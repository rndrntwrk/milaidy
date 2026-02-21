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
  exceptionAction,
  executeApiAction,
  readParam,
} from "../five55-shared/action-kit.js";

const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM555_TOKEN_ENV = "STREAM555_AGENT_TOKEN";
const STREAM_SESSION_ENV = "STREAM_SESSION_ID";
const STREAM555_SESSION_ENV = "STREAM555_DEFAULT_SESSION_ID";

let cachedAgentSessionId: string | undefined;

type JsonObject = Record<string, unknown>;

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function resolveBaseUrl(): string {
  const base = trimEnv(STREAM555_BASE_ENV);
  if (!base) throw new Error(`${STREAM555_BASE_ENV} is not configured`);
  return base;
}

function resolveAgentToken(): string {
  const token =
    trimEnv(STREAM555_TOKEN_ENV) ?? trimEnv("STREAM_API_BEARER_TOKEN");
  if (!token) {
    throw new Error(
      `${STREAM555_TOKEN_ENV} (or STREAM_API_BEARER_TOKEN) is required`,
    );
  }
  return token;
}

async function fetchJson(
  method: "POST" | "PUT",
  base: string,
  endpoint: string,
  token: string,
  payload: JsonObject,
): Promise<{ ok: boolean; status: number; data?: JsonObject; rawBody: string }> {
  const target = new URL(endpoint, base);
  const response = await fetch(target, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const rawBody = await response.text();
  let data: JsonObject | undefined;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as JsonObject;
    }
  } catch {
    // non-json response
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    rawBody,
  };
}

function getErrorDetail(payload: { data?: JsonObject; rawBody: string }): string {
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

function commandTransport(token: string) {
  return {
    service: "stream555",
    operation: "command" as const,
    idempotent: true,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

const stream555ControlProvider: Provider = {
  name: "stream555Control",
  description: "555stream orchestration controls (go-live, ads, radio, guests, scenes)",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(trimEnv(STREAM555_BASE_ENV));
    const hasToken = Boolean(
      trimEnv(STREAM555_TOKEN_ENV) ?? trimEnv("STREAM_API_BEARER_TOKEN"),
    );
    return {
      text: [
        "## 555stream Control Surface",
        "",
        "Actions: STREAM555_GO_LIVE, STREAM555_END_LIVE, STREAM555_AD_TRIGGER, STREAM555_AD_DISMISS, STREAM555_RADIO_CONTROL, STREAM555_GUEST_INVITE, STREAM555_SCENE_SET, STREAM555_PIP_ENABLE",
        `Base URL configured: ${configured ? "yes" : "no"} (${STREAM555_BASE_ENV})`,
        `Agent token configured: ${hasToken ? "yes" : "no"} (${STREAM555_TOKEN_ENV}|STREAM_API_BEARER_TOKEN)`,
      ].join("\n"),
    };
  },
};

const goLiveAction: Action = {
  name: "STREAM555_GO_LIVE",
  similes: ["GO_LIVE_STREAM555", "STREAM555_START_LIVE", "START_LIVE_STREAM555"],
  description:
    "Starts Alice live stream via agent-v1 stream start for the resolved session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const inputType =
        readParam(options as HandlerOptions | undefined, "inputType") || "website";
      const inputUrl = readParam(options as HandlerOptions | undefined, "inputUrl");
      const scene = readParam(options as HandlerOptions | undefined, "scene") || "default";

      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_GO_LIVE",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/start`,
        payload: {
          input: {
            type: inputType,
            ...(inputUrl ? { url: inputUrl } : {}),
          },
          options: { scene },
        },
        requestContract: {
          input: { required: true, type: "object" },
          options: { required: false, type: "object" },
        },
        responseContract: {},
        successMessage: "go-live requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_GO_LIVE", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "inputType", description: "camera|screen|website|avatar|radio|...", required: false, schema: { type: "string" as const } },
    { name: "inputUrl", description: "Optional source url for website/rtmp/file", required: false, schema: { type: "string" as const } },
    { name: "scene", description: "Initial scene id", required: false, schema: { type: "string" as const } },
  ],
};

const endLiveAction: Action = {
  name: "STREAM555_END_LIVE",
  similes: ["STOP_LIVE_STREAM555", "STREAM555_STOP_LIVE"],
  description: "Stops Alice live stream for the resolved session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_END_LIVE",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/stop`,
        payload: {},
        requestContract: {},
        responseContract: {},
        successMessage: "end-live requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_END_LIVE", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
  ],
};

const adsTriggerAction: Action = {
  name: "STREAM555_AD_TRIGGER",
  similes: ["STREAM555_TRIGGER_AD", "TRIGGER_AD_BREAK_STREAM555"],
  description: "Triggers an ad break for a specific ad id in the active session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const adId = readParam(options as HandlerOptions | undefined, "adId");
      if (!adId) throw new Error("adId is required");

      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const durationMsRaw = readParam(
        options as HandlerOptions | undefined,
        "durationMs",
      );
      const durationMs = durationMsRaw ? Number.parseInt(durationMsRaw, 10) : undefined;
      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_AD_TRIGGER",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/${encodeURIComponent(adId)}/trigger`,
        payload: {
          ...(Number.isFinite(durationMs) ? { durationMs } : {}),
        },
        requestContract: {},
        responseContract: {},
        successMessage: "ad trigger requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_AD_TRIGGER", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "adId", description: "Ad identifier", required: true, schema: { type: "string" as const } },
    { name: "durationMs", description: "Optional ad duration override", required: false, schema: { type: "string" as const } },
  ],
};

const adsDismissAction: Action = {
  name: "STREAM555_AD_DISMISS",
  similes: ["STREAM555_DISMISS_AD", "DISMISS_AD_BREAK_STREAM555"],
  description: "Dismisses currently active ad break in the resolved session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_AD_DISMISS",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/dismiss`,
        payload: {},
        requestContract: {},
        responseContract: {},
        successMessage: "ad dismiss requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_AD_DISMISS", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
  ],
};

const radioControlAction: Action = {
  name: "STREAM555_RADIO_CONTROL",
  similes: ["STREAM555_RADIO_SET", "RADIO_CONTROL_STREAM555"],
  description:
    "Controls radio in-session (toggleTrack|toggleEffect|setAutoDJMode|setVolume|setBackground).",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const action =
        readParam(options as HandlerOptions | undefined, "action") || "setAutoDJMode";
      const trackId = readParam(options as HandlerOptions | undefined, "trackId");
      const effectId = readParam(options as HandlerOptions | undefined, "effectId");
      const mode = readParam(options as HandlerOptions | undefined, "mode");
      const target = readParam(options as HandlerOptions | undefined, "target");
      const levelRaw = readParam(options as HandlerOptions | undefined, "level");
      const level = levelRaw ? Number.parseInt(levelRaw, 10) : undefined;
      const background = readParam(
        options as HandlerOptions | undefined,
        "background",
      );

      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_RADIO_CONTROL",
        base,
        endpoint: `/api/agent/v1/radio/${encodeURIComponent(sessionId)}/control`,
        payload: {
          action,
          ...(trackId ? { trackId } : {}),
          ...(effectId ? { effectId } : {}),
          ...(mode ? { mode } : {}),
          ...(target ? { target } : {}),
          ...(Number.isFinite(level) ? { level } : {}),
          ...(background ? { background } : {}),
        },
        requestContract: {
          action: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "radio control requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_RADIO_CONTROL", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "action", description: "toggleTrack|toggleEffect|setAutoDJMode|setVolume|setBackground", required: true, schema: { type: "string" as const } },
    { name: "trackId", description: "Track id for toggleTrack", required: false, schema: { type: "string" as const } },
    { name: "effectId", description: "Effect id for toggleEffect", required: false, schema: { type: "string" as const } },
    { name: "mode", description: "Mode for setAutoDJMode", required: false, schema: { type: "string" as const } },
    { name: "target", description: "Target for setVolume", required: false, schema: { type: "string" as const } },
    { name: "level", description: "0-100 volume level", required: false, schema: { type: "string" as const } },
    { name: "background", description: "Background key/url", required: false, schema: { type: "string" as const } },
  ],
};

const guestInviteAction: Action = {
  name: "STREAM555_GUEST_INVITE",
  similes: ["STREAM555_INVITE_GUEST", "GUEST_INVITE_STREAM555"],
  description: "Creates a guest invite link for the resolved session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const name = readParam(options as HandlerOptions | undefined, "name");
      const email = readParam(options as HandlerOptions | undefined, "email");
      const expiresInRaw = readParam(
        options as HandlerOptions | undefined,
        "expiresIn",
      );
      const expiresIn = expiresInRaw
        ? Number.parseInt(expiresInRaw, 10)
        : undefined;

      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_GUEST_INVITE",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/guests/invites`,
        payload: {
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          ...(Number.isFinite(expiresIn) ? { expiresIn } : {}),
        },
        requestContract: {},
        responseContract: {},
        successMessage: "guest invite created",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_GUEST_INVITE", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "name", description: "Guest display name", required: false, schema: { type: "string" as const } },
    { name: "email", description: "Guest email hint", required: false, schema: { type: "string" as const } },
    { name: "expiresIn", description: "Invite ttl in seconds", required: false, schema: { type: "string" as const } },
  ],
};

const sceneSetAction: Action = {
  name: "STREAM555_SCENE_SET",
  similes: ["STREAM555_SET_SCENE", "SET_SCENE_STREAM555"],
  description: "Sets active studio scene for resolved session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const sceneId =
        readParam(options as HandlerOptions | undefined, "sceneId") || "default";
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );

      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_SCENE_SET",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/studio/scene/active`,
        payload: { sceneId },
        requestContract: {
          sceneId: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "scene switch requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_SCENE_SET", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "sceneId", description: "Scene id to activate", required: true, schema: { type: "string" as const } },
  ],
};

const pipEnableAction: Action = {
  name: "STREAM555_PIP_ENABLE",
  similes: ["STREAM555_ENABLE_PIP", "ENABLE_PIP_STREAM555"],
  description:
    "Enables PiP-like presentation by switching to a PiP scene (default: active-pip).",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const pipScene =
        readParam(options as HandlerOptions | undefined, "sceneId") || "active-pip";
      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_PIP_ENABLE",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/studio/scene/active`,
        payload: { sceneId: pipScene },
        requestContract: {
          sceneId: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "pip scene requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_PIP_ENABLE", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "sceneId", description: "PiP scene id (default active-pip)", required: false, schema: { type: "string" as const } },
  ],
};

export function createStream555ControlPlugin(): Plugin {
  return {
    name: "stream555-control",
    description:
      "Direct 555stream control surface for go-live, ads, radio, guests, and studio scene operations.",
    providers: [stream555ControlProvider],
    actions: [
      goLiveAction,
      endLiveAction,
      adsTriggerAction,
      adsDismissAction,
      radioControlAction,
      guestInviteAction,
      sceneSetAction,
      pipEnableAction,
    ],
  };
}

export default createStream555ControlPlugin;

