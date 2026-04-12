/**
 * Integration tests for /api/apps/defense-of-the-agents/* routes.
 *
 * Starts a real API server and a fixture server for the Defense API,
 * then makes real HTTP requests through the Milady API.
 */

import http from "node:http";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { resetInMemoryStateForTests } from "../../../../plugins/app-defense-of-the-agents/src/routes";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "../../src/api/server";

vi.mock("../../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

const DEFENSE_APP_LOCAL_PATH = path.resolve(
  process.cwd(),
  "plugins/app-defense-of-the-agents",
);

vi.mock("../../src/services/registry-client.js", () => ({
  getPluginInfo: vi.fn(async () => ({
    name: "@elizaos/app-defense-of-the-agents",
    localPath: DEFENSE_APP_LOCAL_PATH,
  })),
}));

type DeploymentRequest = {
  authorization?: string;
  body: Record<string, unknown>;
};

type DefenseFixtureServer = {
  close: () => Promise<void>;
  deploymentRequests: DeploymentRequest[];
  url: string;
};

async function readJsonBody(
  httpReq: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of httpReq) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

async function startDefenseFixtureServer(): Promise<DefenseFixtureServer> {
  const deploymentRequests: DeploymentRequest[] = [];

  let hero = {
    name: "Scout",
    faction: "human",
    class: "mage",
    lane: "mid",
    hp: 132,
    maxHp: 200,
    alive: true,
    level: 3,
    xp: 50,
    xpToNext: 400,
    abilities: [{ id: "tornado", level: 1 }],
    abilityChoices: ["fireball", "fortitude"],
  };

  const gameState = (gameId: number) => ({
    tick: 2_048,
    agents: {
      human: gameId === 2 ? ["Scout", "Ally"] : ["Ally"],
      orc: ["Enemy"],
    },
    lanes: {
      top: { human: 3, orc: 5, frontline: -18 },
      mid: { human: 4, orc: 4, frontline: 0 },
      bot: { human: 5, orc: 3, frontline: 12 },
    },
    towers: [
      { faction: "human", lane: "top", hp: 900, maxHp: 1200, alive: true },
      { faction: "orc", lane: "top", hp: 600, maxHp: 1200, alive: true },
    ],
    bases: {
      human: { hp: 1400, maxHp: 1500 },
      orc: { hp: 1500, maxHp: 1500 },
    },
    heroes: gameId === 2 ? [hero] : [],
    winner: null,
  });

  const server = http.createServer(async (httpReq, res) => {
    const url = new URL(httpReq.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(httpReq);

    if (httpReq.method === "GET" && url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.statusCode = 200;
      res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/styles.css" />
    <style>
      @font-face {
        font-family: "Fixture";
        src: url("/fonts/fixture.woff2") format("woff2");
      }
    </style>
  </head>
  <body>
    <div id="landing-overlay">Landing</div>
    <div id="auth-modal" class="modal-overlay open">Auth</div>
    <div id="class-modal" class="modal-overlay open">Class</div>
    <div id="join-btn">Join</div>
    <img src="/hero.png" />
    <script src="/app.js"></script>
  </body>
</html>`);
      return;
    }

    res.setHeader("Content-Type", "application/json");

    if (httpReq.method === "GET" && url.pathname === "/api/game/state") {
      const gameId = Number.parseInt(url.searchParams.get("game") ?? "1", 10);
      res.statusCode = 200;
      res.end(JSON.stringify(gameState(gameId)));
      return;
    }

    if (httpReq.method === "POST" && url.pathname === "/api/strategy/deployment") {
      deploymentRequests.push({
        authorization: httpReq.headers.authorization,
        body: body ?? {},
      });

      if (typeof body?.heroLane === "string") {
        hero = { ...hero, lane: body.heroLane as typeof hero.lane };
      }
      if (typeof body?.heroClass === "string") {
        hero = { ...hero, class: body.heroClass as typeof hero.class };
      }
      if (typeof body?.abilityChoice === "string") {
        hero = {
          ...hero,
          abilityChoices: hero.abilityChoices.filter(
            (choice) => choice !== body.abilityChoice,
          ),
          abilities: [
            ...hero.abilities,
            {
              id: body.abilityChoice,
              level: 1,
            },
          ],
        };
      }

      res.statusCode = 200;
      res.end(JSON.stringify({ message: "Deployment received.", gameId: 2 }));
      return;
    }

    res.statusCode = 404;
    res.end(
      JSON.stringify({ error: `Unhandled ${httpReq.method} ${url.pathname}` }),
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
    throw new Error("Failed to resolve Defense fixture server address.");
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
    deploymentRequests,
    url: `http://127.0.0.1:${address.port}`,
  };
}

let apiPort: number;
let apiClose: () => Promise<void>;

describe("Defense of the Agents app routes (real server)", () => {
  let fixtureServer: DefenseFixtureServer | null = null;
  const originalApiUrl = process.env.DEFENSE_OF_THE_AGENTS_API_URL;
  const originalApiKey = process.env.DEFENSE_OF_THE_AGENTS_API_KEY;
  const originalGameId = process.env.DEFENSE_OF_THE_AGENTS_GAME_ID;
  const originalAgentName = process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME;
  const originalViewerUrl = process.env.DEFENSE_OF_THE_AGENTS_VIEWER_URL;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    apiPort = server.port;
    apiClose = server.close;
  }, 180_000);

  afterAll(async () => {
    await apiClose();
  });

  beforeEach(async () => {
    fixtureServer = await startDefenseFixtureServer();
    process.env.DEFENSE_OF_THE_AGENTS_API_URL = fixtureServer.url;
    process.env.DEFENSE_OF_THE_AGENTS_API_KEY = "fixture-defense-api-key";
    process.env.DEFENSE_OF_THE_AGENTS_GAME_ID = "2";
    process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME = "Scout";
    process.env.DEFENSE_OF_THE_AGENTS_VIEWER_URL = fixtureServer.url;
  });

  afterEach(async () => {
    resetInMemoryStateForTests();

    if (fixtureServer) {
      await fixtureServer.close();
      fixtureServer = null;
    }

    const envRestore: Record<string, string | undefined> = {
      DEFENSE_OF_THE_AGENTS_API_URL: originalApiUrl,
      DEFENSE_OF_THE_AGENTS_API_KEY: originalApiKey,
      DEFENSE_OF_THE_AGENTS_GAME_ID: originalGameId,
      DEFENSE_OF_THE_AGENTS_AGENT_NAME: originalAgentName,
      DEFENSE_OF_THE_AGENTS_VIEWER_URL: originalViewerUrl,
    };
    for (const [key, value] of Object.entries(envRestore)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }

    vi.restoreAllMocks();
  });

  test("returns live session state for the tracked Defense hero", async () => {
    const { status, data } = await req(
      apiPort,
      "GET",
      "/api/apps/defense-of-the-agents/session/Scout",
    );
    expect(status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        sessionId: "Scout",
        appName: "@elizaos/app-defense-of-the-agents",
        mode: "spectate-and-steer",
        status: "running",
        canSendCommands: true,
      }),
    );
  }, 60_000);

  test("message commands translate into deployments and return a refreshed session", async () => {
    const { status, data } = await req(
      apiPort,
      "POST",
      "/api/apps/defense-of-the-agents/session/Scout/message",
      { content: "Move to top lane and learn fireball" },
    );
    expect(status).toBe(200);
    expect(fixtureServer?.deploymentRequests).toEqual([
      {
        authorization: "Bearer fixture-defense-api-key",
        body: {
          heroClass: "mage",
          heroLane: "top",
          abilityChoice: "fireball",
        },
      },
    ]);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        message: "Deployment received.",
      }),
    );
  }, 60_000);

  test("control routes fail because Defense has no pause/resume surface", async () => {
    const { status, data } = await req(
      apiPort,
      "POST",
      "/api/apps/defense-of-the-agents/session/Scout/control",
      { action: "pause" },
    );
    expect(status).toBe(400);
    expect(data).toEqual({
      error:
        "Defense of the Agents does not expose pause or resume controls.",
    });
  }, 60_000);

  test("message with empty content returns 400", async () => {
    const { status, data } = await req(
      apiPort,
      "POST",
      "/api/apps/defense-of-the-agents/session/Scout/message",
      { content: "" },
    );
    expect(status).toBe(400);
    expect(data).toEqual({
      error: "Command content is required.",
    });
  }, 60_000);
});
