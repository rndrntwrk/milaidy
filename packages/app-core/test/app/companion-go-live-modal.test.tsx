// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInlineUiMock } from "./mockInlineUi";
import { findButtonByText, textOf } from "../../../../test/helpers/react-test";

const mockUseApp = vi.hoisted(() => vi.fn());

vi.mock("@miladyai/ui", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@miladyai/ui");
  return createInlineUiMock(actual);
});

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/config/config-renderer", () => ({
  ConfigRenderer: () =>
    React.createElement("div", { "data-testid": "config-renderer" }, "ConfigRenderer"),
  defaultRegistry: {},
}));

vi.mock("../../src/components/PluginsView", () => ({
  paramsToSchema: () => ({
    schema: {
      type: "object",
      properties: {},
    },
    hints: {},
  }),
}));

import { CompanionGoLiveModal } from "../../src/components/operator/CompanionGoLiveModal";

function t(key: string, options?: Record<string, unknown>) {
  return String(options?.defaultValue ?? key);
}

function createReadyPlugin() {
  return {
    id: "555stream",
    name: "555 Stream",
    parameters: [
      { key: "STREAM555_AGENT_TOKEN", currentValue: "token" },
      { key: "STREAM555_DEST_X_ENABLED", currentValue: "true" },
      { key: "STREAM555_DEST_X_RTMP_URL", currentValue: "rtmp://x" },
      { key: "STREAM555_DEST_X_STREAM_KEY", currentValue: "abc123" },
    ],
    validationWarnings: [],
    validationErrors: [],
  };
}

function createBlockedPlugin() {
  return {
    id: "555stream",
    name: "555 Stream",
    parameters: [
      { key: "STREAM555_DEST_X_ENABLED", currentValue: "true" },
    ],
    validationWarnings: [],
    validationErrors: [],
  };
}

function createOperator(overrides: Record<string, unknown> = {}) {
  return {
    stream: {
      refreshStatus: vi.fn(async () => {}),
      refreshDestinations: vi.fn(async () => {}),
    },
    arcade: {
      refreshState: vi.fn(async () => {}),
      runtimeAvailable: true,
      selectedGameId: "game-1",
      selectedGameLabel: "Super Alice Kart",
    },
    executePlan: vi.fn(async () => ({
      results: [{ success: true, message: "ok" }],
    })),
    performGuidedGoLive: vi.fn(async () => ({ state: "success" })),
    ...overrides,
  };
}

describe("CompanionGoLiveModal", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      handlePluginConfigSave: vi.fn(async () => {}),
      loadPlugins: vi.fn(async () => {}),
      pluginSaving: new Set<string>(),
      plugins: [createReadyPlugin()],
      walletAddresses: { evmAddress: "0x123" },
      t,
    });
  });

  it("marks the active step and exposes checkbox semantics for channel selection", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CompanionGoLiveModal, {
          open: true,
          onOpenChange: vi.fn(),
          preferredMode: "camera",
          onPreferredModeChange: vi.fn(),
          operator: createOperator(),
        }),
      );
      await Promise.resolve();
    });

    const currentStep = tree?.root.find(
      (node) =>
        node.props?.["aria-current"] === "step" &&
        textOf(node).includes("Channels"),
    );
    const channelCheckboxes = tree?.root.findAll(
      (node) => node.type === "input" && node.props.type === "checkbox",
    );

    expect(currentStep).toBeDefined();
    expect(channelCheckboxes?.length).toBeGreaterThan(0);
    expect(channelCheckboxes?.some((node) => node.props.checked)).toBe(true);
  });

  it("uses radio semantics for launch mode selection", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CompanionGoLiveModal, {
          open: true,
          onOpenChange: vi.fn(),
          preferredMode: "camera",
          onPreferredModeChange: vi.fn(),
          operator: createOperator(),
        }),
      );
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(tree!.root, "Continue").props.onClick();
      await Promise.resolve();
    });

    const currentStep = tree?.root.find(
      (node) =>
        node.props?.["aria-current"] === "step" && textOf(node).includes("Mode"),
    );
    const radios = tree?.root.findAll(
      (node) => node.type === "input" && node.props.type === "radio",
    );

    expect(currentStep).toBeDefined();
    expect(radios).toHaveLength(5);
    expect(radios.filter((node) => node.props.checked)).toHaveLength(1);
  });

  it("announces blocked setup notices as alerts", async () => {
    mockUseApp.mockReturnValue({
      handlePluginConfigSave: vi.fn(async () => {}),
      loadPlugins: vi.fn(async () => {}),
      pluginSaving: new Set<string>(),
      plugins: [createBlockedPlugin()],
      walletAddresses: { evmAddress: "0x123" },
      t,
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CompanionGoLiveModal, {
          open: true,
          onOpenChange: vi.fn(),
          preferredMode: "camera",
          onPreferredModeChange: vi.fn(),
          operator: createOperator(),
        }),
      );
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(tree!.root, "Continue").props.onClick();
      await Promise.resolve();
    });

    const alert = tree?.root.find(
      (node) => node.props?.role === "alert" && textOf(node).includes("Authenticate"),
    );

    expect(alert).toBeDefined();
  });
});
