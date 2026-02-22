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
import crypto from "node:crypto";
import {
  assertFive55Capability,
  createFive55CapabilityPolicy,
} from "../../runtime/five55-capability-policy.js";
import { assertTrustedAdminForAction } from "../../runtime/trusted-admin.js";
import {
  exceptionAction,
  executeApiAction,
  type Five55ActionCode,
  getRecentActionLifecycleEvents,
  recordActionLifecycleEvent,
  readParam,
} from "../five55-shared/action-kit.js";
import {
  STREAM555_AGENT_API_KEY_ENV,
  STREAM555_AGENT_TOKEN_ENV,
  STREAM_API_BEARER_TOKEN_ENV,
  describeAgentAuthSource,
  isAgentAuthConfigured,
  resolveAgentBearer,
} from "../five55-shared/agent-auth.js";

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const STREAM_API_ENV = "STREAM_API_URL";
const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM555_SESSION_ENV = "STREAM555_DEFAULT_SESSION_ID";
const STREAM_SESSION_ENV = "STREAM_SESSION_ID";
const STREAM_DIALECT_ENV = "STREAM_API_DIALECT";
const STREAM_DEFAULT_INPUT_TYPE_ENV = "STREAM_DEFAULT_INPUT_TYPE";
const STREAM_DEFAULT_INPUT_URL_ENV = "STREAM_DEFAULT_INPUT_URL";

type StreamDialect = "five55-v1" | "agent-v1";

interface StreamActionEnvelope {
  ok: boolean;
  code: string;
  module: string;
  action: string;
  message: string;
  status: number;
  retryable: boolean;
  data?: unknown;
  details?: unknown;
  trace?: StreamActionTrace;
}

let cachedAgentSessionId: string | null = null;

interface StreamActionTrace {
  actionId: string;
  startedAt: string;
  endedAt: string;
  sessionId?: string;
  segmentId?: string;
}

interface StreamLifecycleContext {
  actionId: string;
  action: "STREAM_STATUS" | "STREAM_CONTROL" | "STREAM_SCHEDULE";
  startedAt: string;
  sessionId?: string;
  segmentId?: string;
}

function createStreamLifecycleContext(
  action: StreamLifecycleContext["action"],
  requestedSessionId?: string,
  segmentId?: string,
): StreamLifecycleContext {
  return {
    actionId: crypto.randomUUID(),
    action,
    startedAt: new Date().toISOString(),
    ...(requestedSessionId?.trim() ? { sessionId: requestedSessionId.trim() } : {}),
    ...(segmentId?.trim() ? { segmentId: segmentId.trim() } : {}),
  };
}

function buildStreamTrace(
  context: StreamLifecycleContext,
  endedAt: string,
): StreamActionTrace {
  return {
    actionId: context.actionId,
    startedAt: context.startedAt,
    endedAt,
    ...(context.sessionId ? { sessionId: context.sessionId } : {}),
    ...(context.segmentId ? { segmentId: context.segmentId } : {}),
  };
}

function emitStreamLifecycle(
  context: StreamLifecycleContext,
  stage: "planned" | "validated" | "dispatched" | "succeeded" | "failed",
  payload: {
    status?: number;
    code?: Five55ActionCode;
    message?: string;
    endpoint?: string;
    details?: unknown;
    endedAt?: string;
  } = {},
): void {
  recordActionLifecycleEvent({
    actionId: context.actionId,
    module: "stream",
    action: context.action,
    stage,
    occurredAt: payload.endedAt ?? new Date().toISOString(),
    startedAt: context.startedAt,
    ...(payload.endedAt ? { endedAt: payload.endedAt } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.message ? { message: payload.message } : {}),
    ...(payload.endpoint ? { endpoint: payload.endpoint } : {}),
    ...(context.sessionId ? { sessionId: context.sessionId } : {}),
    ...(context.segmentId ? { segmentId: context.segmentId } : {}),
    ...(payload.details !== undefined ? { details: payload.details } : {}),
  });
}

function createActionResult(
  success: boolean,
  envelope: StreamActionEnvelope,
): { success: boolean; text: string } {
  return { success, text: JSON.stringify(envelope) };
}

function actionSuccess(
  action: string,
  message: string,
  status: number,
  data?: unknown,
  trace?: StreamActionTrace,
): { success: true; text: string } {
  return createActionResult(true, {
    ok: true,
    code: "OK",
    module: "stream",
    action,
    message,
    status,
    retryable: false,
    data,
    ...(trace ? { trace } : {}),
  }) as { success: true; text: string };
}

function actionFailure(
  action: string,
  code: string,
  status: number,
  message: string,
  details?: unknown,
  trace?: StreamActionTrace,
): { success: false; text: string } {
  return createActionResult(false, {
    ok: false,
    code,
    module: "stream",
    action,
    message,
    status,
    retryable: status === 0 || status === 429 || status >= 500,
    details,
    ...(trace ? { trace } : {}),
  }) as { success: false; text: string };
}

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function resolveStreamBase(): string {
  const base = trimEnv(STREAM_API_ENV) ?? trimEnv(STREAM555_BASE_ENV);
  if (!base) {
    throw new Error(
      `${STREAM_API_ENV} or ${STREAM555_BASE_ENV} must be configured`,
    );
  }
  return base;
}

function resolveConfiguredBaseKey(): string {
  if (trimEnv(STREAM_API_ENV)) return STREAM_API_ENV;
  if (trimEnv(STREAM555_BASE_ENV)) return STREAM555_BASE_ENV;
  return `${STREAM_API_ENV}|${STREAM555_BASE_ENV}`;
}

function resolveStreamDialect(): StreamDialect {
  const explicit = trimEnv(STREAM_DIALECT_ENV)?.toLowerCase();
  if (
    explicit === "agent-v1" ||
    explicit === "agent" ||
    explicit === "stream555-agent"
  ) {
    return "agent-v1";
  }
  if (explicit === "five55-v1" || explicit === "v1") {
    return "five55-v1";
  }
  if (trimEnv(STREAM555_BASE_ENV) && isAgentAuthConfigured()) {
    return "agent-v1";
  }
  return "five55-v1";
}

function getAgentAuthRequiredMessage(purpose: string): string {
  return `${STREAM555_AGENT_API_KEY_ENV} or ${STREAM555_AGENT_TOKEN_ENV} (or ${STREAM_API_BEARER_TOKEN_ENV}) is required for ${purpose}`;
}

async function fetchJson(
  method: "GET" | "POST",
  base: string,
  endpoint: string,
  token: string | undefined,
  body?: Record<string, unknown>,
): Promise<{
  ok: boolean;
  status: number;
  data?: Record<string, unknown>;
  rawBody: string;
}> {
  const url = new URL(endpoint, base).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method,
    headers,
    body: method === "POST" && body ? JSON.stringify(body) : undefined,
  });
  const rawBody = await response.text();
  let data: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // non-JSON upstream response
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    rawBody,
  };
}

function getErrorDetail(payload: {
  data?: Record<string, unknown>;
  rawBody: string;
}): string {
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

async function executeLegacyStreamStatus(
  scope: string,
): Promise<{ success: boolean; text: string }> {
  return executeApiAction({
    module: "stream",
    action: "STREAM_STATUS",
    base: resolveStreamBase(),
    endpoint: "/v1/stream/status",
    payload: {
      scope,
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
}

async function executeLegacyStreamControl(
  operation: string,
  scene: string,
): Promise<{ success: boolean; text: string }> {
  return executeApiAction({
    module: "stream",
    action: "STREAM_CONTROL",
    base: resolveStreamBase(),
    endpoint: "/v1/stream/control",
    payload: {
      operation,
      scene,
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
}

async function executeLegacyStreamSchedule(
  startsAt: string,
  durationMin: string,
): Promise<{ success: boolean; text: string }> {
  return executeApiAction({
    module: "stream",
    action: "STREAM_SCHEDULE",
    base: resolveStreamBase(),
    endpoint: "/v1/stream/schedule",
    payload: {
      startsAt,
      durationMin,
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
}

async function executeAgentStreamStatus(
  scope: string,
  requestedSessionId?: string,
  segmentId?: string,
): Promise<{ success: boolean; text: string }> {
  const lifecycle = createStreamLifecycleContext(
    "STREAM_STATUS",
    requestedSessionId,
    segmentId,
  );
  emitStreamLifecycle(lifecycle, "planned", {
    message: "agent-v1 stream status planned",
    details: { scope, dialect: "agent-v1" },
  });

  const base = resolveStreamBase();
  let token: string;
  try {
    token = await resolveAgentBearer(base);
  } catch (_err) {
    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "failed", {
      status: 401,
      code: "E_UPSTREAM_UNAUTHORIZED",
      message: getAgentAuthRequiredMessage("agent-v1 stream control"),
      endedAt,
    });
    return actionFailure(
      "STREAM_STATUS",
      "E_UPSTREAM_UNAUTHORIZED",
      401,
      getAgentAuthRequiredMessage("agent-v1 stream control"),
      undefined,
      buildStreamTrace(lifecycle, endedAt),
    );
  }

  try {
    const sessionId = await ensureAgentSessionId(
      base,
      token,
      requestedSessionId,
    );
    lifecycle.sessionId = sessionId;
    const endpoint = `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/status`;
    emitStreamLifecycle(lifecycle, "validated", {
      message: "agent-v1 session resolved",
      details: { sessionId },
    });
    emitStreamLifecycle(lifecycle, "dispatched", {
      message: "agent-v1 stream status dispatched",
      endpoint,
    });
    const status = await fetchJson(
      "GET",
      base,
      endpoint,
      token,
    );
    if (!status.ok) {
      const endedAt = new Date().toISOString();
      emitStreamLifecycle(lifecycle, "failed", {
        status: status.status,
        code: "E_UPSTREAM_FAILURE",
        message: "agent-v1 stream status failed",
        details: {
          sessionId,
          detail: getErrorDetail(status),
        },
        endedAt,
      });
      return actionFailure(
        "STREAM_STATUS",
        "E_UPSTREAM_FAILURE",
        status.status,
        "agent-v1 stream status failed",
        {
          sessionId,
          detail: getErrorDetail(status),
        },
        buildStreamTrace(lifecycle, endedAt),
      );
    }

    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "succeeded", {
      status: status.status,
      code: "OK",
      message: "stream status fetched",
      details: {
        dialect: "agent-v1",
        scope,
        sessionId,
      },
      endedAt,
    });
    return actionSuccess(
      "STREAM_STATUS",
      "stream status fetched",
      status.status,
      {
        dialect: "agent-v1",
        scope,
        sessionId,
        ...(status.data ?? {}),
      },
      buildStreamTrace(lifecycle, endedAt),
    );
  } catch (err) {
    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "failed", {
      status: 500,
      code: "E_RUNTIME_EXCEPTION",
      message: err instanceof Error ? err.message : String(err),
      endedAt,
    });
    return actionFailure(
      "STREAM_STATUS",
      "E_RUNTIME_EXCEPTION",
      500,
      err instanceof Error ? err.message : String(err),
      undefined,
      buildStreamTrace(lifecycle, endedAt),
    );
  }
}

async function executeAgentStreamControl(
  operation: string,
  scene: string,
  requestedSessionId?: string,
  inputType?: string,
  inputUrl?: string,
  segmentId?: string,
): Promise<{ success: boolean; text: string }> {
  const lifecycle = createStreamLifecycleContext(
    "STREAM_CONTROL",
    requestedSessionId,
    segmentId,
  );
  emitStreamLifecycle(lifecycle, "planned", {
    message: "agent-v1 stream control planned",
    details: { operation, scene, dialect: "agent-v1" },
  });

  const base = resolveStreamBase();
  let token: string;
  try {
    token = await resolveAgentBearer(base);
  } catch (_err) {
    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "failed", {
      status: 401,
      code: "E_UPSTREAM_UNAUTHORIZED",
      message: getAgentAuthRequiredMessage("agent-v1 stream control"),
      endedAt,
    });
    return actionFailure(
      "STREAM_CONTROL",
      "E_UPSTREAM_UNAUTHORIZED",
      401,
      getAgentAuthRequiredMessage("agent-v1 stream control"),
      undefined,
      buildStreamTrace(lifecycle, endedAt),
    );
  }

  try {
    const sessionId = await ensureAgentSessionId(
      base,
      token,
      requestedSessionId,
    );
    lifecycle.sessionId = sessionId;
    emitStreamLifecycle(lifecycle, "validated", {
      message: "agent-v1 session resolved",
      details: { sessionId, operation },
    });

    if (operation === "pause" || operation === "resume") {
      const endedAt = new Date().toISOString();
      emitStreamLifecycle(lifecycle, "failed", {
        status: 400,
        code: "E_REQUEST_CONTRACT",
        message: `operation '${operation}' is not supported by agent-v1 stream API`,
        endedAt,
      });
      return actionFailure(
        "STREAM_CONTROL",
        "E_REQUEST_CONTRACT",
        400,
        `operation '${operation}' is not supported by agent-v1 stream API`,
        undefined,
        buildStreamTrace(lifecycle, endedAt),
      );
    }

    if (operation === "scene") {
      const endpoint = `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/studio/scene/active`;
      emitStreamLifecycle(lifecycle, "dispatched", {
        message: "agent-v1 scene switch dispatched",
        endpoint,
      });
      const sceneResponse = await fetchJson(
        "POST",
        base,
        endpoint,
        token,
        { sceneId: scene || "default" },
      );
      if (!sceneResponse.ok) {
        const endedAt = new Date().toISOString();
        emitStreamLifecycle(lifecycle, "failed", {
          status: sceneResponse.status,
          code: "E_UPSTREAM_FAILURE",
          message: "agent-v1 scene switch failed",
          details: {
            sessionId,
            detail: getErrorDetail(sceneResponse),
          },
          endedAt,
        });
        return actionFailure(
          "STREAM_CONTROL",
          "E_UPSTREAM_FAILURE",
          sceneResponse.status,
          "agent-v1 scene switch failed",
          {
            sessionId,
            detail: getErrorDetail(sceneResponse),
          },
          buildStreamTrace(lifecycle, endedAt),
        );
      }
      const endedAt = new Date().toISOString();
      emitStreamLifecycle(lifecycle, "succeeded", {
        status: sceneResponse.status,
        code: "OK",
        message: "scene switched",
        details: { sessionId, operation, scene },
        endedAt,
      });
      return actionSuccess(
        "STREAM_CONTROL",
        "scene switched",
        sceneResponse.status,
        {
          dialect: "agent-v1",
          sessionId,
          operation,
          scene,
          ...(sceneResponse.data ?? {}),
        },
        buildStreamTrace(lifecycle, endedAt),
      );
    }

    const endpoint =
      operation === "start"
        ? `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/start`
        : `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/stop`;

    const defaultInputType =
      trimEnv(STREAM_DEFAULT_INPUT_TYPE_ENV) ?? "website";
    const defaultInputUrl = trimEnv(STREAM_DEFAULT_INPUT_URL_ENV);
    const resolvedInputType = inputType?.trim() || defaultInputType;
    const resolvedInputUrl = inputUrl?.trim() || defaultInputUrl;

    const payload =
      operation === "start"
        ? {
            input: {
              type: resolvedInputType,
              ...(resolvedInputUrl ? { url: resolvedInputUrl } : {}),
            },
            options: {
              scene: scene || "default",
            },
          }
        : {};

    emitStreamLifecycle(lifecycle, "dispatched", {
      message: "agent-v1 stream control dispatched",
      endpoint,
      details: {
        operation,
        ...(operation === "start"
          ? {
              inputType: resolvedInputType,
              hasInputUrl: Boolean(resolvedInputUrl),
            }
          : {}),
      },
    });

    const commandResponse = await fetchJson(
      "POST",
      base,
      endpoint,
      token,
      payload,
    );

    if (!commandResponse.ok) {
      const endedAt = new Date().toISOString();
      emitStreamLifecycle(lifecycle, "failed", {
        status: commandResponse.status,
        code: "E_UPSTREAM_FAILURE",
        message: "agent-v1 stream control failed",
        details: {
          sessionId,
          operation,
          detail: getErrorDetail(commandResponse),
        },
        endedAt,
      });
      return actionFailure(
        "STREAM_CONTROL",
        "E_UPSTREAM_FAILURE",
        commandResponse.status,
        "agent-v1 stream control failed",
        {
          sessionId,
          operation,
          detail: getErrorDetail(commandResponse),
        },
        buildStreamTrace(lifecycle, endedAt),
      );
    }

    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "succeeded", {
      status: commandResponse.status,
      code: "OK",
      message: "stream control submitted",
      details: { sessionId, operation, scene },
      endedAt,
    });
    return actionSuccess(
      "STREAM_CONTROL",
      "stream control submitted",
      commandResponse.status,
      {
        dialect: "agent-v1",
        sessionId,
        operation,
        scene,
        ...(commandResponse.data ?? {}),
      },
      buildStreamTrace(lifecycle, endedAt),
    );
  } catch (err) {
    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "failed", {
      status: 500,
      code: "E_RUNTIME_EXCEPTION",
      message: err instanceof Error ? err.message : String(err),
      details: { operation, scene },
      endedAt,
    });
    return actionFailure(
      "STREAM_CONTROL",
      "E_RUNTIME_EXCEPTION",
      500,
      err instanceof Error ? err.message : String(err),
      undefined,
      buildStreamTrace(lifecycle, endedAt),
    );
  }
}

async function executeAgentStreamSchedule(
  startsAt: string,
  durationMin: string,
  requestedSessionId?: string,
  title?: string,
  segmentId?: string,
): Promise<{ success: boolean; text: string }> {
  const lifecycle = createStreamLifecycleContext(
    "STREAM_SCHEDULE",
    requestedSessionId,
    segmentId,
  );
  emitStreamLifecycle(lifecycle, "planned", {
    message: "agent-v1 stream schedule planned",
    details: { startsAt, durationMin, title, dialect: "agent-v1" },
  });

  const base = resolveStreamBase();
  let token: string;
  try {
    token = await resolveAgentBearer(base);
  } catch (_err) {
    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "failed", {
      status: 401,
      code: "E_UPSTREAM_UNAUTHORIZED",
      message: getAgentAuthRequiredMessage("agent-v1 stream scheduling"),
      endedAt,
    });
    return actionFailure(
      "STREAM_SCHEDULE",
      "E_UPSTREAM_UNAUTHORIZED",
      401,
      getAgentAuthRequiredMessage("agent-v1 stream scheduling"),
      undefined,
      buildStreamTrace(lifecycle, endedAt),
    );
  }

  try {
    const sessionId = await ensureAgentSessionId(
      base,
      token,
      requestedSessionId,
    );
    lifecycle.sessionId = sessionId;
    const endpoint = `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/schedule`;
    emitStreamLifecycle(lifecycle, "validated", {
      message: "agent-v1 session resolved",
      details: { sessionId },
    });
    emitStreamLifecycle(lifecycle, "dispatched", {
      message: "agent-v1 stream schedule dispatched",
      endpoint,
      details: { title: title?.trim() || "Scheduled stream" },
    });
    const scheduleResponse = await fetchJson(
      "POST",
      base,
      endpoint,
      token,
      {
        title: title?.trim() || "Scheduled stream",
        scheduledAt: startsAt,
        duration: Number.parseInt(durationMin, 10),
      },
    );
    if (!scheduleResponse.ok) {
      const endedAt = new Date().toISOString();
      emitStreamLifecycle(lifecycle, "failed", {
        status: scheduleResponse.status,
        code: "E_UPSTREAM_FAILURE",
        message: "agent-v1 stream schedule failed",
        details: {
          sessionId,
          detail: getErrorDetail(scheduleResponse),
        },
        endedAt,
      });
      return actionFailure(
        "STREAM_SCHEDULE",
        "E_UPSTREAM_FAILURE",
        scheduleResponse.status,
        "agent-v1 stream schedule failed",
        {
          sessionId,
          detail: getErrorDetail(scheduleResponse),
        },
        buildStreamTrace(lifecycle, endedAt),
      );
    }

    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "succeeded", {
      status: scheduleResponse.status,
      code: "OK",
      message: "stream schedule submitted",
      details: { sessionId },
      endedAt,
    });
    return actionSuccess(
      "STREAM_SCHEDULE",
      "stream schedule submitted",
      scheduleResponse.status,
      {
        dialect: "agent-v1",
        sessionId,
        ...(scheduleResponse.data ?? {}),
      },
      buildStreamTrace(lifecycle, endedAt),
    );
  } catch (err) {
    const endedAt = new Date().toISOString();
    emitStreamLifecycle(lifecycle, "failed", {
      status: 500,
      code: "E_RUNTIME_EXCEPTION",
      message: err instanceof Error ? err.message : String(err),
      endedAt,
    });
    return actionFailure(
      "STREAM_SCHEDULE",
      "E_RUNTIME_EXCEPTION",
      500,
      err instanceof Error ? err.message : String(err),
      undefined,
      buildStreamTrace(lifecycle, endedAt),
    );
  }
}

const streamProvider: Provider = {
  name: "stream",
  description: "Stream control and observability surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const dialect = resolveStreamDialect();
    const configuredBase = resolveConfiguredBaseKey();
    const configured =
      dialect === "agent-v1"
        ? Boolean(trimEnv(STREAM555_BASE_ENV) && isAgentAuthConfigured())
        : Boolean(trimEnv(STREAM_API_ENV) ?? trimEnv(STREAM555_BASE_ENV));
    return {
      text: [
        "## Stream Surface",
        "",
        "Use stream actions to inspect and control live stream operations.",
        `API configured: ${configured ? "yes" : "no"} (${configuredBase})`,
        `Dialect: ${dialect}`,
        `Agent auth: ${describeAgentAuthSource()}`,
        `Session env: ${trimEnv(STREAM_SESSION_ENV) ?? trimEnv(STREAM555_SESSION_ENV) ?? "auto-create"}`,
        "Actions: STREAM_STATUS, STREAM_CONTROL, STREAM_SCHEDULE, STREAM_ACTION_TIMELINE",
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
      const scope =
        readParam(options as HandlerOptions | undefined, "scope") ?? "current";
      const sessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const segmentId = readParam(
        options as HandlerOptions | undefined,
        "segmentId",
      );

      if (resolveStreamDialect() === "agent-v1") {
        const agentResult = await executeAgentStreamStatus(
          scope,
          sessionId,
          segmentId,
        );
        if (agentResult.success) return agentResult;

        const legacyResult = await executeLegacyStreamStatus(scope);
        if (legacyResult.success) return legacyResult;
        return agentResult;
      }

      return executeLegacyStreamStatus(scope);
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
    {
      name: "sessionId",
      description: "Optional stream session identifier (agent-v1 mode)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "segmentId",
      description: "Optional segment identifier for lifecycle visibility",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const streamControlAction: Action = {
  name: "STREAM_CONTROL",
  similes: [
    "STREAM_CONTROL",
    "START_STREAM",
    "STOP_STREAM",
    "SET_SCENE",
    "GO_LIVE",
    "END_STREAM",
    "STREAM_START",
  ],
  description: "Controls stream lifecycle and active scene/action overlays.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(runtime, message, state, "STREAM_CONTROL");
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");
      const operation = readParam(
        options as HandlerOptions | undefined,
        "operation",
      );
      const scene =
        readParam(options as HandlerOptions | undefined, "scene") ?? "default";
      const sessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const inputType = readParam(
        options as HandlerOptions | undefined,
        "inputType",
      );
      const url = readParam(options as HandlerOptions | undefined, "url");
      const segmentId = readParam(
        options as HandlerOptions | undefined,
        "segmentId",
      );

      if (
        !operation ||
        !["start", "stop", "pause", "resume", "scene"].includes(operation)
      ) {
        return actionFailure(
          "STREAM_CONTROL",
          "E_PARAM_MISSING",
          400,
          "operation must be one of: start|stop|pause|resume|scene",
        );
      }

      if (resolveStreamDialect() === "agent-v1") {
        const agentResult = await executeAgentStreamControl(
          operation,
          scene,
          sessionId,
          inputType,
          url,
          segmentId,
        );
        if (agentResult.success) return agentResult;

        const legacyResult = await executeLegacyStreamControl(operation, scene);
        if (legacyResult.success) return legacyResult;
        return agentResult;
      }

      return executeLegacyStreamControl(operation, scene);
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
    {
      name: "sessionId",
      description: "Optional stream session identifier (agent-v1 mode)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "inputType",
      description: "Input type for start operations (agent-v1 mode)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "url",
      description: "Optional input URL for start operations (agent-v1 mode)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "segmentId",
      description: "Optional segment identifier for lifecycle visibility",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const streamScheduleAction: Action = {
  name: "STREAM_SCHEDULE",
  similes: ["SCHEDULE_STREAM", "PLAN_STREAM", "STREAM_TIMELINE"],
  description: "Schedules stream windows plus projected economic impact.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(runtime, message, state, "STREAM_SCHEDULE");
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");
      const startsAt = readParam(
        options as HandlerOptions | undefined,
        "startsAt",
      );
      const durationMin =
        readParam(options as HandlerOptions | undefined, "durationMin") ?? "60";
      const sessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const title = readParam(options as HandlerOptions | undefined, "title");
      const segmentId = readParam(
        options as HandlerOptions | undefined,
        "segmentId",
      );

      if (!startsAt) {
        return actionFailure(
          "STREAM_SCHEDULE",
          "E_PARAM_MISSING",
          400,
          "startsAt is required",
        );
      }

      if (!/^\d+$/.test(durationMin)) {
        return actionFailure(
          "STREAM_SCHEDULE",
          "E_REQUEST_CONTRACT",
          400,
          "durationMin must be an integer string",
        );
      }

      if (resolveStreamDialect() === "agent-v1") {
        const agentResult = await executeAgentStreamSchedule(
          startsAt,
          durationMin,
          sessionId,
          title,
          segmentId,
        );
        if (agentResult.success) return agentResult;

        const legacyResult = await executeLegacyStreamSchedule(
          startsAt,
          durationMin,
        );
        if (legacyResult.success) return legacyResult;
        return agentResult;
      }

      return executeLegacyStreamSchedule(startsAt, durationMin);
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
    {
      name: "sessionId",
      description: "Optional stream session identifier (agent-v1 mode)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "title",
      description: "Optional schedule title (agent-v1 mode)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "segmentId",
      description: "Optional segment identifier for lifecycle visibility",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const streamActionTimelineAction: Action = {
  name: "STREAM_ACTION_TIMELINE",
  similes: ["STREAM_TIMELINE", "ACTION_TIMELINE", "STREAM_ACTIONS_LOG"],
  description:
    "Returns recent action lifecycle events for stream/five55/swap visibility.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "stream.read");
      const limitRaw =
        readParam(options as HandlerOptions | undefined, "limit") ?? "50";
      const limit = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        return actionFailure(
          "STREAM_ACTION_TIMELINE",
          "E_REQUEST_CONTRACT",
          400,
          "limit must be a positive integer",
        );
      }

      const sessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const segmentId = readParam(
        options as HandlerOptions | undefined,
        "segmentId",
      );
      const action = readParam(options as HandlerOptions | undefined, "action");

      const events = getRecentActionLifecycleEvents(limit, {
        sessionId,
        segmentId,
        action,
      });
      return actionSuccess(
        "STREAM_ACTION_TIMELINE",
        "action timeline fetched",
        200,
        {
          count: events.length,
          events,
        },
      );
    } catch (err) {
      return exceptionAction("stream", "STREAM_ACTION_TIMELINE", err);
    }
  },
  parameters: [
    {
      name: "limit",
      description: "Maximum number of events to return",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional session filter",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "segmentId",
      description: "Optional segment filter",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "action",
      description:
        "Optional action filter (STREAM_STATUS, STREAM_CONTROL, SWAP_EXECUTE, etc.)",
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
    actions: [
      streamStatusAction,
      streamControlAction,
      streamScheduleAction,
      streamActionTimelineAction,
    ],
  };
}

export default createStreamPlugin;
