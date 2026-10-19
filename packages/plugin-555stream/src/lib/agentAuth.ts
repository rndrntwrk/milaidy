export const STREAM555_AGENT_TOKEN_ENV = 'STREAM555_AGENT_TOKEN';
export const STREAM555_AGENT_API_KEY_ENV = 'STREAM555_AGENT_API_KEY';
export const STREAM_API_BEARER_TOKEN_ENV = 'STREAM_API_BEARER_TOKEN';
export const STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT_ENV =
  'STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT';
export const STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS_ENV =
  'STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS';

const DEFAULT_TOKEN_EXCHANGE_ENDPOINT = '/api/agent/v1/auth/token/exchange';
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
let inFlightNativeRefresh: Promise<string> | null = null;
let persistNativeToken: ((nextToken: string, previousToken: string) => Promise<void>) | undefined;

export function isAliceNativeStreamRuntime(): boolean {
  return process.env.ALICE_RUNTIME_AUTHORITY_MODE === 'proposer-only' &&
    process.env.ALICE_RUNTIME_PROFILE === 'full-gated';
}

/** Alice supplies its existing encrypted config writer; the plugin owns no secret store. */
export function setNativeAgentTokenPersistence(
  persist: ((nextToken: string, previousToken: string) => Promise<void>) | undefined,
  onlyIfUnset = false,
): void {
  if (onlyIfUnset && persistNativeToken) return;
  persistNativeToken = persist;
}

function nativeTokenMetadata(token: string) {
  let claims: Record<string, unknown>;
  try {
    const parts = token.split('.');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const value: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (parts.length !== 3 || header.alg !== 'HS256' || !value ||
        typeof value !== 'object' || Array.isArray(value)) throw new Error();
    claims = value as Record<string, unknown>;
  } catch { throw new Error('A native Stream grant is required'); }
  const c = claims;
  // This checks client routing/renewal metadata, not admission. Stream verifies
  // the signed grant, current D1 identity, scopes and revocation on every request.
  if (c.type !== 'agent' || c.studioAuthority !== 'd1-v1' ||
      c.iss !== '555stream-studio-agent' || c.aud !== '555stream-native' ||
      typeof c.jti !== 'string' || !c.jti || typeof c.userId !== 'string' ||
      c.subjectUserId !== c.userId || typeof c.actorId !== 'string' ||
      typeof c.agentId !== 'string' || typeof c.policyId !== 'string' ||
      c.actorType !== 'agent' || c.authMethod !== 'agent_key' || c.sessionKind !== 'agent_runtime' ||
      typeof c.iat !== 'number' || !Number.isSafeInteger(c.iat) ||
      typeof c.exp !== 'number' || !Number.isSafeInteger(c.exp) ||
      c.exp <= c.iat || c.exp - c.iat > 604800 ||
      !Array.isArray(c.scopes) || c.scopes.length === 0 ||
      !c.scopes.every(scope => typeof scope === 'string' && scope !== '*:*') ||
      !Array.isArray(c.sessionIds) || !c.sessionIds.includes(trimEnv('STREAM555_DEFAULT_SESSION_ID'))) {
    throw new Error('Native Stream grant bounds do not match the configured session');
  }
  const now = Date.now();
  if (c.exp * 1000 <= now) throw new Error('Native Stream grant has expired');
  if (c.iat * 1000 > now + 60000) throw new Error('Native Stream grant issuance time is invalid');
  const lifetime = (c.exp - c.iat) * 1000;
  return { claims, jti: c.jti, lifetime, expiresAt: c.exp * 1000,
    refreshAt: Math.min(c.iat * 1000 + 86400000, c.iat * 1000 + lifetime / 2) };
}

function conservedNativeClaims(claims: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.keys(claims)
    .filter(key => !['jti', 'iat', 'exp'].includes(key)).sort().map(key => [key, claims[key]])));
}

async function resolveNativeAgentBearer(baseUrl: string): Promise<string> {
  let origin: string;
  try {
    const target = new URL(baseUrl);
    const configured = new URL(trimEnv('STREAM555_PUBLIC_BASE_URL') ?? '');
    if (configured.href !== 'https://stream.rndrntwrk.com/' || target.origin !== configured.origin ||
        target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error();
    origin = target.origin;
  } catch { throw new Error('Native Stream origin is not configured correctly'); }
  const token = trimEnv(STREAM555_AGENT_TOKEN_ENV);
  if (!token) throw new Error('A native Stream grant is required');
  const previous = nativeTokenMetadata(token);
  if (Date.now() < previous.refreshAt) return token;
  if (inFlightNativeRefresh) return inFlightNativeRefresh;
  const persist = persistNativeToken;
  if (!persist) throw new Error('Native Stream credential persistence is unavailable');
  inFlightNativeRefresh = (async () => {
    const response = await fetch(`${origin}/api/agent/v1/auth/refresh`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error(`Native Stream grant refresh failed (${response.status})`);
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('token' in body) || typeof body.token !== 'string')
      throw new Error('Native Stream refresh did not return a grant');
    const next = nativeTokenMetadata(body.token);
    if (next.jti === previous.jti || next.lifetime !== previous.lifetime ||
        next.expiresAt <= previous.expiresAt ||
        conservedNativeClaims(next.claims) !== conservedNativeClaims(previous.claims))
      throw new Error('Native Stream refresh changed grant bounds');
    try { await persist(body.token, token); }
    catch { throw new Error('Native Stream refreshed credential could not be persisted'); }
    if (trimEnv(STREAM555_AGENT_TOKEN_ENV) !== token) {
      throw new Error('Native Stream credential changed during refresh');
    }
    setActiveBearerToken(body.token);
    return body.token;
  })();
  try { return await inFlightNativeRefresh; }
  finally { inFlightNativeRefresh = null; }
}

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
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  const payload = parts[1];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    if (typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) {
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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as AgentTokenExchangePayload;
  } catch {
    return null;
  }
}

function toErrorDetail(payload: AgentTokenExchangePayload | null, rawBody: string): string {
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  return rawBody || 'upstream token exchange failed';
}

function resolveExchangeEndpoint(): string {
  return trimEnv(STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT_ENV) || DEFAULT_TOKEN_EXCHANGE_ENDPOINT;
}

function isTokenFresh(entry: AgentTokenCacheEntry): boolean {
  if (!entry.expiresAtMs) return true;
  return Date.now() + getRefreshWindowMs() < entry.expiresAtMs;
}

function normalizeBase(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error('baseUrl is required for agent auth');
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
      throw new Error(
        `agent token exchange failed (${response.status}): ${toErrorDetail(payload, rawBody)}`,
      );
    }
    if (!payload || typeof payload.token !== 'string' || payload.token.trim().length === 0) {
      throw new Error('agent token exchange succeeded but no token was returned');
    }

    const expiresAtMs =
      typeof payload.expiresAt === 'string' && payload.expiresAt.trim().length > 0
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
  if (isAliceNativeStreamRuntime()) return Boolean(trimEnv(STREAM555_AGENT_TOKEN_ENV));
  return Boolean(
    trimEnv(STREAM555_AGENT_API_KEY_ENV) ||
      trimEnv(STREAM555_AGENT_TOKEN_ENV) ||
      trimEnv(STREAM_API_BEARER_TOKEN_ENV),
  );
}

export function describeAgentAuthSource(): string {
  if (isAliceNativeStreamRuntime()) {
    return trimEnv(STREAM555_AGENT_TOKEN_ENV) ? 'native D1 session grant (persistent renewal)' : 'not configured';
  }
  if (trimEnv(STREAM555_AGENT_API_KEY_ENV)) {
    return `${STREAM555_AGENT_API_KEY_ENV} (short-lived JWT exchange)`;
  }
  if (trimEnv(STREAM555_AGENT_TOKEN_ENV) || trimEnv(STREAM_API_BEARER_TOKEN_ENV)) {
    return `${STREAM555_AGENT_TOKEN_ENV}|${STREAM_API_BEARER_TOKEN_ENV} (static bearer)`;
  }
  return 'not configured';
}

export function invalidateExchangedAgentTokenCache(): void {
  cachedExchangedToken = null;
  inFlightExchange = null;
}

export function setActiveBearerToken(token: string): void {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('token is required');
  }
  process.env[STREAM555_AGENT_TOKEN_ENV] = trimmed;
  delete process.env[STREAM555_AGENT_API_KEY_ENV];
  delete process.env[STREAM_API_BEARER_TOKEN_ENV];
  invalidateExchangedAgentTokenCache();
}

export async function resolveAgentBearer(baseUrl: string): Promise<string> {
  if (isAliceNativeStreamRuntime()) return resolveNativeAgentBearer(baseUrl);
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
