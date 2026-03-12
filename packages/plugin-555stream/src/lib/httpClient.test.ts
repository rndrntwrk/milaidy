import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { HttpClient } from "./httpClient.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("HttpClient", () => {
  it("refreshes the bearer token once on 401 and retries the request", async () => {
    const seenAuthHeaders: string[] = [];
    let callCount = 0;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      seenAuthHeaders.push(String((init?.headers as Record<string, string>)?.Authorization ?? ""));

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "Agent token expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, requestId: "req-2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    let refreshCount = 0;
    const client = new HttpClient({
      baseUrl: "https://stream.rndrntwrk.com",
      token: "expired-token",
      tokenProvider: async () => {
        refreshCount += 1;
        return "fresh-token";
      },
      maxRetries: 0,
    });

    const response = await client.get<{ ok: boolean }>("/api/agent/v1/health");

    assert.equal(response.success, true);
    assert.equal(response.data?.ok, true);
    assert.equal(refreshCount, 1);
    assert.deepEqual(seenAuthHeaders, [
      "Bearer expired-token",
      "Bearer fresh-token",
    ]);
  });

  it("does not retry 401 responses without a token provider", async () => {
    let callCount = 0;

    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(JSON.stringify({ error: "Agent token expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const client = new HttpClient({
      baseUrl: "https://stream.rndrntwrk.com",
      token: "expired-token",
      maxRetries: 0,
    });

    const response = await client.get("/api/agent/v1/health");

    assert.equal(response.success, false);
    assert.equal(response.error, "Agent token expired");
    assert.equal(callCount, 1);
  });
});
