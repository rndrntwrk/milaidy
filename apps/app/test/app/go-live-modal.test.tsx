// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../src/stream555Readiness.js", () => ({
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
    {
      id: "custom",
      label: "Custom",
      urlKey: "STREAM555_DEST_CUSTOM_RTMP_URL",
      streamKeyKey: "STREAM555_DEST_CUSTOM_STREAM_KEY",
      enabledKey: "STREAM555_DEST_CUSTOM_ENABLED",
    },
    {
      id: "kick",
      label: "Kick",
      urlKey: "STREAM555_DEST_KICK_RTMP_URL",
      streamKeyKey: "STREAM555_DEST_KICK_STREAM_KEY",
      enabledKey: "STREAM555_DEST_KICK_ENABLED",
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

vi.mock("../../src/components/SelectablePillGrid.js", () => ({
  SelectablePillGrid: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) =>
    React.createElement(
      "div",
      null,
      options.map((option) =>
        React.createElement(
          "button",
          {
            key: option.value,
            type: "button",
            "aria-pressed": value === option.value,
            onClick: () => onChange(option.value),
          },
          option.label,
        ),
      ),
    ),
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

vi.mock("../../src/components/ui/ScrollArea.js", () => ({
  ScrollArea: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) =>
    React.createElement("div", props, children),
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

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    authState: "connected",
    authMode: "API key/token",
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
        urlReady: true,
        readinessState: "ready",
      },
      {
        id: "x",
        label: "X",
        enabled: true,
        streamKeySet: false,
        streamKeySuffix: null,
        urlSet: true,
        urlReady: true,
        readinessState: "missing-stream-key",
      },
      {
        id: "custom",
        label: "Custom",
        enabled: true,
        streamKeySet: true,
        streamKeySuffix: "9999",
        urlSet: false,
        urlReady: false,
        readinessState: "missing-url",
      },
      {
        id: "kick",
        label: "Kick",
        enabled: false,
        streamKeySet: false,
        streamKeySuffix: null,
        urlSet: false,
        urlReady: false,
        readinessState: "disabled",
      },
    ],
    savedDestinations: 2,
    enabledDestinations: 3,
    readyDestinations: 1,
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

function collectNodeText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((entry) => collectNodeText(entry)).join("");
  }
  if (
    node &&
    typeof node === "object" &&
    "children" in node &&
    Array.isArray((node as { children?: unknown[] }).children)
  ) {
    return collectNodeText((node as { children: unknown[] }).children);
  }
  return "";
}

function findAllButtonsByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance[] {
  return root.findAll(
    (node) =>
      node.type === "button" &&
      collectNodeText(node.children).includes(label),
  );
}

function findButtonByText(root: TestRenderer.ReactTestInstance, label: string) {
  const matches = findAllButtonsByText(root, label);
  if (matches.length === 0) {
    throw new Error(`No button found for label: ${label}`);
  }
  return matches[0];
}

function expectText(root: TestRenderer.ReactTestInstance, text: string) {
  expect(
    root.findAll((node) => collectNodeText(node.children).includes(text)).length,
  ).toBeGreaterThan(0);
}

async function clickButton(button: TestRenderer.ReactTestInstance) {
  await act(async () => {
    button.props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function makeAppContext(overrides: Record<string, unknown> = {}) {
  return {
    currentTheme: "milady-os",
    goLiveModalOpen: true,
    closeGoLiveModal: vi.fn(),
    goLiveInlineNotice: null,
    dismissGoLiveInlineNotice: vi.fn(),
    launchGoLive: vi.fn(async () => ({
      state: "success",
      tone: "success",
      message: "ok",
    })),
    plugins: [makePlugin()],
    loadPlugins: vi.fn(async () => {}),
    handlePluginConfigSave: vi.fn(async () => {}),
    pluginSaving: new Set<string>(),
    ...overrides,
  };
}

describe("GoLiveModal", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockBuildStream555StatusSummary.mockReset();
    mockGetPlugins.mockReset();
  });

  it("refreshes plugins on open when stream555 state is not loaded yet", async () => {
    const app = makeAppContext({
      plugins: [],
    });
    mockBuildStream555StatusSummary.mockImplementation(() =>
      makeSummary({
        authState: "wallet_enabled",
        authMode: "Wallet auth",
        readyDestinations: 0,
        enabledDestinations: 0,
        destinations: [],
      }),
    );
    mockUseApp.mockReturnValue(app);

    await act(async () => {
      TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(app.loadPlugins).toHaveBeenCalledTimes(1);
  });

  it("keeps setup gating in place until auth and ready destinations exist", async () => {
    const summary = makeSummary({
      authState: "wallet_enabled",
      authMode: "Wallet auth",
      readyDestinations: 0,
      enabledDestinations: 0,
      destinations: [],
    });
    const app = makeAppContext();
    mockBuildStream555StatusSummary.mockImplementation(() => summary);
    mockGetPlugins.mockResolvedValue({
      plugins: [makePlugin()],
    });
    mockUseApp.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
    });

    expectText(tree.root, "Setup Required");
    expect(findAllButtonsByText(tree.root, "Next")).toHaveLength(0);

    await clickButton(findButtonByText(tree.root, "Continue"));

    expectText(
      tree.root,
      "Authenticate and enable at least one ready destination before continuing.",
    );
    expect(app.loadPlugins).toHaveBeenCalled();
  });

  it("shows readiness reasons and disables unready channels", async () => {
    mockBuildStream555StatusSummary.mockImplementation(() => makeSummary());
    mockUseApp.mockReturnValue(makeAppContext());

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
    });

    const twitchButton = findButtonByText(tree.root, "Twitch");
    const xButton = findButtonByText(tree.root, "X");
    const customButton = findButtonByText(tree.root, "Custom");
    const kickButton = findButtonByText(tree.root, "Kick");

    expect(twitchButton.props.disabled).toBe(false);
    expect(xButton.props.disabled).toBe(true);
    expect(customButton.props.disabled).toBe(true);
    expect(kickButton.props.disabled).toBe(true);

    expectText(tree.root, "Ready for this launch");
    expectText(tree.root, "Enabled but missing stream key");
    expectText(tree.root, "Enabled but missing RTMP URL");
    expectText(tree.root, "Not enabled for launch");
  });

  it("launches with the selected ready channels and default camera layout", async () => {
    const app = makeAppContext();
    mockBuildStream555StatusSummary.mockImplementation(() => makeSummary());
    mockUseApp.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
    });

    await clickButton(findButtonByText(tree.root, "Next"));
    await clickButton(findButtonByText(tree.root, "Review Launch"));
    await clickButton(findButtonByText(tree.root, "Go Live"));

    expect(app.launchGoLive).toHaveBeenCalledWith({
      channels: ["twitch"],
      launchMode: "camera",
      layoutMode: "camera-full",
    });
    expect(app.closeGoLiveModal).toHaveBeenCalledTimes(1);
  });

  it("renders a four-step progress header and five self-contained launch mode cards", async () => {
    mockBuildStream555StatusSummary.mockImplementation(() => makeSummary());
    mockUseApp.mockReturnValue(makeAppContext());

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
    });

    await clickButton(findButtonByText(tree.root, "Next"));

    expect(
      tree.root.findAll((node) => node.props["data-go-live-step"]).length,
    ).toBe(4);
    expect(
      tree.root.findAll((node) => node.props["data-go-live-mode-card"]).length,
    ).toBe(5);
    expect(
      tree.root.findAll((node) =>
        collectNodeText(node.children).includes("Alice stays camera-full"),
      ),
    ).toHaveLength(0);

    const playGamesCard = tree.root.find(
      (node) => node.props["data-go-live-mode-card"] === "play-games",
    );
    expect(playGamesCard.props["data-selected"]).toBe("false");

    await clickButton(playGamesCard);

    const selectedPlayGamesCard = tree.root.find(
      (node) => node.props["data-go-live-mode-card"] === "play-games",
    );
    expect(selectedPlayGamesCard.props["data-selected"]).toBe("true");
    expectText(tree.root, "Gameplay routed to the hero frame");
  });

  it("uses temporary channel subsets without mutating saved stream plugin config", async () => {
    const app = makeAppContext();
    mockBuildStream555StatusSummary.mockImplementation(() =>
      makeSummary({
        destinations: [
          {
            id: "twitch",
            label: "Twitch",
            enabled: true,
            streamKeySet: true,
            streamKeySuffix: "1234",
            urlSet: true,
            urlReady: true,
            readinessState: "ready",
          },
          {
            id: "x",
            label: "X",
            enabled: true,
            streamKeySet: true,
            streamKeySuffix: "5555",
            urlSet: true,
            urlReady: true,
            readinessState: "ready",
          },
          {
            id: "custom",
            label: "Custom",
            enabled: true,
            streamKeySet: true,
            streamKeySuffix: "9999",
            urlSet: false,
            urlReady: false,
            readinessState: "missing-url",
          },
          {
            id: "kick",
            label: "Kick",
            enabled: false,
            streamKeySet: false,
            streamKeySuffix: null,
            urlSet: false,
            urlReady: false,
            readinessState: "disabled",
          },
        ],
        savedDestinations: 2,
        enabledDestinations: 3,
        readyDestinations: 2,
      }),
    );
    mockUseApp.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
    });

    await clickButton(findButtonByText(tree.root, "X"));
    await clickButton(findButtonByText(tree.root, "Next"));
    await clickButton(findButtonByText(tree.root, "Review Launch"));
    await clickButton(findButtonByText(tree.root, "Go Live"));

    expect(app.launchGoLive).toHaveBeenCalledWith({
      channels: ["twitch"],
      launchMode: "camera",
      layoutMode: "camera-full",
    });
    expect(app.handlePluginConfigSave).not.toHaveBeenCalled();
    expect(app.closeGoLiveModal).toHaveBeenCalledTimes(1);
  });

  it("keeps partial launch results inline so follow-up stays visible", async () => {
    const app = makeAppContext({
      launchGoLive: vi.fn(async () => ({
        state: "partial",
        tone: "warning",
        message: "Game launched, but stream attach failed.",
        followUp: {
          target: "action-log",
          label: "Attach game stream",
          detail: "Attach the selected game stream in the action log.",
        },
      })),
    });
    mockBuildStream555StatusSummary.mockImplementation(() => makeSummary());
    mockUseApp.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
    });

    await clickButton(findButtonByText(tree.root, "Next"));
    await clickButton(findButtonByText(tree.root, "Play Games"));
    await clickButton(findButtonByText(tree.root, "Review Launch"));
    await clickButton(findButtonByText(tree.root, "Go Live"));

    expect(app.closeGoLiveModal).not.toHaveBeenCalled();
    expectText(tree.root, "Partial launch");
    expectText(tree.root, "Game launched, but stream attach failed.");
    expectText(tree.root, "Attach game stream");
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "div" &&
          node.props["data-go-live-result-state"] === "partial",
      ),
    ).not.toHaveLength(0);
  });

  it("keeps the modal open for blocked launch results", async () => {
    const app = makeAppContext({
      goLiveInlineNotice: {
        state: "blocked",
        tone: "warning",
        message: "Selected channels are no longer ready: X (missing stream key).",
      },
      launchGoLive: vi.fn(async () => ({
        state: "blocked",
        tone: "warning",
        message: "Selected channels are no longer ready: X (missing stream key).",
        followUp: {
          target: "action-log",
          label: "Refresh channels",
          detail: "Re-open channel selection and pick a ready destination.",
        },
      })),
    });
    mockBuildStream555StatusSummary.mockImplementation(() => makeSummary());
    mockUseApp.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
    });

    await clickButton(findButtonByText(tree.root, "Next"));
    await clickButton(findButtonByText(tree.root, "Review Launch"));
    await clickButton(findButtonByText(tree.root, "Go Live"));

    expect(app.closeGoLiveModal).not.toHaveBeenCalled();
    expectText(
      tree.root,
      "Selected channels are no longer ready: X (missing stream key).",
    );
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "div" &&
          node.props["data-go-live-result-state"] === "blocked",
      ),
    ).not.toHaveLength(0);
  });

  it("keeps the modal open for failed launch results", async () => {
    const app = makeAppContext({
      goLiveInlineNotice: {
        state: "failed",
        tone: "error",
        message: "Reaction launch failed: reaction override did not succeed",
      },
      launchGoLive: vi.fn(async () => ({
        state: "failed",
        tone: "error",
        message: "Reaction launch failed: reaction override did not succeed",
      })),
    });
    mockBuildStream555StatusSummary.mockImplementation(() => makeSummary());
    mockUseApp.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GoLiveModal));
      await Promise.resolve();
    });

    await clickButton(findButtonByText(tree.root, "Next"));
    await clickButton(findButtonByText(tree.root, "Reaction"));
    await clickButton(findButtonByText(tree.root, "Review Launch"));
    await clickButton(findButtonByText(tree.root, "Go Live"));

    expect(app.closeGoLiveModal).not.toHaveBeenCalled();
    expectText(tree.root, "Reaction launch failed: reaction override did not succeed");
    expect(
      tree.root.findAll(
        (node) => node.props["data-go-live-result-state"] === "failed",
      ),
    ).not.toHaveLength(0);
  });
});
