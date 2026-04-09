/**
 * Unified inbox routes.
 *
 * Exposes a read-only, time-ordered view of messages from every channel
 * the agent participates in — dashboard web chat plus every connector
 * plugin (iMessage, Telegram, Discord, WhatsApp, WeChat, etc.) — merged
 * into a single feed so the UI can render a unified inbox without the
 * client having to know which rooms each source uses.
 *
 * Why a separate endpoint instead of reusing /api/conversations/:id/messages:
 *
 *   Each connector plugin creates its own rooms keyed by the external
 *   chat id (chat.db chat_identifier for iMessage, chat_id for Telegram,
 *   etc.). The dashboard conversation room is pinned to
 *   `${agentName}-web-chat-room`. A single-room read path can't see
 *   cross-channel traffic, and we don't want to fan out writes to the
 *   web-chat room on every connector dispatch (it would pollute the
 *   dashboard world with entities that don't belong to it and break
 *   the "one conversation = one room" invariant that bootstrap relies
 *   on). The read-side aggregator keeps each connector's world/room
 *   graph intact while still giving the UI a unified feed.
 *
 * Routes:
 *
 *   GET /api/inbox/messages?limit=N&sources=imessage,telegram
 *     Returns the N most recent messages across all agent rooms where
 *     `content.source` is set to a connector tag. `sources` (optional,
 *     comma-separated) filters to a specific subset. Ordered newest
 *     first. Default limit is 100, hard cap 500.
 *
 *   GET /api/inbox/sources
 *     Returns the distinct set of source tags the agent currently has
 *     memories for, so the UI can render a dynamic source filter chip
 *     list without hardcoding connector names.
 */

import type http from "node:http";
import type { AgentRuntime, Memory, Room, UUID } from "@elizaos/core";
import type { RouteHelpers } from "./route-helpers.js";

/**
 * Source tags we consider "inbox-worthy". Messages whose content.source
 * is none of these are excluded from the unified feed — this keeps
 * internal sources (e.g. system events, knowledge ingestion, trajectory
 * markers) out of the user-facing inbox.
 *
 * `client_chat` is intentionally excluded; those are dashboard turns and
 * are already visible in the conversation view. The inbox is for
 * *inbound* messages from other humans via connector channels.
 */
const DEFAULT_INBOX_SOURCES = new Set<string>([
  "imessage",
  "telegram",
  "discord",
  "whatsapp",
  "wechat",
  "slack",
  "signal",
  "sms",
]);

/**
 * Hard ceiling on the number of rooms we scan per request. Large
 * deployments can accumulate hundreds of connector rooms; scanning all
 * of them on every request would make the endpoint scale quadratically
 * with history. 200 rooms × limit-per-request messages is enough for a
 * 100-message inbox view under realistic usage.
 */
const MAX_ROOMS_SCANNED = 200;

/**
 * How many memories we ask the database for per room. We over-fetch
 * slightly so that after filtering by source tag we still have enough
 * to fill `limit` for the caller. If a room has 500 messages but only
 * the most recent 50 are connector messages, we'd miss them with a
 * tight per-room limit. 3x the requested limit is a reasonable margin.
 */
const PER_ROOM_OVERFETCH_MULTIPLIER = 3;

export interface InboxRouteState {
  runtime: AgentRuntime | null;
}

/**
 * A single message in the unified inbox response. Shape mirrors
 * ConversationMessage on the client (see packages/app-core/src/api/
 * client-types-chat.ts) so ChatView can render the same component for
 * both feeds without a type dance.
 */
interface InboxMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  source: string;
  /** External chat room id (for threading / jump-to-conversation links). */
  roomId: string;
  /** Best-effort display name of the sender entity, if available. */
  from?: string;
  /** Best-effort username/handle of the sender entity, if available. */
  fromUserName?: string;
  /** Sender avatar URL when the connector can provide one. */
  avatarUrl?: string;
}

/**
 * Parse and clamp the `limit` query parameter. Defaults to 100, capped
 * at 500. Non-numeric input is treated as the default.
 */
function parseLimit(raw: string | null): number {
  if (!raw) return 100;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, 500);
}

/**
 * Parse the `sources` query parameter into a Set of lowercase tags, or
 * null to mean "use the default inbox source set".
 */
function parseSourceFilter(raw: string | null): Set<string> | null {
  if (!raw) return null;
  const tags = raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  if (tags.length === 0) return null;
  return new Set(tags);
}

/**
 * Pull the source tag out of a Memory row. Memory.content is typed as
 * `Content` in core but the shape we care about is a loose record with
 * an optional `source?: string` field. Returns null if the source is
 * missing, non-string, or empty.
 */
function extractSource(memory: Memory): string | null {
  const content = memory.content as { source?: unknown } | undefined;
  const source = content?.source;
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Pull the visible text out of a Memory row. Same rationale as
 * extractSource — we're pulling fields off a loosely-typed Content
 * object and normalizing.
 */
function extractText(memory: Memory): string {
  const content = memory.content as { text?: unknown } | undefined;
  const text = content?.text;
  return typeof text === "string" ? text : "";
}

/**
 * Best-effort sender display name from memory.metadata.entityName. The
 * bootstrap plugin stamps this when it builds memories from
 * ENTITY_JOINED events; connector plugins should do the same via their
 * lifecycle event payloads (iMessage does — see dispatchInboundMessage
 * in plugin-imessage's service.ts).
 */
function extractFrom(memory: Memory): string | undefined {
  const meta = memory.metadata as Record<string, unknown> | undefined;
  const entityName = meta?.entityName;
  if (typeof entityName === "string" && entityName.length > 0) {
    return entityName;
  }
  return undefined;
}

function extractFromUserName(memory: Memory): string | undefined {
  const meta = memory.metadata as Record<string, unknown> | undefined;
  const entityUserName = meta?.entityUserName;
  if (typeof entityUserName === "string" && entityUserName.length > 0) {
    return entityUserName;
  }

  const username = meta?.username;
  if (typeof username === "string" && username.length > 0) {
    return username;
  }
  return undefined;
}

function extractFromAvatarUrl(memory: Memory): string | undefined {
  const meta = memory.metadata as Record<string, unknown> | undefined;
  const entityAvatarUrl = meta?.entityAvatarUrl;
  if (typeof entityAvatarUrl === "string" && entityAvatarUrl.length > 0) {
    return entityAvatarUrl;
  }
  return undefined;
}

function extractRawSenderId(memory: Memory): string | undefined {
  const meta = memory.metadata as Record<string, unknown> | undefined;
  const fromId = meta?.fromId;
  if (typeof fromId === "string" && fromId.length > 0) {
    return fromId;
  }
  return undefined;
}

type DiscordUserProfile = {
  avatarUrl?: string;
  displayName?: string;
  username?: string;
};

const DISCORD_PROFILE_CACHE_TTL_MS = 5 * 60_000;
const discordChannelTitleCache = new Map<
  string,
  { expiresAt: number; value: string | null }
>();
const discordUserProfileCache = new Map<
  string,
  { expiresAt: number; value: DiscordUserProfile | null }
>();

function readCachedValue<T>(
  cache: Map<string, { expiresAt: number; value: T }>,
  key: string,
): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

type DiscordClientLike = {
  channels?: {
    cache?: { get?: (id: string) => unknown };
    fetch?: (id: string) => Promise<unknown>;
  };
  users?: {
    fetch?: (id: string) => Promise<unknown>;
  };
};

function getDiscordClient(runtime: AgentRuntime): DiscordClientLike | null {
  const runtimeWithServices = runtime as AgentRuntime & {
    getService?: (name: string) => unknown;
  };
  const service = runtimeWithServices.getService?.("discord") as
    | { client?: DiscordClientLike | null }
    | undefined;
  return service?.client ?? null;
}

function firstCollectionValue(collection: unknown): unknown {
  if (!collection || typeof collection !== "object") {
    return null;
  }
  const record = collection as {
    first?: () => unknown;
    values?: () => IterableIterator<unknown>;
  };
  if (typeof record.first === "function") {
    return record.first();
  }
  if (typeof record.values === "function") {
    return record.values().next().value ?? null;
  }
  return null;
}

function readDiscordDisplayName(user: unknown): string | undefined {
  if (!user || typeof user !== "object") return undefined;
  const record = user as Record<string, unknown>;
  const globalName = record.globalName;
  if (typeof globalName === "string" && globalName.trim()) {
    return globalName.trim();
  }
  const displayName = record.displayName;
  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim();
  }
  const username = record.username;
  if (typeof username === "string" && username.trim()) {
    return username.trim();
  }
  return undefined;
}

function readDiscordAvatarUrl(user: unknown): string | undefined {
  if (!user || typeof user !== "object") return undefined;
  const record = user as {
    displayAvatarURL?: () => string;
    avatarURL?: () => string | null;
  };
  if (typeof record.displayAvatarURL === "function") {
    const url = record.displayAvatarURL();
    if (typeof url === "string" && url.trim()) return url;
  }
  if (typeof record.avatarURL === "function") {
    const url = record.avatarURL();
    if (typeof url === "string" && url.trim()) return url;
  }
  return undefined;
}

async function resolveDiscordUserProfile(
  runtime: AgentRuntime,
  userId: string,
): Promise<DiscordUserProfile | null> {
  const cached = readCachedValue(discordUserProfileCache, userId);
  if (cached !== undefined) return cached;

  const client = getDiscordClient(runtime);
  const fetchUser = client?.users?.fetch;
  if (typeof fetchUser !== "function") return null;

  try {
    const user = await fetchUser(userId);
    const profile: DiscordUserProfile = {
      displayName: readDiscordDisplayName(user),
      username:
        user &&
        typeof user === "object" &&
        typeof (user as { username?: unknown }).username === "string"
          ? (user as { username: string }).username
          : undefined,
      avatarUrl: readDiscordAvatarUrl(user),
    };
    discordUserProfileCache.set(userId, {
      expiresAt: Date.now() + DISCORD_PROFILE_CACHE_TTL_MS,
      value: profile,
    });
    return profile;
  } catch {
    discordUserProfileCache.set(userId, {
      expiresAt: Date.now() + DISCORD_PROFILE_CACHE_TTL_MS,
      value: null,
    });
    return null;
  }
}

async function resolveDiscordRoomTitle(
  runtime: AgentRuntime,
  room: Room | undefined,
): Promise<string | null> {
  const channelId = typeof room?.channelId === "string" ? room.channelId : "";
  if (!channelId) return null;

  const cached = readCachedValue(discordChannelTitleCache, channelId);
  if (cached !== undefined) return cached;

  const client = getDiscordClient(runtime);
  const cachedChannel = client?.channels?.cache?.get?.(channelId);
  const fetchChannel = client?.channels?.fetch;
  const channel =
    cachedChannel ??
    (typeof fetchChannel === "function"
      ? await fetchChannel(channelId).catch(() => null)
      : null);

  let title: string | null = null;
  if (channel && typeof channel === "object") {
    const namedChannel = channel as { name?: unknown };
    if (typeof namedChannel.name === "string" && namedChannel.name.trim()) {
      title = namedChannel.name.trim();
    } else {
      const record = channel as {
        recipient?: unknown;
        recipients?: unknown;
      };
      const recipient =
        record.recipient ?? firstCollectionValue(record.recipients);
      title = readDiscordDisplayName(recipient) ?? null;
    }
  }

  discordChannelTitleCache.set(channelId, {
    expiresAt: Date.now() + DISCORD_PROFILE_CACHE_TTL_MS,
    value: title,
  });
  return title;
}

/**
 * Enumerate every room the agent currently has state for, up to
 * MAX_ROOMS_SCANNED. We do this by walking every world the runtime
 * knows about and collecting rooms under each. For a single-agent
 * Milady install this is bounded by the number of connector chats the
 * agent participates in; for multi-tenant it would need a tenant scope
 * but Milady's runtime is single-tenant per process.
 */
async function collectAgentRoomIds(runtime: AgentRuntime): Promise<UUID[]> {
  const worlds = await runtime.getAllWorlds();
  if (worlds.length === 0) return [];

  const worldIds = worlds
    .map((w) => w.id)
    .filter((id): id is UUID => typeof id === "string");

  if (worldIds.length === 0) return [];

  // getRoomsByWorlds is the bulk form — single round trip instead of
  // one query per world.
  const rooms = await runtime.getRoomsByWorlds(worldIds, MAX_ROOMS_SCANNED, 0);
  const roomIds: UUID[] = [];
  for (const room of rooms) {
    if (room.id) roomIds.push(room.id);
    if (roomIds.length >= MAX_ROOMS_SCANNED) break;
  }
  return roomIds;
}

/**
 * Collect every room owned by the agent (bounded by MAX_ROOMS_SCANNED)
 * as full Room objects rather than just ids. Used by the chats
 * aggregator which needs each room's name + world for display.
 */
async function collectAgentRooms(runtime: AgentRuntime): Promise<Room[]> {
  const worlds = await runtime.getAllWorlds();
  if (worlds.length === 0) return [];
  const worldIds = worlds
    .map((w) => w.id)
    .filter((id): id is UUID => typeof id === "string");
  if (worldIds.length === 0) return [];
  return runtime.getRoomsByWorlds(worldIds, MAX_ROOMS_SCANNED, 0);
}

/**
 * Fetch messages, optionally scoped to a single room. When `roomId`
 * is set the function skips world enumeration entirely and targets
 * that specific room — used by the unified-chat read path where the
 * sidebar already knows which room the user clicked. When `roomId`
 * is null it walks every agent room and merges across them, which is
 * the cross-channel "everything" feed.
 *
 * Either way the source filter applies: rows whose content.source
 * isn't in the allowed set are dropped before ordering, so callers
 * can never accidentally surface an internal trajectory/system memory
 * via this endpoint.
 */
async function loadInboxMessages(
  runtime: AgentRuntime,
  limit: number,
  sourceFilter: Set<string>,
  roomId: UUID | null,
): Promise<InboxMessage[]> {
  let memories: Memory[];
  if (roomId) {
    memories = await runtime.getMemories({
      tableName: "messages",
      roomId,
      count: limit * PER_ROOM_OVERFETCH_MULTIPLIER,
      unique: false,
    });
  } else {
    const roomIds = await collectAgentRoomIds(runtime);
    if (roomIds.length === 0) return [];
    memories = await runtime.getMemoriesByRoomIds({
      tableName: "messages",
      roomIds,
      limit: limit * PER_ROOM_OVERFETCH_MULTIPLIER,
    });
  }

  const agentId = runtime.agentId;
  const out: Array<InboxMessage & { rawSenderId?: string }> = [];

  for (const memory of memories) {
    const source = extractSource(memory);
    if (!source || !sourceFilter.has(source.toLowerCase())) continue;

    const text = extractText(memory);
    if (!text) continue;

    out.push({
      id: memory.id ?? "",
      role: memory.entityId === agentId ? "assistant" : "user",
      text,
      timestamp: memory.createdAt ?? 0,
      source,
      roomId: memory.roomId ?? "",
      from: extractFrom(memory),
      fromUserName: extractFromUserName(memory),
      avatarUrl: extractFromAvatarUrl(memory),
      rawSenderId: extractRawSenderId(memory),
    });
  }

  // Newest first. The core API doesn't guarantee order across rooms, so
  // we do the merge sort client-side.
  out.sort((a, b) => b.timestamp - a.timestamp);
  const ordered = out.slice(0, limit);

  await Promise.all(
    ordered.map(async (message) => {
      if (message.source.toLowerCase() !== "discord") return;
      if (!message.rawSenderId) return;
      const profile = await resolveDiscordUserProfile(
        runtime,
        message.rawSenderId,
      );
      if (!profile) return;
      if (!message.from && profile.displayName) {
        message.from = profile.displayName;
      }
      if (!message.fromUserName && profile.username) {
        message.fromUserName = profile.username;
      }
      if (!message.avatarUrl && profile.avatarUrl) {
        message.avatarUrl = profile.avatarUrl;
      }
    }),
  );

  return ordered.map(({ rawSenderId: _rawSenderId, ...message }) => message);
}

/**
 * A single entry in the unified chats list. Mirrors the shape the
 * ConversationsSidebar needs (id, title, updatedAt preview) so the
 * frontend can render dashboard conversations and connector chats in
 * the same list without a type dance.
 */
interface InboxChat {
  /** Room id — stable across polls, used as the selection key. */
  id: string;
  /** Connector tag (imessage, telegram, …) for source badging. */
  source: string;
  /** Display title — contact name for 1:1 chats, group name otherwise. */
  title: string;
  /** Last message text preview (truncated) so the list row can render it. */
  lastMessageText: string;
  /** Epoch ms of the most recent message in this room. */
  lastMessageAt: number;
  /** Total messages in this room at scan time (for an optional counter). */
  messageCount: number;
}

/** Cap on how many characters of last-message text we return per chat. */
const INBOX_CHAT_PREVIEW_LENGTH = 140;

/**
 * Walk every agent room, collect the subset that contain connector
 * messages, and reduce each to a single InboxChat row with the room's
 * latest activity as the ordering key. This is the sidebar feed for
 * the unified messages view — one row per external chat thread.
 *
 * We over-fetch memories across all rooms in one bulk call (same
 * pattern loadInboxMessages uses) then group client-side. For the
 * single-agent single-process topology Milady runs under, this is
 * cheap enough to call on a 5-second poll without special-casing.
 */
async function loadInboxChats(
  runtime: AgentRuntime,
  sourceFilter: Set<string>,
): Promise<InboxChat[]> {
  const rooms = await collectAgentRooms(runtime);
  if (rooms.length === 0) return [];

  // Build an id → Room lookup so the memory reducer can fill in the
  // chat title from the room's own name field (plugins stamp this when
  // they create the room from ENTITY_JOINED / WORLD_JOINED).
  const roomById = new Map<UUID, Room>();
  for (const room of rooms) {
    if (room.id) roomById.set(room.id, room);
  }

  const roomIds = Array.from(roomById.keys());
  if (roomIds.length === 0) return [];

  // Fetch a wide slice of recent memories in one call and group by
  // room client-side. 2000 messages is enough to catch the latest turn
  // in every active connector chat — the bulk query is the expensive
  // part, so we fetch once and reduce.
  const memories = await runtime.getMemoriesByRoomIds({
    tableName: "messages",
    roomIds,
    limit: 2000,
  });

  // Reduce: per room, keep the most recent source-tagged message.
  const accumulator = new Map<
    string,
    {
      source: string;
      lastMessageText: string;
      lastMessageAt: number;
      messageCount: number;
      latestSenderName?: string;
    }
  >();

  for (const memory of memories) {
    const source = extractSource(memory);
    if (!source || !sourceFilter.has(source.toLowerCase())) continue;

    const text = extractText(memory);
    if (!text) continue;

    const key = memory.roomId;
    if (!key) continue;
    const ts = memory.createdAt ?? 0;
    const senderName =
      extractFrom(memory) ?? extractFromUserName(memory) ?? undefined;

    const existing = accumulator.get(key);
    if (!existing) {
      accumulator.set(key, {
        source,
        lastMessageText: text.slice(0, INBOX_CHAT_PREVIEW_LENGTH),
        lastMessageAt: ts,
        messageCount: 1,
        latestSenderName: senderName,
      });
    } else {
      existing.messageCount += 1;
      if (ts > existing.lastMessageAt) {
        existing.lastMessageAt = ts;
        existing.lastMessageText = text.slice(0, INBOX_CHAT_PREVIEW_LENGTH);
        existing.latestSenderName = senderName;
      }
    }
  }

  const chats: InboxChat[] = [];
  for (const [roomIdKey, entry] of accumulator) {
    const room = roomById.get(roomIdKey as UUID);
    const liveDiscordTitle =
      entry.source.toLowerCase() === "discord"
        ? await resolveDiscordRoomTitle(runtime, room)
        : null;
    const storedTitle =
      typeof room?.name === "string" && room.name.trim()
        ? room.name.trim()
        : null;
    const dmFallbackTitle =
      room?.type === "DM" && entry.latestSenderName
        ? entry.latestSenderName
        : null;
    const title =
      liveDiscordTitle ??
      storedTitle ??
      dmFallbackTitle ??
      `${entry.source} chat`;
    chats.push({
      id: roomIdKey,
      source: entry.source,
      title,
      lastMessageText: entry.lastMessageText,
      lastMessageAt: entry.lastMessageAt,
      messageCount: entry.messageCount,
    });
  }

  chats.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return chats;
}

/**
 * Scan recent memories across all agent rooms and return the distinct
 * set of source tags present. Used by the UI to build the filter chip
 * list dynamically — no hardcoded connector names in the frontend.
 */
async function loadInboxSources(runtime: AgentRuntime): Promise<string[]> {
  const roomIds = await collectAgentRoomIds(runtime);
  if (roomIds.length === 0) return [];

  // Sample a bounded page so this stays cheap. 1000 messages is enough
  // to catch every source an active agent uses day-to-day.
  const memories = await runtime.getMemoriesByRoomIds({
    tableName: "messages",
    roomIds,
    limit: 1000,
  });

  const seen = new Set<string>();
  for (const memory of memories) {
    const source = extractSource(memory);
    if (!source) continue;
    // We only care about inbox sources — skip client_chat / api / etc.
    if (!DEFAULT_INBOX_SOURCES.has(source.toLowerCase())) continue;
    seen.add(source.toLowerCase());
  }
  return Array.from(seen).sort();
}

/**
 * Route handler entry point. Returns `true` when a route matched and
 * the response has been written; `false` so the caller can continue
 * trying other handlers. Mirrors the handleIMessageRoute pattern.
 */
export async function handleInboxRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: InboxRouteState,
  helpers: RouteHelpers,
): Promise<boolean> {
  if (!pathname.startsWith("/api/inbox")) return false;

  // ── GET /api/inbox/messages ───────────────────────────────────────
  if (method === "GET" && pathname === "/api/inbox/messages") {
    const runtime = state.runtime;
    if (!runtime) {
      helpers.json(res, { messages: [], count: 0 });
      return true;
    }

    const url = new URL(req.url ?? pathname, "http://localhost");
    const limit = parseLimit(url.searchParams.get("limit"));
    const explicitFilter = parseSourceFilter(url.searchParams.get("sources"));
    const sourceFilter = explicitFilter ?? DEFAULT_INBOX_SOURCES;
    // Optional roomId scope. When the unified messages view has a
    // specific connector chat selected, it passes the roomId so the
    // aggregator can skip cross-room enumeration and return just that
    // room's messages. Validated as non-empty; the runtime accepts
    // UUIDs but won't error on arbitrary strings, so we keep parsing
    // forgiving here and let runtime.getMemoriesByRoomIds return empty
    // for bad ids.
    const roomIdParam = url.searchParams.get("roomId")?.trim() ?? "";
    const roomId = roomIdParam.length > 0 ? (roomIdParam as UUID) : null;

    try {
      const messages = await loadInboxMessages(
        runtime,
        limit,
        sourceFilter,
        roomId,
      );
      helpers.json(res, { messages, count: messages.length });
    } catch (err) {
      helpers.error(
        res,
        `failed to load inbox: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/inbox/chats ──────────────────────────────────────────
  // List of connector chat threads (one row per external chat room)
  // used by the unified messages sidebar. Each row carries the source
  // tag, a display title, last-message preview + timestamp, and a
  // message count. Dashboard conversations aren't included here — the
  // frontend merges this list with /api/conversations on its own.
  if (method === "GET" && pathname === "/api/inbox/chats") {
    const runtime = state.runtime;
    if (!runtime) {
      helpers.json(res, { chats: [], count: 0 });
      return true;
    }

    const url = new URL(req.url ?? pathname, "http://localhost");
    const explicitFilter = parseSourceFilter(url.searchParams.get("sources"));
    const sourceFilter = explicitFilter ?? DEFAULT_INBOX_SOURCES;

    try {
      const chats = await loadInboxChats(runtime, sourceFilter);
      helpers.json(res, { chats, count: chats.length });
    } catch (err) {
      helpers.error(
        res,
        `failed to load inbox chats: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/inbox/sources ────────────────────────────────────────
  if (method === "GET" && pathname === "/api/inbox/sources") {
    const runtime = state.runtime;
    if (!runtime) {
      helpers.json(res, { sources: [] });
      return true;
    }

    try {
      const sources = await loadInboxSources(runtime);
      helpers.json(res, { sources });
    } catch (err) {
      helpers.error(
        res,
        `failed to load inbox sources: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  return false;
}
