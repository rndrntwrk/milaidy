import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  "STREAM555_AGENT_TOKEN",
  "STREAM555_AGENT_API_KEY",
  "STREAM_API_BEARER_TOKEN",
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT",
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS",
  "FIVE55_HTTP_TIMEOUT_MS",
  "FIVE55_HTTP_RETRIES",
  "FIVE55_HTTP_RETRY_BASE_MS",
  "FIVE55_HTTP_MAX_RESPONSE_CHARS",
] as const;

function snapshotEnv(): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of ENV_KEYS) snapshot[key] = process.env[key];
  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function getHeader(call: unknown[], key: string): string | undefined {
  const init = call[1] as RequestInit | undefined;
  const headers = init?.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return undefined;
  }
  return (headers as Record<string, string>)[key];
}

describe("agent-auth shared request helper", () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
    vi.resetModules();
    envBefore = snapshotEnv();
    process.env.STREAM555_AGENT_API_KEY = "api-key-1";
    process.env.STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT =
      "/api/agent/v1/auth/token/exchange";
    process.env.FIVE55_HTTP_RETRIES = "0";
    delete process.env.STREAM555_AGENT_TOKEN;
    delete process.env.STREAM_API_BEARER_TOKEN;
    delete process.env.STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS;
  });

  afterEach(() => {
    restoreEnv(envBefore);
    vi.restoreAllMocks();
  });

  it("reuses the cached exchanged token on subsequent requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: "jwt-1" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const { invalidateExchangedAgentTokenCache, requestAgentJson } = await import(
      "./agent-auth.js"
    );
    invalidateExchangedAgentTokenCache();

    const first = await requestAgentJson({
      method: "POST",
      baseUrl: "https://stream.rndrntwrk.com",
      endpoint: "/api/agent/v1/sessions",
      body: {},
      requestId: "req-cached-1",
      logScope: "agent-auth-test",
    });
    const second = await requestAgentJson({
      method: "POST",
      baseUrl: "https://stream.rndrntwrk.com",
      endpoint: "/api/agent/v1/sessions/session-1/stream/start",
      body: {},
      requestId: "req-cached-2",
      logScope: "agent-auth-test",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/agent/v1/auth/token/exchange",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/agent/v1/sessions");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "/api/agent/v1/sessions/session-1/stream/start",
    );
    expect(getHeader(fetchMock.mock.calls[1] ?? [], "Authorization")).toBe(
      "Bearer jwt-1",
    );
    expect(getHeader(fetchMock.mock.calls[2] ?? [], "Authorization")).toBe(
      "Bearer jwt-1",
    );
  });

  it("invalidates the exchanged token and retries once on upstream 401", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: "stale-jwt" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid agent token" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "fresh-jwt" }))
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-1" }));

    const { invalidateExchangedAgentTokenCache, requestAgentJson } = await import(
      "./agent-auth.js"
    );
    invalidateExchangedAgentTokenCache();

    const result = await requestAgentJson({
      method: "POST",
      baseUrl: "https://stream.rndrntwrk.com",
      endpoint: "/api/agent/v1/sessions",
      body: {},
      requestId: "req-refresh-1",
      logScope: "agent-auth-test",
    });

    expect(result.ok).toBe(true);
    expect(result.refreshedOnUnauthorized).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getHeader(fetchMock.mock.calls[1] ?? [], "Authorization")).toBe(
      "Bearer stale-jwt",
    );
    expect(getHeader(fetchMock.mock.calls[3] ?? [], "Authorization")).toBe(
      "Bearer fresh-jwt",
    );
    expect(getHeader(fetchMock.mock.calls[3] ?? [], "x-request-id")).toBe(
      "req-refresh-1",
    );
  });

  it("surfaces the exact upstream 401 after the refresh retry fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: "stale-jwt" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid agent token" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "fresh-jwt" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid agent token" }));

    const { invalidateExchangedAgentTokenCache, requestAgentJson } = await import(
      "./agent-auth.js"
    );
    invalidateExchangedAgentTokenCache();

    const result = await requestAgentJson({
      method: "POST",
      baseUrl: "https://stream.rndrntwrk.com",
      endpoint: "/api/agent/v1/sessions",
      body: {},
      requestId: "req-refresh-2",
      logScope: "agent-auth-test",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.rawBody).toContain("Invalid agent token");
    expect(result.requestId).toBe("req-refresh-2");
  });

  it("keeps exchange failures distinct from upstream bootstrap failures", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: "exchange service unavailable" }),
    );

    const { invalidateExchangedAgentTokenCache, requestAgentJson } = await import(
      "./agent-auth.js"
    );
    invalidateExchangedAgentTokenCache();

    const result = await requestAgentJson({
      method: "POST",
      baseUrl: "https://stream.rndrntwrk.com",
      endpoint: "/api/agent/v1/sessions",
      body: {},
      requestId: "req-exchange-fail",
      logScope: "agent-auth-test",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.rawBody).toContain("agent token exchange failed (500)");
    expect(result.rawBody).toContain("exchange service unavailable");
  });
});
