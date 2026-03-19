/** @vitest-environment jsdom */
import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClientTarget, mockClient } = vi.hoisted(() => {
  const target: Record<string, any> = {};
  const client = new Proxy(target, {
    get(innerTarget, prop) {
      if (!(prop in innerTarget)) {
        innerTarget[prop as string] = vi.fn(async () => ({}));
      }
      return innerTarget[prop as string];
    },
  });
  return { mockClientTarget: target, mockClient: client as any };
});

vi.mock("../../src/api-client", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

import {
  AppProvider,
  type GoLiveConfig,
  type GoLiveLaunchResult,
  useApp,
} from "../../src/AppContext";

type ProbeApi = {
  launchGoLive: (config: GoLiveConfig) => Promise<GoLiveLaunchResult>;
  loadPlugins: () => Promise<void>;
};

type ParamInput = {
  key: string;
  currentValue?: string | null;
  default?: string | null;
  isSet?: boolean;
  sensitive?: boolean;
};

function Probe(props: { onReady: (api: ProbeApi) => void }) {
  const { onReady } = props;
  const app = useApp();

  useEffect(() => {
    onReady({
      launchGoLive: app.launchGoLive,
      loadPlugins: app.loadPlugins,
    });
  }, [app, onReady]);

  return null;
}

function makeParam(param: ParamInput) {
  return {
    key: param.key,
    type: "string" as const,
    required: false,
    sensitive: false,
    currentValue: null,
    default: null,
    isSet: false,
    ...param,
  };
}

function makeStreamPlugin(params: ParamInput[]) {
  return {
    id: "stream555-control",
    name: "stream555-control",
    enabled: true,
    isActive: true,
    installed: true,
    ready: true,
    authenticated: true,
    configured: true,
    category: "feature" as const,
    source: "bundled" as const,
    parameters: params.map((param) => makeParam(param)),
    validationErrors: [],
    validationWarnings: [],
    statusSummary: [],
    operationalCounts: {},
  };
}

function makeLegacyStreamPlugin() {
  return {
    id: "stream",
    name: "stream",
    enabled: true,
    isActive: true,
    installed: true,
    ready: true,
    authenticated: true,
    configured: true,
    category: "feature" as const,
    source: "bundled" as const,
    parameters: [],
    validationErrors: [],
    validationWarnings: [],
    statusSummary: [],
    operationalCounts: {},
  };
}

function makeConversationMessage(id: string) {
  return {
    id,
    role: "assistant" as const,
    text: "operator action",
    timestamp: Date.now(),
    blocks: [
      {
        type: "action-pill" as const,
        label: "Launch",
        kind: "launch" as const,
      },
    ],
  };
}

function planStep(
  action: string,
  ok: boolean,
  message: string,
  data?: Record<string, unknown>,
) {
  return {
    result: {
      text: JSON.stringify({
        ok,
        action,
        message,
        ...(data ? { data } : {}),
      }),
    },
  };
}

function planResponse(...steps: Array<ReturnType<typeof planStep>>) {
  return {
    allSucceeded: steps.every(
      (step) => JSON.parse(step.result.text as string).ok === true,
    ),
    results: steps,
  };
}

function readyTwitchParams() {
  return [
    {
      key: "STREAM555_DEST_TWITCH_ENABLED",
      currentValue: "true",
      isSet: true,
    },
    {
      key: "STREAM555_DEST_TWITCH_RTMP_URL",
      currentValue: "rtmps://ingest.global-contribute.live-video.net/app",
      default: "rtmps://ingest.global-contribute.live-video.net/app",
      isSet: false,
    },
    {
      key: "STREAM555_DEST_TWITCH_STREAM_KEY",
      currentValue: "••••1234",
      isSet: true,
      sensitive: true,
    },
  ];
}

async function renderApp(plugins: any[]) {
  mockClient.getPlugins.mockResolvedValue({ plugins });

  let api: ProbeApi | null = null;
  let tree!: TestRenderer.ReactTestRenderer;

  await act(async () => {
    tree = TestRenderer.create(
      React.createElement(
        AppProvider,
        null,
        React.createElement(Probe, {
          onReady: (nextApi) => {
            api = nextApi;
          },
        }),
      ),
    );
  });

  await vi.waitFor(() => {
    expect(api).not.toBeNull();
  });
  await act(async () => {
    await api?.loadPlugins();
    await Promise.resolve();
  });

  return { api: api!, tree };
}

describe("AppContext go-live launch contract", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/chat");
    Object.assign(window, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    Object.assign(document.documentElement, { setAttribute: vi.fn() });

    for (const fn of Object.values(mockClientTarget)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    }

    mockClient.hasToken.mockReturnValue(false);
    mockClient.getAuthStatus.mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: true });
    mockClient.listConversations.mockResolvedValue({
      conversations: [
        {
          id: "conv-1",
          title: "Chat",
          roomId: "room-1",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    mockClient.createConversation.mockResolvedValue({
      conversation: {
        id: "conv-created",
        title: "Chat",
        roomId: "room-created",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    });
    mockClient.getConversationMessages.mockResolvedValue({ messages: [] });
    mockClient.sendConversationMessage.mockResolvedValue({
      text: "ok",
      agentName: "Milady",
    });
    mockClient.sendConversationMessageStream.mockResolvedValue({
      text: "ok",
      agentName: "Milady",
    });
    mockClient.logConversationOperatorAction.mockResolvedValue({
      message: makeConversationMessage("launch-msg"),
    });
    mockClient.sendWsMessage.mockImplementation(() => {});
    mockClient.connectWs.mockImplementation(() => {});
    mockClient.disconnectWs.mockImplementation(() => {});
    mockClient.onWsEvent.mockReturnValue(() => {});
    mockClient.getAgentEvents.mockResolvedValue({
      events: [],
      latestEventId: null,
    });
    mockClient.getStatus.mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    mockClient.getWalletAddresses.mockResolvedValue(null);
    mockClient.getConfig.mockResolvedValue({});
    mockClient.getCloudStatus.mockResolvedValue({
      enabled: false,
      connected: false,
    });
    mockClient.getWorkbenchOverview.mockResolvedValue({
      tasks: [],
      triggers: [],
      todos: [],
    });
    mockClient.getSkills.mockResolvedValue({ skills: [] });
    mockClient.refreshSkills.mockResolvedValue({ skills: [] });
    mockClient.getLogs.mockResolvedValue({ entries: [], sources: [], tags: [] });
    mockClient.listFive55MasteryRuns.mockResolvedValue({ runs: [] });
    mockClient.getFive55GamesCatalog.mockResolvedValue({
      games: [{ id: "game-1", title: "555 Racer" }],
    });
    mockClient.playFive55Game.mockResolvedValue({
      game: { id: "game-1", title: "555 Racer" },
      viewer: {
        url: "https://games.example/viewer",
        sandbox: "allow-scripts",
        postMessageAuth: false,
      },
    });
    mockClient.executeAutonomyPlan.mockResolvedValue(planResponse());
  });

  it("returns blocked when a selected channel is no longer ready", async () => {
    const plugins = [
      makeStreamPlugin([
        {
          key: "STREAM555_DEST_X_ENABLED",
          currentValue: "true",
          isSet: true,
        },
        {
          key: "STREAM555_DEST_X_RTMP_URL",
          currentValue: "rtmps://or.pscp.tv:443/x",
          default: "rtmps://or.pscp.tv:443/x",
          isSet: false,
        },
      ]),
    ];
    const { api, tree } = await renderApp(plugins);

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["x"],
        launchMode: "camera",
        layoutMode: "camera-full",
      });
    });

    expect(result).toMatchObject({
      state: "blocked",
      tone: "warning",
    });
    expect(result.message).toContain("X (missing stream key)");
    expect(mockClient.executeAutonomyPlan).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it("returns failed when camera launch cannot start and no legacy fallback is available", async () => {
    const { api, tree } = await renderApp([
      {
        ...makeStreamPlugin(readyTwitchParams()),
        name: "555-control",
      },
    ]);
    mockClient.executeAutonomyPlan.mockImplementation(async (input: any) => {
      if (input?.plan?.id === "go-live-modal-camera") {
        return planResponse(
          planStep("STREAM555_GO_LIVE", false, "upstream broadcaster refused start"),
        );
      }
      return planResponse();
    });

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "camera",
        layoutMode: "camera-full",
      });
    });

    expect(result).toMatchObject({
      state: "failed",
      tone: "error",
    });
    expect(result.message).toContain("upstream broadcaster refused start");

    await act(async () => {
      tree.unmount();
    });
  });

  it("returns success for camera with a single modern go-live step", async () => {
    const { api, tree } = await renderApp([makeStreamPlugin(readyTwitchParams())]);
    mockClient.executeAutonomyPlan.mockResolvedValueOnce(
      planResponse(
        planStep("STREAM555_GO_LIVE", true, "go live connected", {
          sessionId: "session-camera-1",
        }),
      ),
    );
    mockClient.executeAutonomyPlan.mockResolvedValueOnce(
      planResponse(
        planStep("STREAM555_STREAM_STATUS", true, "delivery confirmed", {
          sessionId: "session-camera-1",
          phase: "live",
          cloudflare: { isConnected: true },
          platforms: {
            twitch: {
              enabled: true,
              status: "live",
              outputStatus: "active",
              deliveryState: "active",
            },
          },
        }),
      ),
    );

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "camera",
        layoutMode: "camera-full",
      });
    });

    expect(result).toMatchObject({
      state: "success",
      tone: "success",
      message: "Camera is live and delivering.",
    });
    expect(mockClient.executeAutonomyPlan).toHaveBeenCalledTimes(2);
    expect(mockClient.executeAutonomyPlan.mock.calls[0]?.[0]?.plan?.steps).toHaveLength(1);
    expect(mockClient.executeAutonomyPlan.mock.calls[0]?.[0]?.plan?.steps?.[0]).toMatchObject({
      toolName: "STREAM555_GO_LIVE",
      params: {
        inputType: "avatar",
        layoutMode: "camera-full",
        destinationPlatforms: "twitch",
      },
    });
    expect(mockClient.executeAutonomyPlan.mock.calls[1]?.[0]?.plan?.steps?.[0]).toMatchObject({
      toolName: "STREAM555_STREAM_STATUS",
      params: {
        sessionId: "session-camera-1",
      },
    });

    await act(async () => {
      tree.unmount();
    });
  });

  it("fails camera launch when delivery never reaches active outputs", async () => {
    vi.useFakeTimers();
    const { api, tree } = await renderApp([makeStreamPlugin(readyTwitchParams())]);
    mockClient.executeAutonomyPlan.mockResolvedValueOnce(
      planResponse(
        planStep("STREAM555_GO_LIVE", true, "go live connected", {
          sessionId: "session-camera-2",
        }),
      ),
    );
    mockClient.executeAutonomyPlan.mockResolvedValue(
      planResponse(
        planStep("STREAM555_STREAM_STATUS", true, "outputs pending", {
          sessionId: "session-camera-2",
          phase: "outputs_pending",
          cloudflare: { isConnected: true },
          blockedPlatforms: ["twitch"],
          platforms: {
            twitch: {
              enabled: true,
              status: "connecting",
              outputStatus: "pending",
              deliveryState: "pending",
            },
          },
        }),
      ),
    );

    const resultPromise = api.launchGoLive({
        channels: ["twitch"],
        launchMode: "camera",
        layoutMode: "camera-full",
      });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });
    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await resultPromise;
    });

    expect(result).toMatchObject({
      state: "failed",
      tone: "error",
    });
    expect(result.message).toContain("outputs still blocked");

    await act(async () => {
      tree.unmount();
    });
    vi.useRealTimers();
  });

  it("returns success for lo-fi radio when both steps succeed", async () => {
    const { api, tree } = await renderApp([makeStreamPlugin(readyTwitchParams())]);
    mockClient.executeAutonomyPlan.mockResolvedValueOnce(
      planResponse(
        planStep("STREAM555_GO_LIVE", true, "go live"),
        planStep("STREAM555_RADIO_CONTROL", true, "radio mode set"),
      ),
    );

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "radio",
        layoutMode: "camera-full",
      });
    });

    expect(result).toMatchObject({
      state: "success",
      tone: "success",
      message: "Lo-fi radio is live.",
    });

    await act(async () => {
      tree.unmount();
    });
  });

  it("returns partial for screen share when destination attach fails", async () => {
    const { api, tree } = await renderApp([makeStreamPlugin(readyTwitchParams())]);
    mockClient.executeAutonomyPlan.mockResolvedValueOnce(
      planResponse(
        planStep("STREAM555_SCREEN_SHARE", true, "screen share requested"),
        planStep(
          "STREAM555_DESTINATIONS_APPLY",
          false,
          "destination sync failed",
        ),
      ),
    );

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "screen-share",
        layoutMode: "camera-hold",
      });
    });

    expect(result.state).toBe("partial");
    expect(result.followUp?.label).toBe("Attach selected destinations");
    expect(result.message).toContain("destination attach failed");

    await act(async () => {
      tree.unmount();
    });
  });

  it("returns blocked for reaction when segment mode is unavailable and cancels the live start", async () => {
    const { api, tree } = await renderApp([makeStreamPlugin(readyTwitchParams())]);
    mockClient.executeAutonomyPlan
      .mockResolvedValueOnce(
        planResponse(
          planStep("STREAM555_GO_LIVE", true, "reaction live"),
          planStep(
            "STREAM555_GO_LIVE_SEGMENTS",
            false,
            "Segment mode is disabled",
          ),
          planStep(
            "STREAM555_SEGMENT_OVERRIDE",
            false,
            "override skipped",
          ),
        ),
      )
      .mockResolvedValueOnce(
        planResponse(
          planStep("STREAM555_END_LIVE", true, "live cancelled"),
        ),
      );

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "reaction",
        layoutMode: "camera-full",
      });
    });

    expect(result).toMatchObject({
      state: "blocked",
      tone: "error",
    });
    expect(result.message).toContain("requires segment orchestration");
    expect(result.message).toContain("Segment mode is disabled");
    expect(result.message).toContain("Live start was cancelled");
    expect(mockClient.executeAutonomyPlan).toHaveBeenCalledTimes(2);
    expect(
      mockClient.executeAutonomyPlan.mock.calls[0]?.[0]?.plan?.steps?.[0],
    ).toMatchObject({
      toolName: "STREAM555_GO_LIVE",
      params: {
        inputType: "avatar",
        layoutMode: "camera-full",
        destinationPlatforms: "twitch",
      },
    });
    expect(
      mockClient.executeAutonomyPlan.mock.calls[1]?.[0]?.plan?.steps?.[0],
    ).toMatchObject({
      toolName: "STREAM555_END_LIVE",
    });

    await act(async () => {
      tree.unmount();
    });
  });

  it("returns success for play-games when the canonical go-live action succeeds", async () => {
    const { api, tree } = await renderApp([makeStreamPlugin(readyTwitchParams())]);
    mockClient.executeAutonomyPlan.mockResolvedValueOnce(
      planResponse(
        planStep("ARCADE555_GAMES_GO_LIVE_PLAY", true, "game launched", {
          game: { id: "game-1", title: "555 Racer" },
          viewer: {
            url: "https://games.example/viewer",
            sandbox: "allow-scripts",
            postMessageAuth: false,
          },
        }),
      ),
    );

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "play-games",
        layoutMode: "camera-hold",
      });
    });

    expect(result.state).toBe("success");
    expect(result.message).toContain("555 Racer");
    expect(mockClient.executeAutonomyPlan).toHaveBeenCalledTimes(1);
    expect(
      mockClient.executeAutonomyPlan.mock.calls[0]?.[0]?.plan?.steps?.[0]?.toolName,
    ).toBe("ARCADE555_GAMES_GO_LIVE_PLAY");

    await act(async () => {
      tree.unmount();
    });
  });

  it("falls back to the legacy combined action when canonical play-games go-live is unavailable", async () => {
    const { api, tree } = await renderApp([makeStreamPlugin(readyTwitchParams())]);
    mockClient.executeAutonomyPlan
      .mockResolvedValueOnce(
        planResponse(
          planStep(
            "ARCADE555_GAMES_GO_LIVE_PLAY",
            false,
            'Action "ARCADE555_GAMES_GO_LIVE_PLAY" not registered',
          ),
        ),
      )
      .mockResolvedValueOnce(
        planResponse(
          planStep("FIVE55_GAMES_GO_LIVE_PLAY", true, "game launched", {
            game: { id: "game-1", title: "555 Racer" },
            viewer: {
              url: "https://games.example/viewer",
              sandbox: "allow-scripts",
              postMessageAuth: false,
            },
          }),
        ),
      );

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "play-games",
        layoutMode: "camera-hold",
      });
    });

    expect(result.state).toBe("success");
    expect(result.message).toContain("555 Racer");
    expect(mockClient.executeAutonomyPlan).toHaveBeenCalledTimes(2);
    expect(
      mockClient.executeAutonomyPlan.mock.calls[0]?.[0]?.plan?.steps?.[0]?.toolName,
    ).toBe("ARCADE555_GAMES_GO_LIVE_PLAY");
    expect(
      mockClient.executeAutonomyPlan.mock.calls[1]?.[0]?.plan?.steps?.[0]?.toolName,
    ).toBe("FIVE55_GAMES_GO_LIVE_PLAY");

    await act(async () => {
      tree.unmount();
    });
  });

  it("returns failed for play-games when the combined go-live action fails", async () => {
    const { api, tree } = await renderApp([makeStreamPlugin(readyTwitchParams())]);
    mockClient.executeAutonomyPlan.mockResolvedValueOnce(
      planResponse(
        planStep(
          "ARCADE555_GAMES_GO_LIVE_PLAY",
          false,
          "Cloudflare ingest stayed disconnected",
        ),
      ),
    );

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "play-games",
        layoutMode: "camera-hold",
      });
    });

    expect(result.state).toBe("failed");
    expect(result.message).toContain("Cloudflare ingest stayed disconnected");

    await act(async () => {
      tree.unmount();
    });
  });

  it("does not run legacy fallback for camera when stream555 go-live fails", async () => {
    const { api, tree } = await renderApp([
      makeStreamPlugin(readyTwitchParams()),
      makeLegacyStreamPlugin(),
    ]);
    mockClient.executeAutonomyPlan.mockResolvedValueOnce(
      planResponse(
        planStep("STREAM555_GO_LIVE", false, "stream555 primary failed"),
      ),
    );

    let result!: GoLiveLaunchResult;
    await act(async () => {
      result = await api.launchGoLive({
        channels: ["twitch"],
        launchMode: "camera",
        layoutMode: "camera-full",
      });
    });

    expect(result).toMatchObject({
      state: "failed",
      tone: "error",
    });
    expect(result.message).toContain("stream555 primary failed");
    expect(mockClient.executeAutonomyPlan).toHaveBeenCalledTimes(1);
    expect(mockClient.executeAutonomyPlan.mock.calls[0]?.[0]?.plan?.id).toBe(
      "go-live-modal-camera",
    );
    expect(
      mockClient.executeAutonomyPlan.mock.calls[0]?.[0]?.plan?.steps?.map(
        (step: { toolName: string }) => step.toolName,
      ),
    ).toEqual(["STREAM555_GO_LIVE"]);

    await act(async () => {
      tree.unmount();
    });
  });
});
