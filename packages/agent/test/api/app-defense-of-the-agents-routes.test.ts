import http from "node:http";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { handleAppPackageRoutes } from "../../src/api/app-package-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

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
  req: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
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

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(req);
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && url.pathname === "/api/game/state") {
      const gameId = Number.parseInt(url.searchParams.get("game") ?? "1", 10);
      res.statusCode = 200;
      res.end(JSON.stringify(gameState(gameId)));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/strategy/deployment") {
      deploymentRequests.push({
        authorization: req.headers.authorization,
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
      JSON.stringify({ error: `Unhandled ${req.method} ${url.pathname}` }),
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

describe("Defense of the Agents app routes", () => {
  let fixtureServer: DefenseFixtureServer | null = null;
  const originalApiUrl = process.env.DEFENSE_OF_THE_AGENTS_API_URL;
  const originalApiKey = process.env.DEFENSE_OF_THE_AGENTS_API_KEY;
  const originalGameId = process.env.DEFENSE_OF_THE_AGENTS_GAME_ID;
  const originalAgentName = process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME;

  beforeEach(async () => {
    fixtureServer = await startDefenseFixtureServer();
    process.env.DEFENSE_OF_THE_AGENTS_API_URL = fixtureServer.url;
    process.env.DEFENSE_OF_THE_AGENTS_API_KEY = "fixture-defense-api-key";
    process.env.DEFENSE_OF_THE_AGENTS_GAME_ID = "2";
    process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME = "Scout";
  });

  afterEach(async () => {
    if (fixtureServer) {
      await fixtureServer.close();
      fixtureServer = null;
    }

    if (originalApiUrl !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_API_URL = originalApiUrl;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_API_URL;
    }
    if (originalApiKey !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_API_KEY = originalApiKey;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_API_KEY;
    }
    if (originalGameId !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_GAME_ID = originalGameId;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_GAME_ID;
    }
    if (originalAgentName !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME = originalAgentName;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME;
    }

    vi.restoreAllMocks();
  });

  test("returns live session state for the tracked Defense hero", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/defense-of-the-agents/session/Scout",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/defense-of-the-agents/session/Scout",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => null),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(
      expect.objectContaining({
        sessionId: "Scout",
        appName: "@elizaos/app-defense-of-the-agents",
        mode: "spectate-and-steer",
        status: "running",
        canSendCommands: true,
        goalLabel: "Choose an ability for Scout",
        suggestedPrompts: expect.arrayContaining([
          "Move to top lane",
          "Learn Fireball",
        ]),
        telemetry: expect.objectContaining({
          gameId: 2,
          heroClass: "mage",
          heroLane: "mid",
          heroAbilityChoices: 2,
        }),
      }),
    );
  });

  test("message commands translate into deployments and return a refreshed session", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({
        content: "Move to top lane and learn fireball",
      })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
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
    expect(getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: "Deployment received.",
        session: expect.objectContaining({
          sessionId: "Scout",
          status: "running",
          goalLabel: "Choose an ability for Scout",
          telemetry: expect.objectContaining({
            heroLane: "top",
            heroAbilityChoices: 1,
          }),
        }),
      }),
    );
  });

  test("control routes fail loudly because the remote API has no pause or resume surface", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/control",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/control",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/control",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ action: "pause" })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "Defense of the Agents does not expose pause or resume controls.",
    });
  });
});
