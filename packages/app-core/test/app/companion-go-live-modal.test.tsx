// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    React.createElement(
      "div",
      { "data-testid": "config-renderer" },
      "ConfigRenderer",
    ),
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
import { buildStream555SetupSummary } from "../../src/components/operator/stream555-setup";

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
    parameters: [{ key: "STREAM555_DEST_X_ENABLED", currentValue: "true" }],
    validationWarnings: [],
    validationErrors: [],
  };
}

function createPartiallyReadyPlugin() {
  return {
    id: "555stream",
    name: "555 Stream",
    parameters: [
      { key: "STREAM555_AGENT_API_KEY", currentValue: null, isSet: true },
      { key: "STREAM555_DEST_PUMPFUN_ENABLED", currentValue: "true" },
      {
        key: "STREAM555_DEST_PUMPFUN_RTMP_URL",
        currentValue: "rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x",
      },
      { key: "STREAM555_DEST_TWITCH_ENABLED", currentValue: "true" },
      {
        key: "STREAM555_DEST_TWITCH_RTMP_URL",
        currentValue: "rtmps://ingest.global-contribute.live-video.net/app",
      },
      { key: "STREAM555_DEST_TWITCH_STREAM_KEY", currentValue: null },
      { key: "STREAM555_DEST_KICK_ENABLED", currentValue: "true" },
      {
        key: "STREAM555_DEST_KICK_RTMP_URL",
        currentValue: "rtmps://fa723fc1b171.global-contribute.live-video.net",
      },
      { key: "STREAM555_DEST_KICK_STREAM_KEY", currentValue: null },
      { key: "STREAM555_DEST_YOUTUBE_ENABLED", currentValue: "true" },
      {
        key: "STREAM555_DEST_YOUTUBE_RTMP_URL",
        currentValue: "rtmps://a.rtmp.youtube.com/live2",
      },
      { key: "STREAM555_DEST_YOUTUBE_STREAM_KEY", currentValue: null },
    ],
    validationWarnings: [],
    validationErrors: [],
  };
}

function createWalletConfigPlugin() {
  return {
    id: "555stream",
    name: "555 Stream",
    parameters: [
      { key: "STREAM555_DEST_X_ENABLED", currentValue: "true" },
      {
        key: "STREAM555_WALLET_AUTH_PREFERRED_CHAIN",
        currentValue: "solana",
      },
      {
        key: "STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN",
        currentValue: "eth",
      },
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
        node.props?.["aria-current"] === "step" &&
        textOf(node).includes("Mode"),
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
      (node) =>
        node.props?.role === "alert" && textOf(node).includes("Authenticate"),
    );

    expect(alert).toBeDefined();
  });

  it("treats redacted configured 555stream secrets as setup-ready", () => {
    const summary = buildStream555SetupSummary({
      id: "555stream",
      name: "555 Stream",
      parameters: [
        {
          key: "STREAM555_AGENT_API_KEY",
          currentValue: null,
          isSet: true,
          sensitive: true,
        },
        {
          key: "STREAM555_DEST_TWITCH_ENABLED",
          currentValue: "true",
          isSet: true,
          sensitive: false,
        },
        {
          key: "STREAM555_DEST_TWITCH_RTMP_URL",
          currentValue: "rtmps://ingest.global-contribute.live-video.net/app",
          isSet: true,
          sensitive: false,
        },
        {
          key: "STREAM555_DEST_TWITCH_STREAM_KEY",
          currentValue: null,
          isSet: true,
          sensitive: true,
        },
      ],
      validationWarnings: [],
      validationErrors: [],
    } as never);

    expect(summary.authConnected).toBe(true);
    expect(summary.readyDestinations).toBe(1);
    expect(summary.configuredDestinations).toBe(1);
    expect(summary.setupRequired).toBe(false);
  });

  it("shows per-channel setup readiness before the config form", async () => {
    mockUseApp.mockReturnValue({
      handlePluginConfigSave: vi.fn(async () => {}),
      loadPlugins: vi.fn(async () => {}),
      pluginSaving: new Set<string>(),
      plugins: [createPartiallyReadyPlugin()],
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

    const setupCopy = textOf(tree!.root);

    expect(setupCopy).toContain("Pump.fun");
    expect(setupCopy).toContain("Twitch");
    expect(setupCopy).toContain("Kick");
    expect(setupCopy).toContain("YouTube");
    expect(setupCopy).toContain("Missing stream key");
  });

  it("shows wallet-auth chain config instead of inferring from loaded wallet addresses", async () => {
    mockUseApp.mockReturnValue({
      handlePluginConfigSave: vi.fn(async () => {}),
      loadPlugins: vi.fn(async () => {}),
      pluginSaving: new Set<string>(),
      plugins: [createWalletConfigPlugin()],
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

    const setupCopy = textOf(tree!.root);

    expect(setupCopy).toContain("Solana preferred");
    expect(setupCopy).toContain("Provision fallback: Ethereum");
    expect(setupCopy).not.toContain("Ethereum fallbackUsed");
  });

  it("keeps the go-live modal body bounded and scrollable on short viewports", () => {
    const cssFiles = [
      readFileSync(
        resolve(
          process.cwd(),
          "packages/app-core/src/styles/alice-companion.css",
        ),
        "utf8",
      ),
      readFileSync(
        resolve(process.cwd(), "packages/app-core/src/styles/styles.css"),
        "utf8",
      ),
    ];

    for (const css of cssFiles) {
      expect(css).toContain("92dvh");
      expect(css).toContain("100dvh - 1rem");
      expect(css).toMatch(
        /\.go-live-modal__shell\s*\{[\s\S]*?min-height: 0;[\s\S]*?height: 100%;/,
      );
      expect(css).toMatch(
        /\.go-live-modal__header\s*\{[\s\S]*?flex: 0 0 auto;/,
      );
      expect(css).toMatch(
        /\.go-live-modal__body\s*\{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;[\s\S]*?scroll-padding-bottom: 2rem;[\s\S]*?scrollbar-gutter: stable;/,
      );
      expect(css).toMatch(
        /\.go-live-modal__setup-card\s*\{[\s\S]*?min-height: 8rem;/,
      );
      expect(css).toMatch(
        /\.go-live-modal__footer\s*\{[\s\S]*?flex: 0 0 auto;/,
      );
      expect(css).toMatch(
        /@media \(max-height: 760px\) and \(min-width: 721px\) \{[\s\S]*?\.go-live-modal__mode-card\s*\{[\s\S]*?min-height: 8\.8rem;/,
      );
    }
  });
});
