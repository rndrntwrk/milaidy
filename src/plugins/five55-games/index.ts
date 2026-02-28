import type {
  Action,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import {
  assertFive55Capability,
  createFive55CapabilityPolicy,
} from "../../runtime/five55-capability-policy.js";
import { assertTrustedAdminForAction } from "../../runtime/trusted-admin.js";
import {
  exceptionAction,
  executeApiAction,
  readParam,
} from "../five55-shared/action-kit.js";
import {
  describeAgentAuthSource,
  isAgentAuthConfigured,
  resolveAgentBearer,
} from "../five55-shared/agent-auth.js";

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const API_ENV = "FIVE55_GAMES_API_URL";
const DIALECT_ENV = "FIVE55_GAMES_API_DIALECT";
const LOCAL_API_URL_ENV = "MILAIDY_API_URL";
const LOCAL_PORT_ENV = "MILAIDY_PORT";
const LOCAL_TOKEN_ENV = "MILAIDY_API_TOKEN";
const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM_SESSION_ENV = "STREAM_SESSION_ID";
const STREAM555_SESSION_ENV = "STREAM555_DEFAULT_SESSION_ID";

type GamesDialect = "five55-web" | "milaidy-proxy" | "agent-v1";
type GameSessionMode = "standard" | "ranked" | "spectate" | "solo" | "agent";

let cachedAgentSessionId: string | undefined;

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeMode(
  mode: string | undefined,
  dialect: GamesDialect,
): GameSessionMode {
  const normalized = mode?.trim().toLowerCase();
  if (
    normalized === "standard" ||
    normalized === "ranked" ||
    normalized === "spectate" ||
    normalized === "solo" ||
    normalized === "agent"
  ) {
    return normalized;
  }
  if (
    normalized === "autonomous" ||
    normalized === "auto" ||
    normalized === "bot" ||
    normalized === "play"
  ) {
    return "agent";
  }
  return dialect === "agent-v1" ? "agent" : "spectate";
}

function resolveGamesDialect(): GamesDialect {
  const explicit = trimEnv(DIALECT_ENV)?.toLowerCase();
  if (explicit === "five55-web" || explicit === "web") return "five55-web";
  if (explicit === "agent-v1" || explicit === "agent") return "agent-v1";
  if (explicit === "milaidy-proxy" || explicit === "proxy") {
    return "milaidy-proxy";
  }
  if (trimEnv(STREAM555_BASE_ENV) && isAgentAuthConfigured()) {
    return "agent-v1";
  }
  return trimEnv(API_ENV) ? "five55-web" : "milaidy-proxy";
}

function resolveGamesBase(dialect: GamesDialect): string {
  if (dialect === "five55-web") {
    const base = trimEnv(API_ENV);
    if (!base) throw new Error(`${API_ENV} is not configured`);
    return base;
  }

  if (dialect === "agent-v1") {
    const base = trimEnv(STREAM555_BASE_ENV);
    if (!base) throw new Error(`${STREAM555_BASE_ENV} is not configured`);
    return base;
  }

  const localBase = trimEnv(LOCAL_API_URL_ENV);
  if (localBase) return localBase;
  const localPort = trimEnv(LOCAL_PORT_ENV) ?? "2138";
  return `http://127.0.0.1:${localPort}`;
}

function resolveCatalogEndpoint(
  dialect: GamesDialect,
  sessionId?: string,
): string {
  if (dialect === "agent-v1") {
    if (!sessionId) throw new Error("sessionId is required for agent-v1 games catalog");
    return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/catalog`;
  }
  return dialect === "five55-web"
    ? "/api/games/catalog"
    : "/api/five55/games/catalog";
}

function resolvePlayEndpoint(
  dialect: GamesDialect,
  sessionId?: string,
): string {
  if (dialect === "agent-v1") {
    if (!sessionId) throw new Error("sessionId is required for agent-v1 game play");
    return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/play`;
  }
  return dialect === "five55-web" ? "/api/games/play" : "/api/five55/games/play";
}

async function fetchJson(
  method: "GET" | "POST",
  base: string,
  endpoint: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data?: Record<string, unknown>; rawBody: string }> {
  const target = new URL(endpoint, base);
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(target, init);
  const rawBody = await response.text();
  let data: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // non-JSON response
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
    rawBody,
  };
}

function getErrorDetail(payload: {
  data?: Record<string, unknown>;
  rawBody: string;
}): string {
  const fromData = payload.data?.error;
  if (typeof fromData === "string" && fromData.trim()) return fromData;
  return payload.rawBody || "upstream request failed";
}

function resolveCatalogGameId(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const games = Array.isArray(data.games) ? data.games : [];
  for (const game of games) {
    const gameRecord = asRecord(game);
    const gameId = typeof gameRecord?.id === "string" ? gameRecord.id.trim() : "";
    if (gameId.length > 0) return gameId;
  }
  return undefined;
}

async function resolveAgentGameId(
  base: string,
  token: string,
  sessionId: string,
  requestedGameId?: string,
): Promise<string | undefined> {
  const preferred = requestedGameId?.trim();
  if (preferred) return preferred;

  const catalog = await fetchJson(
    "POST",
    base,
    resolveCatalogEndpoint("agent-v1", sessionId),
    token,
    { includeBeta: true },
  );
  if (!catalog.ok) return undefined;
  return resolveCatalogGameId(catalog.data);
}

async function ensureAgentSessionId(
  base: string,
  token: string,
  requestedSessionId?: string,
): Promise<string> {
  const preferredSessionId =
    requestedSessionId?.trim() ||
    cachedAgentSessionId ||
    trimEnv(STREAM_SESSION_ENV) ||
    trimEnv(STREAM555_SESSION_ENV);

  const body =
    preferredSessionId && preferredSessionId.length > 0
      ? { sessionId: preferredSessionId }
      : {};
  const response = await fetchJson(
    "POST",
    base,
    "/api/agent/v1/sessions",
    token,
    body,
  );

  if (!response.ok) {
    throw new Error(
      `session bootstrap failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }

  const sessionId = response.data?.sessionId;
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new Error("session bootstrap did not return sessionId");
  }
  cachedAgentSessionId = sessionId;
  return sessionId;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

type AgentSessionSnapshot = {
  active: boolean;
  cfSessionId?: string;
};

async function fetchAgentSessionSnapshot(
  base: string,
  token: string,
  sessionId: string,
): Promise<AgentSessionSnapshot> {
  const response = await fetchJson(
    "GET",
    base,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`,
    token,
  );
  if (!response.ok) {
    throw new Error(
      `session status preflight failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }
  return {
    active: Boolean(response.data?.active),
    cfSessionId: readNonEmptyString(response.data?.cfSessionId),
  };
}

async function stopAgentStream(
  base: string,
  token: string,
  sessionId: string,
): Promise<void> {
  const response = await fetchJson(
    "POST",
    base,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/stop`,
    token,
    {},
  );
  if (!response.ok) {
    throw new Error(
      `stream/stop failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }
}

async function startAgentScreenStream(
  base: string,
  token: string,
  sessionId: string,
): Promise<string | undefined> {
  const response = await fetchJson(
    "POST",
    base,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/start`,
    token,
    {
      input: {
        type: "screen",
      },
    },
  );

  const cfSessionId = readNonEmptyString(response.data?.cfSessionId);
  if (!response.ok && !(response.status === 409 && cfSessionId)) {
    throw new Error(
      `stream/start provisioning failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }

  return cfSessionId;
}

async function ensureAgentCloudflareOutput(
  base: string,
  token: string,
  sessionId: string,
): Promise<void> {
  const snapshot = await fetchAgentSessionSnapshot(base, token, sessionId);
  if (snapshot.cfSessionId) return;

  if (snapshot.active) {
    await stopAgentStream(base, token, sessionId);
  }

  const startedCfSessionId = await startAgentScreenStream(base, token, sessionId);
  if (startedCfSessionId) return;

  const verifiedSnapshot = await fetchAgentSessionSnapshot(base, token, sessionId);
  if (verifiedSnapshot.cfSessionId) return;

  throw new Error(
    "Cloudflare output provisioning did not produce cfSessionId for session",
  );
}

const gamesProvider: Provider = {
  name: "five55Games",
  description: "Five55 game discovery and launch orchestration surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const dialect = resolveGamesDialect();
    const configured =
      dialect === "five55-web"
        ? Boolean(trimEnv(API_ENV))
        : dialect === "agent-v1"
          ? Boolean(trimEnv(STREAM555_BASE_ENV) && isAgentAuthConfigured())
          : true;
    return {
      text: [
        "## Five55 Games Surface",
        "",
        "Actions: FIVE55_GAMES_CATALOG, FIVE55_GAMES_PLAY, FIVE55_GAMES_GO_LIVE_PLAY",
        `API configured: ${configured ? "yes" : "no"} (${dialect === "five55-web" ? API_ENV : dialect === "agent-v1" ? `${STREAM555_BASE_ENV}|${describeAgentAuthSource()}` : `${LOCAL_API_URL_ENV}|${LOCAL_PORT_ENV}`})`,
        `Dialect: ${dialect}`,
        ...(dialect === "agent-v1"
          ? [`Session env: ${trimEnv(STREAM_SESSION_ENV) ?? trimEnv(STREAM555_SESSION_ENV) ?? "auto-create"}`]
          : []),
      ].join("\n"),
    };
  },
};

const catalogAction: Action = {
  name: "FIVE55_GAMES_CATALOG",
  similes: ["GAMES_CATALOG", "LIST_GAMES", "FIVE55_LIST_GAMES"],
  description: "Lists available Five55 games for play orchestration.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "games.observe");
      const dialect = resolveGamesDialect();
      const filter = readParam(options as HandlerOptions | undefined, "filter");
      const includeBeta =
        readParam(options as HandlerOptions | undefined, "includeBeta") ?? "true";
      const category = filter && filter !== "all" ? filter : undefined;
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );

      if (dialect === "agent-v1") {
        const base = resolveGamesBase(dialect);
        const token = await resolveAgentBearer(base);
        const sessionId = await ensureAgentSessionId(
          base,
          token,
          requestedSessionId,
        );
        return executeApiAction({
          module: "five55.games",
          action: "FIVE55_GAMES_CATALOG",
          base,
          endpoint: resolveCatalogEndpoint(dialect, sessionId),
          payload: {
            ...(category ? { category } : {}),
            includeBeta,
          },
          requestContract: {
            category: {
              required: false,
              type: "string",
              nonEmpty: true,
              oneOf: ["arcade", "rpg", "puzzle", "racing", "casino"],
            },
            includeBeta: {
              required: true,
              type: "string",
              nonEmpty: true,
              oneOf: ["true", "false", "1", "0", "yes", "no", "on", "off"],
            },
          },
          responseContract: {},
          successMessage: "game catalog fetched",
          transport: {
            service: "games",
            operation: "query",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          context: { sessionId },
        });
      }

      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_CATALOG",
        base: resolveGamesBase(dialect),
        endpoint: resolveCatalogEndpoint(dialect),
        payload: {
          ...(category ? { category } : {}),
          includeBeta,
        },
        requestContract: {
          category: {
            required: false,
            type: "string",
            nonEmpty: true,
            oneOf: ["arcade", "rpg", "puzzle", "racing", "casino"],
          },
          includeBeta: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["true", "false", "1", "0", "yes", "no", "on", "off"],
          },
        },
        responseContract: {},
        successMessage: "game catalog fetched",
        transport: {
          service: "games",
          operation: "query",
          ...(dialect === "milaidy-proxy"
            ? { bearerTokenEnv: LOCAL_TOKEN_ENV }
            : {}),
        },
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_CATALOG", err);
    }
  },
  parameters: [
    {
      name: "filter",
      description: "Catalog filter (all|arcade|rpg|puzzle|racing|casino)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "includeBeta",
      description: "Include beta games (true|false)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional stream session id for agent-v1 dialect",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const playAction: Action = {
  name: "FIVE55_GAMES_PLAY",
  similes: [
    "PLAY_GAME",
    "PLAY_GAMES",
    "LAUNCH_GAME",
    "START_GAME_SESSION",
    "FIVE55_PLAY",
  ],
  description: "Starts a game session for a selected Five55 game.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      const dialect = resolveGamesDialect();
      const gameId = readParam(options as HandlerOptions | undefined, "gameId");
      const mode = normalizeMode(
        readParam(options as HandlerOptions | undefined, "mode"),
        dialect,
      );
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );

      if (dialect === "agent-v1") {
        const base = resolveGamesBase(dialect);
        const token = await resolveAgentBearer(base);
        const sessionId = await ensureAgentSessionId(
          base,
          token,
          requestedSessionId,
        );
        const resolvedGameId = await resolveAgentGameId(
          base,
          token,
          sessionId,
          gameId,
        );
        return executeApiAction({
          module: "five55.games",
          action: "FIVE55_GAMES_PLAY",
          base,
          endpoint: resolvePlayEndpoint(dialect, sessionId),
          payload: {
            ...(resolvedGameId ? { gameId: resolvedGameId } : {}),
            mode,
          },
          requestContract: {
            gameId: { required: true, type: "string", nonEmpty: true },
            mode: {
              required: true,
              type: "string",
              nonEmpty: true,
              oneOf: ["standard", "ranked", "spectate", "solo", "agent"],
            },
          },
          responseContract: {},
          successMessage: "game play started",
          transport: {
            service: "games",
            operation: "command",
            idempotent: true,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          context: { sessionId },
        });
      }

      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_PLAY",
        base: resolveGamesBase(dialect),
        endpoint: resolvePlayEndpoint(dialect),
        payload: {
          ...(gameId ? { gameId } : {}),
          mode,
        },
        requestContract: {
          gameId: { required: false, type: "string", nonEmpty: true },
          mode: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["standard", "ranked", "spectate", "solo", "agent"],
          },
        },
        responseContract: {},
        successMessage: "game play started",
        transport: {
          service: "games",
          operation: "command",
          idempotent: true,
          ...(dialect === "milaidy-proxy"
            ? { bearerTokenEnv: LOCAL_TOKEN_ENV }
            : {}),
        },
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_PLAY", err);
    }
  },
  parameters: [
    {
      name: "gameId",
      description: "Canonical game identifier",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "mode",
      description: "Session mode (standard|ranked|spectate|solo|agent)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional stream session id for agent-v1 dialect",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const goLivePlayAction: Action = {
  name: "FIVE55_GAMES_GO_LIVE_PLAY",
  similes: [
    "PLAY_GAME_GO_LIVE",
    "GO_LIVE_PLAY_GAME",
    "START_GAME_STREAM",
    "FIVE55_GO_LIVE_PLAY",
  ],
  description:
    "Launches a Five55 game in agent mode and ensures Cloudflare stream output is provisioned for the session.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(runtime, message, state, "FIVE55_GAMES_GO_LIVE_PLAY");
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");

      const dialect = resolveGamesDialect();
      if (dialect !== "agent-v1") {
        throw new Error(
          "FIVE55_GAMES_GO_LIVE_PLAY requires agent-v1 dialect (set FIVE55_GAMES_API_DIALECT=agent-v1 with STREAM555_BASE_URL + agent auth)",
        );
      }

      const base = resolveGamesBase(dialect);
      const token = await resolveAgentBearer(base);
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const requestedGameId = readParam(
        options as HandlerOptions | undefined,
        "gameId",
      );
      const mode = normalizeMode(
        readParam(options as HandlerOptions | undefined, "mode"),
        dialect,
      );

      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);
      await ensureAgentCloudflareOutput(base, token, sessionId);

      const resolvedGameId = await resolveAgentGameId(
        base,
        token,
        sessionId,
        requestedGameId,
      );
      if (!resolvedGameId) {
        throw new Error("No playable game could be resolved for go-live launch");
      }

      const playResult = await executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_GO_LIVE_PLAY",
        base,
        endpoint: resolvePlayEndpoint(dialect, sessionId),
        payload: {
          gameId: resolvedGameId,
          mode,
        },
        requestContract: {
          gameId: { required: true, type: "string", nonEmpty: true },
          mode: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["standard", "ranked", "spectate", "solo", "agent"],
          },
        },
        responseContract: {},
        successMessage: "game play started",
        transport: {
          service: "games",
          operation: "command",
          idempotent: true,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        context: { sessionId },
      });

      return playResult;
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_GO_LIVE_PLAY", err);
    }
  },
  parameters: [
    {
      name: "gameId",
      description: "Canonical game identifier (optional, resolves first playable game when omitted)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "mode",
      description: "Session mode (defaults to agent for agent-v1)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional stream session id for agent-v1 dialect",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55GamesPlugin(): Plugin {
  return {
    name: "five55-games",
    description: "Five55 games orchestration plugin",
    providers: [gamesProvider],
    actions: [catalogAction, playAction, goLivePlayAction],
  };
}

export default createFive55GamesPlugin;
