export const STREAM555_AGENT_TOKEN_ENV = 'STREAM555_AGENT_TOKEN';
export const STREAM555_AGENT_API_KEY_ENV = 'STREAM555_AGENT_API_KEY';
export const STREAM_API_BEARER_TOKEN_ENV = 'STREAM_API_BEARER_TOKEN';
export const STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT_ENV = 'STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT';
export const STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS_ENV = 'STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS';
const DEFAULT_TOKEN_EXCHANGE_ENDPOINT = '/api/agent/v1/auth/token/exchange';
const DEFAULT_REFRESH_WINDOW_SECONDS = 300;
let cachedExchangedToken = null;
let inFlightExchange = null;
function trimEnv(key) {
    const value = process.env[key]?.trim();
    return value ? value : undefined;
}
function getRefreshWindowMs() {
    const raw = trimEnv(STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS_ENV);
    if (!raw)
        return DEFAULT_REFRESH_WINDOW_SECONDS * 1000;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_REFRESH_WINDOW_SECONDS * 1000;
    }
    return parsed * 1000;
}
function parseJwtExpiryMs(token) {
    const parts = token.split('.');
    if (parts.length < 2)
        return undefined;
    const payload = parts[1];
    if (!payload)
        return undefined;
    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) {
            return undefined;
        }
        return parsed.exp * 1000;
    }
    catch {
        return undefined;
    }
}
function parseExchangeResponse(rawBody) {
    try {
        const parsed = rawBody ? JSON.parse(rawBody) : null;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function toErrorDetail(payload, rawBody) {
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
    }
    return rawBody || 'upstream token exchange failed';
}
function resolveExchangeEndpoint() {
    return trimEnv(STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT_ENV) || DEFAULT_TOKEN_EXCHANGE_ENDPOINT;
}
function isTokenFresh(entry) {
    if (!entry.expiresAtMs)
        return true;
    return Date.now() + getRefreshWindowMs() < entry.expiresAtMs;
}
function normalizeBase(baseUrl) {
    const trimmed = baseUrl.trim();
    if (!trimmed)
        throw new Error('baseUrl is required for agent auth');
    return trimmed;
}
async function exchangeTokenWithApiKey(baseUrl, apiKey) {
    const normalizedBase = normalizeBase(baseUrl);
    if (cachedExchangedToken &&
        cachedExchangedToken.baseUrl === normalizedBase &&
        isTokenFresh(cachedExchangedToken)) {
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
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ apiKey }),
        });
        const rawBody = await response.text();
        const payload = parseExchangeResponse(rawBody);
        if (!response.ok) {
            throw new Error(`agent token exchange failed (${response.status}): ${toErrorDetail(payload, rawBody)}`);
        }
        if (!payload || typeof payload.token !== 'string' || payload.token.trim().length === 0) {
            throw new Error('agent token exchange succeeded but no token was returned');
        }
        const expiresAtMs = typeof payload.expiresAt === 'string' && payload.expiresAt.trim().length > 0
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
    }
    finally {
        inFlightExchange = null;
    }
}
export function isAgentAuthConfigured() {
    return Boolean(trimEnv(STREAM555_AGENT_API_KEY_ENV) ||
        trimEnv(STREAM555_AGENT_TOKEN_ENV) ||
        trimEnv(STREAM_API_BEARER_TOKEN_ENV));
}
export function describeAgentAuthSource() {
    if (trimEnv(STREAM555_AGENT_API_KEY_ENV)) {
        return `${STREAM555_AGENT_API_KEY_ENV} (short-lived JWT exchange)`;
    }
    if (trimEnv(STREAM555_AGENT_TOKEN_ENV) || trimEnv(STREAM_API_BEARER_TOKEN_ENV)) {
        return `${STREAM555_AGENT_TOKEN_ENV}|${STREAM_API_BEARER_TOKEN_ENV} (static bearer)`;
    }
    return 'not configured';
}
export function invalidateExchangedAgentTokenCache() {
    cachedExchangedToken = null;
    inFlightExchange = null;
}
export function setActiveBearerToken(token) {
    const trimmed = token.trim();
    if (!trimmed) {
        throw new Error('token is required');
    }
    process.env[STREAM555_AGENT_TOKEN_ENV] = trimmed;
    delete process.env[STREAM555_AGENT_API_KEY_ENV];
    delete process.env[STREAM_API_BEARER_TOKEN_ENV];
    invalidateExchangedAgentTokenCache();
}
export async function resolveAgentBearer(baseUrl) {
    const apiKey = trimEnv(STREAM555_AGENT_API_KEY_ENV);
    if (apiKey) {
        return exchangeTokenWithApiKey(baseUrl, apiKey);
    }
    const staticToken = trimEnv(STREAM555_AGENT_TOKEN_ENV) || trimEnv(STREAM_API_BEARER_TOKEN_ENV);
    if (staticToken) {
        return staticToken;
    }
    throw new Error(`${STREAM555_AGENT_API_KEY_ENV} or ${STREAM555_AGENT_TOKEN_ENV} (or ${STREAM_API_BEARER_TOKEN_ENV}) is required`);
}
//# sourceMappingURL=agentAuth.js.map