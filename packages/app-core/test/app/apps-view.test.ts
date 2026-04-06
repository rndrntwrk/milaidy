// @vitest-environment jsdom

import type {
  AppLaunchResult,
  AppRunSummary,
  RegistryAppInfo,
} from "@miladyai/app-core/api";
import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findButtonByText,
  flush,
  text,
} from "../../../../test/helpers/react-test";

interface AppsContextStub {
  appRuns: AppRunSummary[];
  activeGameRunId: string;
  activeGameDisplayName: string;
  activeGameViewerUrl: string;
  appsSubTab: "browse" | "running" | "games";
  setState: (key: string, value: unknown) => void;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
}

const { mockClientFns, mockUseApp } = vi.hoisted(() => ({
  mockClientFns: {
    getCodingAgentStatus: vi.fn(async () => null),
    listApps: vi.fn(),
    listInstalledApps: vi.fn(),
    listAppRuns: vi.fn(),
    launchApp: vi.fn(),
    attachAppRun: vi.fn(),
    detachAppRun: vi.fn(),
    stopAppRun: vi.fn(),
    listHyperscapeEmbeddedAgents: vi.fn(),
    getHyperscapeAgentGoal: vi.fn(),
    getHyperscapeAgentQuickActions: vi.fn(),
    createHyperscapeEmbeddedAgent: vi.fn(),
    controlHyperscapeEmbeddedAgent: vi.fn(),
    sendHyperscapeAgentMessage: vi.fn(),
    sendHyperscapeEmbeddedAgentCommand: vi.fn(),
  },
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClientFns,
}));
vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import {
  AppsView,
  shouldShowAppInAppsView,
} from "../../src/components/pages/AppsView";

function createApp(
  name: string,
  displayName: string,
  description: string,
  overrides: Partial<RegistryAppInfo> = {},
): RegistryAppInfo {
  return {
    name,
    displayName,
    description,
    category: "app",
    launchType: "connect",
    launchUrl: `https://example.com/${displayName.toLowerCase()}`,
    icon: null,
    capabilities: ["observe"],
    stars: 1,
    repository: "https://github.com/example/repo",
    latestVersion: "1.0.0",
    supports: { v0: false, v1: false, v2: true },
    npm: {
      package: name,
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    ...overrides,
  };
}

function createLaunchResult(
  overrides?: Partial<AppLaunchResult>,
): AppLaunchResult {
  const viewer =
    overrides?.viewer === undefined
      ? {
          url: "https://example.com/viewer",
          postMessageAuth: false,
          sandbox: "allow-scripts",
        }
      : overrides.viewer;
  const session = overrides?.session ?? null;
  const run =
    overrides?.run ??
    createRunSummary({
      appName: "@elizaos/app-test",
      displayName: overrides?.displayName ?? "Test App",
      launchType: overrides?.launchType ?? "connect",
      launchUrl:
        overrides?.launchUrl === undefined
          ? "https://example.com/launch"
          : overrides.launchUrl,
      viewer,
      session,
      viewerAttachment: viewer ? "attached" : "unavailable",
      status: session?.status ?? (viewer ? "running" : "idle"),
      summary: session?.summary ?? (viewer ? "Viewer ready." : "Run active."),
    });
  return {
    pluginInstalled: true,
    needsRestart: false,
    displayName: "Test App",
    launchType: "connect",
    launchUrl: "https://example.com/launch",
    viewer,
    session,
    run,
    ...overrides,
  };
}

function createRunSummary(
  overrides: Partial<AppRunSummary> = {},
): AppRunSummary {
  return {
    runId: "run-1",
    appName: "@elizaos/app-test",
    displayName: "Test App",
    pluginName: "@elizaos/app-test",
    launchType: "connect",
    launchUrl: "https://example.com/launch",
    viewer: {
      url: "https://example.com/viewer",
      postMessageAuth: false,
      sandbox: "allow-scripts",
    },
    session: null,
    status: "running",
    summary: "Viewer ready.",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
    lastHeartbeatAt: "2026-04-06T00:00:00.000Z",
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: null,
    },
    ...overrides,
  };
}

function createAppsContext(
  overrides: Partial<AppsContextStub> = {},
): AppsContextStub {
  return {
    appRuns: [],
    activeGameRunId: "",
    activeGameDisplayName: "",
    activeGameViewerUrl: "",
    appsSubTab: "browse",
    setState: vi.fn<AppsContextStub["setState"]>(),
    setActionNotice: vi.fn<AppsContextStub["setActionNotice"]>(),
    ...overrides,
  };
}

function findButtonByTitle(
  root: TestRenderer.ReactTestInstance,
  title: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && node.props.title === title,
  );
  if (!matches[0]) {
    throw new Error(`Button titled "${title}" not found`);
  }
  return matches[0];
}

function findButtonContainingText(
  root: TestRenderer.ReactTestInstance,
  value: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && text(node).includes(value),
  );
  if (!matches[0]) {
    throw new Error(`Button containing "${value}" not found`);
  }
  return matches[0];
}

function _findTextareaByPlaceholder(
  root: TestRenderer.ReactTestInstance,
  placeholder: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) =>
      node.type === "textarea" && node.props.placeholder === placeholder,
  );
  if (!matches[0]) {
    throw new Error(`Textarea "${placeholder}" not found`);
  }
  return matches[0];
}

async function _waitFor(
  predicate: () => boolean,
  message: string,
  attempts = 20,
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(message);
}

describe("AppsView", () => {
  beforeEach(() => {
    // Prevent jsdom mock leakages between files
    delete (window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.spyOn(electrobunRpc, "getElectrobunRendererRpc").mockReturnValue(
      undefined,
    );
    mockClientFns.listApps.mockReset();
    mockClientFns.listInstalledApps.mockReset();
    mockClientFns.listAppRuns.mockReset();
    mockClientFns.launchApp.mockReset();
    mockClientFns.attachAppRun.mockReset();
    mockClientFns.detachAppRun.mockReset();
    mockClientFns.stopAppRun.mockReset();
    mockClientFns.listHyperscapeEmbeddedAgents.mockReset();
    mockClientFns.getHyperscapeAgentGoal.mockReset();
    mockClientFns.getHyperscapeAgentQuickActions.mockReset();
    mockClientFns.createHyperscapeEmbeddedAgent.mockReset();
    mockClientFns.controlHyperscapeEmbeddedAgent.mockReset();
    mockClientFns.sendHyperscapeAgentMessage.mockReset();
    mockClientFns.sendHyperscapeEmbeddedAgentCommand.mockReset();
    mockUseApp.mockReset();

    mockClientFns.listHyperscapeEmbeddedAgents.mockResolvedValue({
      success: true,
      agents: [],
      count: 0,
    });
    mockClientFns.getHyperscapeAgentGoal.mockResolvedValue({
      success: true,
      goal: null,
      availableGoals: [],
    });
    mockClientFns.getHyperscapeAgentQuickActions.mockResolvedValue({
      success: true,
      nearbyLocations: [],
      availableGoals: [],
      quickCommands: [],
      inventory: [],
      playerPosition: null,
    });
    mockClientFns.createHyperscapeEmbeddedAgent.mockResolvedValue({
      success: true,
      message: "created",
    });
    mockClientFns.controlHyperscapeEmbeddedAgent.mockResolvedValue({
      success: true,
      message: "ok",
    });
    mockClientFns.sendHyperscapeAgentMessage.mockResolvedValue({
      success: true,
      message: "sent",
    });
    mockClientFns.sendHyperscapeEmbeddedAgentCommand.mockResolvedValue({
      success: true,
      message: "command sent",
    });
    mockClientFns.listInstalledApps.mockResolvedValue([]);
    mockClientFns.listAppRuns.mockResolvedValue([]);
  });

  const tStub = (
    key: string,
    vars?: Record<string, string | number | boolean | null | undefined>,
  ) => {
    const name = typeof vars?.name === "string" ? vars.name : "App";
    const message =
      typeof vars?.message === "string" ? vars.message : "unknown error";
    const count = typeof vars?.count === "number" ? vars.count : 0;

    switch (key) {
      case "appsview.IframeAuthMissing":
        return `${name} requires iframe auth, but no auth payload was returned.`;
      case "appsview.OpenedInNewTab":
        return `${name} opened in a new tab.`;
      case "appsview.PopupBlockedOpen":
        return `Popup blocked while opening ${name}. Allow popups and try again.`;
      case "appsview.LaunchFailed":
        return `Failed to launch ${name}: ${message}`;
      case "appsview.Open":
        return `Open ${name}`;
      case "appsview.Search":
      case "appsview.SearchPlaceholder":
        return "Search apps";
      case "appsview.HelperText":
        return "Browse installed and available apps.";
      case "appsview.Results":
        return `${count} results`;
      case "appsview.NoAppsMatchSearch":
        return "No apps match your search.";
      case "appsview.NoAppsAvailable":
        return "No apps available.";
      case "appsview.EmptySearchHint":
        return "Try a different search.";
      case "appsview.EmptyCatalogHint":
        return "Refresh the catalog.";
      case "appsview.GameRunning":
        return "Game running";
      case "appsview.Resume":
        return "Resume";
      case "appsview.LoadError":
        return `Failed to load apps: ${message}`;
      case "appsview.NetworkError":
        return "Network error";
      case "appsview.CurrentGameOpened":
        return "Current game opened in a new tab.";
      case "appsview.PopupBlocked":
        return "Popup blocked. Allow popups and try again.";
      case "appsview.LaunchedNoViewer":
        return `${name} launched without a viewer URL.`;
      case "appsview.EmptyStateTitle":
        return "Select an app to view details";
      case "appsview.EmptyStateDescription":
        return "Choose an app from the catalog.";
      case "common.error":
        return "Error";
      default:
        return key;
    }
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.restoreAllMocks();
  });

  it("uses an exact curated app allowlist in production", () => {
    expect(
      shouldShowAppInAppsView(
        createApp("@elizaos/app-hyperscape", "Hyperscape", "Game"),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        createApp("@elizaos/app-2004scape", "2004scape", "Game"),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        createApp(
          "@elizaos/app-defense-of-the-agents",
          "Defense of the Agents",
          "Game",
        ),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        createApp("@elizaos/app-dungeons", "Dungeons", "Game"),
        true,
      ),
    ).toBe(false);
  });

  it("does not restrict the apps list by production allowlist in development", () => {
    expect(
      shouldShowAppInAppsView(
        createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena"),
        false,
      ),
    ).toBe(true);
  });

  it("loads apps and launches iframe viewer flow", async () => {
    const ctx = createAppsContext();
    const t = (k: string) => {
      if (k === "appsview.Active") return "Active";
      if (k === "appsview.Back") return "Back";
      if (k === "appsview.Refresh") return "Refresh";
      if (k === "appsview.ActiveOnly") return "Active Only";
      if (k === "appsview.SaySomethingToSel")
        return "Say something to selected agent...";
      return k;
    };
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t,
    });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena", {
      uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
    });
    const run = createRunSummary({
      runId: "run-hyperscape",
      appName: app.name,
      displayName: app.displayName,
      pluginName: app.name,
      launchUrl: "http://localhost:5175",
      viewer: {
        url: "http://localhost:5175",
        sandbox: "allow-scripts allow-same-origin",
        postMessageAuth: true,
        authMessage: { type: "HYPERSCAPE_AUTH", authToken: "token-1" },
      },
      session: {
        sessionId: "agent-123",
        appName: app.name,
        mode: "spectate-and-steer",
        status: "connecting",
        canSendCommands: true,
        controls: ["pause"],
        summary: "Connecting session...",
      },
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        viewer: run.viewer,
        session: run.session,
        run,
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    const launchButton = findButtonByText(tree?.root, "appsview.Launch");
    await act(async () => {
      await launchButton.props.onClick();
    });

    expect(mockClientFns.launchApp).toHaveBeenCalledWith(app.name);
    expect(ctx.setState).toHaveBeenCalledWith(
      "appRuns",
      expect.arrayContaining([
        expect.objectContaining({
          runId: "run-hyperscape",
          appName: app.name,
          displayName: app.displayName,
        }),
      ]),
    );
    expect(ctx.setState).toHaveBeenCalledWith(
      "activeGameRunId",
      "run-hyperscape",
    );
    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "games");
    expect(
      ctx.setActionNotice.mock.calls.some((call) =>
        String(call[0]).includes("requires iframe auth"),
      ),
    ).toBe(false);
  });

  it("shows auth warning when postMessage auth payload is missing", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena", {
      uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
    });
    const run = createRunSummary({
      runId: "run-auth-missing",
      appName: app.name,
      displayName: app.displayName,
      pluginName: app.name,
      launchUrl: "http://localhost:5175",
      viewer: {
        url: "http://localhost:5175",
        sandbox: "allow-scripts allow-same-origin",
        postMessageAuth: true,
      },
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        viewer: run.viewer,
        run,
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });

    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      expect.stringContaining("requires iframe auth"),
      "error",
      4800,
    );
    expect(ctx.setState).toHaveBeenCalledWith("activeGameRunId", run.runId);
    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "games");
  });

  it("opens non-viewer launches in a new tab and keeps the run in the running list", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    const run = createRunSummary({
      runId: "run-babylon",
      appName: app.name,
      displayName: app.displayName,
      pluginName: app.name,
      launchUrl: "https://example.com/babylon",
      viewer: null,
      viewerAttachment: "unavailable",
      status: "running",
      summary: "Babylon run active.",
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        launchUrl: "https://example.com/babylon",
        viewer: null,
        run,
      }),
    );

    const popupSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });

    expect(popupSpy).toHaveBeenCalledWith(
      "https://example.com/babylon",
      "_blank",
      "noopener,noreferrer",
    );
    expect(ctx.setState).toHaveBeenCalledWith(
      "appRuns",
      expect.arrayContaining([
        expect.objectContaining({
          runId: "run-babylon",
          appName: app.name,
        }),
      ]),
    );
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "running");
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );
  });

  it("reports popup-blocked errors and launch failures", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp
      .mockResolvedValueOnce(
        createLaunchResult({
          displayName: app.displayName,
          launchUrl: "https://example.com/babylon",
          viewer: null,
        }),
      )
      .mockRejectedValueOnce(new Error("network down"));

    vi.spyOn(window, "open").mockReturnValue(null);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Failed to launch Babylon: network down",
      "error",
      4000,
    );
  });

  it("uses the Electrobun shell bridge for external app launches", async () => {
    const ctx = createAppsContext();
    const request = vi.fn(async () => undefined);
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        launchUrl: "https://example.com/babylon",
        viewer: null,
      }),
    );
    (
      window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__ = {
      request: { desktopOpenExternal: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };
    const popupSpy = vi.spyOn(window, "open");

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });

    expect(request).toHaveBeenCalledWith({
      url: "https://example.com/babylon",
    });
    expect(popupSpy).not.toHaveBeenCalled();
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );
    delete (window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    delete (
      globalThis as typeof globalThis & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__;
  });

  it("refreshes list and applies search filtering", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const appOne = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    const appTwo = createApp("@elizaos/app-babylon", "Babylon", "Wallet");
    mockClientFns.listApps.mockResolvedValue([appOne, appTwo]);
    mockClientFns.listAppRuns.mockResolvedValue([
      createRunSummary({
        runId: "run-hyperscape",
        appName: appOne.name,
        displayName: appOne.displayName,
        pluginName: appOne.name,
      }),
    ]);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    const root = tree?.root;
    expect(
      root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Open Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      root.findAll(
        (node) => node.type === "button" && node.props.title === "Open Babylon",
      ).length,
    ).toBe(1);
    expect(
      root.findAll((node) => text(node) === "appsview.Active").length,
    ).toBeGreaterThanOrEqual(1);

    const searchInput = root.findByType("input");
    await act(async () => {
      searchInput.props.onChange({ target: { value: "hyper" } });
    });
    expect(
      root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Open Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      root.findAll(
        (node) => node.type === "button" && node.props.title === "Open Babylon",
      ).length,
    ).toBe(0);

    await act(async () => {
      await findButtonByText(root, "common.refresh").props.onClick();
    });
    expect(mockClientFns.listApps).toHaveBeenCalledTimes(2);

    await act(async () => {
      searchInput.props.onChange({ target: { value: "" } });
    });
    await act(async () => {
      await findButtonByText(root, "appsview.ActiveOnly").props.onClick();
    });
    expect(
      root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Open Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      root.findAll(
        (node) => node.type === "button" && node.props.title === "Open Babylon",
      ).length,
    ).toBe(0);
  });

  it("opens detail pane for app with unregistered uiExtension without crashing", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena", {
      uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
    });
    mockClientFns.listApps.mockResolvedValue([app]);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree?.root, "Open Hyperscape").props.onClick();
    });
    await flush();

    // The detail pane should render with a Back button and app name
    expect(
      tree?.root.findAll((node) => text(node).includes("appsview.Back")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree?.root.findAll((node) => text(node) === "Hyperscape").length,
    ).toBeGreaterThan(0);

    // The extension panel ID is not registered, so no extension UI should render.
    // Hyperscape API calls should NOT be made when the extension is absent.
    expect(mockClientFns.listHyperscapeEmbeddedAgents).not.toHaveBeenCalled();
  });

  it("applies the selected launcher tile treatment after opening an app", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.listAppRuns.mockResolvedValue([
      createRunSummary({
        runId: "run-hyperscape",
        appName: app.name,
        displayName: app.displayName,
        pluginName: app.name,
      }),
    ]);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree?.root, "Open Hyperscape").props.onClick();
    });

    const selectedButton = findButtonByTitle(tree?.root, "Open Hyperscape");
    expect(selectedButton.props.className).toContain("rounded-2xl");
    expect(selectedButton.props.className).toContain("border-accent/35");
    expect(selectedButton.props.className).toContain("bg-accent/10");
  });

  it("opens app details and can return to the app list", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const appOne = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    const appTwo = createApp("@elizaos/app-babylon", "Babylon", "Wallet");
    mockClientFns.listApps.mockResolvedValue([appOne, appTwo]);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree?.root, "Open Babylon").props.onClick();
    });
    expect(
      tree?.root.findAll((node) => text(node).includes("appsview.Back")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree?.root.findAll((node) => text(node) === "Babylon").length,
    ).toBeGreaterThan(0);

    await act(async () => {
      findButtonContainingText(tree?.root, "appsview.Back").props.onClick();
    });
    expect(
      tree?.root.findAll(
        (node) => text(node) === "Select an app to view details",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree?.root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Open Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      tree?.root.findAll(
        (node) => node.type === "button" && node.props.title === "Open Babylon",
      ).length,
    ).toBe(1);
  });
});
