// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/components/AgentCore", () => ({
  AgentCore: () => React.createElement("div", null, "AgentCore"),
}));
vi.mock("../../src/components/CognitiveTracePanel", () => ({
  CognitiveTracePanel: () => React.createElement("div", null, "Trace"),
}));
vi.mock("../../src/components/MissionQueuePanel", () => ({
  MissionQueuePanel: () => React.createElement("div", null, "Mission"),
}));
vi.mock("../../src/components/MemoryDrawer", () => ({
  MemoryDrawer: ({ open }: { open: boolean }) =>
    open ? React.createElement("div", null, "MemoryDrawer") : null,
}));
vi.mock("../../src/components/OpsDrawer", () => ({
  OpsDrawer: ({ open }: { open: boolean }) =>
    open ? React.createElement("div", null, "OpsDrawer") : null,
}));
vi.mock("../../src/components/MiladyStatusStrip", () => ({
  MiladyStatusStrip: () => React.createElement("div", null, "StatusStrip"),
}));
vi.mock("../../src/components/ThreadsDrawer", () => ({
  ThreadsDrawer: ({ open }: { open: boolean }) =>
    open ? React.createElement("div", null, "ThreadsDrawer") : null,
}));
vi.mock("../../src/components/AssetVaultDrawer", () => ({
  AssetVaultDrawer: ({ open }: { open: boolean }) =>
    open ? React.createElement("div", null, "AssetVaultDrawer") : null,
}));
vi.mock("../../src/components/ControlStackModal", () => ({
  ControlStackModal: ({ open }: { open: boolean }) =>
    open ? React.createElement("div", null, "ControlStackModal") : null,
}));
vi.mock("../../src/components/GoLiveModal", () => ({
  GoLiveModal: () => React.createElement("div", null, "GoLiveModal"),
}));
vi.mock("../../src/components/CommandDock", () => ({
  CommandDock: () => React.createElement("div", null, "CommandDock"),
}));

import { MiladyOsDashboard } from "../../src/components/MiladyOsDashboard";

function renderWithTab(
  tab: string,
  options?: {
    appContextOverrides?: Record<string, unknown>;
    leftRailState?: "collapsed" | "peek" | "expanded";
    windowWidth?: number;
  },
) {
  const previousInnerWidth = window.innerWidth;
  if (options?.windowWidth) {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: options.windowWidth,
    });
  }
  const runQuickLayer = vi.fn(async () => {});
  const openGoLiveModal = vi.fn();
  const dismissActionLogInlineNotice = vi.fn();
  const setRailDisplay = vi.fn();
  mockUseApp.mockReturnValue({
    tab,
    dockSurface:
      tab === "character"
        ? "vault"
        : tab === "knowledge"
          ? "memory"
          : "none",
    leftRailState: options?.leftRailState ?? "collapsed",
    rightRailState: "collapsed",
    activeBubble: options?.leftRailState === "expanded" ? "action-log" : "none",
    streamViewMode: "broadcast",
    hudSurface: tab === "settings" ? "control-stack" : "none",
    hudControlSection: tab === "settings" ? "settings" : null,
    hudAssetSection: tab === "character" ? "character" : null,
    actionLogInlineNotice: null,
    chatSending: false,
    chatFirstTokenReceived: false,
    autonomousEvents: [],
    agentStatus: null,
    triggers: [],
    quickLayerStatuses: {
      "go-live": "available",
      "screen-share": "available",
      "play-games": "available",
      ads: "available",
      "reaction-segment": "available",
      "end-live": "available",
    },
    activeGameViewerUrl: "",
    activeGameDisplayName: "",
    gameOverlayEnabled: false,
    openDockSurface: vi.fn(),
    closeDockSurface: vi.fn(),
    openHudControlStack: vi.fn(),
    openHudAssetVault: vi.fn(),
    closeHudSurface: vi.fn(),
    runQuickLayer,
    openGoLiveModal,
    dismissActionLogInlineNotice,
    availableEmotes: [],
    activeAvatarEmoteId: null,
    avatarMotionMode: "idle",
    playAvatarEmote: vi.fn(async () => {}),
    stopAvatarEmote: vi.fn(),
    setState: vi.fn(),
    setRailDisplay,
    collapseRails: vi.fn(),
    ...options?.appContextOverrides,
  });
  let tree: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    tree = TestRenderer.create(React.createElement(MiladyOsDashboard));
  });
  if (options?.windowWidth) {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: previousInnerWidth,
    });
  }
  if (!tree) throw new Error("failed to render dashboard");
  return { tree, runQuickLayer, openGoLiveModal, dismissActionLogInlineNotice, setRailDisplay };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

describe("MiladyOsDashboard", () => {
  it("keeps the HUD shell on screen and opens the control stack for settings tabs", () => {
    const { tree } = renderWithTab("settings");
    const content = textOf(tree.root);
    expect(content).toContain("StatusStrip");
    expect(content).toContain("ControlStackModal");
    expect(content).toContain("CommandDock");
    expect(content).toContain("GoLiveModal");
  });

  it("opens the asset vault for vault tabs instead of routing away", () => {
    const { tree } = renderWithTab("character");
    const content = textOf(tree.root);
    expect(content).toContain("AssetVaultDrawer");
    expect(content).toContain("AgentCore");
  });

  it("opens the guided go-live modal from the action log without requiring ChatView to be mounted", () => {
    const { tree, runQuickLayer, openGoLiveModal } = renderWithTab("settings", {
      leftRailState: "expanded",
    });
    const buttons = tree.root.findAllByType("button");
    const goLive = buttons.find((button) =>
      button.children.some((child) => child === "Go Live"),
    );
    expect(goLive).toBeDefined();
    expect(textOf(tree.root)).toContain("Live Controls");
    expect(
      tree.root.findByProps({ "data-action-log-live-controls": true }),
    ).toBeDefined();

    act(() => {
      goLive?.props.onClick();
    });

    expect(openGoLiveModal).toHaveBeenCalled();
    expect(runQuickLayer).not.toHaveBeenCalledWith("go-live");
    expect(
      tree.root.findByProps({ "data-action-log-shell": true }),
    ).toBeDefined();
    expect(
      tree.root.findByProps({ "data-action-log-header": true }),
    ).toBeDefined();
    expect(
      tree.root.findByProps({ "data-action-log-pinned-region": true }),
    ).toBeDefined();
    expect(
      tree.root.findByProps({ "data-action-log-feed-region": true }),
    ).toBeDefined();
  });

  it("keeps the Action Log shell on an explicit desktop 80vh rail", () => {
    const { tree } = renderWithTab("settings", {
      leftRailState: "expanded",
      windowWidth: 1440,
    });

    const sheet = tree.root.findByProps({ "data-sheet-side": "left" });
    expect(sheet.props.className).toContain("sm:h-[80vh]");
    expect(sheet.props.className).toContain("sm:top-[10vh]");
  });

  it("keeps the Action Log shell on an explicit mobile 80dvh sheet", () => {
    const { tree } = renderWithTab("settings", {
      leftRailState: "expanded",
      windowWidth: 390,
    });

    const sheet = tree.root.findByProps({ "data-sheet-side": "bottom" });
    expect(sheet.props.className).toContain("h-[80dvh]");
  });

  it("renders and dismisses the persistent Action Log inline notice", () => {
    const actionLogInlineNotice = {
      id: "notice-1",
      tone: "warning",
      title: "Play Games",
      message: "Game launched, but stream feed attach needs follow-up in stream controls.",
      actionLabel: "Review live controls",
    };
    const {
      tree,
      dismissActionLogInlineNotice,
      setRailDisplay,
    } = renderWithTab("settings", {
      appContextOverrides: {
        actionLogInlineNotice,
      },
      leftRailState: "expanded",
    });
    expect(
      tree.root.findByProps({ "data-action-log-inline-notice": true }),
    ).toBeDefined();
    expect(textOf(tree.root)).toContain(
      "Game launched, but stream feed attach needs follow-up",
    );

    act(() => {
      tree.root.findByProps({ "data-action-log-inline-cta": true }).props.onClick();
    });
    expect(setRailDisplay).toHaveBeenCalledWith("action-log", "expanded");

    act(() => {
      tree.root.findByProps({ "aria-label": "Dismiss action log notice" }).props.onClick();
    });
    expect(dismissActionLogInlineNotice).toHaveBeenCalled();
  });
});
