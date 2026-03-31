// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  keyboardSetScrollMock,
  useAppMock,
  useBugReportStateMock,
  useContextMenuMock,
  useStreamPopoutNavigationMock,
} = vi.hoisted(() => ({
  keyboardSetScrollMock: vi.fn(() => Promise.resolve()),
  useAppMock: vi.fn(),
  useBugReportStateMock: vi.fn(),
  useContextMenuMock: vi.fn(),
  useStreamPopoutNavigationMock: vi.fn(),
}));

vi.mock("@capacitor/keyboard", () => ({
  Keyboard: {
    setScroll: keyboardSetScrollMock,
  },
}));

vi.mock("@miladyai/app-core/platform", () => ({
  isIOS: false,
  isNative: false,
}));

vi.mock("./state", () => ({
  useApp: useAppMock,
}));

vi.mock("./hooks", () => ({
  BugReportProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useBugReportState: useBugReportStateMock,
  useContextMenu: useContextMenuMock,
  useStreamPopoutNavigation: useStreamPopoutNavigationMock,
}));

vi.mock("./app-shell-components", () => {
  const stub =
    (name: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": name }, children);
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  return {
    AdvancedPageView: stub("AdvancedPageView"),
    AppsPageView: stub("AppsPageView"),
    AvatarLoader: stub("AvatarLoader"),
    BugReportModal: stub("BugReportModal"),
    CharacterEditor: stub("CharacterEditor"),
    ChatView: stub("ChatView"),
    CompanionShell: stub("CompanionShell"),
    CompanionView: stub("CompanionView"),
    ConnectionFailedBanner: stub("ConnectionFailedBanner"),
    ConnectorsPageView: stub("ConnectorsPageView"),
    ConversationsSidebar: stub("ConversationsSidebar"),
    CustomActionEditor: stub("CustomActionEditor"),
    CustomActionsPanel: stub("CustomActionsPanel"),
    GameViewOverlay: stub("GameViewOverlay"),
    Header: stub("Header"),
    HeartbeatsView: stub("HeartbeatsView"),
    InventoryView: stub("InventoryView"),
    KnowledgeView: stub("KnowledgeView"),
    OnboardingWizard: stub("OnboardingWizard"),

    PairingView: stub("PairingView"),
    SaveCommandModal: stub("SaveCommandModal"),
    SettingsView: stub("SettingsView"),
    SharedCompanionScene: passthrough,
    ShellOverlays: stub("ShellOverlays"),
    StartupFailureView: ({ error }: { error: { message: string } }) =>
      React.createElement(
        "div",
        { "data-testid": "StartupFailureView" },
        error.message,
      ),
    StartupShell: () => {
      const app = useAppMock();
      const coordPhase = app?.startupCoordinator?.phase ?? "restoring-session";
      if (coordPhase === "error") {
        const err = app?.startupError ?? {
          message: "Startup error",
          reason: "unknown",
          phase: "starting-backend",
        };
        return React.createElement(
          "div",
          { "data-testid": "StartupFailureView" },
          err.message,
        );
      }
      return React.createElement("div", { "data-testid": "StartupShell" });
    },
    StreamView: stub("StreamView"),
    SystemWarningBanner: stub("SystemWarningBanner"),
  };
});

vi.mock("./components/FlaminaGuide", () => ({
  DeferredSetupChecklist: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      "div",
      { "data-testid": "DeferredSetupChecklist" },
      children,
    ),
}));

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    keyboardSetScrollMock.mockReset();
    useAppMock.mockReset();
    useBugReportStateMock.mockReset().mockReturnValue({});
    useContextMenuMock.mockReset().mockReturnValue({
      saveCommandModalOpen: false,
      saveCommandText: "",
      confirmSaveCommand: vi.fn(),
      closeSaveCommandModal: vi.fn(),
    });
    useStreamPopoutNavigationMock.mockReset();
  });

  it("keeps hook order stable when startupError appears after the app has mounted", async () => {
    const appState = {
      onboardingLoading: false,
      startupPhase: "ready",
      startupError: null,
      startupCoordinator: { phase: "ready" },
      authRequired: false,
      onboardingComplete: true,
      retryStartup: vi.fn(),
      tab: "stream",
      setTab: vi.fn(),
      actionNotice: null,
      uiShellMode: "native",
      agentStatus: { state: "running" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
    };
    useAppMock.mockImplementation(() => appState);

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(App));
    });

    // Transition the coordinator to the error phase — StartupShell renders
    // StartupFailureView when the coordinator is in the error phase.
    appState.startupCoordinator = {
      phase: "error",
      state: {
        phase: "error",
        reason: "agent-error",
        message: "backend died",
        timedOut: false,
      },
      retry: vi.fn(),
    };
    appState.startupError = {
      reason: "agent-error",
      phase: "ready",
      message: "backend died",
    };

    await act(async () => {
      renderer?.update(React.createElement(App));
    });

    if (!renderer) {
      throw new Error("App did not render");
    }

    expect(
      renderer.root.findByProps({ "data-testid": "StartupFailureView" })
        .children,
    ).toContain("backend died");
  });
});
