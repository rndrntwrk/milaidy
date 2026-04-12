/**
 * Tests for cloud/cloud-proxy.ts — the CloudRuntimeProxy.
 *
 * Uses a local HTTP server with a real ElizaCloudClient instead of mock objects.
 *
 * Exercises:
 *   - handleChatMessage delegates to client.sendMessage
 *   - handleChatMessageStream yields text chunks
 *   - getStatus returns agent status
 *   - agentName getter
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ElizaCloudClient } from "./bridge-client";
import { CloudRuntimeProxy } from "./cloud-proxy";

// ---------------------------------------------------------------------------
// Local test server simulating cloud bridge endpoints
// ---------------------------------------------------------------------------

let server: http.Server;
let serverPort: number;
let heartbeatShouldFail = false;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const respond = (body: unknown, status = 200, contentType = "application/json") => {
      res.writeHead(status, { "Content-Type": contentType });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };

    // POST /api/v1/eliza/agents/:id/bridge — sendMessage / heartbeat
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/bridge/) && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;

      if (body.method === "heartbeat") {
        if (heartbeatShouldFail) {
          res.writeHead(503);
          res.end("Service unavailable");
          return;
        }
        respond({ result: { ok: true } });
        return;
      }

      // message.send
      const params = body.params as Record<string, string> | undefined;
      respond({
        result: { text: "Hello from cloud" },
        id: body.id,
      });
      return;
    }

    // POST /api/v1/eliza/agents/:id/stream — sendMessageStream
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/stream/) && req.method === "POST") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: chunk\ndata: ${JSON.stringify({ text: "Hello " })}\n\n`);
      res.write(`event: chunk\ndata: ${JSON.stringify({ text: "world" })}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({})}\n\n`);
      res.end();
      return;
    }

    // GET /api/v1/eliza/agents/:id — getAgent
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+$/) && req.method === "GET") {
      respond({
        success: true,
        data: {
          id: "a1",
          agentName: "TestBot",
          status: "running",
          databaseStatus: "ready",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  serverPort = (server.address() as AddressInfo).port;
});

afterEach(() => {
  heartbeatShouldFail = false;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function createClient(): ElizaCloudClient {
  return new ElizaCloudClient(`http://127.0.0.1:${serverPort}`, "test-key");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

    // "done" events are filtered out — only text chunks yielded
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
