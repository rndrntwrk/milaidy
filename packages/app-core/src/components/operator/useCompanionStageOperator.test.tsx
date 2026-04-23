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

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useDocumentVisibility: () => true,
}));

vi.mock("@miladyai/app-core/api", () => ({
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
  },
  isApiError: (err: unknown) =>
    Boolean(err && typeof err === "object" && "status" in (err as object)),
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
      (typeof options?.defaultValue === "string"
        ? options.defaultValue
        : key),
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
      data-degraded={String(operator.stream.degraded)}
      data-starting={String(operator.stream.starting)}
      data-state={operator.stream.state}
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

  it("does not mark the stream live until the stream health is actually ready", async () => {
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

  it("classifies a cold-boot stream as starting, not degraded", async () => {
    // Server authoritative state = "starting" — the encoder isn't up yet,
    // no platform is delivering. Client must NOT flash the DEGRADED visual
    // during this window; starting is a distinct, calmer state.
    mockStreamStatus.mockResolvedValue({
      running: true,
      ffmpegAlive: false,
      state: "starting",
      requiredOutputsReady: false,
      uptime: 1,
      frameCount: 0,
      destination: { id: "twitch", name: "Twitch" },
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = tree?.root.findByProps({ "data-testid": "operator-stream" });
    expect(status?.props["data-live"]).toBe("false");
    expect(status?.props["data-degraded"]).toBe("false");
    expect(status?.props["data-starting"]).toBe("true");
    expect(status?.props["data-state"]).toBe("starting");
  });

  it("classifies a partially-delivering stream as degraded", async () => {
    // Server says ffmpeg is producing frames but not all required platforms
    // are accepting the feed. Client should render DEGRADED, not starting.
    mockStreamStatus.mockResolvedValue({
      running: true,
      ffmpegAlive: true,
      state: "degraded",
      requiredOutputsReady: false,
      uptime: 30,
      frameCount: 900,
      destination: { id: "twitch", name: "Twitch" },
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = tree?.root.findByProps({ "data-testid": "operator-stream" });
    expect(status?.props["data-live"]).toBe("false");
    expect(status?.props["data-degraded"]).toBe("true");
    expect(status?.props["data-starting"]).toBe("false");
    expect(status?.props["data-state"]).toBe("degraded");
  });

  it("reports live only when the server says live and ffmpeg is alive", async () => {
    mockStreamStatus.mockResolvedValue({
      running: true,
      ffmpegAlive: true,
      state: "live",
      requiredOutputsReady: true,
      uptime: 120,
      frameCount: 3600,
      destination: { id: "twitch", name: "Twitch" },
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = tree?.root.findByProps({ "data-testid": "operator-stream" });
    expect(status?.props["data-live"]).toBe("true");
    expect(status?.props["data-degraded"]).toBe("false");
    expect(status?.props["data-starting"]).toBe("false");
    expect(status?.props["data-state"]).toBe("live");
  });

  it("never flashes degraded during a cold-boot transition from starting to live", async () => {
    // Locks in the cold-boot regression fix. Before this patch, any running
    // state with `requiredOutputsReady === false` was classified as degraded,
    // so the orange pill flashed for the whole launch window. The contract
    // now: during starting → live, `data-degraded` stays "false" on every
    // poll, and the visual transitions idle → starting → live.
    mockStreamStatus
      .mockResolvedValueOnce({
        running: true,
        ffmpegAlive: false,
        state: "starting",
        requiredOutputsReady: false,
        uptime: 1,
        frameCount: 0,
        destination: { id: "twitch", name: "Twitch" },
      })
      .mockResolvedValueOnce({
        running: true,
        ffmpegAlive: true,
        state: "live",
        requiredOutputsReady: true,
        uptime: 6,
        frameCount: 180,
        destination: { id: "twitch", name: "Twitch" },
      });

    const operatorRef: {
      current: ReturnType<typeof useCompanionStageOperator> | null;
    } = { current: null };
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <Harness
          onOperator={(operator) => {
            operatorRef.current = operator;
          }}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const first = tree?.root.findByProps({ "data-testid": "operator-stream" });
    expect(first?.props["data-starting"]).toBe("true");
    expect(first?.props["data-degraded"]).toBe("false");
    expect(first?.props["data-live"]).toBe("false");

    await act(async () => {
      await operatorRef.current?.stream.refreshStatus();
      await Promise.resolve();
    });

    const second = tree?.root.findByProps({ "data-testid": "operator-stream" });
    expect(second?.props["data-starting"]).toBe("false");
    expect(second?.props["data-degraded"]).toBe("false");
    expect(second?.props["data-live"]).toBe("true");
  });

  it("falls unknown running phases through to degraded, not live", async () => {
    // Server is supposed to normalize unknown upstream phases to "degraded"
    // before returning, but the client keeps its own safe fallback for
    // defense in depth: any running state that isn't live/starting lands in
    // degraded. Simulate a server-side regression that leaks an unknown
    // phase — the client must not light up LIVE.
    mockStreamStatus.mockResolvedValue({
      running: true,
      ffmpegAlive: true,
      state: "reconnecting" as unknown as
        | "idle"
        | "starting"
        | "live"
        | "degraded",
      requiredOutputsReady: false,
      uptime: 3,
      frameCount: 90,
      destination: { id: "twitch", name: "Twitch" },
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = tree?.root.findByProps({ "data-testid": "operator-stream" });
    expect(status?.props["data-live"]).toBe("false");
    expect(status?.props["data-starting"]).toBe("false");
    expect(status?.props["data-degraded"]).toBe("true");
    // The client-side normalization collapses unknowns into "degraded"
    // rather than leaking the raw value.
    expect(status?.props["data-state"]).toBe("degraded");
  });

  it("does not report live when the server says live but ffmpegAlive disagrees", async () => {
    // Edge case: distributor passes through `state: "live"` but no platform
    // is actually delivering (ffmpegAlive: false on the client view). The
    // old client would compute nextLive=false, nextStarting=false,
    // nextDegraded=false, and render the IDLE visual — a silent lie. The
    // new contract: if the two signals disagree we surface DEGRADED so the
    // operator sees a warning instead of a clean "Go Live" button over a
    // dead pipe.
    mockStreamStatus.mockResolvedValue({
      running: true,
      ffmpegAlive: false,
      state: "live",
      requiredOutputsReady: false,
      uptime: 90,
      frameCount: 2700,
      destination: { id: "twitch", name: "Twitch" },
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = tree?.root.findByProps({ "data-testid": "operator-stream" });
    expect(status?.props["data-live"]).toBe("false");
    expect(status?.props["data-starting"]).toBe("false");
    expect(status?.props["data-degraded"]).toBe("true");
    expect(status?.props["data-state"]).toBe("degraded");
  });

  it("returns a partial result when camera launch starts but delivery is not yet live", async () => {
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
          ReturnType<ReturnType<typeof useCompanionStageOperator>["performGuidedGoLive"]>
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
    expect(mockStreamStatus).toHaveBeenCalledOnce();
  });
});
