import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@milady/app-core/hooks", () => ({
  useBugReport: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

vi.mock("../../src/hooks/useBugReport", () => ({
  useBugReport: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

import { Header } from "../../src/components/Header";

let baseAppState: Record<string, unknown>;

describe("header status", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    baseAppState = {
      t: (k: string) => k,
      agentStatus: {
        state: "running",
        agentName: "Milady",
        model: undefined,
        startedAt: undefined,
        uptime: undefined,
      },
      miladyCloudEnabled: false,
      miladyCloudConnected: false,
      miladyCloudCredits: null,
      miladyCloudCreditsCritical: false,
      miladyCloudCreditsLow: false,
      miladyCloudTopUpUrl: "",
      walletAddresses: null,
      lifecycleBusy: false,
      lifecycleAction: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      openCommandPalette: vi.fn(),
      copyToClipboard: vi.fn(),
      setTab: vi.fn(),
      dropStatus: null,
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      registryStatus: null,
      uiShellMode: "native",
      setUiShellMode: vi.fn(),
      uiLanguage: "en",
    };
    mockUseApp.mockReturnValue(baseAppState);
  });

  it("renders starting state with loading indicator", async () => {
    mockUseApp.mockReturnValue({
      ...baseAppState,
      agentStatus: {
        state: "starting",
        agentName: "Milady",
        model: undefined,
        startedAt: undefined,
        uptime: undefined,
      },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    const renderedText = tree?.root
      .findAllByType("span")
      .map((node) => node.children.join(""))
      .join("\n");

    // Check that pause button is not present during starting state
    // (Loader2 spinner is shown instead of the pause/resume button)
    expect(renderedText).not.toContain("⏸️");
  });

  it("shows restart in-progress label and disables controls during lifecycle action", async () => {
    mockUseApp.mockReturnValue({
      ...baseAppState,
      lifecycleBusy: true,
      lifecycleAction: "restart",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    const restartButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "header.restartAgent",
    );
    expect(restartButton.props.disabled).toBe(true);

    const pauseResumeButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "header.pauseAutonomy",
    );
    expect(pauseResumeButton.props.disabled).toBe(true);
  });

  it("renders aria labels for icon-only controls", async () => {
    mockUseApp.mockReturnValue({
      ...baseAppState,
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    const pauseResumeButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "header.pauseAutonomy",
    );
    expect(pauseResumeButton.props["aria-label"]).toBe("header.pauseAutonomy");

    const restartButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "header.restartAgent",
    );
    expect(restartButton.props["aria-label"]).toBe("header.restartAgent");
  });
});
