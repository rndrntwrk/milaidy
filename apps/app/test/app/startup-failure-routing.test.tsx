// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", async () => {
  const actual = await vi.importActual("../../src/AppContext");
  return {
    ...actual,
    useApp: () => mockUseApp(),
  };
});

vi.mock("../../src/components/Header", () => ({
  Header: () => React.createElement("div", null, "Header"),
}));
vi.mock("../../src/components/Nav", () => ({
  Nav: () => React.createElement("div", null, "Nav"),
}));
vi.mock("../../src/components/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));
vi.mock("../../src/components/EmotePicker", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));
vi.mock("../../src/components/SaveCommandModal", () => ({
  SaveCommandModal: () => React.createElement("div", null, "SaveCommandModal"),
}));
vi.mock("../../src/components/PairingView", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));
vi.mock("../../src/components/OnboardingWizard", () => ({
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
}));
vi.mock("../../src/components/ChatView", () => ({
  ChatView: () => React.createElement("div", null, "ChatView"),
}));
vi.mock("../../src/components/ConversationsSidebar", () => ({
  ConversationsSidebar: () =>
    React.createElement("div", null, "ConversationsSidebar"),
}));
vi.mock("../../src/components/AutonomousPanel", () => ({
  AutonomousPanel: () => React.createElement("div", null, "AutonomousPanel"),
}));
vi.mock("../../src/components/CustomActionsPanel", () => ({
  CustomActionsPanel: () =>
    React.createElement("div", null, "CustomActionsPanel"),
}));
vi.mock("../../src/components/CustomActionEditor", () => ({
  CustomActionEditor: () =>
    React.createElement("div", null, "CustomActionEditor"),
}));
vi.mock("../../src/components/AppsPageView", () => ({
  AppsPageView: () => React.createElement("div", null, "AppsPageView"),
}));
vi.mock("../../src/components/AdvancedPageView", () => ({
  AdvancedPageView: () => React.createElement("div", null, "AdvancedPageView"),
}));
vi.mock("../../src/components/CharacterView", () => ({
  CharacterView: () => React.createElement("div", null, "CharacterView"),
}));
vi.mock("../../src/components/ConnectorsPageView", () => ({
  ConnectorsPageView: () =>
    React.createElement("div", null, "ConnectorsPageView"),
}));
vi.mock("../../src/components/InventoryView", () => ({
  InventoryView: () => React.createElement("div", null, "InventoryView"),
}));
vi.mock("../../src/components/KnowledgeView", () => ({
  KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
}));
vi.mock("../../src/components/SettingsView", () => ({
  SettingsView: () => React.createElement("div", null, "SettingsView"),
}));
vi.mock("../../src/components/LoadingScreen", () => ({
  LoadingScreen: () => React.createElement("div", null, "LoadingScreen"),
}));
vi.mock("../../src/components/StartupFailureView", () => ({
  StartupFailureView: ({
    error,
    currentTheme,
    agentName,
  }: {
    error: { reason: string };
    currentTheme?: string;
    agentName?: string | null;
  }) =>
    React.createElement(
      "div",
      null,
      `StartupFailureView:${error.reason}:${currentTheme ?? "none"}:${agentName ?? "none"}`,
    ),
}));
vi.mock("../../src/components/TerminalPanel", () => ({
  TerminalPanel: () => React.createElement("div", null, "TerminalPanel"),
}));
vi.mock("../../src/hooks/useContextMenu", () => ({
  useContextMenu: () => null,
}));
vi.mock("../../src/hooks/useBugReport", () => ({
  BugReportProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useBugReportState: () => ({ open: false }),
}));

import { App } from "../../src/App";

describe("startup failure routing", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      onboardingLoading: false,
      startupPhase: "starting-backend",
      startupError: {
        reason: "backend-unreachable",
        phase: "starting-backend",
        message: "Backend unavailable",
      },
      authRequired: false,
      onboardingComplete: true,
      retryStartup: () => {},
      tab: "chat",
      currentTheme: "milady-os",
      agentStatus: { state: "starting", agentName: "DJ Alice" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      toasts: [],
      dismissToast: () => {},
    });
  });

  it("forwards theme and agent identity into the failure view", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    const renderedText = tree?.root
      .findAllByType("div")
      .map((node) => node.children.join(""))
      .join("\n");

    expect(renderedText).toContain(
      "StartupFailureView:backend-unreachable:milady-os:DJ Alice",
    );
  });
});
