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
  requireApiBase,
} from "../five55-shared/action-kit.js";

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const API_ENV = "FIVE55_GAMES_API_URL";

const gamesProvider: Provider = {
  name: "five55Games",
  description: "Five55 game discovery and launch orchestration surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[API_ENV]?.trim());
    return {
      text: [
        "## Five55 Games Surface",
        "",
        "Actions: FIVE55_GAMES_CATALOG, FIVE55_GAMES_PLAY",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV})`,
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
      const filter = readParam(options as HandlerOptions | undefined, "filter");
      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_CATALOG",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/games/catalog",
        payload: {
          filter: filter ?? "all",
        },
        requestContract: {
          filter: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["all", "featured", "competitive"],
          },
        },
        responseContract: {},
        successMessage: "game catalog fetched",
        transport: {
          service: "games",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_CATALOG", err);
    }
  },
  parameters: [
    {
      name: "filter",
      description: "Catalog filter (all|featured|competitive)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const playAction: Action = {
  name: "FIVE55_GAMES_PLAY",
  similes: ["PLAY_GAME", "LAUNCH_GAME", "FIVE55_PLAY"],
  description: "Starts a game session for a selected Five55 game.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      const gameId = readParam(options as HandlerOptions | undefined, "gameId");
      const mode = readParam(options as HandlerOptions | undefined, "mode");
      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_PLAY",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/games/play",
        payload: {
          gameId,
          mode: mode ?? "standard",
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
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "mode",
      description: "Session mode (standard|ranked|spectate)",
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
