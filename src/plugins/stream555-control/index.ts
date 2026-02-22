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

function parseCsvList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const list = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

async function fetchJson(
  method: "GET" | "POST" | "PUT",
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
    body: method === "GET" ? undefined : JSON.stringify(payload),
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

function mapFailureCode(status: number): string {
  if (status === 400) return "E_UPSTREAM_BAD_REQUEST";
  if (status === 401) return "E_UPSTREAM_UNAUTHORIZED";
  if (status === 403) return "E_UPSTREAM_FORBIDDEN";
  if (status === 404) return "E_UPSTREAM_NOT_FOUND";
  if (status === 409) return "E_UPSTREAM_CONFLICT";
  if (status === 429) return "E_UPSTREAM_RATE_LIMITED";
  if (status >= 500) return "E_UPSTREAM_SERVER";
  return "E_UPSTREAM_FAILURE";
}

function buildEnvelopeActionResult({
  ok,
  module,
  action,
  status,
  message,
  data,
  details,
}: {
  ok: boolean;
  module: string;
  action: string;
  status: number;
  message: string;
  data?: unknown;
  details?: unknown;
}): { success: boolean; text: string } {
  return {
    success: ok,
    text: JSON.stringify({
      ok,
      code: ok ? "OK" : mapFailureCode(status),
      module,
      action,
      message,
      status,
      retryable: status === 429 || status >= 500,
      ...(ok ? { data } : { details }),
    }),
  };
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

function buildStopIdempotencyKey(sessionId: string): string {
  const normalizedSessionId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const nonce = Math.random().toString(36).slice(2, 10);
  return `stream-stop:${normalizedSessionId}:${Date.now().toString(36)}:${nonce}`;
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
        "Actions: STREAM555_GO_LIVE, STREAM555_GO_LIVE_SEGMENTS, STREAM555_SEGMENT_STATE, STREAM555_SCREEN_SHARE, STREAM555_END_LIVE, STREAM555_AD_CREATE, STREAM555_AD_TRIGGER, STREAM555_AD_DISMISS, STREAM555_RADIO_CONTROL, STREAM555_GUEST_INVITE, STREAM555_SCENE_SET, STREAM555_PIP_ENABLE, STREAM555_SEGMENT_OVERRIDE, STREAM555_EARNINGS_ESTIMATE",
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

const goLiveSegmentsAction: Action = {
  name: "STREAM555_GO_LIVE_SEGMENTS",
  similes: [
    "GO_LIVE_SEGMENTS_STREAM555",
    "STREAM555_SEGMENT_BOOTSTRAP",
    "STREAM555_START_SEGMENT_MODE",
  ],
  description:
    "Bootstraps or resumes segment orchestration for the resolved active stream session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const segmentIntent = readParam(
        options as HandlerOptions | undefined,
        "segmentIntent",
      );
      const segmentTypes = parseCsvList(
        readParam(options as HandlerOptions | undefined, "segmentTypes"),
      );
      const topicHints = parseCsvList(
        readParam(options as HandlerOptions | undefined, "topicHints"),
      );
      const theme = readParam(options as HandlerOptions | undefined, "theme");
      const segmentCountRaw = readParam(
        options as HandlerOptions | undefined,
        "segmentCount",
      );
      const avgSegmentDurationMsRaw = readParam(
        options as HandlerOptions | undefined,
        "avgSegmentDurationMs",
      );
      const autoStopRaw = readParam(
        options as HandlerOptions | undefined,
        "autoStop",
      );
      const segmentCount = segmentCountRaw
        ? Number.parseInt(segmentCountRaw, 10)
        : undefined;
      const avgSegmentDurationMs = avgSegmentDurationMsRaw
        ? Number.parseInt(avgSegmentDurationMsRaw, 10)
        : undefined;
      const normalizedAutoStop = autoStopRaw
        ? !["false", "0", "no"].includes(autoStopRaw.trim().toLowerCase())
        : undefined;

      const optionsPayload: JsonObject = {};
      if (segmentIntent) optionsPayload.segmentIntent = segmentIntent;
      if (segmentTypes) optionsPayload.segmentTypes = segmentTypes;
      if (topicHints) optionsPayload.topicHints = topicHints;
      if (theme) optionsPayload.theme = theme;
      if (
        typeof segmentCount === "number" &&
        Number.isFinite(segmentCount) &&
        segmentCount > 0
      ) {
        optionsPayload.segmentCount = segmentCount;
      }
      if (
        typeof avgSegmentDurationMs === "number" &&
        Number.isFinite(avgSegmentDurationMs) &&
        avgSegmentDurationMs > 0
      ) {
        optionsPayload.avgSegmentDurationMs = avgSegmentDurationMs;
      }
      if (typeof normalizedAutoStop === "boolean") {
        optionsPayload.autoStop = normalizedAutoStop;
      }

      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_GO_LIVE_SEGMENTS",
        base,
        endpoint: "/api/agent/v1/go-live/segments",
        payload: {
          sessionId,
          options: optionsPayload,
        },
        requestContract: {
          sessionId: { required: true, type: "string", nonEmpty: true },
          options: { required: false, type: "object" },
        },
        responseContract: {},
        successMessage: "segment orchestration bootstrap requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_GO_LIVE_SEGMENTS", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "segmentIntent", description: "balanced|news|reaction|gaming|qa|analysis", required: false, schema: { type: "string" as const } },
    { name: "segmentTypes", description: "Comma-separated segment type list", required: false, schema: { type: "string" as const } },
    { name: "topicHints", description: "Comma-separated topic hints", required: false, schema: { type: "string" as const } },
    { name: "theme", description: "Optional segment theme override", required: false, schema: { type: "string" as const } },
    { name: "segmentCount", description: "Optional segment count", required: false, schema: { type: "string" as const } },
    { name: "avgSegmentDurationMs", description: "Optional segment duration per segment (ms)", required: false, schema: { type: "string" as const } },
    { name: "autoStop", description: "true|false", required: false, schema: { type: "string" as const } },
  ],
};

const segmentStateAction: Action = {
  name: "STREAM555_SEGMENT_STATE",
  similes: [
    "STREAM555_GET_SEGMENT_STATE",
    "STREAM555_SEGMENTS_STATUS",
    "SEGMENT_STATE_STREAM555",
  ],
  description:
    "Fetches segment runtime state for the resolved session (queue, active segment, overrides, metrics).",
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
      const response = await fetchJson(
        "GET",
        base,
        `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/segments/state`,
        token,
        {},
      );
      if (!response.ok) {
        return buildEnvelopeActionResult({
          ok: false,
          module: "stream555.control",
          action: "STREAM555_SEGMENT_STATE",
          status: response.status || 502,
          message: `segment state query failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }

      return buildEnvelopeActionResult({
        ok: true,
        module: "stream555.control",
        action: "STREAM555_SEGMENT_STATE",
        status: response.status,
        message: "segment state fetched",
        data: response.data ?? {},
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_SEGMENT_STATE", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
  ],
};

const screenShareAction: Action = {
  name: "STREAM555_SCREEN_SHARE",
  similes: ["STREAM555_START_SCREEN_SHARE", "START_SCREEN_SHARE_STREAM555"],
  description:
    "Switches the current stream input to screen share for the resolved session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const inputUrl = readParam(options as HandlerOptions | undefined, "inputUrl");
      const sceneId =
        readParam(options as HandlerOptions | undefined, "sceneId") || "active-pip";

      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_SCREEN_SHARE",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/start`,
        payload: {
          input: {
            type: "screen",
            ...(inputUrl ? { url: inputUrl } : {}),
          },
          options: { scene: sceneId },
        },
        requestContract: {
          input: { required: true, type: "object" },
          options: { required: false, type: "object" },
        },
        responseContract: {},
        successMessage: "screen-share requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_SCREEN_SHARE", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "inputUrl", description: "Optional URL for browser-based screen source", required: false, schema: { type: "string" as const } },
    { name: "sceneId", description: "Scene to activate (default active-pip)", required: false, schema: { type: "string" as const } },
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
        transport: {
          ...commandTransport(token),
          idempotencyKey: buildStopIdempotencyKey(sessionId),
        },
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

const adsCreateAction: Action = {
  name: "STREAM555_AD_CREATE",
  similes: ["STREAM555_CREATE_AD", "CREATE_AD_STREAM555"],
  description: "Creates an ad in the resolved session for immediate or scheduled playback.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const type = readParam(options as HandlerOptions | undefined, "type") || "l-bar";
      const imageUrl = readParam(
        options as HandlerOptions | undefined,
        "imageUrl",
      );
      const text = readParam(options as HandlerOptions | undefined, "text");
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
        action: "STREAM555_AD_CREATE",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads`,
        payload: {
          type,
          ...(imageUrl ? { imageUrl } : {}),
          ...(text ? { text } : {}),
          ...(Number.isFinite(durationMs) ? { durationMs } : {}),
        },
        requestContract: {
          type: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "ad created",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_AD_CREATE", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "type", description: "Ad type (default l-bar)", required: false, schema: { type: "string" as const } },
    { name: "imageUrl", description: "Creative image URL", required: false, schema: { type: "string" as const } },
    { name: "text", description: "Creative text/caption", required: false, schema: { type: "string" as const } },
    { name: "durationMs", description: "Playback duration in milliseconds", required: false, schema: { type: "string" as const } },
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
      const radioPayload: JsonObject = {};
      if (trackId) radioPayload.trackId = trackId;
      if (effectId) radioPayload.effectId = effectId;
      if (mode) radioPayload.mode = mode;
      if (target) radioPayload.target = target;
      if (Number.isFinite(level)) radioPayload.level = level;
      if (background) radioPayload.backgroundId = background;

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
          payload: radioPayload,
        },
        requestContract: {
          action: { required: true, type: "string", nonEmpty: true },
          payload: { required: true, type: "object" },
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

const segmentOverrideAction: Action = {
  name: "STREAM555_SEGMENT_OVERRIDE",
  similes: ["STREAM555_OVERRIDE_SEGMENT", "SEGMENT_OVERRIDE_STREAM555"],
  description:
    "Queues a segment override for the active live session (e.g. reaction/news/gaming/qa/storytime).",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const segmentType =
        readParam(options as HandlerOptions | undefined, "segmentType") || "reaction";
      const reason = readParam(options as HandlerOptions | undefined, "reason");
      const requestedBy = readParam(
        options as HandlerOptions | undefined,
        "requestedBy",
      );

      const base = resolveBaseUrl();
      const token = resolveAgentToken();
      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_SEGMENT_OVERRIDE",
        base,
        endpoint: `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/segments/override`,
        payload: {
          segmentType,
          ...(reason ? { reason } : {}),
          ...(requestedBy ? { requestedBy } : {}),
        },
        requestContract: {
          segmentType: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "segment override requested",
        transport: commandTransport(token),
        context: { sessionId },
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_SEGMENT_OVERRIDE", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "segmentType", description: "reaction|news|gaming|storytime|qa", required: true, schema: { type: "string" as const } },
    { name: "reason", description: "Operator reason for override", required: false, schema: { type: "string" as const } },
    { name: "requestedBy", description: "Requester identifier", required: false, schema: { type: "string" as const } },
  ],
};

const earningsEstimateAction: Action = {
  name: "STREAM555_EARNINGS_ESTIMATE",
  similes: ["STREAM555_PROJECTED_EARNINGS", "PROJECTED_EARNINGS_STREAM555"],
  description:
    "Evaluates marketplace inventory and returns projected payout-per-impression opportunities.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const categoriesRaw = readParam(
        options as HandlerOptions | undefined,
        "categories",
      );
      const categories = parseCsvList(categoriesRaw);
      const limitRaw = readParam(options as HandlerOptions | undefined, "limit");
      const poolSizeRaw = readParam(
        options as HandlerOptions | undefined,
        "poolSize",
      );
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 5;
      const poolSize = poolSizeRaw ? Number.parseInt(poolSizeRaw, 10) : 30;
      const base = resolveBaseUrl();
      const token = resolveAgentToken();

      return executeApiAction({
        module: "stream555.control",
        action: "STREAM555_EARNINGS_ESTIMATE",
        base,
        endpoint: "/api/agent/v1/marketplace/evaluate",
        payload: {
          ...(categories ? { categories } : {}),
          ...(Number.isFinite(limit) ? { limit } : {}),
          ...(Number.isFinite(poolSize) ? { poolSize } : {}),
        },
        requestContract: {},
        responseContract: {},
        successMessage: "projected earnings evaluated",
        transport: commandTransport(token),
      });
    } catch (err) {
      return exceptionAction("stream555.control", "STREAM555_EARNINGS_ESTIMATE", err);
    }
  },
  parameters: [
    { name: "categories", description: "Comma-separated categories", required: false, schema: { type: "string" as const } },
    { name: "limit", description: "Top campaign count", required: false, schema: { type: "string" as const } },
    { name: "poolSize", description: "Evaluation candidate pool size", required: false, schema: { type: "string" as const } },
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
      goLiveSegmentsAction,
      segmentStateAction,
      screenShareAction,
      endLiveAction,
      adsCreateAction,
      adsTriggerAction,
      adsDismissAction,
      radioControlAction,
      guestInviteAction,
      sceneSetAction,
      pipEnableAction,
      segmentOverrideAction,
      earningsEstimateAction,
    ],
  };
}

export default createStream555ControlPlugin;
