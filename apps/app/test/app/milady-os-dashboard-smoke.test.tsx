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
vi.mock("../../src/components/CommandDock", () => ({
  CommandDock: () => React.createElement("div", null, "CommandDock"),
}));

import { MiladyOsDashboard } from "../../src/components/MiladyOsDashboard";

function renderWithTab(tab: string) {
  mockUseApp.mockReturnValue({
    tab,
    dockSurface:
      tab === "character"
        ? "vault"
        : tab === "knowledge"
          ? "memory"
          : "none",
    leftRailState: "collapsed",
    rightRailState: "collapsed",
    activeBubble: "none",
    streamViewMode: "broadcast",
    hudSurface: tab === "settings" ? "control-stack" : "none",
    hudControlSection: tab === "settings" ? "settings" : null,
    hudAssetSection: tab === "character" ? "character" : null,
    chatSending: false,
    chatFirstTokenReceived: false,
    autonomousEvents: [],
    agentStatus: null,
    triggers: [],
    openDockSurface: vi.fn(),
    closeDockSurface: vi.fn(),
    openHudControlStack: vi.fn(),
    openHudAssetVault: vi.fn(),
    closeHudSurface: vi.fn(),
    setRailDisplay: vi.fn(),
    collapseRails: vi.fn(),
  });
  let tree: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    tree = TestRenderer.create(React.createElement(MiladyOsDashboard));
  });
  if (!tree) throw new Error("failed to render dashboard");
  return tree;
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

describe("MiladyOsDashboard", () => {
  it("keeps the HUD shell on screen and opens the control stack for settings tabs", () => {
    const tree = renderWithTab("settings");
    const content = textOf(tree.root);
    expect(content).toContain("StatusStrip");
    expect(content).toContain("ControlStackModal");
    expect(content).toContain("CommandDock");
  });

  it("opens the asset vault for vault tabs instead of routing away", () => {
    const tree = renderWithTab("character");
    const content = textOf(tree.root);
    expect(content).toContain("AssetVaultDrawer");
    expect(content).toContain("AgentCore");
  });
});
