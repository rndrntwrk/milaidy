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
const STREAM_API_ENV = "STREAM_API_URL";

const streamProvider: Provider = {
  name: "stream",
  description: "Stream control and observability surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[STREAM_API_ENV]?.trim());
    return {
      text: [
        "## Stream Surface",
        "",
        "Use stream actions to inspect and control live stream operations.",
        `API configured: ${configured ? "yes" : "no"} (${STREAM_API_ENV})`,
        "Actions: STREAM_STATUS, STREAM_CONTROL, STREAM_SCHEDULE",
      ].join("\n"),
    };
  },
};

const streamStatusAction: Action = {
  name: "STREAM_STATUS",
  similes: ["STREAM_STATUS", "GET_STREAM_STATUS", "LIVE_STATUS"],
  description:
    "Reads current stream state, active scene, and observability metrics.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "stream.read");
      const scope = readParam(options as HandlerOptions | undefined, "scope");
      return executeApiAction({
        module: "stream",
        action: "STREAM_STATUS",
        base: requireApiBase(STREAM_API_ENV),
        endpoint: "/v1/stream/status",
        payload: {
          scope: scope ?? "current",
        },
        requestContract: {
          scope: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["current", "day", "week"],
          },
        },
        responseContract: {},
        successMessage: "stream status fetched",
        transport: {
          service: "stream",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("stream", "STREAM_STATUS", err);
    }
  },
  parameters: [
    {
      name: "scope",
      description: "Scope selector (current|day|week)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const streamControlAction: Action = {
  name: "STREAM_CONTROL",
  similes: ["STREAM_CONTROL", "START_STREAM", "STOP_STREAM", "SET_SCENE"],
  description:
    "Controls stream lifecycle and active scene/action overlays.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");
      const operation = readParam(
        options as HandlerOptions | undefined,
        "operation",
      );
      const scene = readParam(options as HandlerOptions | undefined, "scene");
      return executeApiAction({
        module: "stream",
        action: "STREAM_CONTROL",
        base: requireApiBase(STREAM_API_ENV),
        endpoint: "/v1/stream/control",
        payload: {
          operation,
          scene: scene ?? "default",
        },
        requestContract: {
          operation: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["start", "stop", "pause", "resume", "scene"],
          },
          scene: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "stream control submitted",
        transport: {
          service: "stream",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction("stream", "STREAM_CONTROL", err);
    }
  },
  parameters: [
    {
      name: "operation",
      description: "Operation (start|stop|pause|resume|scene)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "scene",
      description: "Optional scene/profile target",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const streamScheduleAction: Action = {
  name: "STREAM_SCHEDULE",
  similes: ["SCHEDULE_STREAM", "PLAN_STREAM", "STREAM_TIMELINE"],
  description:
    "Schedules stream windows plus projected economic impact.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");
      const startsAt = readParam(options as HandlerOptions | undefined, "startsAt");
      const durationMin = readParam(
        options as HandlerOptions | undefined,
        "durationMin",
      );
      return executeApiAction({
        module: "stream",
        action: "STREAM_SCHEDULE",
        base: requireApiBase(STREAM_API_ENV),
        endpoint: "/v1/stream/schedule",
        payload: {
          startsAt,
          durationMin: durationMin ?? "60",
        },
        requestContract: {
          startsAt: { required: true, type: "string", nonEmpty: true },
          durationMin: {
            required: true,
            type: "string",
            nonEmpty: true,
            pattern: /^\d+$/,
          },
        },
        responseContract: {},
        successMessage: "stream schedule submitted",
        transport: {
          service: "stream",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction("stream", "STREAM_SCHEDULE", err);
    }
  },
  parameters: [
    {
      name: "startsAt",
      description: "ISO start timestamp",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "durationMin",
      description: "Duration in minutes",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

export function createStreamPlugin(): Plugin {
  return {
    name: "stream",
    description: "Live-stream orchestration and observability surface",
    providers: [streamProvider],
    actions: [streamStatusAction, streamControlAction, streamScheduleAction],
  };
}

export default createStreamPlugin;
