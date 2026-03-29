import crypto from "node:crypto";
import {
  createMessageMemory,
  stringToUuid,
  type AgentRuntime,
  type Content,
  type State,
  type UUID,
} from "@elizaos/core";
import type { RouteRequestContext } from "./route-helpers";

export const ALICE_OPERATOR_ALLOWED_ACTIONS = new Set([
  "STREAM555_AUTH_WALLET_LOGIN",
  "STREAM555_AUTH_WALLET_PROVISION_LINKED",
  "STREAM555_GO_LIVE",
  "STREAM555_GO_LIVE_SEGMENTS",
  "STREAM555_SCREEN_SHARE",
  "STREAM555_RADIO_CONTROL",
  "STREAM555_DESTINATIONS_APPLY",
  "STREAM555_SEGMENT_OVERRIDE",
  "STREAM555_END_LIVE",
  "STREAM555_AD_CREATE",
  "STREAM555_AD_TRIGGER",
  "STREAM555_AD_DISMISS",
  "STREAM555_EARNINGS_ESTIMATE",
  "STREAM555_PIP_ENABLE",
  "STREAM555_GUEST_INVITE",
  "FIVE55_GAMES_CATALOG",
  "FIVE55_GAMES_PLAY",
  "FIVE55_GAMES_SWITCH",
  "FIVE55_GAMES_STOP",
  "FIVE55_GAMES_GO_LIVE_PLAY",
]);

type OperatorActionStep = {
  id?: string;
  action?: string;
  params?: Record<string, unknown>;
};

type OperatorActionResult = {
  id: string;
  action: string;
  success: boolean;
  message: string;
  status?: number;
  code?: string;
  data?: unknown;
};

interface AliceOperatorRouteContext extends RouteRequestContext {
  runtime?: AgentRuntime | null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeActionName(value: string | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function parseResultText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return asRecord(parsed) ?? null;
  } catch {
    return null;
  }
}

function normalizeActionResult(
  fallback: { id: string; action: string },
  rawResult: unknown,
  callbackPayload: unknown,
): OperatorActionResult {
  let success: boolean | undefined;
  let message: string | undefined;
  let status: number | undefined;
  let code: string | undefined;
  let data: unknown;

  const callbackRecord = asRecord(callbackPayload);
  if (typeof callbackRecord?.text === "string" && callbackRecord.text.trim()) {
    message = callbackRecord.text.trim();
  }
  const callbackContent = asRecord(callbackRecord?.content);
  if (typeof callbackContent?.success === "boolean") {
    success = callbackContent.success;
  }
  if (typeof callbackContent?.error === "string" && !message) {
    message = callbackContent.error;
  }
  if ("data" in (callbackContent ?? {})) {
    data = callbackContent?.data;
  }

  const rawRecord = asRecord(rawResult);
  if (typeof rawRecord?.success === "boolean") {
    success ??= rawRecord.success;
  }
  if (typeof rawRecord?.text === "string" && rawRecord.text.trim()) {
    const parsedText = parseResultText(rawRecord.text);
    if (parsedText) {
      if (typeof parsedText.ok === "boolean") {
        success ??= parsedText.ok;
      }
      if (typeof parsedText.message === "string" && parsedText.message.trim()) {
        message ??= parsedText.message.trim();
      }
      if (typeof parsedText.status === "number") {
        status = parsedText.status;
      }
      if (typeof parsedText.code === "string" && parsedText.code.trim()) {
        code = parsedText.code.trim();
      }
      if ("data" in parsedText && data === undefined) {
        data = parsedText.data;
      }
    } else if (!message) {
      message = rawRecord.text.trim();
    }
  }

  return {
    ...fallback,
    success: success ?? false,
    message:
      message ??
      (success
        ? `${fallback.action} completed.`
        : `${fallback.action} failed.`),
    ...(typeof status === "number" ? { status } : {}),
    ...(typeof code === "string" ? { code } : {}),
    ...(data !== undefined ? { data } : {}),
  };
}

function buildActionLookup(runtime: AgentRuntime) {
  const actions = Array.isArray((runtime as { actions?: unknown[] }).actions)
    ? ((runtime as { actions: unknown[] }).actions as Array<{
        name?: string;
        similes?: string[];
        validate?: (...args: unknown[]) => unknown;
        handler?: (...args: unknown[]) => unknown;
      }>)
    : [];

  const lookup = new Map<string, (typeof actions)[number]>();
  for (const action of actions) {
    const name = normalizeActionName(action.name);
    if (name) lookup.set(name, action);
    for (const alias of action.similes ?? []) {
      const normalizedAlias = normalizeActionName(alias);
      if (normalizedAlias) lookup.set(normalizedAlias, action);
    }
  }
  return lookup;
}

async function executeOperatorStep(
  runtime: AgentRuntime,
  action: {
    validate?: (...args: unknown[]) => unknown;
    handler?: (...args: unknown[]) => unknown;
  },
  step: Required<Pick<OperatorActionStep, "id" | "action">> &
    Pick<OperatorActionStep, "params">,
): Promise<OperatorActionResult> {
  const roomId = stringToUuid(`alice-operator:${step.id}`) as UUID;
  const message = createMessageMemory({
    id: crypto.randomUUID() as UUID,
    entityId: runtime.agentId,
    agentId: runtime.agentId,
    roomId,
    content: {
      text: `Execute Alice operator action ${step.action}`,
      source: "internal",
    },
  });
  const state = { values: { trustedAdmin: true } } as State;

  if (typeof action.validate === "function") {
    const valid = await Promise.resolve(action.validate(runtime, message, state));
    if (!valid) {
      return {
        id: step.id,
        action: step.action,
        success: false,
        message: `${step.action} is unavailable on this runtime.`,
        status: 503,
      };
    }
  }

  if (typeof action.handler !== "function") {
    return {
      id: step.id,
      action: step.action,
      success: false,
      message: `${step.action} is missing a runtime handler.`,
      status: 500,
    };
  }

  let callbackPayload: Content | Record<string, unknown> | undefined;
  const rawResult = await Promise.resolve(
    action.handler(
      runtime,
      message,
      state,
      { parameters: step.params ?? {} },
      async (content: unknown) => {
        if (content && typeof content === "object") {
          callbackPayload = content as Content;
        }
        return [];
      },
      [],
    ),
  );

  return normalizeActionResult(
    { id: step.id, action: step.action },
    rawResult,
    callbackPayload,
  );
}

export async function handleAliceOperatorRoutes(
  ctx: AliceOperatorRouteContext,
): Promise<boolean> {
  const { method, pathname, runtime, req, res, json, error, readJsonBody } = ctx;
  if (method !== "POST" || pathname !== "/api/alice/operator/execute") {
    return false;
  }
  if (!runtime) {
    error(res, "Agent runtime not available", 503);
    return true;
  }

  const body = await readJsonBody<{
    steps?: OperatorActionStep[];
    stopOnFailure?: boolean;
  }>(req, res);
  if (!body) return true;

  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    error(res, "steps must contain at least one operator action", 400);
    return true;
  }

  const lookup = buildActionLookup(runtime);
  const results: OperatorActionResult[] = [];
  for (const [index, rawStep] of body.steps.entries()) {
    const actionName = normalizeActionName(rawStep.action);
    const stepId = rawStep.id?.trim() || `step-${index + 1}`;
    if (!actionName) {
      error(res, `steps[${index}].action is required`, 400);
      return true;
    }
    if (!ALICE_OPERATOR_ALLOWED_ACTIONS.has(actionName)) {
      error(res, `${actionName} is not allowed through the Alice operator bridge`, 400);
      return true;
    }
    const action = lookup.get(actionName);
    if (!action) {
      results.push({
        id: stepId,
        action: actionName,
        success: false,
        message: `${actionName} is not registered on the current runtime.`,
        status: 503,
      });
    } else {
      const result = await executeOperatorStep(runtime, action, {
        id: stepId,
        action: actionName,
        params: asRecord(rawStep.params) ?? {},
      });
      results.push(result);
    }

    if (body.stopOnFailure !== false && results.at(-1)?.success === false) {
      break;
    }
  }

  json(res, {
    ok: true,
    allSucceeded: results.every((entry) => entry.success),
    results,
  });
  return true;
}
