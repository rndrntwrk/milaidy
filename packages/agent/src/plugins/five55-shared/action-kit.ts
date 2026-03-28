import type { HandlerOptions } from "@elizaos/core";
import {
  requestAgentJson,
  type AgentJsonResponse,
} from "./agent-auth.js";

export function readParam(
  options: HandlerOptions | undefined,
  key: string,
): string | undefined {
  const value = options?.parameters?.[key];
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : String(value);
}

export type Five55ActionCode =
  | "OK"
  | "E_PARAM_MISSING"
  | "E_REQUEST_CONTRACT"
  | "E_RESPONSE_CONTRACT"
  | "E_UPSTREAM_UNREACHABLE"
  | "E_UPSTREAM_BAD_REQUEST"
  | "E_UPSTREAM_UNAUTHORIZED"
  | "E_UPSTREAM_FORBIDDEN"
  | "E_UPSTREAM_NOT_FOUND"
  | "E_UPSTREAM_CONFLICT"
  | "E_UPSTREAM_RATE_LIMITED"
  | "E_UPSTREAM_SERVER"
  | "E_UPSTREAM_FAILURE"
  | "E_CAPABILITY_DENIED"
  | "E_RUNTIME_EXCEPTION";

type ContractFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array";

interface ContractFieldSpec {
  required?: boolean;
  type?: ContractFieldType;
  nonEmpty?: boolean;
  oneOf?: ReadonlyArray<string>;
}

type ContractSchema = Record<string, ContractFieldSpec>;

function valueType(value: unknown): ContractFieldType {
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function validateContract(
  payload: Record<string, unknown>,
  schema: ContractSchema | undefined,
): string[] {
  if (!schema) return [];
  const errors: string[] = [];
  for (const [key, spec] of Object.entries(schema)) {
    const value = payload[key];
    const hasValue = value !== undefined && value !== null;
    if (spec.required && !hasValue) {
      errors.push(`missing ${key}`);
      continue;
    }
    if (!hasValue) continue;
    if (spec.type) {
      const actualType = valueType(value);
      if (actualType !== spec.type) {
        errors.push(`${key} expected ${spec.type} but got ${actualType}`);
        continue;
      }
    }
    if (spec.nonEmpty && typeof value === "string" && value.trim().length === 0) {
      errors.push(`${key} must be non-empty`);
    }
    if (spec.oneOf && typeof value === "string" && !spec.oneOf.includes(value)) {
      errors.push(`${key} must be one of [${spec.oneOf.join(", ")}]`);
    }
  }
  return errors;
}

function actionResult(params: {
  success: boolean;
  module: string;
  action: string;
  code: Five55ActionCode;
  status: number;
  message: string;
  data?: unknown;
  details?: unknown;
}) {
  const { success, module, action, code, status, message, data, details } = params;
  return {
    success,
    text: JSON.stringify({
      ok: success,
      code,
      module,
      action,
      message,
      status,
      retryable: !success && (status === 0 || status === 429 || status >= 500),
      ...(data !== undefined ? { data } : {}),
      ...(details !== undefined ? { details } : {}),
    }),
  };
}

export function exceptionAction(
  module: string,
  action: string,
  err: unknown,
): { success: false; text: string } {
  const message = err instanceof Error ? err.message : String(err);
  const isCapabilityDenied = /capability denied|trusted admin/i.test(message);
  return actionResult({
    success: false,
    module,
    action,
    code: isCapabilityDenied ? "E_CAPABILITY_DENIED" : "E_RUNTIME_EXCEPTION",
    status: isCapabilityDenied ? 403 : 500,
    message,
  });
}

function mapUpstreamCode(status: number): Five55ActionCode {
  if (status === 0) return "E_UPSTREAM_UNREACHABLE";
  if (status === 400) return "E_UPSTREAM_BAD_REQUEST";
  if (status === 401) return "E_UPSTREAM_UNAUTHORIZED";
  if (status === 403) return "E_UPSTREAM_FORBIDDEN";
  if (status === 404) return "E_UPSTREAM_NOT_FOUND";
  if (status === 409) return "E_UPSTREAM_CONFLICT";
  if (status === 429) return "E_UPSTREAM_RATE_LIMITED";
  if (status >= 500) return "E_UPSTREAM_SERVER";
  return "E_UPSTREAM_FAILURE";
}

interface ExecuteApiActionOptions {
  module: string;
  action: string;
  base: string;
  endpoint: string;
  payload?: Record<string, unknown>;
  successMessage: string;
  requestContract?: ContractSchema;
  responseContract?: ContractSchema;
  requestId?: string;
  logScope?: string;
}

export async function executeApiAction(
  options: ExecuteApiActionOptions,
): Promise<{ success: boolean; text: string }> {
  const payload = options.payload ?? {};
  const requestErrors = validateContract(payload, options.requestContract);
  if (requestErrors.length > 0) {
    const hasMissing = requestErrors.some((entry) => entry.startsWith("missing "));
    return actionResult({
      success: false,
      module: options.module,
      action: options.action,
      code: hasMissing ? "E_PARAM_MISSING" : "E_REQUEST_CONTRACT",
      status: 400,
      message: "request contract validation failed",
      details: requestErrors,
    });
  }

  const result: AgentJsonResponse = await requestAgentJson({
    method: "POST",
    baseUrl: options.base,
    endpoint: options.endpoint,
    body: payload,
    requestId: options.requestId,
    logScope: options.logScope,
  });

  if (!result.ok) {
    const errorMessage =
      (typeof result.data?.error === "string" && result.data.error.trim()) ||
      (typeof result.data?.message === "string" && result.data.message.trim()) ||
      result.rawBody ||
      "upstream request failed";
    const messageWithRequestId = result.requestId
      ? `${errorMessage} [requestId: ${result.requestId}]`
      : errorMessage;
    return actionResult({
      success: false,
      module: options.module,
      action: options.action,
      code: mapUpstreamCode(result.status),
      status: result.status,
      message: messageWithRequestId,
      details: result.data ?? result.rawBody,
    });
  }

  const responseErrors = validateContract(
    result.data ?? {},
    options.responseContract,
  );
  if (responseErrors.length > 0) {
    return actionResult({
      success: false,
      module: options.module,
      action: options.action,
      code: "E_RESPONSE_CONTRACT",
      status: result.status || 502,
      message: "response contract validation failed",
      details: responseErrors,
    });
  }

  return actionResult({
    success: true,
    module: options.module,
    action: options.action,
    code: "OK",
    status: result.status,
    message: options.successMessage,
    data: result.data ?? {},
  });
}
