/**
 * Tests for cloud/cloud-proxy.ts — the CloudRuntimeProxy.
 *
 * Uses the real ElizaCloudClient with mocked fetch responses so the suite
 * stays deterministic and does not depend on local socket permissions.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElizaCloudClient } from "./bridge-client";
import { CloudRuntimeProxy } from "./cloud-proxy";

let heartbeatShouldFail = false;

function createClient(): ElizaCloudClient {
  return new ElizaCloudClient("http://cloud.test", "test-key");
}

function createStreamResponse(body: string) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

beforeEach(() => {
  heartbeatShouldFail = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";

      if (
        url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/bridge/) &&
        method === "POST"
      ) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;

        if (body.method === "heartbeat") {
          if (heartbeatShouldFail) {
            return new Response("Service unavailable", { status: 503 });
          }
          return new Response(JSON.stringify({ result: { ok: true } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({
            result: { text: "Hello from cloud" },
            id: body.id,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (
        url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/stream/) &&
        method === "POST"
      ) {
        return createStreamResponse(
          `event: chunk\ndata: ${JSON.stringify({ text: "Hello " })}\n\n` +
            `event: chunk\ndata: ${JSON.stringify({ text: "world" })}\n\n` +
            `event: done\ndata: ${JSON.stringify({})}\n\n`,
        );
      }

      if (
        url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+$/) &&
        method === "GET"
      ) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "a1",
              agentName: "TestBot",
              status: "running",
              databaseStatus: "ready",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response("Not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("CloudRuntimeProxy", () => {
  it("agentName returns the name passed at construction", () => {
    const proxy = new CloudRuntimeProxy(createClient(), "a1", "MyBot");
    expect(proxy.agentName).toBe("MyBot");
  });

  it("handleChatMessage delegates to client and returns text", async () => {
    const proxy = new CloudRuntimeProxy(createClient(), "a1", "Bot");

    const result = await proxy.handleChatMessage("Hi there");
    expect(result).toBe("Hello from cloud");
  });

  it("handleChatMessageStream yields only text chunks", async () => {
    const proxy = new CloudRuntimeProxy(createClient(), "a1", "Bot");

    const chunks: string[] = [];
    for await (const chunk of proxy.handleChatMessageStream(
      "Tell me something",
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello ", "world"]);
  });

  it("getStatus returns status from cloud agent", async () => {
    const proxy = new CloudRuntimeProxy(createClient(), "a1", "Bot");
    const status = await proxy.getStatus();

    expect(status.state).toBe("running");
    expect(status.agentName).toBe("TestBot");
  });

  it("isAlive returns true when heartbeat succeeds", async () => {
    const proxy = new CloudRuntimeProxy(createClient(), "a1", "Bot");
    const alive = await proxy.isAlive();
    expect(alive).toBe(true);
  });

  it("isAlive returns false when heartbeat fails", async () => {
    heartbeatShouldFail = true;
    const proxy = new CloudRuntimeProxy(createClient(), "a1", "Bot");
    const alive = await proxy.isAlive();
    expect(alive).toBe(false);
  });
});
