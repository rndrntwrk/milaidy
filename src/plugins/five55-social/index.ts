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
  requireApiBase,
} from "../five55-shared/action-kit.js";

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const API_ENV = "FIVE55_SOCIAL_API_URL";

const socialProvider: Provider = {
  name: "five55Social",
  description: "Five55 social monitoring and point-assignment surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[API_ENV]?.trim());
    return {
      text: [
        "## Five55 Social Surface",
        "",
        "Actions: FIVE55_SOCIAL_MONITOR, FIVE55_SOCIAL_ASSIGN_POINTS",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV})`,
      ].join("\n"),
    };
  },
};

const monitorAction: Action = {
  name: "FIVE55_SOCIAL_MONITOR",
  similes: ["SOCIAL_MONITOR", "READ_SOCIAL_FEED"],
  description:
    "Reads social interaction signal stream for contribution scoring.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "social.monitor");
      const source = readParam(options as HandlerOptions | undefined, "source");
      const handle = readParam(options as HandlerOptions | undefined, "handle");
      return executeApiAction({
        module: "five55.social",
        action: "FIVE55_SOCIAL_MONITOR",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/social/monitor",
        payload: {
          source: source ?? "twitter",
          handle: handle ?? "",
        },
        requestContract: {
          source: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["twitter", "discord", "stream-chat"],
          },
          handle: { required: true, type: "string" },
        },
        responseContract: {},
        successMessage: "social snapshot fetched",
        transport: {
          service: "social",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("five55.social", "FIVE55_SOCIAL_MONITOR", err);
    }
  },
  parameters: [
    {
      name: "source",
      description: "Social source (twitter|discord|stream-chat)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "handle",
      description: "Optional user handle filter",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const assignPointsAction: Action = {
  name: "FIVE55_SOCIAL_ASSIGN_POINTS",
  similes: ["ASSIGN_SOCIAL_POINTS", "SOCIAL_POINTS_UPDATE"],
  description: "Assigns points based on validated social interactions.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(
        runtime,
        message,
        state,
        "FIVE55_SOCIAL_ASSIGN_POINTS",
      );
      assertFive55Capability(CAPABILITY_POLICY, "social.assign_points");
      const userId = readParam(options as HandlerOptions | undefined, "userId");
      const points = readParam(options as HandlerOptions | undefined, "points");
      const reason = readParam(options as HandlerOptions | undefined, "reason");
      return executeApiAction({
        module: "five55.social",
        action: "FIVE55_SOCIAL_ASSIGN_POINTS",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/social/assign-points",
        payload: {
          userId,
          points,
          reason: reason ?? "social-interaction",
        },
        requestContract: {
          userId: { required: true, type: "string", nonEmpty: true },
          points: {
            required: true,
            type: "string",
            nonEmpty: true,
            pattern: /^-?\d+$/,
          },
          reason: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "social points assigned",
        transport: {
          service: "social",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction(
        "five55.social",
        "FIVE55_SOCIAL_ASSIGN_POINTS",
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
      name: "points",
      description: "Points delta to assign",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "reason",
      description: "Optional reason code",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55SocialPlugin(): Plugin {
  return {
    name: "five55-social",
    description: "Five55 social monitoring and points plugin",
    providers: [socialProvider],
    actions: [monitorAction, assignPointsAction],
  };
}

export default createFive55SocialPlugin;
