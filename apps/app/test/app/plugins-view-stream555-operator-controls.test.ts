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

type PluginParam = {
  key: string;
  type: "string";
  description?: string;
  required?: boolean;
  sensitive?: boolean;
  default?: string | null;
  currentValue?: string | null;
  isSet?: boolean;
};

function createStreamPlugin(params: PluginParam[]) {
  return {
    id: "stream555-control",
    name: "555 stream",
    description: "Primary 555 stream control plugin",
    enabled: true,
    configured: false,
    envKey: null,
    category: "feature" as const,
    source: "bundled" as const,
    parameters: params.map((param) => ({
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
      ...param,
    })),
    validationErrors: [],
    validationWarnings: [],
  };
}

function createContext(params: PluginParam[]) {
  return {
    plugins: [createStreamPlugin(params)],
    pluginStatusFilter: "all" as const,
    pluginSearch: "",
    pluginSettingsOpen: new Set<string>(["stream555-control"]),
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

describe("Stream555 operator controls", () => {
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

  it("hides readonly control-plane URL and locks auth button when connected", async () => {
    mockUseApp.mockReturnValue(
      createContext([
        {
          key: "STREAM555_PUBLIC_BASE_URL",
          type: "string",
          currentValue: "https://stream.rndrntwrk.com",
          isSet: true,
        },
        {
          key: "STREAM555_AGENT_TOKEN",
          type: "string",
          currentValue: "********",
          isSet: true,
          sensitive: true,
        },
        {
          key: "STREAM555_WALLET_AUTH_PREFERRED_CHAIN",
          type: "string",
          currentValue: "solana",
          isSet: true,
        },
        {
          key: "STREAM555_WALLET_AUTH_ALLOW_PROVISION",
          type: "string",
          currentValue: "true",
          isSet: true,
        },
      ]),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    const authenticatedButton = findButtonByText(tree!.root, "Authenticated");
    const disconnectButton = findButtonByText(tree!.root, "Disconnect Auth");

    expect(authenticatedButton.props.disabled).toBe(true);
    expect(disconnectButton.props.disabled).toBe(false);
    expect(
      tree!.root.findAll(
        (node) =>
          node.children.some(
            (child) =>
              typeof child === "string" && child.includes("Control Plane URL"),
          ),
      ).length,
    ).toBe(0);
  });

  it("opens wallet modal when solana wallet is missing", async () => {
    mockUseApp.mockReturnValue(
      createContext([
        {
          key: "STREAM555_WALLET_AUTH_PREFERRED_CHAIN",
          type: "string",
          currentValue: "solana",
          isSet: true,
        },
        {
          key: "STREAM555_WALLET_AUTH_ALLOW_PROVISION",
          type: "string",
          currentValue: "true",
          isSet: true,
        },
        {
          key: "SOLANA_PRIVATE_KEY",
          type: "string",
          sensitive: true,
          isSet: false,
          currentValue: null,
        },
      ]),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    const authButton = findButtonByText(tree!.root, "Authenticate Wallet");
    await act(async () => {
      authButton.props.onClick();
    });

    expect(
      tree!.root.findAll(
        (node) =>
          node.children.some(
            (child) =>
              typeof child === "string" &&
              child.includes("Solana wallet required"),
          ),
      ).length,
    ).toBeGreaterThan(0);
    expect(mockExecuteAutonomyPlan).not.toHaveBeenCalled();
  });

  it("syncs destinations after saving RTMP destination config", async () => {
    mockUseApp.mockReturnValue(
      createContext([
        {
          key: "STREAM555_DEST_X_ENABLED",
          type: "string",
          isSet: true,
          currentValue: "true",
        },
        {
          key: "STREAM555_DEST_X_RTMP_URL",
          type: "string",
          isSet: false,
          currentValue: null,
        },
      ]),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    const input = tree!.root.find(
      (node) =>
        node.type === "input" &&
        node.props["data-config-key"] === "STREAM555_DEST_X_RTMP_URL",
    );

    await act(async () => {
      input.props.onChange({ target: { value: "rtmps://example/x" } });
    });

    const saveButton = findButtonByText(tree!.root, "Save Settings");
    await act(async () => {
      await saveButton.props.onClick();
    });

    expect(mockHandlePluginConfigSave).toHaveBeenCalled();
    expect(mockExecuteAutonomyPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              toolName: "STREAM555_DESTINATIONS_APPLY",
            }),
          ]),
        }),
      }),
    );
  });

  it("hides destination URL/key fields when destination is disabled", async () => {
    mockUseApp.mockReturnValue(
      createContext([
        {
          key: "STREAM555_DEST_KICK_ENABLED",
          type: "string",
          isSet: true,
          currentValue: "false",
        },
        {
          key: "STREAM555_DEST_KICK_RTMP_URL",
          type: "string",
          isSet: false,
          currentValue: null,
        },
      ]),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    expect(
      tree!.root.findAll(
        (node) =>
          node.type === "input" &&
          node.props["data-config-key"] === "STREAM555_DEST_KICK_RTMP_URL",
      ).length,
    ).toBe(0);
  });

  it("auto-enables destination section when a stream key is already saved", async () => {
    mockUseApp.mockReturnValue(
      createContext([
        {
          key: "STREAM555_DEST_TWITCH_ENABLED",
          type: "string",
          isSet: false,
          currentValue: null,
        },
        {
          key: "STREAM555_DEST_TWITCH_STREAM_KEY",
          type: "string",
          sensitive: true,
          isSet: true,
          currentValue: null,
        },
        {
          key: "STREAM555_DEST_TWITCH_RTMP_URL",
          type: "string",
          isSet: false,
          currentValue: null,
        },
      ]),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    expect(
      tree!.root.findAll(
        (node) =>
          node.type === "input" &&
          node.props["data-config-key"] === "STREAM555_DEST_TWITCH_RTMP_URL",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("shows all destination toggles inside collapsible Destinations group", async () => {
    mockUseApp.mockReturnValue(
      createContext([
        { key: "STREAM555_DEST_PUMPFUN_ENABLED", type: "string", currentValue: "true", isSet: true },
        { key: "STREAM555_DEST_X_ENABLED", type: "string", currentValue: "false", isSet: true },
        { key: "STREAM555_DEST_TWITCH_ENABLED", type: "string", currentValue: "true", isSet: true },
        { key: "STREAM555_DEST_KICK_ENABLED", type: "string", currentValue: "true", isSet: true },
        { key: "STREAM555_DEST_YOUTUBE_ENABLED", type: "string", currentValue: "false", isSet: true },
        { key: "STREAM555_DEST_FACEBOOK_ENABLED", type: "string", currentValue: "false", isSet: true },
        { key: "STREAM555_DEST_CUSTOM_ENABLED", type: "string", currentValue: "false", isSet: true },
      ]),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    const destinationsToggleKeys = [
      "STREAM555_DEST_PUMPFUN_ENABLED",
      "STREAM555_DEST_X_ENABLED",
      "STREAM555_DEST_TWITCH_ENABLED",
      "STREAM555_DEST_KICK_ENABLED",
      "STREAM555_DEST_YOUTUBE_ENABLED",
      "STREAM555_DEST_FACEBOOK_ENABLED",
      "STREAM555_DEST_CUSTOM_ENABLED",
    ];

    for (const key of destinationsToggleKeys) {
      expect(
        tree!.root.findAll(
          (node) =>
            node.type === "button" && node.props["data-config-key"] === key,
        ).length,
      ).toBe(1);
    }

    const destinationsHeader = tree!.root.find(
      (node) =>
        node.type === "button" && node.props["aria-expanded"] === true,
    );

    await act(async () => {
      destinationsHeader.props.onClick();
    });

    const collapsedDestinationsHeader = tree!.root.find(
      (node) =>
        node.type === "button" && node.props["aria-expanded"] === false,
    );
    expect(collapsedDestinationsHeader.props["aria-expanded"]).toBe(false);
    expect(
      tree!.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["data-config-key"] === "STREAM555_DEST_X_ENABLED",
      ).length,
    ).toBe(0);
  });
});
