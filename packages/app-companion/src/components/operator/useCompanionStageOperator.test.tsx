// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockStreamStatus,
  mockGetStreamingDestinations,
  mockExecuteAliceOperatorPlan,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockStreamStatus: vi.fn(),
  mockGetStreamingDestinations: vi.fn(),
  mockExecuteAliceOperatorPlan: vi.fn(),
}));

vi.mock("@elizaos/ui", () => ({
  STOP_EMOTE_EVENT: "eliza:stop-emote",
  client: {
    streamStatus: (...args: unknown[]) => mockStreamStatus(...args),
    getStreamingDestinations: (...args: unknown[]) =>
      mockGetStreamingDestinations(...args),
    executeAliceOperatorPlan: (...args: unknown[]) =>
      mockExecuteAliceOperatorPlan(...args),
    getArcade555GamesCatalog: vi.fn(async () => ({ games: [] })),
    getArcade555GameState: vi.fn(async () => ({
      sessionId: null,
      activeGameId: null,
      activeGameLabel: null,
      mode: null,
      phase: null,
      live: false,
      destination: null,
    })),
    listHyperscapeEmbeddedAgents: vi.fn(async () => ({ agents: [] })),
    getEmotes: vi.fn(async () => ({ emotes: [] })),
    playEmote: vi.fn(async () => ({ ok: true })),
  },
  dispatchAppEmoteEvent: vi.fn(),
  dispatchAppEvent: vi.fn(),
  isApiError: (err: unknown) =>
    Boolean(err && typeof err === "object" && "status" in (err as object)),
  useApp: () => mockUseApp(),
  useDocumentVisibility: () => true,
}));

import { useCompanionStageOperator } from "./useCompanionStageOperator";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    plugins: [],
    selectedVrmIndex: 9,
    logConversationOperatorAction: vi.fn(async () => true),
    setActionNotice: vi.fn(),
    setTab: vi.fn(),
    switchShellView: vi.fn(),
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.defaultValue === "string" ? options.defaultValue : key,
    ...overrides,
  };
}

function Harness({
  onOperator,
}: {
  onOperator?: (operator: ReturnType<typeof useCompanionStageOperator>) => void;
}) {
  const operator = useCompanionStageOperator();
  React.useEffect(() => {
    onOperator?.(operator);
  }, [onOperator, operator]);
  return (
    <div
      data-testid="operator-stream"
      data-live={String(operator.stream.live)}
      data-available={String(operator.stream.available)}
      data-destination={operator.stream.activeDestination?.name ?? ""}
    />
  );
}

describe("useCompanionStageOperator stream health", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockStreamStatus.mockReset();
    mockGetStreamingDestinations.mockReset();
    mockExecuteAliceOperatorPlan.mockReset();
    mockUseApp.mockReturnValue(createContext());
    mockGetStreamingDestinations.mockResolvedValue({
      destinations: [{ id: "twitch", name: "Twitch" }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not mark the stream live until delivery health is ready", async () => {
    mockStreamStatus.mockResolvedValue({
      running: true,
      ffmpegAlive: false,
      uptime: 12,
      frameCount: 48,
      destination: { id: "twitch", name: "Twitch" },
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = tree?.root.findByProps({ "data-testid": "operator-stream" });
    expect(status?.props["data-available"]).toBe("true");
    expect(status?.props["data-live"]).toBe("false");
    expect(status?.props["data-destination"]).toBe("Twitch");
  });

  it("returns partial when camera launch starts but delivery is still warming", async () => {
    const operatorRef: {
      current: ReturnType<typeof useCompanionStageOperator> | null;
    } = { current: null };
    mockUseApp.mockReturnValue(
      createContext({
        plugins: [{ id: "@rndrntwrk/plugin-555stream", enabled: true }],
      }),
    );
    mockStreamStatus.mockResolvedValue({
      ok: true,
      running: true,
      ffmpegAlive: false,
      uptime: 12,
      frameCount: 48,
      volume: 80,
      muted: false,
      audioSource: "555stream",
      inputMode: "screen",
      destination: { id: "twitch", name: "Twitch" },
    });
    mockExecuteAliceOperatorPlan.mockResolvedValue({
      results: [
        {
          action: "STREAM555_GO_LIVE",
          success: true,
          message: "Launch accepted.",
        },
      ],
    });

    await act(async () => {
      TestRenderer.create(
        <Harness
          onOperator={(operator) => {
            operatorRef.current = operator;
          }}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    mockStreamStatus.mockClear();

    let result:
      | Awaited<
          ReturnType<
            ReturnType<typeof useCompanionStageOperator>["performGuidedGoLive"]
          >
        >
      | undefined;
    await act(async () => {
      result = await operatorRef.current?.performGuidedGoLive({
        channels: ["twitch"],
        launchMode: "camera",
      });
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: "partial",
        tone: "warning",
        message: "Camera launch started, but delivery is still warming up.",
        followUp: {
          label: "Delivery status",
          detail: "Stream delivery has not reached live state yet.",
        },
      }),
    );
    expect(mockExecuteAliceOperatorPlan).toHaveBeenCalledWith({
      stopOnFailure: true,
      steps: [
        {
          id: "go-live",
          action: "STREAM555_GO_LIVE",
          params: {
            inputType: "avatar",
            layoutMode: "camera-full",
            destinationPlatforms: "twitch",
            applyDestinations: true,
            avatarIdentity: "alice",
          },
        },
      ],
    });
    expect(mockStreamStatus).toHaveBeenCalledOnce();
  });

  it("keeps screen-share on active PiP scene while forwarding Alice avatar identity", async () => {
    const operatorRef: {
      current: ReturnType<typeof useCompanionStageOperator> | null;
    } = { current: null };
    mockUseApp.mockReturnValue(
      createContext({
        plugins: [{ id: "@rndrntwrk/plugin-555stream", enabled: true }],
      }),
    );
    mockStreamStatus.mockResolvedValue({
      ok: true,
      running: true,
      ffmpegAlive: true,
      uptime: 12,
      frameCount: 48,
      destination: { id: "twitch", name: "Twitch" },
    });
    mockExecuteAliceOperatorPlan.mockResolvedValue({
      results: [
        {
          action: "STREAM555_SCREEN_SHARE",
          success: true,
          message: "Screen share accepted.",
        },
        {
          action: "STREAM555_DESTINATIONS_APPLY",
          success: true,
          message: "Destinations attached.",
        },
      ],
    });

    await act(async () => {
      TestRenderer.create(
        <Harness
          onOperator={(operator) => {
            operatorRef.current = operator;
          }}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await operatorRef.current?.performGuidedGoLive({
        channels: ["twitch"],
        launchMode: "screen-share",
      });
    });

    expect(mockExecuteAliceOperatorPlan).toHaveBeenCalledWith({
      stopOnFailure: false,
      steps: expect.arrayContaining([
        expect.objectContaining({
          action: "STREAM555_SCREEN_SHARE",
          params: expect.objectContaining({
            avatarIdentity: "alice",
            sceneId: "active-pip",
          }),
        }),
      ]),
    });
  });
});
