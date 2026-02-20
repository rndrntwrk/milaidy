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

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const API_ENV = "FIVE55_ADMIN_API_URL";
const LEGACY_API_ENVS = [
  "TWITTER_AGENT_MAIN_API_BASE",
  "TWITTER_BOT_MAIN_API_BASE",
];
const BEARER_ENV = "FIVE55_ADMIN_BEARER_TOKEN";
const LEGACY_BEARER_ENVS = [
  "ADMIN_API_TOKEN",
  "TWITTER_AGENT_KEY",
  "TWITTER_BOT_KEY",
];

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function resolveAdminBase(): string {
  const modern = trimEnv(API_ENV);
  if (modern) return modern;
  for (const key of LEGACY_API_ENVS) {
    const candidate = trimEnv(key);
    if (candidate) return candidate;
  }
  throw new Error(
    `${API_ENV} or ${LEGACY_API_ENVS.join("|")} must be configured`,
  );
}

function resolveBearerToken(): string | undefined {
  const modern = trimEnv(BEARER_ENV);
  if (modern) return modern;
  for (const key of LEGACY_BEARER_ENVS) {
    const candidate = trimEnv(key);
    if (candidate) return candidate;
  }
  return undefined;
}

const adminProvider: Provider = {
  name: "five55Admin",
  description:
    "Five55 admin controls for theme, events, and cabinet possession",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(
      trimEnv(API_ENV) || LEGACY_API_ENVS.some((key) => Boolean(trimEnv(key))),
    );
    const tokenConfigured = Boolean(
      trimEnv(BEARER_ENV) ||
        LEGACY_BEARER_ENVS.some((key) => Boolean(trimEnv(key))),
    );
    return {
      text: [
        "## Five55 Admin Surface",
        "",
        "Actions: FIVE55_THEME_SET, FIVE55_EVENT_TRIGGER, FIVE55_CABINET_POSSESS, FIVE55_CABINET_RELEASE",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV}|${LEGACY_API_ENVS.join("|")})`,
        `Auth configured: ${tokenConfigured ? "yes" : "no"} (${BEARER_ENV}|${LEGACY_BEARER_ENVS.join("|")})`,
      ].join("\n"),
    };
  },
};

const themeSetAction: Action = {
  name: "FIVE55_THEME_SET",
  similes: ["UPDATE_THEME", "CHANGE_THEME", "SET_THEME", "SWITCH_MODE"],
  description:
    "Updates the active 555 site theme (for operators and live events).",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(runtime, message, state, "FIVE55_THEME_SET");
      assertFive55Capability(CAPABILITY_POLICY, "theme.write");
      const theme =
        readParam(options as HandlerOptions | undefined, "theme") ?? "default";
      const token = resolveBearerToken();
      return executeApiAction({
        module: "five55.admin",
        action: "FIVE55_THEME_SET",
        base: resolveAdminBase(),
        endpoint: "/admin/theme",
        payload: { theme },
        requestContract: {
          theme: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "theme updated",
        transport: {
          service: "admin",
          operation: "command",
          idempotent: true,
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        },
      });
    } catch (err) {
      return exceptionAction("five55.admin", "FIVE55_THEME_SET", err);
    }
  },
  parameters: [
    {
      name: "theme",
      description:
        "Theme identifier (for example: default, glitch, neon, gold, dark, retro, matrix)",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

const eventTriggerAction: Action = {
  name: "FIVE55_EVENT_TRIGGER",
  similes: [
    "TRIGGER_EVENT",
    "START_EVENT",
    "ACTIVATE_BONUS",
    "ENABLE_MULTIPLIER",
  ],
  description:
    "Triggers a temporary platform event (double_xp, free_play, burn_boost).",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(
        runtime,
        message,
        state,
        "FIVE55_EVENT_TRIGGER",
      );
      assertFive55Capability(CAPABILITY_POLICY, "theme.write");
      const eventType =
        readParam(options as HandlerOptions | undefined, "type") ?? "double_xp";
      const durationRaw =
        readParam(options as HandlerOptions | undefined, "durationMinutes") ??
        "60";
      const durationMinutes = Number.parseInt(durationRaw, 10);
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        throw new Error("durationMinutes must be a positive integer");
      }

      const token = resolveBearerToken();
      return executeApiAction({
        module: "five55.admin",
        action: "FIVE55_EVENT_TRIGGER",
        base: resolveAdminBase(),
        endpoint: "/admin/event",
        payload: {
          type: eventType,
          duration_minutes: durationMinutes,
        },
        requestContract: {
          type: { required: true, type: "string", nonEmpty: true },
          duration_minutes: { required: true, type: "number" },
        },
        responseContract: {},
        successMessage: "event triggered",
        transport: {
          service: "admin",
          operation: "command",
          idempotent: true,
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        },
      });
    } catch (err) {
      return exceptionAction("five55.admin", "FIVE55_EVENT_TRIGGER", err);
    }
  },
  parameters: [
    {
      name: "type",
      description: "Event type (double_xp|free_play|burn_boost)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "durationMinutes",
      description: "Event duration in minutes",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const possessCabinetAction: Action = {
  name: "FIVE55_CABINET_POSSESS",
  similes: [
    "POSSESS_CABINET",
    "CONTROL_CABINET",
    "OVERRIDE_CABINET",
    "POSSESS_MACHINE",
  ],
  description:
    "Possesses a cabinet and injects operator metadata (capability, value, message).",
  validate: async () => true,
  handler: async (runtime, _message, _state, options) => {
    try {
      assertTrustedAdminForAction(
        runtime,
        _message,
        _state,
        "FIVE55_CABINET_POSSESS",
      );
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      const gameId =
        readParam(options as HandlerOptions | undefined, "gameId") ??
        readParam(options as HandlerOptions | undefined, "cabinetId");
      const capability = readParam(
        options as HandlerOptions | undefined,
        "capability",
      );
      const value = readParam(options as HandlerOptions | undefined, "value");
      const message = readParam(
        options as HandlerOptions | undefined,
        "message",
      );
      const agentId =
        readParam(options as HandlerOptions | undefined, "agentId") ??
        runtime.agentId ??
        "milaidy-agent";
      const token = resolveBearerToken();

      return executeApiAction({
        module: "five55.admin",
        action: "FIVE55_CABINET_POSSESS",
        base: resolveAdminBase(),
        endpoint: "/admin/cabinet/possess",
        payload: {
          game_id: gameId,
          agent_id: agentId,
          metadata: {
            capability: capability ?? "",
            value,
            message,
            source: "milaidy-five55-admin",
          },
        },
        requestContract: {
          game_id: { required: true, type: "string", nonEmpty: true },
          agent_id: { required: true, type: "string", nonEmpty: true },
          metadata: { required: true, type: "object" },
        },
        responseContract: {},
        successMessage: "cabinet possessed",
        transport: {
          service: "admin",
          operation: "command",
          idempotent: true,
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        },
      });
    } catch (err) {
      return exceptionAction("five55.admin", "FIVE55_CABINET_POSSESS", err);
    }
  },
  parameters: [
    {
      name: "gameId",
      description: "Game/cabinet identifier",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "capability",
      description: "Capability label being injected into the cabinet",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "value",
      description: "Optional capability value payload",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "message",
      description: "Optional operator message",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "agentId",
      description: "Agent identifier for possession metadata",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const releaseCabinetAction: Action = {
  name: "FIVE55_CABINET_RELEASE",
  similes: ["RELEASE_CABINET", "UNPOSSESS_CABINET", "RELEASE_MACHINE"],
  description: "Releases a previously possessed cabinet.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(
        runtime,
        message,
        state,
        "FIVE55_CABINET_RELEASE",
      );
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      const cabinetId =
        readParam(options as HandlerOptions | undefined, "cabinetId") ??
        readParam(options as HandlerOptions | undefined, "gameId");
      const token = resolveBearerToken();
      return executeApiAction({
        module: "five55.admin",
        action: "FIVE55_CABINET_RELEASE",
        base: resolveAdminBase(),
        endpoint: "/admin/cabinet/release",
        payload: {
          cabinet_id: cabinetId,
        },
        requestContract: {
          cabinet_id: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "cabinet released",
        transport: {
          service: "admin",
          operation: "command",
          idempotent: true,
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        },
      });
    } catch (err) {
      return exceptionAction("five55.admin", "FIVE55_CABINET_RELEASE", err);
    }
  },
  parameters: [
    {
      name: "cabinetId",
      description: "Cabinet identifier to release",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55AdminPlugin(): Plugin {
  return {
    name: "five55-admin",
    description: "Five55 admin operations (theme/event/cabinet) plugin",
    providers: [adminProvider],
    actions: [
      themeSetAction,
      eventTriggerAction,
      possessCabinetAction,
      releaseCabinetAction,
    ],
  };
}

export default createFive55AdminPlugin;
