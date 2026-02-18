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
const API_ENV = "FIVE55_QUESTS_API_URL";

const questsProvider: Provider = {
  name: "five55Quests",
  description: "Five55 quests/challenges lifecycle surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[API_ENV]?.trim());
    return {
      text: [
        "## Five55 Quests Surface",
        "",
        "Actions: FIVE55_QUESTS_READ, FIVE55_QUESTS_CREATE, FIVE55_QUESTS_COMPLETE",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV})`,
      ].join("\n"),
    };
  },
};

const readAction: Action = {
  name: "FIVE55_QUESTS_READ",
  similes: ["READ_QUESTS", "LIST_QUESTS", "GET_QUESTS"],
  description: "Reads active and completed quests/challenges.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "quests.read");
      const userId = readParam(options as HandlerOptions | undefined, "userId");
      const status = readParam(options as HandlerOptions | undefined, "status");
      return executeApiAction({
        module: "five55.quests",
        action: "FIVE55_QUESTS_READ",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/quests/read",
        payload: {
          userId: userId ?? "",
          status: status ?? "active",
        },
        requestContract: {
          userId: { required: true, type: "string" },
          status: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["active", "completed", "all"],
          },
        },
        responseContract: {},
        successMessage: "quests fetched",
        transport: {
          service: "quests",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("five55.quests", "FIVE55_QUESTS_READ", err);
    }
  },
  parameters: [
    {
      name: "userId",
      description: "Optional user identifier",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "status",
      description: "Quest status filter (active|completed|all)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const createAction: Action = {
  name: "FIVE55_QUESTS_CREATE",
  similes: ["CREATE_QUEST", "NEW_QUEST"],
  description: "Creates a new quest/challenge.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "quests.create");
      const title = readParam(options as HandlerOptions | undefined, "title");
      const objective = readParam(
        options as HandlerOptions | undefined,
        "objective",
      );
      return executeApiAction({
        module: "five55.quests",
        action: "FIVE55_QUESTS_CREATE",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/quests/create",
        payload: { title, objective },
        requestContract: {
          title: { required: true, type: "string", nonEmpty: true },
          objective: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "quest created",
        transport: {
          service: "quests",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction("five55.quests", "FIVE55_QUESTS_CREATE", err);
    }
  },
  parameters: [
    {
      name: "title",
      description: "Quest title",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "objective",
      description: "Quest objective statement",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

const completeAction: Action = {
  name: "FIVE55_QUESTS_COMPLETE",
  similes: ["COMPLETE_QUEST", "FINISH_QUEST"],
  description: "Marks quest completion for a user and triggers points pipeline.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "quests.complete");
      const questId = readParam(options as HandlerOptions | undefined, "questId");
      const userId = readParam(options as HandlerOptions | undefined, "userId");
      return executeApiAction({
        module: "five55.quests",
        action: "FIVE55_QUESTS_COMPLETE",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/quests/complete",
        payload: { questId, userId },
        requestContract: {
          questId: { required: true, type: "string", nonEmpty: true },
          userId: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "quest completion recorded",
        transport: {
          service: "quests",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction("five55.quests", "FIVE55_QUESTS_COMPLETE", err);
    }
  },
  parameters: [
    {
      name: "questId",
      description: "Quest identifier",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "userId",
      description: "User identifier",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55QuestsPlugin(): Plugin {
  return {
    name: "five55-quests",
    description: "Five55 quests lifecycle plugin",
    providers: [questsProvider],
    actions: [readAction, createAction, completeAction],
  };
}

export default createFive55QuestsPlugin;
