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
const API_ENV = "FIVE55_BATTLES_API_URL";

const battlesProvider: Provider = {
  name: "five55Battles",
  description: "Five55 battle state and resolution surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[API_ENV]?.trim());
    return {
      text: [
        "## Five55 Battles Surface",
        "",
        "Actions: FIVE55_BATTLES_READ, FIVE55_BATTLES_RESOLVE",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV})`,
      ].join("\n"),
    };
  },
};

const readAction: Action = {
  name: "FIVE55_BATTLES_READ",
  similes: ["READ_BATTLES", "LIST_BATTLES"],
  description: "Reads active/pending battle records.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "battles.read");
      const status = readParam(options as HandlerOptions | undefined, "status");
      return executeApiAction({
        module: "five55.battles",
        action: "FIVE55_BATTLES_READ",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/battles/read",
        payload: {
          status: status ?? "active",
        },
        requestContract: {
          status: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["active", "pending", "resolved", "all"],
          },
        },
        responseContract: {},
        successMessage: "battles fetched",
        transport: {
          service: "battles",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("five55.battles", "FIVE55_BATTLES_READ", err);
    }
  },
  parameters: [
    {
      name: "status",
      description: "Battle status filter (active|pending|resolved|all)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const resolveAction: Action = {
  name: "FIVE55_BATTLES_RESOLVE",
  similes: ["RESOLVE_BATTLE", "SETTLE_BATTLE"],
  description: "Resolves battle outcome and emits downstream scoring events.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "battles.resolve");
      const battleId = readParam(options as HandlerOptions | undefined, "battleId");
      const winnerId = readParam(options as HandlerOptions | undefined, "winnerId");
      return executeApiAction({
        module: "five55.battles",
        action: "FIVE55_BATTLES_RESOLVE",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/battles/resolve",
        payload: { battleId, winnerId },
        requestContract: {
          battleId: { required: true, type: "string", nonEmpty: true },
          winnerId: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "battle resolved",
        transport: {
          service: "battles",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction("five55.battles", "FIVE55_BATTLES_RESOLVE", err);
    }
  },
  parameters: [
    {
      name: "battleId",
      description: "Battle identifier",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "winnerId",
      description: "Winning player/agent identifier",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55BattlesPlugin(): Plugin {
  return {
    name: "five55-battles",
    description: "Five55 battles resolution plugin",
    providers: [battlesProvider],
    actions: [readAction, resolveAction],
  };
}

export default createFive55BattlesPlugin;
