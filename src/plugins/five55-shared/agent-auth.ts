export const STREAM555_AGENT_TOKEN_ENV = "STREAM555_AGENT_TOKEN";
export const STREAM555_AGENT_API_KEY_ENV = "STREAM555_AGENT_API_KEY";
export const STREAM_API_BEARER_TOKEN_ENV = "STREAM_API_BEARER_TOKEN";
export const STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT_ENV =
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT";
export const STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS_ENV =
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS";

const DEFAULT_TOKEN_EXCHANGE_ENDPOINT = "/api/agent/v1/auth/token/exchange";
const DEFAULT_REFRESH_WINDOW_SECONDS = 300;

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

let cachedExchangedToken: AgentTokenCacheEntry | null = null;
let inFlightExchange: Promise<string> | null = null;

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

async function exchangeTokenWithApiKey(baseUrl: string, apiKey: string): Promise<string> {
  const normalizedBase = normalizeBase(baseUrl);
  if (
    cachedExchangedToken &&
    cachedExchangedToken.baseUrl === normalizedBase &&
    isTokenFresh(cachedExchangedToken)
  ) {
    return cachedExchangedToken.token;
  }
  if (cachedExchangedToken && cachedExchangedToken.baseUrl !== normalizedBase) {
    cachedExchangedToken = null;
  }
  if (inFlightExchange) {
    return inFlightExchange;
  }

  inFlightExchange = (async () => {
    const endpoint = resolveExchangeEndpoint();
    const exchangeUrl = new URL(endpoint, normalizedBase);
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
    return payload.token;
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

export async function resolveAgentBearer(baseUrl: string): Promise<string> {
  const apiKey = trimEnv(STREAM555_AGENT_API_KEY_ENV);
  if (apiKey) {
    return exchangeTokenWithApiKey(baseUrl, apiKey);
  }

  const staticToken =
    trimEnv(STREAM555_AGENT_TOKEN_ENV) || trimEnv(STREAM_API_BEARER_TOKEN_ENV);
  if (staticToken) {
    return staticToken;
  }

  throw new Error(
    `${STREAM555_AGENT_API_KEY_ENV} or ${STREAM555_AGENT_TOKEN_ENV} (or ${STREAM_API_BEARER_TOKEN_ENV}) is required`,
  );
}
