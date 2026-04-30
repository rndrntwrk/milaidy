import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureGamesAgentSessionId,
  requestGamesAgentJson,
} from "./five55-games-agent.js";
import { invalidateExchangedAgentTokenCache } from "../plugins/five55-shared/agent-auth.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getFetchHeader(call: unknown[], key: string): string | undefined {
  const init = call[1] as RequestInit | undefined;
  const headers = init?.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return undefined;
  }
  return (headers as Record<string, string>)[key];
}

describe("five55-games agent bootstrap", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateExchangedAgentTokenCache();
    process.env = {
      ...originalEnv,
      STREAM555_AGENT_API_KEY: "games-api-key",
      STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT:
        "/api/agent/v1/auth/token/exchange",
    };
    delete process.env.STREAM555_AGENT_TOKEN;
    delete process.env.STREAM_API_BEARER_TOKEN;
    delete process.env.STREAM_SESSION_ID;
    delete process.env.STREAM555_DEFAULT_SESSION_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    invalidateExchangedAgentTokenCache();
    process.env = { ...originalEnv };
  });

  it("retries games session bootstrap once when the exchanged token is stale", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: "stale-jwt" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid agent token" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "fresh-jwt" }))
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-games-1" }));

    const sessionId = await ensureGamesAgentSessionId(
      "https://alice.example",
      "session-games-1",
      "req-games-bootstrap",
    );

    expect(sessionId).toBe("session-games-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/agent/v1/sessions");
    expect(getFetchHeader(fetchMock.mock.calls[1] ?? [], "Authorization")).toBe(
      "Bearer stale-jwt",
    );
    expect(getFetchHeader(fetchMock.mock.calls[3] ?? [], "Authorization")).toBe(
      "Bearer fresh-jwt",
    );
  });

  it("surfaces the exact upstream auth failure when games bootstrap cannot recover", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: "stale-jwt" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid agent token" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "fresh-jwt" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid agent token" }));

    await expect(
      ensureGamesAgentSessionId(
        "https://alice.example",
        "session-games-2",
        "req-games-bootstrap-fail",
      ),
    ).rejects.toThrow(
      "Session bootstrap failed (401): Invalid agent token [requestId: req-games-bootstrap-fail]",
    );
  });

  it("uses the shared helper for downstream games requests after bootstrap", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: "fresh-jwt" }))
      .mockResolvedValueOnce(jsonResponse(200, { games: [{ id: "ninja-evilcorp" }] }));

    const response = await requestGamesAgentJson(
      "https://alice.example",
      "req-games-catalog",
      "POST",
      "/api/agent/v1/sessions/session-games-3/games/catalog",
      { includeBeta: true },
    );

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.data?.games).toEqual([{ id: "ninja-evilcorp" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getFetchHeader(fetchMock.mock.calls[1] ?? [], "Authorization")).toBe(
      "Bearer fresh-jwt",
    );
  });
});
