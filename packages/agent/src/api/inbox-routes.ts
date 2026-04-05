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
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import type { RouteHelpers } from "./route-helpers";

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
 * Fetch messages from every agent room, filter by source tag, sort
 * newest first, truncate to `limit`. Returns an empty list when the
 * runtime isn't ready or has no matching rooms — never throws.
 */
async function loadInboxMessages(
  runtime: AgentRuntime,
  limit: number,
  sourceFilter: Set<string>,
): Promise<InboxMessage[]> {
  const roomIds = await collectAgentRoomIds(runtime);
  if (roomIds.length === 0) return [];

  const memories = await runtime.getMemoriesByRoomIds({
    tableName: "messages",
    roomIds,
    limit: limit * PER_ROOM_OVERFETCH_MULTIPLIER,
  });

  const agentId = runtime.agentId;
  const out: InboxMessage[] = [];

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
    });
  }

  // Newest first. The core API doesn't guarantee order across rooms, so
  // we do the merge sort client-side.
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out.slice(0, limit);
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

    try {
      const messages = await loadInboxMessages(runtime, limit, sourceFilter);
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
