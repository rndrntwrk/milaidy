import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStewardWalletAddress } from "./steward-evm-account";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchStewardWalletAddress", () => {
  it("applies request timeouts and falls back from vault addresses to the agent record", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(
      fetchStewardWalletAddress(
        "https://steward.example",
        "token-123",
        "agent-123",
      ),
    ).resolves.toBe("0x1234567890abcdef1234567890abcdef12345678");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://steward.example/vault/agent-123/addresses",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://steward.example/agents/agent-123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
