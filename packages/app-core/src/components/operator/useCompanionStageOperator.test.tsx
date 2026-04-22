// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockStreamStatus,
  mockGetStreamingDestinations,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockStreamStatus: vi.fn(),
  mockGetStreamingDestinations: vi.fn(),
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

function Harness() {
  const operator = useCompanionStageOperator();
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
});
