import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MilaidyClient } from "../../src/api-client";

describe("MilaidyClient workbench quarantine endpoints", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true, quarantined: [], stats: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("calls quarantine list and review endpoints with expected payload", async () => {
    const client = new MilaidyClient("http://localhost:2138", "token");

    await client.getWorkbenchQuarantine();
    await client.reviewWorkbenchQuarantined("memory/1", "reject");

    const calls = fetchMock.mock.calls.map((call) => ({
      url: String(call[0]),
      method: (call[1]?.method as string | undefined) ?? "GET",
      body: call[1]?.body as string | undefined,
    }));

    expect(calls).toContainEqual({
      url: "http://localhost:2138/api/workbench/quarantine",
      method: "GET",
      body: undefined,
    });
    expect(calls).toContainEqual({
      url: "http://localhost:2138/api/workbench/quarantine/memory%2F1/review",
      method: "POST",
      body: JSON.stringify({ decision: "reject" }),
    });
  });
});
