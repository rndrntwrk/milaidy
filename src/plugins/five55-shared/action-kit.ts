import type { HandlerOptions } from "@elizaos/core";
import crypto from "node:crypto";

export function readParam(
  options: HandlerOptions | undefined,
  key: string,
): string | undefined {
  const value = options?.parameters?.[key];
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : String(value);
}

export function requireApiBase(envKey: string): string {
  const base = process.env[envKey]?.trim();
  if (!base) throw new Error(`${envKey} is not configured`);
  return base;
}

export interface PostJsonOptions {
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  maxResponseChars?: number;
  service?: string;
  operation?: "query" | "command";
  idempotent?: boolean;
  idempotencyKey?: string;
  bearerTokenEnv?: string;
  apiKeyEnv?: string;
  signingSecretEnv?: string;
  headers?: Record<string, string>;
}

export type Five55ActionCode =
  | "OK"
  | "E_PARAM_MISSING"
  | "E_REQUEST_CONTRACT"
  | "E_RESPONSE_PARSE"
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

export type ContractFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array";

export interface ContractFieldSpec {
  required?: boolean;
  type?: ContractFieldType;
  nonEmpty?: boolean;
  oneOf?: ReadonlyArray<string>;
  pattern?: RegExp;
}

export type ContractSchema = Record<string, ContractFieldSpec>;

export interface Five55ActionEnvelope {
  ok: boolean;
  code: Five55ActionCode;
  module: string;
  action: string;
  message: string;
  status: number;
  retryable: boolean;
  data?: unknown;
  details?: unknown;
}

export interface ExecuteApiActionOptions {
  module: string;
  action: string;
  base: string;
  endpoint: string;
  payload: Record<string, unknown>;
  successMessage: string;
  requestContract?: ContractSchema;
  responseContract?: ContractSchema;
  transport?: PostJsonOptions;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimEnv(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function pickFirstEnv(keys: Array<string | undefined>): string | undefined {
  for (const key of keys) {
    const value = trimEnv(key);
    if (value) return value;
  }
  return undefined;
}

function inferService(endpoint: string): string | undefined {
  const match = endpoint.match(/^\/v\d+\/([^/]+)/i);
  if (!match) return undefined;
  return match[1]?.replace(/[^a-z0-9_]/gi, "").toLowerCase() || undefined;
}

function normalizeService(service: string | undefined): string | undefined {
  if (!service) return undefined;
  const cleaned = service.replace(/[^a-z0-9_]/gi, "").toUpperCase();
  return cleaned || undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldUseIdempotency(
  endpoint: string,
  options: PostJsonOptions | undefined,
): boolean {
  if (typeof options?.idempotent === "boolean") return options.idempotent;
  if (options?.operation === "command") return true;
  if (options?.operation === "query") return false;
  return /(execute|submit|write|create|complete|resolve|control|schedule|allocate|claim|finish|award|distribute|pay|withdraw|transfer|settle|send)/i.test(
    endpoint,
  );
}

function buildIdempotencyKey(
  endpoint: string,
  payloadText: string,
  options: PostJsonOptions | undefined,
): string | undefined {
  if (options?.idempotencyKey) return options.idempotencyKey;
  if (!shouldUseIdempotency(endpoint, options)) return undefined;
  const digest = crypto
    .createHash("sha256")
    .update(`${endpoint}\n${payloadText}`)
    .digest("hex");
  return `five55-${digest.slice(0, 40)}`;
}

function buildSecurityHeaders(
  endpoint: string,
  payloadText: string,
  options: PostJsonOptions | undefined,
  idempotencyKey: string | undefined,
): Record<string, string> {
  const inferredService = inferService(endpoint);
  const service = normalizeService(options?.service ?? inferredService);

  const bearerToken = pickFirstEnv([
    options?.bearerTokenEnv,
    service ? `${service}_API_BEARER_TOKEN` : undefined,
    "FIVE55_API_BEARER_TOKEN",
  ]);
  const apiKey = pickFirstEnv([
    options?.apiKeyEnv,
    service ? `${service}_API_KEY` : undefined,
    "FIVE55_API_KEY",
  ]);
  const signingSecret = pickFirstEnv([
    options?.signingSecretEnv,
    service ? `${service}_API_SIGNING_SECRET` : undefined,
    "FIVE55_API_SIGNING_SECRET",
  ]);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers ?? {}),
  };

  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  if (apiKey) headers["x-api-key"] = apiKey;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (service) headers["x-five55-service"] = service.toLowerCase();

  if (signingSecret) {
    const timestamp = String(Date.now());
    const signingInput = [
      "POST",
      endpoint,
      timestamp,
      idempotencyKey ?? "",
      payloadText,
    ].join("\n");
    const signature = crypto
      .createHmac("sha256", signingSecret)
      .update(signingInput)
      .digest("hex");
    headers["x-five55-timestamp"] = timestamp;
    headers["x-five55-signature"] = signature;
  }

  return headers;
}

function buildEnvelopeText(envelope: Five55ActionEnvelope): string {
  return JSON.stringify(envelope);
}

function actionSuccess(
  module: string,
  action: string,
  status: number,
  message: string,
  data?: unknown,
): { success: true; text: string } {
  return {
    success: true,
    text: buildEnvelopeText({
      ok: true,
      code: "OK",
      module,
      action,
      message,
      status,
      retryable: false,
      data,
    }),
  };
}

function actionFailure(
  module: string,
  action: string,
  code: Five55ActionCode,
  status: number,
  message: string,
  details?: unknown,
): { success: false; text: string } {
  return {
    success: false,
    text: buildEnvelopeText({
      ok: false,
      code,
      module,
      action,
      message,
      status,
      retryable: status === 0 || status === 429 || status >= 500,
      details,
    }),
  };
}

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
    if (spec.pattern && typeof value === "string" && !spec.pattern.test(value)) {
      errors.push(`${key} does not match required format`);
    }
  }
  return errors;
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

function parseJsonObject(
  body: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  if (!body || !body.trim()) return { ok: false, reason: "empty response body" };
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isPlainObject(parsed)) {
      return { ok: false, reason: "response must be a JSON object" };
    }
    return { ok: true, value: parsed };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export function exceptionAction(
  module: string,
  action: string,
  err: unknown,
): { success: false; text: string } {
  const message = err instanceof Error ? err.message : String(err);
  const isCapabilityDenied = /capability denied/i.test(message);
  return actionFailure(
    module,
    action,
    isCapabilityDenied ? "E_CAPABILITY_DENIED" : "E_RUNTIME_EXCEPTION",
    isCapabilityDenied ? 403 : 500,
    message,
  );
}

export async function executeApiAction(
  options: ExecuteApiActionOptions,
): Promise<{ success: boolean; text: string }> {
  const requestErrors = validateContract(
    options.payload,
    options.requestContract,
  );
  if (requestErrors.length > 0) {
    const hasMissing = requestErrors.some((entry) => entry.startsWith("missing "));
    return actionFailure(
      options.module,
      options.action,
      hasMissing ? "E_PARAM_MISSING" : "E_REQUEST_CONTRACT",
      400,
      "request contract validation failed",
      requestErrors,
    );
  }

  const upstream = await postJson(
    options.base,
    options.endpoint,
    options.payload,
    options.transport,
  );
  if (!upstream.ok) {
    return actionFailure(
      options.module,
      options.action,
      mapUpstreamCode(upstream.status),
      upstream.status,
      "upstream request failed",
      { body: upstream.body },
    );
  }

  const parsed = parseJsonObject(upstream.body);
  if (!parsed.ok) {
    return actionFailure(
      options.module,
      options.action,
      "E_RESPONSE_PARSE",
      upstream.status || 502,
      "response parse failed",
      parsed.reason,
    );
  }

  const responseErrors = validateContract(
    parsed.value,
    options.responseContract,
  );
  if (responseErrors.length > 0) {
    return actionFailure(
      options.module,
      options.action,
      "E_RESPONSE_CONTRACT",
      upstream.status || 502,
      "response contract validation failed",
      responseErrors,
    );
  }

  return actionSuccess(
    options.module,
    options.action,
    upstream.status,
    options.successMessage,
    parsed.value,
  );
}

export async function postJson(
  base: string,
  endpoint: string,
  payload: Record<string, unknown>,
  options?: PostJsonOptions,
): Promise<{ ok: boolean; status: number; body: string }> {
  const timeoutMs = options?.timeoutMs ?? parsePositiveInt(process.env.FIVE55_HTTP_TIMEOUT_MS, 8000);
  const retries = options?.retries ?? parsePositiveInt(process.env.FIVE55_HTTP_RETRIES, 2);
  const retryBaseDelayMs =
    options?.retryBaseDelayMs ??
    parsePositiveInt(process.env.FIVE55_HTTP_RETRY_BASE_MS, 250);
  const maxResponseChars =
    options?.maxResponseChars ??
    parsePositiveInt(process.env.FIVE55_HTTP_MAX_RESPONSE_CHARS, 4000);

  const url = new URL(endpoint, base).toString();
  const bodyText = JSON.stringify(payload);
  const idempotencyKey = buildIdempotencyKey(endpoint, bodyText, options);
  const headers = buildSecurityHeaders(endpoint, bodyText, options, idempotencyKey);
  const attempts = Math.max(1, retries + 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: bodyText,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseText = (await response.text()).slice(0, maxResponseChars);
      if (response.ok || !isRetryableStatus(response.status) || attempt >= attempts) {
        return { ok: response.ok, status: response.status, body: responseText };
      }
    } catch (err) {
      clearTimeout(timeout);
      if (attempt >= attempts) {
        return {
          ok: false,
          status: 0,
          body: `request failed after ${attempts} attempt(s): ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    const delayMs = retryBaseDelayMs * 2 ** (attempt - 1);
    await sleep(delayMs);
  }

  return {
    ok: false,
    status: 0,
    body: "request failed: exhausted retry budget",
  };
}
