// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockBuildStream555StatusSummary,
  mockGetPlugins,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockBuildStream555StatusSummary: vi.fn(),
  mockGetPlugins: vi.fn(),
}));

vi.mock("../../src/AppContext.js", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/api-client.js", () => ({
  client: {
    getPlugins: () => mockGetPlugins(),
  },
}));

vi.mock("../../src/components/PluginOperatorPanels.js", () => ({
  STREAM555_DESTINATION_SPECS: [
    {
      id: "twitch",
      label: "Twitch",
      urlKey: "STREAM555_DEST_TWITCH_RTMP_URL",
      streamKeyKey: "STREAM555_DEST_TWITCH_STREAM_KEY",
      enabledKey: "STREAM555_DEST_TWITCH_ENABLED",
    },
    {
      id: "x",
      label: "X",
      urlKey: "STREAM555_DEST_X_RTMP_URL",
      streamKeyKey: "STREAM555_DEST_X_STREAM_KEY",
      enabledKey: "STREAM555_DEST_X_ENABLED",
    },
  ],
  isStream555PrimaryPlugin: (pluginId: string) => pluginId === "stream555-control",
  buildStream555StatusSummary: (...args: unknown[]) =>
    mockBuildStream555StatusSummary(...args),
}));

vi.mock("../../src/components/PluginsView.js", () => ({
  paramsToSchema: () => ({ schema: null, hints: {} }),
}));

vi.mock("../../src/components/config-renderer.js", () => ({
  ConfigRenderer: () => React.createElement("div", null, "ConfigRenderer"),
  defaultRegistry: {},
}));

vi.mock("../../src/components/shared/configRenderMode.js", () => ({
  configRenderModeForTheme: () => "minimal",
}));

vi.mock("../../src/components/Stream555ChannelIcon.js", () => ({
  Stream555ChannelIcon: () => React.createElement("span", null, "ChannelIcon"),
}));

vi.mock("../../src/components/ui/Dialog.js", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? React.createElement("div", { role: "dialog" }, children) : null),
}));

vi.mock("../../src/components/ui/Button.js", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", props, children),
}));

vi.mock("../../src/components/ui/Badge.js", () => ({
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>
    React.createElement("span", props, children),
}));

vi.mock("../../src/components/ui/Card.js", () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", props, children),
}));

vi.mock("../../src/components/ui/Icons.js", () => ({
  BroadcastIcon: () => React.createElement("span", null, "Broadcast"),
  CameraIcon: () => React.createElement("span", null, "Camera"),
  CheckIcon: () => React.createElement("span", null, "Check"),
  ChevronLeftIcon: () => React.createElement("span", null, "Left"),
  ChevronRightIcon: () => React.createElement("span", null, "Right"),
  CloseIcon: () => React.createElement("span", null, "Close"),
  ConnectionIcon: () => React.createElement("span", null, "Connect"),
  PlayIcon: () => React.createElement("span", null, "Play"),
  SparkIcon: () => React.createElement("span", null, "Spark"),
  VideoIcon: () => React.createElement("span", null, "Video"),
}));

import { GoLiveModal } from "../../src/components/GoLiveModal.js";

function makeSummary(overrides?: Record<string, unknown>) {
  return {
    authState: "connected",
    authMode: "Wallet auth",
    authSource: "stream555",
    preferredChain: "solana",
    walletProvisionAllowed: true,
    hasSolanaWallet: true,
    hasEvmWallet: false,
    walletDetectionAvailable: true,
    destinations: [
      {
        id: "twitch",
        label: "Twitch",
        enabled: true,
        streamKeySet: true,
        streamKeySuffix: "1234",
        urlSet: true,
      },
      {
        id: "x",
        label: "X",
        enabled: true,
        streamKeySet: true,
        streamKeySuffix: "5678",
        urlSet: true,
      },
    ],
    savedDestinations: 2,
    enabledDestinations: 2,
    readyDestinations: 2,
    ...overrides,
  };
}

function makePlugin() {
  return {
    id: "stream555-control",
    name: "555 Stream",
    parameters: [],
    configUiHints: {},
  };
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
) {
  return root.find(
    (node) =>
      node.type === "button" &&
      node.children.some(
        (child) => typeof child === "string" && child.includes(label),
      ),
  );
}

describe("GoLiveModal", () => {
  it("opens in setup-required mode when stream auth or ready channels are missing", () => {
    mockBuildStream555StatusSummary.mockReturnValue(
      makeSummary({
        authState: "not_configured",
        readyDestinations: 0,
        enabledDestinations: 0,
        savedDestinations: 0,
        destinations: [],
      }),
    );
    mockUseApp.mockReturnValue({
      currentTheme: "milady-os",
      goLiveModalOpen: true,
      closeGoLiveModal: vi.fn(),
      launchGoLive: vi.fn(async () => ({ ok: true, tone: "success", message: "ok" })),
      plugins: [makePlugin()],
      loadPlugins: vi.fn(async () => {}),
      handlePluginConfigSave: vi.fn(async () => {}),
      pluginSaving: new Set<string>(),
    });

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
    });
    const text = JSON.stringify(tree.toJSON());

    expect(text).toContain("Setup Required");
    expect(text).toContain("Authenticate");
  });

  it("launches with selected channels and the default camera layout when already configured", async () => {
    const launchGoLive = vi.fn(async () => ({
      ok: true,
      tone: "success",
      message: "Launched",
    }));
    mockBuildStream555StatusSummary.mockReturnValue(makeSummary());
    mockUseApp.mockReturnValue({
      currentTheme: "milady-os",
      goLiveModalOpen: true,
      closeGoLiveModal: vi.fn(),
      launchGoLive,
      plugins: [makePlugin()],
      loadPlugins: vi.fn(async () => {}),
      handlePluginConfigSave: vi.fn(async () => {}),
      pluginSaving: new Set<string>(),
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
    });

    await act(async () => {
      findButtonByText(tree!.root, "Next").props.onClick();
    });
    await act(async () => {
      findButtonByText(tree!.root, "Review Launch").props.onClick();
    });
    await act(async () => {
      findButtonByText(tree!.root, "Go Live").props.onClick();
    });

    expect(launchGoLive).toHaveBeenCalledWith({
      channels: ["twitch", "x"],
      launchMode: "camera",
      layoutMode: "camera-full",
    });
  });
});
