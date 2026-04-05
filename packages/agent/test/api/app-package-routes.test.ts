import { afterEach, describe, expect, test, vi } from "vitest";
import { handleAppPackageRoutes } from "../../src/api/app-package-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

const HYPERSCAPE_LOCAL_PATH =
  "/Users/shawwalters/eliza-workspace/plugins/app-hyperscape";

vi.mock("../../src/services/registry-client.js", () => ({
  getPluginInfo: vi.fn(async () => ({
    name: "@elizaos/app-hyperscape",
    localPath: HYPERSCAPE_LOCAL_PATH,
  })),
}));

function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("handleAppPackageRoutes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("loads local app package routes and returns generic session state", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/embedded-agents")) {
        return createJsonResponse({
          success: true,
          agents: [
            {
              agentId: "agent-1",
              characterId: "char-1",
              name: "Scout",
              state: "running",
              entityId: "char-1",
            },
          ],
        });
      }
      if (url.includes("/api/agents/agent-1/goal")) {
        return createJsonResponse({
          success: true,
          goal: { description: "Chop nearby tree" },
          goalsPaused: false,
          availableGoals: [],
        });
      }
      if (url.includes("/api/agents/agent-1/quick-actions")) {
        return createJsonResponse({
          success: true,
          quickCommands: [
            {
              label: "Woodcutting",
              command: "chop nearest tree",
              available: true,
            },
          ],
          nearbyLocations: [],
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/hyperscape/session/agent-1",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/hyperscape/session/agent-1",
      url: new URL("http://localhost:2138/api/apps/hyperscape/session/agent-1"),
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
        sessionId: "agent-1",
        appName: "@elizaos/app-hyperscape",
        mode: "spectate-and-steer",
        status: "running",
        goalLabel: "Chop nearby tree",
        suggestedPrompts: ["chop nearest tree"],
      }),
    );
  });

  test("routes generic session control actions through the app package", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/embedded-agents") && (!init?.method || init.method === "GET")) {
        return createJsonResponse({
          success: true,
          agents: [
            {
              agentId: "agent-1",
              characterId: "char-1",
              name: "Scout",
              state: "running",
              entityId: "char-1",
            },
          ],
        });
      }
      if (
        url.includes("/api/embedded-agents/char-1/pause") &&
        init?.method === "POST"
      ) {
        return createJsonResponse({
          success: true,
          message: "Goals paused",
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/hyperscape/session/agent-1/control",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/hyperscape/session/agent-1/control",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/agent-1/control",
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
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: "Goals paused",
        session: expect.objectContaining({
          sessionId: "agent-1",
          status: "paused",
          controls: ["resume"],
        }),
      }),
    );
  });
});
