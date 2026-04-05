import { expect, test } from "@playwright/test";
import {
  installDefaultAppMocks,
  openAppPath,
  seedAppStorage,
} from "./helpers";

const HYPERSCAPE_VIEWER_PATH = "/mock-hyperscape-viewer";
const SESSION_ID = "session-123";

function buildViewerHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mock Hyperscape Viewer</title>
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
      <div class="label">Mock Hyperscape Viewer</div>
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
        window.setTimeout(() => {
          window.parent.postMessage(
            { type: "HYPERSCAPE_READY" },
            window.location.origin,
          );
          stateEl.textContent = "ready-sent";
        }, 40);
      });
    </script>
  </body>
</html>`;
}

test("apps page launches a Hyperscape session with iframe auth and bidirectional session controls", async ({
  page,
  baseURL,
}) => {
  const viewerUrl = new URL(HYPERSCAPE_VIEWER_PATH, baseURL).toString();
  let sessionPollCount = 0;
  let lastCommand: string | null = null;
  let lastControlAction: string | null = null;

  let sessionState = {
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
  };

  await installDefaultAppMocks(page);
  await seedAppStorage(page);

  await page.route("**/api/apps", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          description:
            "Spectate your agent live in a multiplayer world and steer it with real-time commands.",
          category: "game",
          launchType: "connect",
          launchUrl: "http://127.0.0.1:3333",
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
            url: "http://127.0.0.1:3333",
            postMessageAuth: true,
            sandbox:
              "allow-scripts allow-same-origin allow-popups allow-forms",
          },
          session: {
            mode: "spectate-and-steer",
            features: ["commands", "telemetry", "pause", "resume", "suggestions"],
          },
        },
      ]),
    });
  });

  await page.route("**/api/apps/installed", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          version: "0.1.0",
          installPath: "/plugins/app-hyperscape",
          installedAt: "2026-04-04T08:00:00.000Z",
          isRunning: true,
        },
      ]),
    });
  });

  await page.route("**/api/apps/launch", async (route) => {
    const requestBody = route.request().postDataJSON();
    expect(requestBody).toEqual({ name: "@elizaos/app-hyperscape" });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pluginInstalled: true,
        needsRestart: false,
        displayName: "Hyperscape",
        launchType: "connect",
        launchUrl: "http://127.0.0.1:3333",
        viewer: {
          url: viewerUrl,
          postMessageAuth: true,
          sandbox:
            "allow-scripts allow-same-origin allow-popups allow-forms",
          authMessage: {
            type: "HYPERSCAPE_AUTH",
            authToken: "test-auth-token",
            agentId: sessionState.agentId,
            characterId: sessionState.characterId,
            followEntity: sessionState.followEntity,
          },
        },
        session: sessionState,
      }),
    });
  });

  await page.route(`**/api/apps/hyperscape/session/${SESSION_ID}`, async (route) => {
    sessionPollCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessionState),
    });
  });

  await page.route(
    `**/api/apps/hyperscape/session/${SESSION_ID}/message`,
    async (route) => {
      const requestBody = route.request().postDataJSON() as { content: string };
      lastCommand = requestBody.content;
      sessionState = {
        ...sessionState,
        summary: `Command: ${requestBody.content}`,
        goalLabel: "Scout is adapting to the latest operator command",
        suggestedPrompts: ["Hold position", "Open inventory", "Report nearby players"],
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Command relayed to Scout",
          session: sessionState,
        }),
      });
    },
  );

  await page.route(
    `**/api/apps/hyperscape/session/${SESSION_ID}/control`,
    async (route) => {
      const requestBody = route.request().postDataJSON() as { action: string };
      lastControlAction = requestBody.action;
      const paused = requestBody.action === "pause";
      sessionState = {
        ...sessionState,
        status: paused ? "paused" : "running",
        controls: paused ? ["resume"] : ["pause"],
        summary: paused
          ? "Session paused from Milady"
          : "Session resumed from Milady",
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: paused ? "Paused Scout" : "Resumed Scout",
          session: sessionState,
        }),
      });
    },
  );

  await page.route("**/api/logs**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [],
        sources: [],
        tags: [],
      }),
    });
  });

  await page.route(`**${HYPERSCAPE_VIEWER_PATH}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: buildViewerHtml(),
    });
  });

  await openAppPath(page, "/apps");

  await expect(page.getByTestId("apps-session-status-card")).toContainText(
    "No app session running",
  );
  await expect(page.getByTestId("app-card--elizaos-app-hyperscape")).toBeVisible();
  await expect(page.getByTestId("apps-detail-panel")).toContainText(
    "Spectate + steer",
  );

  await page.getByTestId("apps-detail-launch").click();

  const frame = page.frameLocator('[data-testid="game-view-iframe"]');
  await expect(frame.locator("#viewer-state")).toHaveText("auth-received");
  await expect(frame.locator("#auth-payload")).toContainText(
    "\"type\": \"HYPERSCAPE_AUTH\"",
  );
  await expect(frame.locator("#auth-payload")).toContainText(
    "\"followEntity\": \"entity-scout-1\"",
  );

  await expect
    .poll(() => sessionPollCount, {
      message: "session state should be polled after launch",
    })
    .toBeGreaterThan(0);

  await expect(page.getByTestId("game-session-status")).toContainText(
    "Following Scout live in Hyperscape",
  );
  await expect(page.getByTestId("game-session-control")).toContainText("Pause");

  await page.getByTestId("game-toggle-logs").click();
  await expect(page.getByTestId("game-command-input")).toBeVisible();
  await page.getByTestId("game-command-input").fill("Gather 3 moon shards");
  await page.getByTestId("game-command-send").click();

  await expect
    .poll(() => lastCommand, {
      message: "session message endpoint should receive the operator command",
    })
    .toBe("Gather 3 moon shards");
  await expect(page.getByTestId("game-session-status")).toContainText(
    "Command: Gather 3 moon shards",
  );

  await page.getByTestId("game-session-control").click();
  await expect
    .poll(() => lastControlAction, {
      message: "pause action should reach the session control endpoint",
    })
    .toBe("pause");
  await expect(page.getByTestId("game-session-control")).toContainText("Resume");
  await expect(page.getByTestId("game-session-status")).toContainText(
    "Session paused from Milady",
  );

  await page.getByTestId("game-session-control").click();
  await expect
    .poll(() => lastControlAction, {
      message: "resume action should reach the session control endpoint",
    })
    .toBe("resume");
  await expect(page.getByTestId("game-session-control")).toContainText("Pause");
  await expect(page.getByTestId("game-session-status")).toContainText(
    "Session resumed from Milady",
  );
});
