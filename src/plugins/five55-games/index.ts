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
import {
  exceptionAction,
  executeApiAction,
  readParam,
} from "../five55-shared/action-kit.js";

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const API_ENV = "FIVE55_GAMES_API_URL";
const DIALECT_ENV = "FIVE55_GAMES_API_DIALECT";
const LOCAL_API_URL_ENV = "MILAIDY_API_URL";
const LOCAL_PORT_ENV = "MILAIDY_PORT";
const LOCAL_TOKEN_ENV = "MILAIDY_API_TOKEN";
const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM555_TOKEN_ENV = "STREAM555_AGENT_TOKEN";
const STREAM_SESSION_ENV = "STREAM_SESSION_ID";
const STREAM555_SESSION_ENV = "STREAM555_DEFAULT_SESSION_ID";

type GamesDialect = "five55-web" | "milaidy-proxy" | "agent-v1";

let cachedAgentSessionId: string | undefined;

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function resolveGamesDialect(): GamesDialect {
  const explicit = trimEnv(DIALECT_ENV)?.toLowerCase();
  if (explicit === "five55-web" || explicit === "web") return "five55-web";
  if (explicit === "agent-v1" || explicit === "agent") return "agent-v1";
  if (explicit === "milaidy-proxy" || explicit === "proxy") {
    return "milaidy-proxy";
  }
  if (trimEnv(STREAM555_BASE_ENV) && trimEnv(STREAM555_TOKEN_ENV)) {
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

function resolveAgentToken(): string | undefined {
  return trimEnv(STREAM555_TOKEN_ENV) ?? trimEnv("STREAM_API_BEARER_TOKEN");
}

async function fetchJson(
  method: "POST",
  base: string,
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data?: Record<string, unknown>; rawBody: string }> {
  const target = new URL(endpoint, base);
  const response = await fetch(target, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
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
          ? Boolean(trimEnv(STREAM555_BASE_ENV) && resolveAgentToken())
        : true;
    return {
      text: [
        "## Five55 Games Surface",
        "",
        "Actions: FIVE55_GAMES_CATALOG, FIVE55_GAMES_PLAY",
        `API configured: ${configured ? "yes" : "no"} (${dialect === "five55-web" ? API_ENV : dialect === "agent-v1" ? `${STREAM555_BASE_ENV}|${STREAM555_TOKEN_ENV}` : `${LOCAL_API_URL_ENV}|${LOCAL_PORT_ENV}`})`,
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
        const token = resolveAgentToken();
        if (!token) {
          throw new Error(
            `${STREAM555_TOKEN_ENV} (or STREAM_API_BEARER_TOKEN) is not configured`,
          );
        }
        const base = resolveGamesBase(dialect);
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
      const mode = readParam(options as HandlerOptions | undefined, "mode");
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );

      if (dialect === "agent-v1") {
        const token = resolveAgentToken();
        if (!token) {
          throw new Error(
            `${STREAM555_TOKEN_ENV} (or STREAM_API_BEARER_TOKEN) is not configured`,
          );
        }
        const base = resolveGamesBase(dialect);
        const sessionId = await ensureAgentSessionId(
          base,
          token,
          requestedSessionId,
        );
        return executeApiAction({
          module: "five55.games",
          action: "FIVE55_GAMES_PLAY",
          base,
          endpoint: resolvePlayEndpoint(dialect, sessionId),
          payload: {
            ...(gameId ? { gameId } : {}),
            mode: mode ?? "spectate",
          },
          requestContract: {
            gameId: { required: true, type: "string", nonEmpty: true },
            mode: {
              required: true,
              type: "string",
              nonEmpty: true,
              oneOf: ["standard", "ranked", "spectate"],
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
          mode: mode ?? "spectate",
        },
        requestContract: {
          gameId: { required: false, type: "string", nonEmpty: true },
          mode: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["standard", "ranked", "spectate"],
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
      description: "Session mode (standard|ranked|spectate)",
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
    actions: [catalogAction, playAction],
  };
}

export default createFive55GamesPlugin;
