import type { RouteRequestContext } from "./route-helpers";
import type { StreamRouteState } from "./stream-route-state";
import {
  createAgentRequestId,
  isAgentAuthConfigured,
} from "../plugins/five55-shared/agent-auth.js";
import {
  ensureGamesAgentSessionId,
  extractGamesUpstreamError,
  requestGamesAgentJson,
} from "../plugins/five55-games/agent-client.js";

type GamesOperation = "catalog" | "play" | "switch" | "stop";

interface Five55GamesRouteContext extends RouteRequestContext {
  streamState?: StreamRouteState;
}

interface CachedCatalogGame {
  id: string;
  label: string;
}

interface CachedGamesSessionState {
  sessionId: string;
  activeGameId: string | null;
  activeGameLabel: string | null;
  mode: string | null;
  catalog: CachedCatalogGame[];
  updatedAt: number;
}

interface GamesStateResponse {
  ok: true;
  sessionId: string;
  activeGameId: string | null;
  activeGameLabel: string | null;
  mode: string | null;
  phase: string;
  live: boolean;
  destination: { id: string; name: string } | null;
}

const gamesSessionStateCache = new Map<string, CachedGamesSessionState>();

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readTrimmedString(
  ...candidates: Array<unknown>
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function readBoolean(...candidates: Array<unknown>): boolean | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "boolean") return candidate;
  }
  return undefined;
}

function getCachedSessionState(sessionId: string): CachedGamesSessionState {
  const current = gamesSessionStateCache.get(sessionId);
  if (current) return current;
  const created: CachedGamesSessionState = {
    sessionId,
    activeGameId: null,
    activeGameLabel: null,
    mode: null,
    catalog: [],
    updatedAt: Date.now(),
  };
  gamesSessionStateCache.set(sessionId, created);
  return created;
}

function getCatalogGames(
  payload: Record<string, unknown> | undefined,
): CachedCatalogGame[] {
  const games = Array.isArray(payload?.games) ? payload.games : [];
  return games
    .map((game) => {
      const record = asRecord(game);
      const id = readTrimmedString(record?.id);
      if (!id) return null;
      const label =
        readTrimmedString(record?.title, record?.label, record?.name, id) ?? id;
      return { id, label };
    })
    .filter((game): game is CachedCatalogGame => game !== null);
}

function findCatalogLabel(
  sessionId: string,
  gameId: string | null | undefined,
): string | undefined {
  if (!gameId) return undefined;
  return gamesSessionStateCache
    .get(sessionId)
    ?.catalog.find((entry) => entry.id === gameId)?.label;
}

function updateCatalogCache(
  sessionId: string,
  payload: Record<string, unknown> | undefined,
): void {
  const cache = getCachedSessionState(sessionId);
  cache.catalog = getCatalogGames(payload);
  if (cache.activeGameId) {
    cache.activeGameLabel =
      findCatalogLabel(sessionId, cache.activeGameId) ?? cache.activeGameLabel;
  }
  cache.updatedAt = Date.now();
}

function updateActionCache(
  sessionId: string,
  operation: GamesOperation,
  body: Record<string, unknown>,
  payload: Record<string, unknown> | undefined,
): void {
  const cache = getCachedSessionState(sessionId);
  if (operation === "catalog") {
    updateCatalogCache(sessionId, payload);
    return;
  }
  if (operation === "stop") {
    cache.activeGameId = null;
    cache.activeGameLabel = null;
    cache.mode = null;
    cache.updatedAt = Date.now();
    return;
  }

  const gameId =
    readTrimmedString(payload?.gameId, body.gameId) ?? cache.activeGameId;
  cache.activeGameId = gameId ?? null;
  cache.activeGameLabel =
    readTrimmedString(
      payload?.gameLabel,
      payload?.gameTitle,
      payload?.title,
      payload?.label,
      findCatalogLabel(sessionId, gameId),
    ) ?? cache.activeGameLabel;
  cache.mode =
    readTrimmedString(payload?.mode, body.mode, cache.mode) ?? cache.mode;
  cache.updatedAt = Date.now();
}

function readLocalDestination(
  streamState?: StreamRouteState,
): { id: string; name: string } | null {
  if (!streamState) return null;
  const activeId =
    streamState.activeDestinationId ??
    streamState.destinations.keys().next().value;
  if (!activeId) return null;
  const destination = streamState.destinations.get(activeId);
  if (!destination) return null;
  return { id: destination.id, name: destination.name };
}

function readLocalLive(streamState?: StreamRouteState): boolean {
  if (!streamState) return false;
  try {
    const health = streamState.streamManager.getHealth();
    return Boolean(health.running && health.ffmpegAlive);
  } catch {
    return streamState.streamManager.isRunning();
  }
}

function derivePhase(params: {
  explicitPhase?: string;
  activeGameId?: string | null;
  live: boolean;
}): string {
  const explicit = readTrimmedString(params.explicitPhase);
  if (explicit) return explicit;
  if (params.live && params.activeGameId) return "live";
  if (params.activeGameId) return "playing";
  if (params.live) return "broadcasting";
  return "ready";
}

async function readUpstreamGameState(
  upstreamBase: string | undefined,
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  if (!upstreamBase || !isAgentAuthConfigured()) {
    return null;
  }
  const requestId = createAgentRequestId("api-five55-games-state");
  const upstream = await requestGamesAgentJson(
    upstreamBase,
    requestId,
    "GET",
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/state`,
  );
  if (!upstream.ok) {
    return null;
  }
  return asRecord(upstream.data) ?? null;
}

function buildFallbackGamesState(
  sessionId: string,
  streamState?: StreamRouteState,
): GamesStateResponse {
  const cache = gamesSessionStateCache.get(sessionId);
  const destination = readLocalDestination(streamState);
  const live = readLocalLive(streamState);
  return {
    ok: true,
    sessionId,
    activeGameId: cache?.activeGameId ?? null,
    activeGameLabel: cache?.activeGameLabel ?? null,
    mode: cache?.mode ?? null,
    phase: derivePhase({
      activeGameId: cache?.activeGameId ?? null,
      live,
    }),
    live,
    destination,
  };
}

function normalizeGamesState(
  sessionId: string,
  upstream: Record<string, unknown> | null,
  streamState?: StreamRouteState,
): GamesStateResponse {
  const fallback = buildFallbackGamesState(sessionId, streamState);
  if (!upstream) return fallback;

  const currentGame = asRecord(
    upstream.currentGame ??
      upstream.activeGame ??
      upstream.game ??
      asRecord(upstream.state)?.currentGame,
  );
  const activeGameId =
    readTrimmedString(
      upstream.activeGameId,
      upstream.currentGameId,
      currentGame?.id,
      fallback.activeGameId,
    ) ?? null;
  const destinationRecord = asRecord(upstream.destination);
  const destination =
    readTrimmedString(destinationRecord?.id, upstream.destinationId) &&
    readTrimmedString(destinationRecord?.name, upstream.destinationName)
      ? {
          id:
            readTrimmedString(destinationRecord?.id, upstream.destinationId) ??
            fallback.destination?.id ??
            "",
          name:
            readTrimmedString(
              destinationRecord?.name,
              upstream.destinationName,
            ) ??
            fallback.destination?.name ??
            "",
        }
      : fallback.destination;
  const live = readBoolean(upstream.live, upstream.isLive) ?? fallback.live;
  return {
    ok: true,
    sessionId:
      readTrimmedString(upstream.sessionId, fallback.sessionId) ?? fallback.sessionId,
    activeGameId,
    activeGameLabel:
      readTrimmedString(
        upstream.activeGameLabel,
        upstream.gameLabel,
        currentGame?.title,
        currentGame?.label,
        currentGame?.name,
        findCatalogLabel(sessionId, activeGameId),
        fallback.activeGameLabel,
      ) ?? null,
    mode:
      readTrimmedString(upstream.mode, currentGame?.mode, fallback.mode) ?? null,
    phase: derivePhase({
      explicitPhase:
        readTrimmedString(upstream.phase, upstream.state) ?? undefined,
      activeGameId,
      live,
    }),
    live,
    destination,
  };
}

export function __resetFive55GamesRouteStateForTests(): void {
  gamesSessionStateCache.clear();
}

export async function handleFive55GamesRoutes(
  ctx: Five55GamesRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json, error } = ctx;
  const match =
    /^\/api\/agent\/v1\/sessions\/([^/]+)\/games\/(catalog|play|switch|stop|state)$/.exec(
      pathname,
    );
  if (!match) return false;

  let sessionId: string;
  try {
    sessionId = decodeURIComponent(match[1] ?? "").trim();
  } catch {
    error(res, "Invalid session id", 400);
    return true;
  }
  if (!sessionId) {
    error(res, "sessionId is required", 400);
    return true;
  }

  const operation = match[2] as GamesOperation | "state";
  if (operation === "state") {
    if (method !== "GET") {
      error(res, "Method not allowed", 405);
      return true;
    }
    const upstream = await readUpstreamGameState(
      process.env.STREAM555_BASE_URL?.trim(),
      sessionId,
    );
    json(res, normalizeGamesState(sessionId, upstream, ctx.streamState), 200);
    return true;
  }

  if (method !== "POST") {
    error(res, "Method not allowed", 405);
    return true;
  }

  const upstreamBase = process.env.STREAM555_BASE_URL?.trim();
  if (!upstreamBase) {
    error(res, "STREAM555_BASE_URL is not configured", 503);
    return true;
  }
  if (!isAgentAuthConfigured()) {
    error(res, "STREAM555 agent auth is not configured", 503);
    return true;
  }

  const requestId = createAgentRequestId(`api-five55-games-${operation}`);
  let ensuredSessionId = sessionId;
  try {
    ensuredSessionId = await ensureGamesAgentSessionId(
      upstreamBase,
      sessionId,
      `${requestId}-bootstrap`,
    );
  } catch (err) {
    error(
      res,
      err instanceof Error ? err.message : "Session bootstrap failed",
      502,
    );
    return true;
  }

  const body = (await readJsonBody<Record<string, unknown>>(req, res)) ?? {};
  const endpoint = `/api/agent/v1/sessions/${encodeURIComponent(ensuredSessionId)}/games/${operation}`;
  const upstream = await requestGamesAgentJson(
    upstreamBase,
    requestId,
    "POST",
    endpoint,
    body,
  );

  if (!upstream.ok) {
    const message = extractGamesUpstreamError(upstream.data, upstream.rawBody);
    error(
      res,
      `${message} [requestId: ${upstream.requestId}]`,
      upstream.status || 502,
    );
    return true;
  }

  updateActionCache(ensuredSessionId, operation, body, upstream.data);
  json(
    res,
    upstream.data ?? {
      ok: true,
      requestId: upstream.requestId,
    },
    upstream.status || 200,
  );
  return true;
}
