import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loggerDebugMock, loggerWarnMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: {
      ...actual.logger,
      debug: loggerDebugMock,
      warn: loggerWarnMock,
    },
  };
});

import { refreshRunSession, resolveLaunchSession } from "./hyperscape";

function createRuntime(
  settings: Record<string, string | undefined> = {},
  agentId = "runtime-agent-id",
): IAgentRuntime {
  return {
    agentId,
    getSetting: vi.fn((key: string) => settings[key] ?? null),
  } as unknown as IAgentRuntime;
}

function createJsonResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn(async () => payload),
  } as unknown as Response;
}

describe("hyperscape built-in route module", () => {
  const originalApiUrl = process.env.HYPERSCAPE_API_URL;
  const originalClientUrl = process.env.HYPERSCAPE_CLIENT_URL;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    loggerDebugMock.mockReset();
    loggerWarnMock.mockReset();
    delete process.env.HYPERSCAPE_API_URL;
    delete process.env.HYPERSCAPE_CLIENT_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiUrl !== undefined) {
      process.env.HYPERSCAPE_API_URL = originalApiUrl;
    } else {
      delete process.env.HYPERSCAPE_API_URL;
    }
    if (originalClientUrl !== undefined) {
      process.env.HYPERSCAPE_CLIENT_URL = originalClientUrl;
    } else {
      delete process.env.HYPERSCAPE_CLIENT_URL;
    }
  });

  it("resolves a running launch session from the client-url fallback and viewer auth payload", async () => {
    process.env.HYPERSCAPE_CLIENT_URL = "https://hyperscape.example/";
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          agents: [
            {
              agentId: "viewer-agent-id",
              state: "running",
              startedAt: 1_710_000_000_000,
              lastActivity: 1_710_000_001_000,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          goal: { description: "Hold the ridge" },
          goalsPaused: false,
          availableGoals: [
            { type: "combat", description: "Hold position" },
            { type: "scout", description: "Scout the ruins" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          quickCommands: [
            { command: "/scan", available: true },
            { command: "/ignore", available: false },
          ],
          nearbyLocations: [{ name: "Ruins" }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          thoughts: [
            {
              id: "thought-1",
              type: "observation",
              content: "Enemy spotted",
              timestamp: 1_710_000_002_000,
            },
          ],
        }),
      );

    const session = await resolveLaunchSession({
      appName: "@hyperscape/plugin-hyperscape",
      launchUrl: "https://hyperscape.example/viewer",
      runtime: createRuntime({}, "runtime-agent-id"),
      viewer: {
        authMessage: {
          agentId: "viewer-agent-id",
          characterId: "char-42",
        },
      },
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://hyperscape.example/api/embedded-agents",
      "https://hyperscape.example/api/agents/viewer-agent-id/goal",
      "https://hyperscape.example/api/agents/viewer-agent-id/quick-actions",
      "https://hyperscape.example/api/agents/viewer-agent-id/thoughts?limit=5",
    ]);
    expect(session).toEqual(
      expect.objectContaining({
      sessionId: "viewer-agent-id",
      appName: "@hyperscape/plugin-hyperscape",
      mode: "spectate-and-steer",
      status: "running",
      agentId: "viewer-agent-id",
      characterId: "char-42",
      followEntity: "char-42",
      canSendCommands: true,
      controls: ["pause"],
      goalLabel: "Hold the ridge",
      suggestedPrompts: ["/scan"],
      }),
    );
    expect(session?.telemetry).toEqual(
      expect.objectContaining({
        goalsPaused: false,
        availableGoalCount: 2,
        nearbyLocationCount: 1,
        startedAt: 1_710_000_000_000,
        lastActivity: 1_710_000_001_000,
        recommendedGoals: [
          {
            id: "goal-0",
            type: "combat",
            description: "Hold position",
          },
          {
            id: "goal-1",
            type: "scout",
            description: "Scout the ruins",
          },
        ],
        recentThoughts: [
          {
            id: "thought-1",
            type: "observation",
            content: "Enemy spotted",
            timestamp: 1_710_000_002_000,
          },
        ],
      }),
    );
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("refreshes a disconnected session from the stored session identity", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          agents: [{ agentId: "agent/with space", state: "paused" }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          goal: null,
          goalsPaused: true,
          availableGoals: [],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          quickCommands: [{ command: "/resume", available: false }],
          nearbyLocations: [],
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ thoughts: [] }));

    const session = await refreshRunSession({
      appName: "@hyperscape/plugin-hyperscape",
      launchUrl: null,
      runtime: createRuntime({
        HYPERSCAPE_API_URL: "https://api.hyperscape.example",
      }),
      viewer: null,
      runId: "run-1",
      session: {
        sessionId: "session-1",
        appName: "@hyperscape/plugin-hyperscape",
        mode: "spectate-and-steer",
        status: "running",
        agentId: "agent/with space",
        characterId: "char-session",
        canSendCommands: true,
        controls: ["pause"],
      },
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.hyperscape.example/api/agents/agent%2Fwith%20space/goal",
    );
    expect(session).toMatchObject({
      sessionId: "agent/with space",
      status: "connecting",
      controls: ["resume"],
      summary: "Connecting session...",
      characterId: "char-session",
      followEntity: "char-session",
      telemetry: expect.objectContaining({
        goalsPaused: true,
        availableGoalCount: 0,
        nearbyLocationCount: 0,
      }),
    });
  });

  it("skips launch session resolution when no agent id is available", async () => {
    process.env.HYPERSCAPE_CLIENT_URL = "https://hyperscape.example";

    const session = await resolveLaunchSession({
      appName: "@hyperscape/plugin-hyperscape",
      launchUrl: null,
      runtime: createRuntime({}, ""),
      viewer: null,
    });

    expect(session).toBeNull();
    expect(loggerDebugMock).toHaveBeenCalledWith(
      "[hyperscape] No agentId available; skipping live session resolution",
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
