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
const API_ENV = "FIVE55_LEADERBOARD_API_URL";

const leaderboardProvider: Provider = {
  name: "five55Leaderboard",
  description: "Five55 leaderboard read/write surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[API_ENV]?.trim());
    return {
      text: [
        "## Five55 Leaderboard Surface",
        "",
        "Actions: FIVE55_LEADERBOARD_READ, FIVE55_LEADERBOARD_WRITE",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV})`,
      ].join("\n"),
    };
  },
};

const readAction: Action = {
  name: "FIVE55_LEADERBOARD_READ",
  similes: ["READ_LEADERBOARD", "GET_LEADERBOARD"],
  description: "Reads per-game or global leaderboard standings.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "leaderboard.read");
      const board = readParam(options as HandlerOptions | undefined, "board");
      const gameId = readParam(options as HandlerOptions | undefined, "gameId");
      return executeApiAction({
        module: "five55.leaderboard",
        action: "FIVE55_LEADERBOARD_READ",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/leaderboard/read",
        payload: {
          board: board ?? "global",
          gameId: gameId ?? "",
        },
        requestContract: {
          board: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["global", "game"],
          },
          gameId: { required: true, type: "string" },
        },
        responseContract: {},
        successMessage: "leaderboard fetched",
        transport: {
          service: "leaderboard",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("five55.leaderboard", "FIVE55_LEADERBOARD_READ", err);
    }
  },
  parameters: [
    {
      name: "board",
      description: "Board type (global|game)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "gameId",
      description: "Game identifier when board=game",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const writeAction: Action = {
  name: "FIVE55_LEADERBOARD_WRITE",
  similes: ["WRITE_LEADERBOARD", "UPDATE_LEADERBOARD"],
  description: "Writes or upserts leaderboard score entries.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "leaderboard.write");
      const userId = readParam(options as HandlerOptions | undefined, "userId");
      const gameId = readParam(options as HandlerOptions | undefined, "gameId");
      const score = readParam(options as HandlerOptions | undefined, "score");
      return executeApiAction({
        module: "five55.leaderboard",
        action: "FIVE55_LEADERBOARD_WRITE",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/leaderboard/write",
        payload: {
          userId,
          gameId: gameId ?? "",
          score,
        },
        requestContract: {
          userId: { required: true, type: "string", nonEmpty: true },
          gameId: { required: true, type: "string" },
          score: {
            required: true,
            type: "string",
            nonEmpty: true,
            pattern: /^-?\d+(\.\d+)?$/,
          },
        },
        responseContract: {},
        successMessage: "leaderboard updated",
        transport: {
          service: "leaderboard",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction(
        "five55.leaderboard",
        "FIVE55_LEADERBOARD_WRITE",
        err,
      );
    }
  },
  parameters: [
    {
      name: "userId",
      description: "User or agent identifier",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "gameId",
      description: "Optional game identifier for per-game leaderboard",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "score",
      description: "Score to upsert",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55LeaderboardPlugin(): Plugin {
  return {
    name: "five55-leaderboard",
    description: "Five55 leaderboard plugin",
    providers: [leaderboardProvider],
    actions: [readAction, writeAction],
  };
}

export default createFive55LeaderboardPlugin;
