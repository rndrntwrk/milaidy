// @vitest-environment jsdom

import type {
  AppRunSummary,
  AppSessionState,
  AppViewerAuthMessage,
} from "@miladyai/app-core/api";
import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findButtonByText, flush } from "../../../../test/helpers/react-test";

interface GameContextStub {
  t: (key: string, opts?: Record<string, unknown>) => string;
  appRuns: AppRunSummary[];
  activeGameRunId: string;
  activeGameApp: string;
  activeGameDisplayName: string;
  activeGameViewerUrl: string;
  activeGameSandbox: string;
  activeGamePostMessageAuth: boolean;
  activeGamePostMessagePayload: AppViewerAuthMessage | null;
  activeGameSession: AppSessionState | null;
  gameOverlayEnabled: boolean;
  plugins: { id: string; enabled: boolean }[];
  logs: unknown[];
  loadLogs: () => Promise<void>;
  setState: (key: string, value: unknown) => void;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
}

type TestWindow = Window & {
  __electrobunWindowId?: number;
};

const { mockClientFns, mockUseApp } = vi.hoisted(() => ({
  mockClientFns: {
    getCodingAgentStatus: vi.fn(async () => null),
    getAppSessionState: vi.fn(async () => null),
    sendAppSessionMessage: vi.fn(),
    controlAppSession: vi.fn(),
    sendChatRest: vi.fn(),
    stopAppRun: vi.fn(),
  },
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClientFns,
}));
vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import { GameView } from "../../src/components/apps/GameView";

function createRunSummary(
  overrides: Partial<AppRunSummary> = {},
): AppRunSummary {
  return {
    runId: "run-1",
    appName: "@elizaos/app-2004scape",
    displayName: "2004scape",
    pluginName: "@elizaos/app-2004scape",
    launchType: "connect",
    launchUrl: "http://localhost:5175/viewer",
    viewer: {
      url: "http://localhost:5175/viewer",
      sandbox: "allow-scripts allow-same-origin",
      postMessageAuth: false,
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

function createContext(overrides?: Partial<GameContextStub>): GameContextStub {
  const run = createRunSummary({
    viewer:
      overrides?.activeGameViewerUrl === ""
        ? null
        : {
            url:
              overrides?.activeGameViewerUrl ?? "http://localhost:5175/viewer",
            sandbox:
              overrides?.activeGameSandbox ?? "allow-scripts allow-same-origin",
            postMessageAuth: overrides?.activeGamePostMessageAuth ?? false,
            authMessage: overrides?.activeGamePostMessagePayload ?? undefined,
          },
    session: overrides?.activeGameSession ?? null,
  });
  return {
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.defaultValue && typeof opts.defaultValue === "string") {
        let str = opts.defaultValue;
        for (const [key, val] of Object.entries(opts)) {
          if (key !== "defaultValue")
            str = str.replace(`{{${key}}}`, String(val));
        }
        return str;
      }
      return k;
    },
    appRuns: [run],
    activeGameRunId: run.runId,
    activeGameApp: "@elizaos/app-2004scape",
    activeGameDisplayName: "2004scape",
    activeGameViewerUrl: "http://localhost:5175/viewer",
    activeGameSandbox: "allow-scripts allow-same-origin",
    activeGamePostMessageAuth: false,
    activeGamePostMessagePayload: null,
    activeGameSession: null,
    gameOverlayEnabled: false,
    plugins: [],
    logs: [],
    loadLogs: vi.fn(async () => {}),
    setState: vi.fn<GameContextStub["setState"]>(),
    setActionNotice: vi.fn<GameContextStub["setActionNotice"]>(),
    ...overrides,
  };
}

describe("GameView", () => {
  beforeEach(() => {
    delete (window as TestWindow & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.spyOn(electrobunRpc, "getElectrobunRendererRpc").mockReturnValue(
      undefined,
    );
    mockClientFns.stopAppRun.mockReset();
    mockClientFns.getAppSessionState.mockReset();
    mockClientFns.sendAppSessionMessage.mockReset();
    mockClientFns.controlAppSession.mockReset();
    mockClientFns.sendChatRest.mockReset();
    mockUseApp.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as TestWindow).__electrobunWindowId;
    delete (window as TestWindow & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.restoreAllMocks();
  });

  it("renders empty state and Back to Apps returns to apps tab", async () => {
    const ctx = createContext({
      appRuns: [],
      activeGameRunId: "",
      activeGameApp: "",
      activeGameDisplayName: "",
      activeGameViewerUrl: "",
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      findButtonByText(tree?.root, "game.backToApps").props.onClick();
    });

    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
  });

  it("opens viewer in a new tab and handles popup blocking", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.openInNewTab").props.onClick();
    });

    expect(openSpy).toHaveBeenCalledWith(
      ctx.activeGameViewerUrl,
      "_blank",
      "noopener,noreferrer",
    );
    expect(ctx.setActionNotice).not.toHaveBeenCalledWith(
      "Popup blocked. Allow popups and try again.",
      "error",
      3600,
    );

    openSpy.mockReturnValueOnce(null);
    await act(async () => {
      await findButtonByText(tree?.root, "game.openInNewTab").props.onClick();
    });
    expect(ctx.setActionNotice).not.toHaveBeenCalledWith(
      "Popup blocked. Allow popups and try again.",
      "error",
      3600,
    );
  });

  it("uses the Electrobun shell bridge when opening the viewer externally", async () => {
    const ctx = createContext();
    const desktopOpenExternal = vi.fn(async () => undefined);
    const gameOpenWindow = vi.fn(async () => ({ id: "game-window-1" }));
    mockUseApp.mockReturnValue(ctx);
    (window as TestWindow).__electrobunWindowId = 1;

    (
      window as TestWindow & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        desktopOpenExternal,
        gameOpenWindow,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };

    const openSpy = vi.spyOn(window, "open");

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.openInNewTab").props.onClick();
    });

    expect(gameOpenWindow).toHaveBeenCalledWith({
      url: ctx.activeGameViewerUrl,
      title: ctx.activeGameDisplayName || ctx.activeGameApp,
    });
    expect(desktopOpenExternal).toHaveBeenCalledWith({
      url: ctx.activeGameViewerUrl,
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("keeps auth-backed embedded viewers inside the app shell on Electrobun", async () => {
    const payload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token-embedded",
      agentId: "agent-1",
      characterId: "char-1",
      followEntity: "char-1",
    };
    const ctx = createContext({
      activeGameApp: "@elizaos/app-hyperscape",
      activeGameDisplayName: "Hyperscape",
      activeGameViewerUrl:
        "http://localhost:3333?embedded=true&mode=spectator&surface=agent-control",
      activeGamePostMessageAuth: true,
      activeGamePostMessagePayload: payload,
      appRuns: [
        createRunSummary({
          appName: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          viewer: {
            url: "http://localhost:3333?embedded=true&mode=spectator&surface=agent-control",
            embedParams: {
              embedded: "true",
              mode: "spectator",
              surface: "agent-control",
            },
            sandbox: "allow-scripts allow-same-origin",
            postMessageAuth: true,
            authMessage: payload,
          },
        }),
      ],
    });
    const gameOpenWindow = vi.fn(async () => ({ id: "game-window-1" }));
    mockUseApp.mockReturnValue(ctx);
    (window as TestWindow).__electrobunWindowId = 1;

    (
      window as TestWindow & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        gameOpenWindow,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    expect(gameOpenWindow).not.toHaveBeenCalled();
    expect(
      tree.root.find(
        (node) => node.props?.["data-testid"] === "game-view-iframe",
      ),
    ).toBeDefined();
  });

  it("stops app, resets state, and navigates back on success", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.stopAppRun.mockResolvedValue({
      success: true,
      appName: ctx.activeGameApp,
      runId: ctx.activeGameRunId,
      stoppedAt: new Date().toISOString(),
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message: "2004scape stopped.",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.stop").props.onClick();
    });

    expect(mockClientFns.stopAppRun).toHaveBeenCalledWith(ctx.activeGameRunId);
    expect(ctx.setState).toHaveBeenCalledWith("appRuns", []);
    expect(ctx.setState).toHaveBeenCalledWith("activeGameRunId", "");
    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "browse");
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "2004scape stopped.",
      "success",
      3200,
    );
  });

  it("shows stop errors when API call fails", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.stopAppRun.mockRejectedValue(new Error("stop failed"));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.stop").props.onClick();
    });
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Failed to stop: stop failed",
      "error",
    );
  });

  it("shows info notice when stop result is a no-op", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.stopAppRun.mockResolvedValue({
      success: false,
      appName: ctx.activeGameApp,
      runId: ctx.activeGameRunId,
      stoppedAt: new Date().toISOString(),
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "no-op",
      message: "No active session or installed plugin found.",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.stop").props.onClick();
    });
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "No active session or installed plugin found.",
      "info",
      3200,
    );
  });

  it("postMessage auth handshake sends auth once for matching origin", async () => {
    const payload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token-abc",
    };
    const ctx = createContext({
      activeGamePostMessageAuth: true,
      activeGamePostMessagePayload: payload,
    });
    mockUseApp.mockReturnValue(ctx);

    let messageHandler:
      | ((event: MessageEvent<{ type?: string }>) => void)
      | null = null;
    vi.spyOn(window, "addEventListener").mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (type === "message" && typeof listener === "function") {
        messageHandler = listener as (
          event: MessageEvent<{ type?: string }>,
        ) => void;
      }
    }) as typeof window.addEventListener);
    vi.spyOn(window, "removeEventListener").mockImplementation(
      (() => {}) as typeof window.removeEventListener,
    );

    const postMessage =
      vi.fn<(message: AppViewerAuthMessage, targetOrigin: string) => void>();
    Object.defineProperty(window, "postMessage", {
      value: postMessage,
      writable: true,
      configurable: true,
    });
    let _tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      _tree = TestRenderer.create(React.createElement(GameView), {
        createNodeMock: (element) => {
          if (element.type === "iframe") {
            return { contentWindow: window };
          }
          return {};
        },
      });
    });
    await flush();

    expect(messageHandler).toBeTypeOf("function");
    await act(async () => {
      messageHandler?.({
        source: window,
        data: { type: "HYPERSCAPE_READY" },
        origin: "http://localhost:5175",
      } as MessageEvent<{ type?: string }>);
    });
    expect(postMessage).toHaveBeenCalledWith(payload, "http://localhost:5175");
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Viewer auth sent.",
      "info",
      1800,
    );

    await act(async () => {
      messageHandler?.({
        source: window,
        data: { type: "HYPERSCAPE_READY" },
        origin: "http://localhost:5175",
      } as MessageEvent<{ type?: string }>);
    });
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("does not send auth when ready event origin mismatches", async () => {
    const payload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token-abc",
    };
    const ctx = createContext({
      activeGamePostMessageAuth: true,
      activeGamePostMessagePayload: payload,
    });
    mockUseApp.mockReturnValue(ctx);

    let messageHandler:
      | ((event: MessageEvent<{ type?: string }>) => void)
      | null = null;
    vi.spyOn(window, "addEventListener").mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (type === "message" && typeof listener === "function") {
        messageHandler = listener as (
          event: MessageEvent<{ type?: string }>,
        ) => void;
      }
    }) as typeof window.addEventListener);
    vi.spyOn(window, "removeEventListener").mockImplementation(
      (() => {}) as typeof window.removeEventListener,
    );

    const postMessage =
      vi.fn<(message: AppViewerAuthMessage, targetOrigin: string) => void>();
    Object.defineProperty(window, "postMessage", {
      value: postMessage,
      writable: true,
      configurable: true,
    });
    let _tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      _tree = TestRenderer.create(React.createElement(GameView), {
        createNodeMock: (element) => {
          if (element.type === "iframe") {
            return { contentWindow: window };
          }
          return {};
        },
      });
    });
    await flush();

    await act(async () => {
      messageHandler?.({
        source: window,
        data: { type: "HYPERSCAPE_READY" },
        origin: "http://evil.example",
      } as MessageEvent<{ type?: string }>);
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("Back to Apps button switches tab", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      findButtonByText(tree?.root, "game.backToApps").props.onClick();
    });
    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
  });

  it("uses app session messaging when a live session is active", async () => {
    const ctx = createContext({
      activeGameApp: "@elizaos/app-hyperscape",
      activeGameSession: {
        sessionId: "agent-1",
        appName: "@elizaos/app-hyperscape",
        mode: "spectate-and-steer",
        status: "running",
        canSendCommands: true,
        controls: ["pause"],
        summary: "running: Chop wood",
      },
    });
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.getAppSessionState.mockResolvedValue(ctx.activeGameSession);
    mockClientFns.sendAppSessionMessage.mockResolvedValue({
      success: true,
      message: "Message sent to Hyperscape session.",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree.root, "game.showLogs").props.onClick();
    });

    const input = tree.root.findAll(
      (node) => node.props?.placeholder === "game.chatPlaceholder",
    )[0];
    expect(input).toBeDefined();
    await act(async () => {
      input.props.onChange({ target: { value: "go chop some wood" } });
    });

    await act(async () => {
      await findButtonByText(tree.root, "common.send").props.onClick();
    });

    expect(mockClientFns.sendAppSessionMessage).toHaveBeenCalledWith(
      "@elizaos/app-hyperscape",
      "agent-1",
      "go chop some wood",
    );
    expect(mockClientFns.sendChatRest).not.toHaveBeenCalled();
  });

  it("shows pause or resume controls for session-backed apps", async () => {
    const ctx = createContext({
      activeGameApp: "@elizaos/app-hyperscape",
      activeGameSession: {
        sessionId: "agent-2",
        appName: "@elizaos/app-hyperscape",
        mode: "spectate-and-steer",
        status: "running",
        canSendCommands: true,
        controls: ["pause"],
        summary: "running: Patrolling",
      },
    });
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.getAppSessionState.mockResolvedValue(ctx.activeGameSession);
    mockClientFns.controlAppSession.mockResolvedValue({
      success: true,
      message: "Hyperscape session paused.",
      session: {
        ...ctx.activeGameSession,
        status: "paused",
        controls: ["resume"],
      },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree.root, "Pause").props.onClick();
    });

    expect(mockClientFns.controlAppSession).toHaveBeenCalledWith(
      "@elizaos/app-hyperscape",
      "agent-2",
      "pause",
    );
  });
});
