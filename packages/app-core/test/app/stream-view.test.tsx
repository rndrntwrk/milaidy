// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findButtonByText, flush, text } from "../../../../test/helpers/react-test";

const { mockClientFns, mockUseApp } = vi.hoisted(() => ({
  mockClientFns: {
    streamStatus: vi.fn(),
    getStreamingDestinations: vi.fn(),
    setActiveDestination: vi.fn(),
    streamGoLive: vi.fn(),
    streamGoOffline: vi.fn(),
  },
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClientFns,
  isApiError: (err: unknown) =>
    Boolean(err && typeof err === "object" && "status" in (err as object)),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/config", () => ({
  getBootConfig: () => ({
    branding: { appName: "Milady" },
    apiBase: "",
  }),
}));

vi.mock("@miladyai/app-core/bridge", () => ({
  isElectrobunRuntime: () => false,
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useDocumentVisibility: () => true,
}));

import { StreamView } from "../../src/components/StreamView";

describe("StreamView", () => {
  beforeEach(() => {
    mockClientFns.streamStatus.mockReset();
    mockClientFns.getStreamingDestinations.mockReset();
    mockClientFns.setActiveDestination.mockReset();
    mockClientFns.streamGoLive.mockReset();
    mockClientFns.streamGoOffline.mockReset();
    mockUseApp.mockReset();

    mockClientFns.streamStatus.mockResolvedValue({
      running: false,
      ffmpegAlive: false,
      uptime: 0,
      frameCount: 0,
      destination: { id: "twitch", name: "Twitch" },
    });
    mockClientFns.getStreamingDestinations.mockResolvedValue({
      destinations: [
        { id: "twitch", name: "Twitch" },
        { id: "youtube", name: "YouTube" },
      ],
    });
    mockClientFns.setActiveDestination.mockResolvedValue({
      ok: true,
      destination: { id: "youtube", name: "YouTube" },
    });
    mockClientFns.streamGoLive.mockResolvedValue({
      ok: true,
      live: true,
    });
    mockClientFns.streamGoOffline.mockResolvedValue({
      ok: true,
      live: false,
    });
    mockUseApp.mockReturnValue({
      agentStatus: { agentName: "Alice" },
      setActionNotice: vi.fn(),
      t: (key: string, opts?: Record<string, unknown>) =>
        typeof opts?.defaultValue === "string" ? opts.defaultValue : key,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("owns destination controls inside StreamView instead of StatusBar", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(StreamView));
    });
    await flush();
    await flush();

    const selects = tree!.root.findAllByType("select");
    expect(selects).toHaveLength(1);
    expect(selects[0]?.props.value).toBe("twitch");

    act(() => {
      selects[0]?.props.onChange({ target: { value: "youtube" } });
    });

    expect(mockClientFns.setActiveDestination).toHaveBeenCalledWith("youtube");
    expect(
      tree!.root.findAll((node) => text(node).includes("Go Live")).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows a concise degraded state when go live fails", async () => {
    const actionNotice = vi.fn();
    mockUseApp.mockReturnValue({
      agentStatus: { agentName: "Alice" },
      setActionNotice: actionNotice,
      t: (key: string, opts?: Record<string, unknown>) =>
        typeof opts?.defaultValue === "string" ? opts.defaultValue : key,
    });
    mockClientFns.streamGoLive.mockRejectedValueOnce(
      new Error("Invalid API key format"),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(StreamView));
    });
    await flush();
    await flush();

    await act(async () => {
      await findButtonByText(tree!.root, "Go Live").props.onClick();
    });

    expect(actionNotice).toHaveBeenCalledWith(
      "Invalid API key format",
      "error",
      4200,
    );
    expect(
      tree!.root.findAll((node) =>
        text(node).includes("Streaming is degraded"),
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
