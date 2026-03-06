import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApp = vi.fn();
const mockOnWsEvent = vi.fn(() => () => {});
const mockLoadPlugins = vi.fn(async () => {});
const mockHandlePluginToggle = vi.fn(async () => {});
const mockHandlePluginConfigSave = vi.fn(async () => {});
const mockSetActionNotice = vi.fn();
const mockSetState = vi.fn();
const mockExecuteAutonomyPlan = vi.fn();

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/api-client", () => ({
  client: {
    onWsEvent: (...args: unknown[]) => mockOnWsEvent(...args),
    installRegistryPlugin: vi.fn(),
    testPluginConnection: vi.fn(),
    restartAndWait: vi.fn(),
    executeAutonomyPlan: (...args: unknown[]) => mockExecuteAutonomyPlan(...args),
  },
}));

import { PluginsView } from "../../src/components/PluginsView";

function createArcadePlugin() {
  return {
    id: "555arcade",
    name: "555 Arcade",
    description: "Unified 555 arcade plugin",
    enabled: true,
    configured: true,
    isActive: true,
    authenticated: true,
    ready: false,
    envKey: null,
    category: "feature" as const,
    source: "bundled" as const,
    statusSummary: [
      "Installed",
      "Enabled",
      "Loaded",
      "Authenticated",
      "Session not bootstrapped",
      "Setup incomplete",
    ],
    operationalCounts: {
      sessionBootstrapped: 0,
      catalogReachable: 1,
      leaderboardReachable: 1,
      questsReachable: 1,
      scorePipelineReachable: 1,
    },
    pluginUiSchema: {
      actions: {
        verify: { label: "Verify Auth" },
        bootstrap: { label: "Bootstrap Session" },
        catalog: { label: "Fetch Catalog" },
        play: { label: "Play" },
        switch: { label: "Switch" },
        stop: { label: "Stop" },
        leaderboard: { label: "Read Leaderboard" },
        quests: { label: "Read Quests" },
      },
    },
    parameters: [
      {
        key: "ARCADE555_DEFAULT_SESSION_ID",
        type: "string",
        description: "Preferred default session",
        currentValue: "alice-session",
        isSet: true,
        required: false,
        sensitive: false,
      },
      {
        key: "ARCADE555_REQUIRE_APPROVALS",
        type: "boolean",
        description: "Require approvals",
        default: "true",
        currentValue: "true",
        isSet: true,
        required: false,
        sensitive: false,
      },
    ],
    validationErrors: [],
    validationWarnings: [],
  };
}

function createContext() {
  return {
    plugins: [createArcadePlugin()],
    pluginStatusFilter: "all" as const,
    pluginSearch: "",
    pluginSettingsOpen: new Set<string>(["555arcade"]),
    pluginSaving: new Set<string>(),
    pluginSaveSuccess: new Set<string>(),
    loadPlugins: mockLoadPlugins,
    handlePluginToggle: mockHandlePluginToggle,
    handlePluginConfigSave: mockHandlePluginConfigSave,
    setActionNotice: mockSetActionNotice,
    setState: mockSetState,
  };
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  return root.find(
    (node) =>
      node.type === "button" &&
      node.children.some(
        (child) => typeof child === "string" && child.includes(label),
      ),
  );
}

describe("Arcade555 operator controls", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockOnWsEvent.mockReset();
    mockLoadPlugins.mockReset();
    mockHandlePluginToggle.mockReset();
    mockHandlePluginConfigSave.mockReset();
    mockSetActionNotice.mockReset();
    mockSetState.mockReset();
    mockExecuteAutonomyPlan.mockReset();
    mockOnWsEvent.mockReturnValue(() => {});
    mockLoadPlugins.mockResolvedValue(undefined);
    mockHandlePluginToggle.mockResolvedValue(undefined);
    mockHandlePluginConfigSave.mockResolvedValue(undefined);
    mockSetState.mockImplementation(() => {});
    mockExecuteAutonomyPlan.mockResolvedValue({
      results: [{ success: true, data: { message: "ok" } }],
    });
  });

  it("renders canonical arcade operator actions from the unified plugin surface", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    expect(findButtonByText(tree!.root, "Verify Auth")).toBeDefined();
    expect(findButtonByText(tree!.root, "Bootstrap Session")).toBeDefined();
    expect(findButtonByText(tree!.root, "Fetch Catalog")).toBeDefined();
    expect(findButtonByText(tree!.root, "Play")).toBeDefined();
    expect(findButtonByText(tree!.root, "Switch")).toBeDefined();
    expect(findButtonByText(tree!.root, "Read Leaderboard")).toBeDefined();
    expect(findButtonByText(tree!.root, "Read Quests")).toBeDefined();
    expect(
      tree!.root.findAll(
        (node) =>
          node.children.some(
            (child) =>
              typeof child === "string" &&
              child.includes("Session not bootstrapped"),
          ),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.props?.placeholder === "string" &&
          node.props.placeholder.includes("knighthood"),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree!.root.findAll(
        (node) =>
          node.children.some(
            (child) =>
              typeof child === "string" &&
              child.includes("Default session ID: alice-session"),
          ),
      ).length,
    ).toBeGreaterThan(0);
  });
});
