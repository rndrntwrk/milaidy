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
const API_ENV = "FIVE55_REWARDS_API_URL";

const rewardsProvider: Provider = {
  name: "five55Rewards",
  description: "Five55 rewards projection and settlement surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[API_ENV]?.trim());
    return {
      text: [
        "## Five55 Rewards Surface",
        "",
        "Actions: FIVE55_REWARDS_PROJECT, FIVE55_REWARDS_ALLOCATE",
        "Settlement operations remain policy-gated until launch controls enable payout.",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV})`,
      ].join("\n"),
    };
  },
};

const projectAction: Action = {
  name: "FIVE55_REWARDS_PROJECT",
  similes: ["PROJECT_REWARDS", "REWARDS_PROJECTION"],
  description:
    "Projects rewards from points/credits activity without settlement side effects.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "rewards.project");
      const window = readParam(options as HandlerOptions | undefined, "window");
      const userId = readParam(options as HandlerOptions | undefined, "userId");
      return executeApiAction({
        module: "five55.rewards",
        action: "FIVE55_REWARDS_PROJECT",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/rewards/project",
        payload: {
          window: window ?? "weekly",
          userId: userId ?? "",
        },
        requestContract: {
          window: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["daily", "weekly", "monthly"],
          },
          userId: { required: true, type: "string" },
        },
        responseContract: {},
        successMessage: "rewards projected",
        transport: {
          service: "rewards",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("five55.rewards", "FIVE55_REWARDS_PROJECT", err);
    }
  },
  parameters: [
    {
      name: "window",
      description: "Projection window (daily|weekly|monthly)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "userId",
      description: "Optional user identifier",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const allocateAction: Action = {
  name: "FIVE55_REWARDS_ALLOCATE",
  similes: ["ALLOCATE_REWARDS", "SETTLE_REWARDS", "PAYOUT_REWARDS"],
  description:
    "Allocates rewards and prepares settlement transfer instructions.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "rewards.allocate");
      const userId = readParam(options as HandlerOptions | undefined, "userId");
      const amount = readParam(options as HandlerOptions | undefined, "amount");
      const asset = readParam(options as HandlerOptions | undefined, "asset");
      return executeApiAction({
        module: "five55.rewards",
        action: "FIVE55_REWARDS_ALLOCATE",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/rewards/allocate",
        payload: {
          userId,
          amount,
          asset: asset ?? "USDC",
        },
        requestContract: {
          userId: { required: true, type: "string", nonEmpty: true },
          amount: {
            required: true,
            type: "string",
            nonEmpty: true,
            pattern: /^\d+(\.\d+)?$/,
          },
          asset: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["USDC", "CREDITS"],
          },
        },
        responseContract: {},
        successMessage: "rewards allocation submitted",
        transport: {
          service: "rewards",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction(
        "five55.rewards",
        "FIVE55_REWARDS_ALLOCATE",
        err,
      );
    }
  },
  parameters: [
    {
      name: "userId",
      description: "User identifier",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description: "Reward amount",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "asset",
      description: "Settlement asset (USDC|CREDITS)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55RewardsPlugin(): Plugin {
  return {
    name: "five55-rewards",
    description: "Five55 rewards projection and settlement plugin",
    providers: [rewardsProvider],
    actions: [projectAction, allocateAction],
  };
}

export default createFive55RewardsPlugin;
