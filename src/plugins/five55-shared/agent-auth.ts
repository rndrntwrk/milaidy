import crypto from "node:crypto";

export const STREAM555_AGENT_TOKEN_ENV = "STREAM555_AGENT_TOKEN";
export const STREAM555_AGENT_API_KEY_ENV = "STREAM555_AGENT_API_KEY";
export const STREAM_API_BEARER_TOKEN_ENV = "STREAM_API_BEARER_TOKEN";
export const STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT_ENV =
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT";
export const STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS_ENV =
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS";

const DEFAULT_TOKEN_EXCHANGE_ENDPOINT = "/api/agent/v1/auth/token/exchange";
const DEFAULT_REFRESH_WINDOW_SECONDS = 300;
const DEFAULT_HTTP_TIMEOUT_MS = 8_000;
const DEFAULT_HTTP_RETRIES = 2;
const DEFAULT_HTTP_RETRY_BASE_MS = 250;
const DEFAULT_HTTP_MAX_RESPONSE_CHARS = 4_000;

interface AgentTokenExchangePayload {
  token?: unknown;
  expiresAt?: unknown;
  error?: unknown;
}

interface AgentTokenCacheEntry {
  baseUrl: string;
  token: string;
  expiresAtMs?: number;
}

type AgentBearerKind = "api-key-exchange" | "static-bearer";

interface ResolvedAgentBearer {
  token: string;
  kind: AgentBearerKind;
  usedCachedExchangeToken: boolean;
  exchangeEndpoint?: string;
}

export type AgentRequestMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface AgentJsonRequestOptions {
  method: AgentRequestMethod;
  baseUrl: string;
  endpoint: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  requestId?: string;
  logScope?: string;
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  maxResponseChars?: number;
}

export interface AgentJsonResponse {
  ok: boolean;
  status: number;
  data?: Record<string, unknown>;
  rawBody: string;
  requestId: string;
  refreshedOnUnauthorized: boolean;
  authSource: AgentBearerKind;
}

let cachedExchangedToken: AgentTokenCacheEntry | null = null;
let inFlightExchange: Promise<ResolvedAgentBearer> | null = null;

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function getRefreshWindowMs(): number {
  const raw = trimEnv(STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS_ENV);
  if (!raw) return DEFAULT_REFRESH_WINDOW_SECONDS * 1000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REFRESH_WINDOW_SECONDS * 1000;
  }
  return parsed * 1000;
}

function getHttpTimeoutMs(): number {
  const raw = trimEnv("FIVE55_HTTP_TIMEOUT_MS");
  if (!raw) return DEFAULT_HTTP_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HTTP_TIMEOUT_MS;
}

function getHttpRetries(): number {
  const raw = trimEnv("FIVE55_HTTP_RETRIES");
  if (!raw) return DEFAULT_HTTP_RETRIES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_HTTP_RETRIES;
}

function getHttpRetryBaseDelayMs(): number {
  const raw = trimEnv("FIVE55_HTTP_RETRY_BASE_MS");
  if (!raw) return DEFAULT_HTTP_RETRY_BASE_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HTTP_RETRY_BASE_MS;
}

function getHttpMaxResponseChars(): number {
  const raw = trimEnv("FIVE55_HTTP_MAX_RESPONSE_CHARS");
  if (!raw) return DEFAULT_HTTP_MAX_RESPONSE_CHARS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_HTTP_MAX_RESPONSE_CHARS;
}

function parseJwtExpiryMs(token: string): number | undefined {
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  const payload = parts[1];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) {
      return undefined;
    }
    return parsed.exp * 1000;
  } catch {
    return undefined;
  }
}

function parseExchangeResponse(rawBody: string): AgentTokenExchangePayload | null {
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as AgentTokenExchangePayload;
  } catch {
    return null;
  }
}

function toErrorDetail(payload: AgentTokenExchangePayload | null, rawBody: string): string {
  if (payload && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return rawBody || "upstream token exchange failed";
}

function resolveExchangeEndpoint(): string {
  return (
    trimEnv(STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT_ENV) ||
    DEFAULT_TOKEN_EXCHANGE_ENDPOINT
  );
}

function isTokenFresh(entry: AgentTokenCacheEntry): boolean {
  if (!entry.expiresAtMs) return true;
  return Date.now() + getRefreshWindowMs() < entry.expiresAtMs;
}

function normalizeBase(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("baseUrl is required for agent auth");
  return trimmed;
}

async function exchangeTokenWithApiKeyDetailed(
  baseUrl: string,
  apiKey: string,
): Promise<ResolvedAgentBearer> {
  const normalizedBase = normalizeBase(baseUrl);
  const exchangeEndpoint = resolveExchangeEndpoint();
  if (
    cachedExchangedToken &&
    cachedExchangedToken.baseUrl === normalizedBase &&
    isTokenFresh(cachedExchangedToken)
  ) {
    return {
      token: cachedExchangedToken.token,
      kind: "api-key-exchange",
      usedCachedExchangeToken: true,
      exchangeEndpoint,
    };
  }
  if (cachedExchangedToken && cachedExchangedToken.baseUrl !== normalizedBase) {
    cachedExchangedToken = null;
  }
  if (inFlightExchange) {
    return inFlightExchange;
  }

  inFlightExchange = (async () => {
    const exchangeUrl = new URL(exchangeEndpoint, normalizedBase);
    const response = await fetch(exchangeUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ apiKey }),
    });
    const rawBody = await response.text();
    const payload = parseExchangeResponse(rawBody);
    if (!response.ok) {
      throw new Error(
        `agent token exchange failed (${response.status}): ${toErrorDetail(payload, rawBody)}`,
      );
    }
    if (!payload || typeof payload.token !== "string" || payload.token.trim().length === 0) {
      throw new Error("agent token exchange succeeded but no token was returned");
    }

    const expiresAtMs =
      typeof payload.expiresAt === "string" && payload.expiresAt.trim().length > 0
        ? Date.parse(payload.expiresAt)
        : parseJwtExpiryMs(payload.token);
    cachedExchangedToken = {
      baseUrl: normalizedBase,
      token: payload.token,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : undefined,
    };
    return {
      token: payload.token,
      kind: "api-key-exchange",
      usedCachedExchangeToken: false,
      exchangeEndpoint,
    };
  })();

  try {
    return await inFlightExchange;
  } finally {
    inFlightExchange = null;
  }
}

export function isAgentAuthConfigured(): boolean {
  return Boolean(
    trimEnv(STREAM555_AGENT_API_KEY_ENV) ||
      trimEnv(STREAM555_AGENT_TOKEN_ENV) ||
      trimEnv(STREAM_API_BEARER_TOKEN_ENV),
  );
}

export function describeAgentAuthSource(): string {
  if (trimEnv(STREAM555_AGENT_API_KEY_ENV)) {
    return `${STREAM555_AGENT_API_KEY_ENV} (short-lived JWT exchange)`;
  }
  if (trimEnv(STREAM555_AGENT_TOKEN_ENV) || trimEnv(STREAM_API_BEARER_TOKEN_ENV)) {
    return `${STREAM555_AGENT_TOKEN_ENV}|${STREAM_API_BEARER_TOKEN_ENV} (static bearer)`;
  }
  return "not configured";
}

export function invalidateExchangedAgentTokenCache(): void {
  cachedExchangedToken = null;
  inFlightExchange = null;
}

function resolveStaticAgentBearer(): string | undefined {
  return trimEnv(STREAM555_AGENT_TOKEN_ENV) || trimEnv(STREAM_API_BEARER_TOKEN_ENV);
}

async function resolveAgentBearerDetailed(baseUrl: string): Promise<ResolvedAgentBearer> {
  const apiKey = trimEnv(STREAM555_AGENT_API_KEY_ENV);
  if (apiKey) {
    return exchangeTokenWithApiKeyDetailed(baseUrl, apiKey);
  }

  const staticToken = resolveStaticAgentBearer();
  if (staticToken) {
    return {
      token: staticToken,
      kind: "static-bearer",
      usedCachedExchangeToken: false,
    };
  }

  throw new Error(
    `${STREAM555_AGENT_API_KEY_ENV} or ${STREAM555_AGENT_TOKEN_ENV} (or ${STREAM_API_BEARER_TOKEN_ENV}) is required`,
  );
}

export async function resolveAgentBearer(baseUrl: string): Promise<string> {
  const resolved = await resolveAgentBearerDetailed(baseUrl);
  return resolved.token;
}

function parseJsonRecord(rawBody: string): Record<string, unknown> | undefined {
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function logAgentAuthEvent(
  level: "info" | "warn" | "error",
  event: string,
  metadata: Record<string, unknown>,
): void {
  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  logger("[stream555.agent-auth]", {
    event,
    ...metadata,
  });
}

export function createAgentRequestId(scope = "agent"): string {
  const normalizedScope = scope.trim().replace(/[^a-zA-Z0-9._-]+/g, "-") || "agent";
  return `${normalizedScope}-${crypto.randomUUID()}`;
}

export async function requestAgentJson(
  options: AgentJsonRequestOptions,
): Promise<AgentJsonResponse> {
  const requestId = options.requestId?.trim() || createAgentRequestId(options.logScope);
  const logScope = options.logScope?.trim() || "agent-request";
  const retries = Math.max(0, options.retries ?? getHttpRetries());
  const retryBaseDelayMs = Math.max(
    1,
    options.retryBaseDelayMs ?? getHttpRetryBaseDelayMs(),
  );
  const maxResponseChars = Math.max(
    1,
    options.maxResponseChars ?? getHttpMaxResponseChars(),
  );
  const timeoutMs = Math.max(1, options.timeoutMs ?? getHttpTimeoutMs());
  const attempts = retries + 1;
  let refreshedOnUnauthorized = false;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const runRequest = async (
        resolution: ResolvedAgentBearer,
      ): Promise<AgentJsonResponse> => {
        const bodyText =
          options.body !== undefined ? JSON.stringify(options.body) : undefined;
        const headers: Record<string, string> = {
          Accept: "application/json",
          ...(options.headers ?? {}),
          Authorization: `Bearer ${resolution.token}`,
          "x-request-id": requestId,
        };
        if (bodyText !== undefined && !headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
        const response = await fetch(new URL(options.endpoint, options.baseUrl).toString(), {
          method: options.method,
          headers,
          ...(bodyText !== undefined ? { body: bodyText } : {}),
          signal: controller.signal,
        });
        const rawBody = truncate(await response.text(), maxResponseChars);
        return {
          ok: response.ok,
          status: response.status,
          rawBody,
          data: parseJsonRecord(rawBody),
          requestId,
          refreshedOnUnauthorized,
          authSource: resolution.kind,
        };
      };

      const bearer = await resolveAgentBearerDetailed(options.baseUrl);
      let result = await runRequest(bearer);
      if (result.status === 401 && bearer.kind === "api-key-exchange") {
        refreshedOnUnauthorized = true;
        logAgentAuthEvent("warn", "refresh-on-401", {
          requestId,
          logScope,
          method: options.method,
          endpoint: options.endpoint,
          status: result.status,
          usedCachedExchangeToken: bearer.usedCachedExchangeToken,
          exchangeEndpoint: bearer.exchangeEndpoint ?? null,
        });
        invalidateExchangedAgentTokenCache();
        const refreshedBearer = await resolveAgentBearerDetailed(options.baseUrl);
        result = await runRequest(refreshedBearer);
      }

      clearTimeout(timeout);
      logAgentAuthEvent(result.ok ? "info" : "warn", "request-complete", {
        requestId,
        logScope,
        method: options.method,
        endpoint: options.endpoint,
        status: result.status,
        authSource: result.authSource,
        refreshedOnUnauthorized,
        usedCachedExchangeToken: bearer.usedCachedExchangeToken,
        exchangeEndpoint: bearer.exchangeEndpoint ?? null,
      });
      if (result.ok || !isRetryableStatus(result.status) || attempt >= attempts) {
        return result;
      }
    } catch (err) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = /aborted|abort/i.test(message);
      if (attempt >= attempts) {
        logAgentAuthEvent("error", "request-failed", {
          requestId,
          logScope,
          method: options.method,
          endpoint: options.endpoint,
          timeoutMs,
          attempts,
          error: message,
        });
        return {
          ok: false,
          status: 0,
          rawBody: isAbort
            ? `request timed out after ${timeoutMs}ms`
            : `request failed after ${attempts} attempt(s): ${message}`,
          requestId,
          refreshedOnUnauthorized,
          authSource: trimEnv(STREAM555_AGENT_API_KEY_ENV)
            ? "api-key-exchange"
            : "static-bearer",
        };
      }
    }

    const delayMs = retryBaseDelayMs * 2 ** (attempt - 1);
    await sleep(delayMs);
  }

  return {
    ok: false,
    status: 0,
    rawBody: "request failed: exhausted retry budget",
    requestId,
    refreshedOnUnauthorized,
    authSource: trimEnv(STREAM555_AGENT_API_KEY_ENV)
      ? "api-key-exchange"
      : "static-bearer",
  };
}
