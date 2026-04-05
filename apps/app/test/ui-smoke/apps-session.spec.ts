import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { expect, test } from "@playwright/test";
import { WebSocketServer } from "ws";
import { installDefaultAppMocks, openAppPath, seedAppStorage } from "./helpers";

const SESSION_ID = "session-123";
const VIEWER_PATH = "/viewer/hyperscape";

type FixtureState = {
  launchRequestName: string | null;
  lastCommand: string | null;
  lastControlAction: string | null;
  sessionPollCount: number;
  unexpectedRequests: string[];
  sessionState: {
    sessionId: string;
    appName: string;
    mode: "spectate-and-steer";
    status: string;
    displayName: string;
    agentId: string;
    characterId: string;
    followEntity: string;
    canSendCommands: boolean;
    controls: Array<"pause" | "resume">;
    summary: string;
    goalLabel: string;
    suggestedPrompts: string[];
    telemetry: {
      zone: string;
      mode: string;
    };
  };
};

type FixtureServer = {
  baseUrl: string;
  state: FixtureState;
  close: () => Promise<void>;
};

function buildViewerUrl(req: http.IncomingMessage): string {
  return new URL(VIEWER_PATH, `http://${req.headers.host}`).toString();
}

function buildViewerHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Hyperscape Viewer Fixture</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: #06070a;
        color: #f4f0e6;
        display: grid;
        min-height: 100vh;
        place-items: center;
      }
      main {
        width: min(32rem, 100%);
        border: 1px solid rgba(255, 205, 96, 0.28);
        border-radius: 20px;
        background: rgba(18, 18, 24, 0.92);
        padding: 24px;
        box-sizing: border-box;
      }
      .label {
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #ffcd60;
      }
      #viewer-state {
        margin-top: 12px;
        font-size: 20px;
        font-weight: 700;
      }
      pre {
        margin: 16px 0 0;
        white-space: pre-wrap;
        word-break: break-word;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 14px;
        padding: 12px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="label">Hyperscape Viewer Fixture</div>
      <div id="viewer-state">booting</div>
      <pre id="auth-payload">waiting for auth</pre>
    </main>
    <script>
      const stateEl = document.getElementById("viewer-state");
      const payloadEl = document.getElementById("auth-payload");

      window.addEventListener("message", (event) => {
        payloadEl.textContent = JSON.stringify(
          { origin: event.origin, data: event.data },
          null,
          2,
        );
        stateEl.textContent = event.data?.type === "HYPERSCAPE_AUTH"
          ? "auth-received"
          : "message-received";
      });

      window.addEventListener("load", () => {
        const parentOrigin = (() => {
          try {
            return new URL(document.referrer).origin;
          } catch {
            return "*";
          }
        })();

        window.setTimeout(() => {
          window.parent.postMessage(
            { type: "HYPERSCAPE_READY" },
            parentOrigin,
          );
          stateEl.textContent = "ready-sent";
        }, 40);
      });
    </script>
  </body>
</html>`;
}

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return null;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function applyCorsHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  payload: unknown,
): void {
  applyCorsHeaders(req, res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function sendHtml(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  html: string,
): void {
  applyCorsHeaders(req, res);
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function sendEmpty(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
): void {
  applyCorsHeaders(req, res);
  res.statusCode = status;
  res.end();
}

async function startAppsSessionFixture(): Promise<FixtureServer> {
  const state: FixtureState = {
    launchRequestName: null,
    lastCommand: null,
    lastControlAction: null,
    sessionPollCount: 0,
    unexpectedRequests: [],
    sessionState: {
      sessionId: SESSION_ID,
      appName: "@elizaos/app-hyperscape",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "Hyperscape",
      agentId: "agent-scout-1",
      characterId: "char-scout-1",
      followEntity: "entity-scout-1",
      canSendCommands: true,
      controls: ["pause"],
      summary: "Following Scout live in Hyperscape",
      goalLabel: "Scout is roaming toward the moon gate",
      suggestedPrompts: [
        "Check the moon gate",
        "Talk to the trader",
        "Pick up the dropped relic",
      ],
      telemetry: {
        zone: "Liminal Bazaar",
        mode: "spectating",
      },
    },
  };

  const sockets = new Set<Socket>();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "OPTIONS") {
      applyCorsHeaders(req, res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === VIEWER_PATH) {
      sendHtml(req, res, 200, buildViewerHtml());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/onboarding/status") {
      sendJson(req, res, 200, { complete: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/status") {
      sendJson(req, res, 200, {
        required: false,
        pairingEnabled: false,
        expiresAt: null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/agent/status") {
      sendJson(req, res, 200, { onboardingComplete: true, status: "running" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(req, res, 200, {
        state: "running",
        agentName: "Chen",
        startup: { phase: "running", attempt: 0 },
        pendingRestart: false,
        pendingRestartReasons: [],
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/vincent/status") {
      sendJson(req, res, 200, {
        connected: false,
        connectedAt: null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      sendJson(req, res, 200, {
        cloud: { enabled: false },
        media: {},
        plugins: { entries: {} },
        ui: {},
        wallet: {},
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/conversations") {
      sendJson(req, res, 200, { conversations: [] });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/workbench/overview") {
      sendJson(req, res, 200, {
        tasks: [],
        triggers: [],
        todos: [],
        summary: {
          totalTasks: 0,
          completedTasks: 0,
          totalTriggers: 0,
          activeTriggers: 0,
          totalTodos: 0,
          completedTodos: 0,
        },
        tasksAvailable: false,
        triggersAvailable: false,
        todosAvailable: false,
        lifeopsAvailable: false,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/plugins") {
      sendJson(req, res, 200, { plugins: [] });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/character") {
      sendJson(req, res, 200, {
        character: {},
        agentName: "Chen",
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/wallet/addresses") {
      sendJson(req, res, 200, {
        evmAddress: null,
        solanaAddress: null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/stream/settings") {
      sendJson(req, res, 200, {
        ok: true,
        settings: {
          theme: "milady",
          avatarIndex: 0,
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/stream/settings") {
      const body = await readJsonBody(req);
      const settings =
        body &&
        typeof body === "object" &&
        body.settings &&
        typeof body.settings === "object"
          ? body.settings
          : {};
      sendJson(req, res, 200, {
        ok: true,
        settings: {
          theme: "milady",
          avatarIndex: 0,
          ...settings,
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/cloud/status") {
      sendJson(req, res, 200, {
        connected: false,
        enabled: false,
        cloudVoiceProxyAvailable: false,
        hasApiKey: false,
        reason: "runtime_not_started",
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/agent/events") {
      sendJson(req, res, 200, {
        events: [],
        latestEventId: null,
        totalBuffered: 0,
        replayed: true,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/drop/status") {
      sendJson(req, res, 200, {
        dropEnabled: false,
        publicMintOpen: false,
        whitelistMintOpen: false,
        mintedOut: false,
        currentSupply: 0,
        maxSupply: 2138,
        shinyPrice: "0.1",
        userHasMinted: false,
      });
      return;
    }

    if (req.method === "HEAD" && url.pathname === "/api/avatar/vrm") {
      sendEmpty(req, res, 404);
      return;
    }

    if (req.method === "HEAD" && url.pathname === "/api/avatar/background") {
      sendEmpty(req, res, 404);
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/coding-agents/coordinator/status"
    ) {
      sendJson(req, res, 200, {
        supervisionLevel: "autonomous",
        taskCount: 0,
        tasks: [],
        pendingConfirmations: 0,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/coding-agents") {
      sendJson(req, res, 200, []);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/apps") {
      sendJson(req, res, 200, [
        {
          name: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          description:
            "Spectate your agent live in a multiplayer world and steer it with real-time commands.",
          category: "game",
          launchType: "connect",
          launchUrl: null,
          icon: null,
          capabilities: ["combat", "skills", "inventory", "social-chat"],
          stars: 42,
          repository: "https://github.com/elizaos/app-hyperscape",
          latestVersion: "0.1.0",
          supports: { v0: false, v1: false, v2: true },
          npm: {
            package: "@elizaos/app-hyperscape",
            v0Version: null,
            v1Version: null,
            v2Version: "0.1.0",
          },
          viewer: {
            url: buildViewerUrl(req),
            postMessageAuth: true,
            sandbox:
              "allow-scripts allow-same-origin allow-popups allow-forms",
          },
          session: {
            mode: "spectate-and-steer",
            features: ["commands", "telemetry", "pause", "resume", "suggestions"],
          },
        },
      ]);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/apps/installed") {
      sendJson(req, res, 200, [
        {
          name: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          version: "0.1.0",
          installPath: "/plugins/app-hyperscape",
          installedAt: "2026-04-04T08:00:00.000Z",
          isRunning: true,
        },
      ]);
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname ===
        `/api/apps/info/${encodeURIComponent("@elizaos/app-hyperscape")}`
    ) {
      sendJson(req, res, 200, {
        name: "@elizaos/app-hyperscape",
        displayName: "Hyperscape",
        description:
          "Spectate your agent live in a multiplayer world and steer it with real-time commands.",
        category: "game",
        launchType: "connect",
        launchUrl: null,
        icon: null,
        capabilities: ["combat", "skills", "inventory", "social-chat"],
        viewer: {
          url: buildViewerUrl(req),
          postMessageAuth: true,
          sandbox:
            "allow-scripts allow-same-origin allow-popups allow-forms",
        },
        session: {
          mode: "spectate-and-steer",
          features: ["commands", "telemetry", "pause", "resume", "suggestions"],
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/apps/launch") {
      const body = await readJsonBody(req);
      state.launchRequestName =
        typeof body?.name === "string" ? body.name : null;

      sendJson(req, res, 200, {
        pluginInstalled: true,
        needsRestart: false,
        displayName: "Hyperscape",
        launchType: "connect",
        launchUrl: null,
        viewer: {
          url: buildViewerUrl(req),
          postMessageAuth: true,
          sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
          authMessage: {
            type: "HYPERSCAPE_AUTH",
            authToken: "test-auth-token",
            agentId: state.sessionState.agentId,
            characterId: state.sessionState.characterId,
            followEntity: state.sessionState.followEntity,
          },
        },
        session: state.sessionState,
      });
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === `/api/apps/hyperscape/session/${SESSION_ID}`
    ) {
      state.sessionPollCount += 1;
      sendJson(req, res, 200, state.sessionState);
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === `/api/apps/hyperscape/session/${SESSION_ID}/message`
    ) {
      const body = await readJsonBody(req);
      const content =
        typeof body?.content === "string" ? body.content.trim() : "";
      state.lastCommand = content;
      state.sessionState = {
        ...state.sessionState,
        summary: `Command: ${content}`,
        goalLabel: "Scout is adapting to the latest operator command",
        suggestedPrompts: [
          "Hold position",
          "Open inventory",
          "Report nearby players",
        ],
      };

      sendJson(req, res, 200, {
        success: true,
        message: "Command relayed to Scout",
        session: state.sessionState,
      });
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === `/api/apps/hyperscape/session/${SESSION_ID}/control`
    ) {
      const body = await readJsonBody(req);
      const action =
        typeof body?.action === "string" ? body.action.trim() : "";
      state.lastControlAction = action;
      const paused = action === "pause";
      state.sessionState = {
        ...state.sessionState,
        status: paused ? "paused" : "running",
        controls: paused ? ["resume"] : ["pause"],
        summary: paused
          ? "Session paused from Milady"
          : "Session resumed from Milady",
      };

      sendJson(req, res, 200, {
        success: true,
        message: paused ? "Paused Scout" : "Resumed Scout",
        session: state.sessionState,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/logs") {
      sendJson(req, res, 200, {
        entries: [],
        sources: [],
        tags: [],
      });
      return;
    }

    state.unexpectedRequests.push(`${req.method ?? "GET"} ${url.pathname}`);
    sendJson(req, res, 404, { error: `Unhandled ${req.method} ${url.pathname}` });
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

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
  });

  const wsServer = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit("connection", ws, req);
    });
  });

  wsServer.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "ready" }));
    ws.on("message", () => {
      // The UI authenticates the socket opportunistically. The fixture only
      // needs the connection to remain alive so startup effects stay honest.
    });
  });

  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("Fixture server did not expose an address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    state,
    close: async () => {
      for (const client of wsServer.clients) {
        client.terminate();
      }
      wsServer.close();
      for (const socket of sockets) {
        socket.destroy();
      }
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
  };
}

test("apps page launches a Hyperscape session with iframe auth and bidirectional session controls", async ({
  page,
}) => {
  const fixture = await startAppsSessionFixture();

  await page.addInitScript((apiBase) => {
    window.__MILADY_API_BASE__ = apiBase;
    window.sessionStorage.setItem("milady_api_base", apiBase);
  }, fixture.baseUrl);
  await installDefaultAppMocks(page);
  await seedAppStorage(page, {
    "milady:active-server": JSON.stringify({
      id: "remote:fixture",
      kind: "remote",
      label: "Fixture API",
      apiBase: fixture.baseUrl,
    }),
  });

  try {
    await openAppPath(
      page,
      `/apps?apiBase=${encodeURIComponent(fixture.baseUrl)}`,
    );

    await expect(page.getByTestId("apps-session-status-card")).toContainText(
      "No app session running",
    );
    await expect(
      page.getByTestId("app-card--elizaos-app-hyperscape"),
    ).toBeVisible();
    await expect(page.getByTestId("apps-detail-panel")).toContainText(
      "Spectate + steer",
    );

    await page.getByTestId("apps-detail-launch").click();

    await expect
      .poll(() => fixture.state.launchRequestName, {
        message: "launch should target the Hyperscape app package",
      })
      .toBe("@elizaos/app-hyperscape");

    const frame = page.frameLocator('[data-testid="game-view-iframe"]');
    await expect(frame.locator("#viewer-state")).toHaveText("auth-received");
    await expect(frame.locator("#auth-payload")).toContainText(
      "\"type\": \"HYPERSCAPE_AUTH\"",
    );
    await expect(frame.locator("#auth-payload")).toContainText(
      "\"followEntity\": \"entity-scout-1\"",
    );

    await expect
      .poll(() => fixture.state.sessionPollCount, {
        message: "session state should be polled after launch",
      })
      .toBeGreaterThan(0);

    await expect(page.getByTestId("game-session-status")).toContainText(
      "Following Scout live in Hyperscape",
    );
    await expect(page.getByTestId("game-session-control")).toContainText(
      "Pause",
    );

    await page.getByTestId("game-toggle-logs").click();
    await expect(page.getByTestId("game-command-input")).toBeVisible();
    await page.getByTestId("game-command-input").fill("Gather 3 moon shards");
    await page.getByTestId("game-command-send").click();

    await expect
      .poll(() => fixture.state.lastCommand, {
        message: "session message endpoint should receive the operator command",
      })
      .toBe("Gather 3 moon shards");
    await expect(page.getByTestId("game-session-status")).toContainText(
      "Command: Gather 3 moon shards",
    );

    await page.getByTestId("game-session-control").click();
    await expect
      .poll(() => fixture.state.lastControlAction, {
        message: "pause action should reach the session control endpoint",
      })
      .toBe("pause");
    await expect(page.getByTestId("game-session-control")).toContainText(
      "Resume",
    );
    await expect(page.getByTestId("game-session-status")).toContainText(
      "Session paused from Milady",
    );

    await page.getByTestId("game-session-control").click();
    await expect
      .poll(() => fixture.state.lastControlAction, {
        message: "resume action should reach the session control endpoint",
      })
      .toBe("resume");
    await expect(page.getByTestId("game-session-control")).toContainText(
      "Pause",
    );
    await expect(page.getByTestId("game-session-status")).toContainText(
      "Session resumed from Milady",
    );

    expect(fixture.state.unexpectedRequests).toEqual([]);
  } finally {
    await fixture.close();
  }
});
