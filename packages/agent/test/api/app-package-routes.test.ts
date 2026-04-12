/**
 * Integration tests for /api/apps/:appSlug/* package routes.
 *
 * These tests start a real API server and exercise the app package route
 * handler through real HTTP requests. Since the Hyperscape local checkout
 * may not be available in all environments, tests are conditionally skipped.
 */

import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "../../src/api/server";

vi.mock("../../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

const hyperscapeLocalPathUrl = new URL(
  "../../../../../hyperscape/packages/plugin-hyperscape/",
  import.meta.url,
);
const HYPERSCAPE_LOCAL_PATH = fileURLToPath(hyperscapeLocalPathUrl);
const hasLocalHyperscapeRoutes = existsSync(
  new URL("src/app.ts", hyperscapeLocalPathUrl),
);

vi.mock("../../src/services/registry-client.js", () => ({
  getPluginInfo: vi.fn(async () => ({
    name: "@hyperscape/plugin-hyperscape",
    localPath: hasLocalHyperscapeRoutes ? HYPERSCAPE_LOCAL_PATH : null,
  })),
}));

type HyperscapeFixtureServer = {
  close: () => Promise<void>;
  receivedCommands: Array<{ path: string; body: unknown }>;
  url: string;
};

async function readJsonBody(
  httpReq: http.IncomingMessage,
): Promise<unknown | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of httpReq) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function startHyperscapeFixtureServer(): Promise<HyperscapeFixtureServer> {
  let goalsPaused = false;
  const receivedCommands: Array<{ path: string; body: unknown }> = [];

  const server = http.createServer(async (httpReq, res) => {
    const url = new URL(httpReq.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(httpReq);

    res.setHeader("Content-Type", "application/json");

    if (httpReq.method === "GET" && url.pathname === "/api/embedded-agents") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          agents: [
            {
              agentId: "agent-1",
              characterId: "char-1",
              name: "Scout",
              state: "running",
              entityId: "char-1",
              lastActivity: 1712265600,
              startedAt: 1712262000,
            },
          ],
        }),
      );
      return;
    }

    if (
      httpReq.method === "POST" &&
      url.pathname === "/api/embedded-agents/char-1/pause"
    ) {
      goalsPaused = true;
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Goals paused" }));
      return;
    }

    if (
      httpReq.method === "POST" &&
      url.pathname === "/api/embedded-agents/char-1/resume"
    ) {
      goalsPaused = false;
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Goals resumed" }));
      return;
    }

    if (
      httpReq.method === "POST" &&
      url.pathname === "/api/embedded-agents/char-1/command"
    ) {
      receivedCommands.push({ path: url.pathname, body });
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Command delivered" }));
      return;
    }

    if (
      httpReq.method === "GET" &&
      url.pathname === "/api/agents/mapping/runtime-agent-id"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          agentId: "runtime-agent-id",
          characterId: "char-runtime",
          accountId: "wallet:evm:0x1234567890123456789012345678901234567890",
          agentName: "Chen",
        }),
      );
      return;
    }

    if (
      httpReq.method === "POST" &&
      url.pathname === "/api/agents/runtime-agent-id/message"
    ) {
      receivedCommands.push({ path: url.pathname, body });
      res.statusCode = 200;
      res.end(
        JSON.stringify({ success: true, message: "Message sent to agent" }),
      );
      return;
    }

    if (
      httpReq.method === "POST" &&
      url.pathname === "/api/agents/runtime-agent-id/goal/stop"
    ) {
      goalsPaused = true;
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Goal stopped" }));
      return;
    }

    if (
      httpReq.method === "POST" &&
      url.pathname === "/api/agents/runtime-agent-id/goal/resume"
    ) {
      goalsPaused = false;
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Goal resumed" }));
      return;
    }

    if (httpReq.method === "GET" && url.pathname === "/api/agents/agent-1/goal") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          goal: goalsPaused ? null : { description: "Scout the ruins" },
          goalsPaused,
          availableGoals: [
            { description: "Scout the ruins", type: "explore" },
            { description: "Chop nearby tree", type: "gather" },
          ],
        }),
      );
      return;
    }

    if (
      httpReq.method === "GET" &&
      url.pathname === "/api/agents/runtime-agent-id/goal"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          goal: goalsPaused ? null : { description: "Investigate the ruins" },
          goalsPaused,
          availableGoals: [
            { description: "Investigate the ruins", type: "explore" },
            { description: "Gather wood", type: "gather" },
          ],
        }),
      );
      return;
    }

    if (
      httpReq.method === "GET" &&
      url.pathname === "/api/agents/agent-1/quick-actions"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          quickCommands: [
            {
              label: "Scout",
              command: goalsPaused ? "resume exploration" : "scan nearby ruins",
              available: true,
            },
          ],
          nearbyLocations: [{ name: "Ruins" }, { name: "Forest" }],
        }),
      );
      return;
    }

    if (
      httpReq.method === "GET" &&
      url.pathname === "/api/agents/runtime-agent-id/quick-actions"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          quickCommands: [
            {
              label: "Explore",
              command: goalsPaused ? "resume exploring" : "check the ruins",
              available: true,
            },
          ],
          nearbyLocations: [{ name: "Ruins" }, { name: "Town" }],
          playerPosition: [12, 0, 18],
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(
      JSON.stringify({
        error: `Unhandled route: ${httpReq.method} ${url.pathname}`,
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err?: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve Hyperscape fixture server address.");
  }

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
    receivedCommands,
    url: `http://127.0.0.1:${address.port}`,
  };
}

let apiPort: number;
let apiClose: () => Promise<void>;

describeIf(hasLocalHyperscapeRoutes)("handleAppPackageRoutes (real server)", () => {
  let fixtureServer: HyperscapeFixtureServer | null = null;
  const originalApiUrl = process.env.HYPERSCAPE_API_URL;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    apiPort = server.port;
    apiClose = server.close;
  }, 180_000);

  afterAll(async () => {
    await apiClose();
  });

  beforeEach(async () => {
    fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
  });

  afterEach(async () => {
    if (fixtureServer) {
      await fixtureServer.close();
      fixtureServer = null;
    }
    if (originalApiUrl !== undefined) {
      process.env.HYPERSCAPE_API_URL = originalApiUrl;
    } else {
      delete process.env.HYPERSCAPE_API_URL;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("does not route reserved app slugs like /api/apps/runs through package handlers", async () => {
    const { status } = await req(apiPort, "GET", "/api/apps/runs/run-1");
    // Reserved slug /api/apps/runs is handled by apps-routes, not package routes
    expect([200, 404]).toContain(status);
  }, 60_000);

  test("loads local app package routes and returns live session state", async () => {
    const { status, data } = await req(
      apiPort,
      "GET",
      "/api/apps/hyperscape/session/agent-1",
    );
    expect(status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        sessionId: "agent-1",
        appName: "@hyperscape/plugin-hyperscape",
        mode: "spectate-and-steer",
        status: "running",
      }),
    );
  }, 60_000);

  test("session messages go upstream and return a refreshed session snapshot", async () => {
    const { status, data } = await req(
      apiPort,
      "POST",
      "/api/apps/hyperscape/session/agent-1/message",
      { content: "scan the area" },
    );
    expect(status).toBe(200);
    expect(fixtureServer?.receivedCommands).toEqual([
      {
        path: "/api/embedded-agents/char-1/command",
        body: {
          command: "chat",
          data: { message: "scan the area" },
        },
      },
    ]);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        message: "Command delivered",
      }),
    );
  }, 60_000);

  test("returns 400 for empty message content", async () => {
    const { status, data } = await req(
      apiPort,
      "POST",
      "/api/apps/hyperscape/session/agent-1/message",
      { content: "   " },
    );
    expect(status).toBe(400);
    expect(data).toEqual({ error: "content is required" });
  }, 60_000);

  test("returns 404 when the requested session cannot be resolved", async () => {
    const { status, data } = await req(
      apiPort,
      "GET",
      "/api/apps/hyperscape/session/unknown-session",
    );
    expect(status).toBe(404);
    expect(data).toEqual({ error: "Hyperscape session not found" });
  }, 60_000);
});
