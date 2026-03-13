import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WsClient } from "./wsClient.js";

describe("WsClient", () => {
  it("refreshes the bearer token and retries bind once on auth failure", async () => {
    let refreshCount = 0;
    const client = new WsClient({
      url: "wss://stream.rndrntwrk.com/ws",
      token: "expired-token",
      tokenProvider: async () => `fresh-token-${++refreshCount}`,
      maxReconnectAttempts: 0,
    });

    const sentTokens: string[] = [];
    let sendCount = 0;

    (client as unknown as { ws: { readyState: number; send: (payload: string) => void } }).ws = {
      readyState: 1,
      send: (payload: string) => {
        const parsed = JSON.parse(payload) as { token: string };
        sentTokens.push(parsed.token);
        sendCount += 1;

        queueMicrotask(() => {
          const runtimeClient = client as unknown as {
            handleMessage: (message: { type: string; sessionId?: string; error?: string }) => void;
          };
          if (sendCount === 1) {
            runtimeClient.handleMessage({
              type: "error",
              error: "Agent token expired",
            });
            return;
          }

          runtimeClient.handleMessage({
            type: "bound",
            sessionId: "session-1",
          });
        });
      },
    };

    await client.bind("session-1");

    assert.deepEqual(sentTokens, ["fresh-token-1", "fresh-token-2"]);
    assert.equal(client.getBoundSessionId(), "session-1");
  });
});
