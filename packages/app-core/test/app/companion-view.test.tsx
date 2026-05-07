// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_EMOTE_EVENT } from "@miladyai/app-core/events";
import { textOf as text } from "../../../../test/helpers/react-test";
import { createInlineUiMock } from "./mockInlineUi";

const mockUseApp = vi.hoisted(() => vi.fn());
const viewerPropsRef = vi.hoisted(
  () =>
    ({
      current: null,
    }) as { current: null | Record<string, unknown> },
);

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
  getDefaultBundledVrmIndex: () => 9,
  getVrmCount: () => 24,
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm.gz",
  getVrmBackgroundUrl: (index: number) =>
    `/vrms/backgrounds/milady-${index}.png`,
  getVrmTitle: (index: number) => `MILADY-${index}`,
  VRM_COUNT: 24,
  CUSTOM_ONBOARDING_STEPS: [],
  useCompanionSceneConfig: () => {
    const state = (mockUseApp() as Record<string, unknown>) ?? {};
    return {
      selectedVrmIndex: (state.selectedVrmIndex as number | undefined) ?? 1,
      customVrmUrl: (state.customVrmUrl as string | undefined) ?? "",
      uiTheme: (state.uiTheme as string | undefined) ?? "light",
      tab: (state.tab as string | undefined) ?? "companion",
      companionVrmPowerMode: "balanced",
      companionHalfFramerateMode: "when_saving_power",
      companionAnimateWhenHidden: false,
    };
  },
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@miladyai/ui", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@miladyai/ui");
  return createInlineUiMock(actual);
});

vi.mock("../../src/components/avatar/VrmViewer", () => ({
  VrmViewer: (props: Record<string, unknown>) => {
    viewerPropsRef.current = props;
    return React.createElement("div", null, "VrmViewer");
  },
}));

vi.mock("../../src/components/pages/ChatModalView", () => ({
  ChatModalView: (props: Record<string, unknown>) =>
    React.createElement(
      "div",
      {
        "data-testid": "companion-chat-modal-stub",
        "data-show-agent-activity-box": String(
          props.showAgentActivityBox ?? true,
        ),
      },
      "ChatModalView",
    ),
}));

vi.mock("../../src/components/coding/PtyConsoleDrawer", () => ({
  PtyConsoleDrawer: () => React.createElement("div", null, "PtyConsoleDrawer"),
}));

vi.mock("../../src/components/coding/PtyConsoleSidePanel", () => ({
  PtyConsoleSidePanel: () =>
    React.createElement("div", null, "PtyConsoleSidePanel"),
}));

const mockClientFns = vi.hoisted(() => ({
  uploadCustomVrm: vi.fn(async () => {}),
  uploadCustomBackground: vi.fn(async () => {}),
  onWsEvent: vi.fn(() => () => {}),
  streamStatus: vi.fn(),
  getStreamingDestinations: vi.fn(),
  streamGoLive: vi.fn(),
  streamGoOffline: vi.fn(),
  setActiveDestination: vi.fn(),
  getArcade555GamesCatalog: vi.fn(),
  getArcade555GameState: vi.fn(),
  playArcade555Game: vi.fn(),
  switchArcade555Game: vi.fn(),
  stopArcade555Game: vi.fn(),
  getEmotes: vi.fn(),
  executeAliceOperatorPlan: vi.fn(),
  listHyperscapeEmbeddedAgents: vi.fn(),
  getHyperscapeAgentGoal: vi.fn(),
  getHyperscapeAgentQuickActions: vi.fn(),
  sendHyperscapeAgentMessage: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClientFns,
  isApiError: (err: unknown) =>
    Boolean(err && typeof err === "object" && "status" in (err as object)),
}));

vi.mock("@miladyai/app-core/utils", () => ({
  resolveApiUrl: (p: string) => p,
  resolveAppAssetUrl: (p: string) => p,
  DESKTOP_WORKSPACE_SURFACES: [],
  modelLooksLikeElizaCloudHosted: () => false,
}));

import { CompanionSceneHost } from "../../src/components/companion/CompanionSceneHost";
import { CompanionView } from "../../src/components/pages/CompanionView";

const COMPANION_ZOOM_STORAGE_KEY = "milady.companion.zoom.v1";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    t: (k: string) => k,
    chatMode: "simple",
    chatAgentVoiceMuted: false,
    conversations: [{ id: "conv-1", title: "Chat", status: "completed" }],
    conversationMessages: [],
    conversations: [],
    activeConversationId: null,
    chatLastUsage: null,
    elizaCloudAuthRejected: false,
    elizaCloudCreditsError: null,
    elizaCloudEnabled: false,
    elizaCloudConnected: false,
    onboardingHandoffPhase: "idle",
    setState: vi.fn(),
    handleStartDraftConversation: vi.fn(async () => {}),
    handleNewConversation: vi.fn(async () => {}),
    selectedVrmIndex: 1,
    customVrmUrl: "",
    customBackgroundUrl: "",
    walletAddresses: null,
    walletBalances: null,
    walletNfts: null,
    walletLoading: false,
    walletNftsLoading: false,
    walletError: null,
    ptySessions: [],
    ptySidePanelSessionId: null,
    setPtySidePanelSessionId: vi.fn(),
    loadBalances: vi.fn(async () => {}),
    loadNfts: vi.fn(async () => {}),
    getBscTradePreflight: vi.fn(async () => ({
      ok: false,
      reasons: ["disabled"],
    })),
    getBscTradeQuote: vi.fn(async () => ({
      route: [],
      quoteIn: { amount: "0", symbol: "BNB" },
      quoteOut: { amount: "0", symbol: "BNB" },
      minReceive: { amount: "0", symbol: "BNB" },
      slippageBps: 100,
    })),
    getBscTradeTxStatus: vi.fn(async (hash: string) => ({
      ok: true,
      hash,
      status: "pending",
      explorerUrl: `https://bscscan.com/tx/${hash}`,
      chainId: 56,
      blockNumber: null,
      confirmations: 0,
      nonce: null,
      gasUsed: null,
      effectiveGasPriceWei: null,
    })),
    loadWalletTradingProfile: vi.fn(async () => ({
      window: "30d",
      source: "all",
      generatedAt: new Date().toISOString(),
      summary: {
        totalSwaps: 0,
        buyCount: 0,
        sellCount: 0,
        settledCount: 0,
        successCount: 0,
        revertedCount: 0,
        tradeWinRate: null,
        txSuccessRate: null,
        winningTrades: 0,
        evaluatedTrades: 0,
        realizedPnlBnb: "0",
        volumeBnb: "0",
      },
      pnlSeries: [],
      tokenBreakdown: [],
      recentSwaps: [],
    })),
    executeBscTrade: vi.fn(async () => ({
      executed: false,
      execution: null,
      requiresUserSignature: false,
    })),
    executeBscTransfer: vi.fn(async () => ({
      executed: false,
      execution: null,
      requiresUserSignature: false,
    })),
    logConversationOperatorAction: vi.fn(async () => true),
    setActionNotice: vi.fn(),
    loadPlugins: vi.fn(async () => {}),
    handlePluginConfigSave: vi.fn(async () => {}),
    pluginSaving: new Set<string>(),
    agentStatus: {
      state: "running",
      agentName: "Milady",
      platform: "test",
      pid: null,
    },
    elizaCloudCredits: null,
    elizaCloudCreditsCritical: false,
    elizaCloudCreditsLow: false,
    elizaCloudTopUpUrl: "",
    lifecycleBusy: false,
    lifecycleAction: null,

    handleRestart: vi.fn(async () => {}),
    copyToClipboard: vi.fn(async () => {}),
    uiLanguage: "en",
    setUiLanguage: vi.fn(),
    uiTheme: "light",
    setUiTheme: vi.fn(),
    uiShellMode: "companion",
    setUiShellMode: vi.fn(),
    switchUiShellMode: vi.fn(),
    switchShellView: vi.fn(),
    navigation: {
      subscribeTabCommitted: () => () => {},
      scheduleAfterTabCommit: (fn: () => void) => {
        queueMicrotask(fn);
      },
    },
    setTab: vi.fn(),
    plugins: [],
    ...overrides,
  };
}

function createCompanionRootMock(
  options: { hasPointerCapture?: boolean } = {},
) {
  const listeners = new Map<string, EventListener>();
  const node = {
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          listeners.set(type, listener);
        }
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (listeners.get(type) === listener) {
          listeners.delete(type);
        }
      },
    ),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => options.hasPointerCapture ?? true),
    clientWidth: 1440,
    clientHeight: 900,
  };

  return {
    node,
    getListener(type: string) {
      return listeners.get(type) as ((event: Event) => void) | undefined;
    },
  };
}

function renderWithCompanionRootMock(
  rootMock: ReturnType<typeof createCompanionRootMock>,
) {
  return TestRenderer.create(React.createElement(CompanionView), {
    createNodeMock: (element) =>
      element.props?.["data-testid"] === "companion-root"
        ? rootMock.node
        : null,
  });
}

function createMatchMedia(
  matchesFor: (query: string) => boolean = () => false,
) {
  return vi.fn((query: string) => ({
    matches: matchesFor(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("CompanionView", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    viewerPropsRef.current = null;
    mockClientFns.streamStatus.mockReset();
    mockClientFns.getStreamingDestinations.mockReset();
    mockClientFns.streamGoLive.mockReset();
    mockClientFns.streamGoOffline.mockReset();
    mockClientFns.setActiveDestination.mockReset();
    mockClientFns.getArcade555GamesCatalog.mockReset();
    mockClientFns.getArcade555GameState.mockReset();
    mockClientFns.playArcade555Game.mockReset();
    mockClientFns.switchArcade555Game.mockReset();
    mockClientFns.stopArcade555Game.mockReset();
    mockClientFns.getEmotes.mockReset();
    mockClientFns.executeAliceOperatorPlan.mockReset();
    mockClientFns.listHyperscapeEmbeddedAgents.mockReset();
    mockClientFns.getHyperscapeAgentGoal.mockReset();
    mockClientFns.getHyperscapeAgentQuickActions.mockReset();
    mockClientFns.sendHyperscapeAgentMessage.mockReset();

    mockClientFns.streamStatus.mockResolvedValue({
      running: false,
      ffmpegAlive: false,
      uptime: 0,
      frameCount: 0,
      destination: { id: "dest-1", name: "555 TV" },
    });
    mockClientFns.getStreamingDestinations.mockResolvedValue({
      destinations: [{ id: "dest-1", name: "555 TV" }],
    });
    mockClientFns.streamGoLive.mockResolvedValue({ ok: true, live: true });
    mockClientFns.streamGoOffline.mockResolvedValue({ ok: true, live: false });
    mockClientFns.setActiveDestination.mockResolvedValue({
      ok: true,
      destination: { id: "dest-1", name: "555 TV" },
    });
    mockClientFns.getArcade555GamesCatalog.mockResolvedValue({
      games: [{ id: "space-quest", title: "Space Quest" }],
    });
    mockClientFns.getArcade555GameState.mockResolvedValue({
      sessionId: null,
      activeGameId: null,
      activeGameLabel: null,
      mode: null,
      phase: null,
      live: false,
      destination: null,
    });
    mockClientFns.playArcade555Game.mockResolvedValue({ ok: true });
    mockClientFns.switchArcade555Game.mockResolvedValue({ ok: true });
    mockClientFns.stopArcade555Game.mockResolvedValue({ ok: true });
    mockClientFns.getEmotes.mockResolvedValue({
      emotes: [
        {
          id: "wave",
          name: "Wave",
          description: "Wave",
          path: "/animations/emotes/wave.fbx.gz",
          duration: 2,
          loop: false,
          category: "greeting",
        },
        {
          id: "dance-happy",
          name: "Happy Dance",
          description: "Dance",
          path: "/animations/emotes/dance.fbx.gz",
          duration: 3,
          loop: false,
          category: "dance",
        },
      ],
    });
    mockClientFns.executeAliceOperatorPlan.mockResolvedValue({
      ok: true,
      allSucceeded: true,
      results: [],
    });
    mockClientFns.listHyperscapeEmbeddedAgents.mockResolvedValue({
      success: true,
      agents: [],
      count: 0,
    });
    mockClientFns.getHyperscapeAgentGoal.mockResolvedValue({
      success: true,
      goal: null,
    });
    mockClientFns.getHyperscapeAgentQuickActions.mockResolvedValue({
      success: true,
      quickCommands: [],
      nearbyLocations: [],
      availableGoals: [],
      inventory: [],
      playerPosition: null,
    });
    mockClientFns.sendHyperscapeAgentMessage.mockResolvedValue({
      success: true,
    });

    const storage = new Map<string, string>();
    const windowListeners = new Map<string, Set<EventListener>>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => storage.get(String(key)) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(String(key), String(value));
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(String(key));
        }),
        clear: vi.fn(() => {
          storage.clear();
        }),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "window", {
      value: {
        innerWidth: 1440,
        innerHeight: 900,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        setInterval: globalThis.setInterval.bind(globalThis),
        clearInterval: globalThis.clearInterval.bind(globalThis),
        matchMedia: createMatchMedia(),
        addEventListener: vi.fn(
          (type: string, listener: EventListenerOrEventListenerObject) => {
            if (typeof listener !== "function") return;
            const listeners =
              windowListeners.get(type) ?? new Set<EventListener>();
            listeners.add(listener);
            windowListeners.set(type, listeners);
          },
        ),
        removeEventListener: vi.fn(
          (type: string, listener: EventListenerOrEventListenerObject) => {
            if (typeof listener !== "function") return;
            windowListeners.get(type)?.delete(listener);
          },
        ),
        dispatchEvent: vi.fn((event: Event) => {
          for (const listener of windowListeners.get(event.type) ?? []) {
            listener(event);
          }
          return true;
        }),
      },
      configurable: true,
    });
    Object.assign(document, {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "activeElement");
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("renders CompanionView containing VrmStage, Header, and HubNav", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree?.root);
    // Should render the mock VrmViewer text
    expect(content).toContain("VrmViewer");
    // ChatModalView is gated behind avatarReady (VRM teleport), so it won't
    // render until the avatar finishes loading. Verify the header overlay is
    // present instead (rendered with opacity 0 while waiting).
    const desktopVoice = tree?.root.findAllByProps({
      "aria-label": "companion.agentVoiceOn",
    });
    expect(desktopVoice.length).toBeGreaterThanOrEqual(1);
    const headerShell = tree?.root.findAllByProps({
      "data-testid": "companion-header-shell",
    });
    expect(headerShell).toHaveLength(1);
  });

  it("reveals the companion overlay if teleport completion never arrives", async () => {
    vi.useFakeTimers();
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    try {
      await act(async () => {
        tree = TestRenderer.create(React.createElement(CompanionView));
      });

      expect(
        tree?.root.findAllByProps({
          "data-testid": "companion-chat-modal-stub",
        }),
      ).toHaveLength(0);

      await act(async () => {
        vi.advanceTimersByTime(1400);
      });

      expect(
        tree?.root.findAllByProps({
          "data-testid": "companion-chat-modal-stub",
        }),
      ).toHaveLength(1);
    } finally {
      await act(async () => {
        tree?.unmount();
      });
      vi.useRealTimers();
      window.setTimeout = globalThis.setTimeout.bind(globalThis);
      window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    }
  });

  it("reveals the companion dock immediately during onboarding handoff", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        onboardingHandoffPhase: "bootstrapping",
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-chat-modal-stub",
      }),
    ).toHaveLength(1);
  });

  it("renders the Alice go live control and collapsed stage launcher for Alice", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        onboardingHandoffPhase: "bootstrapping",
        selectedVrmIndex: 9,
        plugins: [{ id: "five55-games", enabled: true, isActive: true }],
        ptySessions: [
          {
            sessionId: "pty-1",
            label: "Alice Ops",
            status: "active",
            lastActivity: "Running",
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
      await Promise.resolve();
    });

    expect(
      tree?.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["data-testid"] === "companion-header-go-live",
      ),
    ).toHaveLength(1);
    expect(
      tree?.root.findByProps({
        "data-testid": "companion-header-go-live",
      }).props["data-no-camera-zoom"],
    ).toBe("true");
    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-stage-actions-launcher",
      }).length ?? 0,
    ).toBeGreaterThan(0);
    expect(
      tree?.root.findByProps({
        "data-testid": "companion-stage-actions-launcher",
      }).props["data-no-camera-zoom"],
    ).toBe("true");
    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-stage-actions-bubble",
      }),
    ).toHaveLength(0);
    expect(
      tree?.root.findByProps({
        "data-testid": "companion-chat-modal-stub",
      }).props["data-show-agent-activity-box"],
    ).toBe("true");
  });

  it("keeps the Alice go live control hidden for non-Alice avatars", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        onboardingHandoffPhase: "bootstrapping",
        selectedVrmIndex: 1,
        ptySessions: [
          {
            sessionId: "pty-1",
            label: "Generic Ops",
            status: "active",
            lastActivity: "Running",
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
      await Promise.resolve();
    });

    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-header-go-live",
      }),
    ).toHaveLength(0);
    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-stage-actions-launcher",
      }),
    ).toHaveLength(0);
    expect(
      tree?.root.findByProps({
        "data-testid": "companion-chat-modal-stub",
      }).props["data-show-agent-activity-box"],
    ).toBe("true");
    expect(viewerPropsRef.current?.speechMotionPath).toBeNull();
  });

  it("keeps the Alice stage launcher off narrow screens while preserving the header go live control", async () => {
    window.matchMedia = createMatchMedia(
      (query) => query === "(max-width: 767px)",
    );
    mockUseApp.mockReturnValue(
      createContext({
        onboardingHandoffPhase: "bootstrapping",
        selectedVrmIndex: 9,
        plugins: [{ id: "five55-games", enabled: true, isActive: true }],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
      await Promise.resolve();
    });

    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-header-go-live",
      }).length ?? 0,
    ).toBeGreaterThan(0);
    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-stage-actions-launcher",
      }),
    ).toHaveLength(0);
  });

  it("expands the Alice stage launcher into a scrollable action panel", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        onboardingHandoffPhase: "bootstrapping",
        selectedVrmIndex: 9,
        plugins: [{ id: "five55-games", enabled: true, isActive: true }],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
      await Promise.resolve();
    });

    const launcher = tree?.root.findByProps({
      "data-testid": "companion-stage-actions-launcher",
    });

    await act(async () => {
      launcher?.props.onClick();
      await Promise.resolve();
    });

    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-stage-actions-bubble",
      }).length ?? 0,
    ).toBeGreaterThan(0);
    expect(
      tree?.root.findByProps({
        "data-testid": "companion-stage-actions-bubble",
      }).props["data-no-camera-zoom"],
    ).toBe("true");
  });

  it("logs Alice stage actions and collapses the sheet when bubble actions are triggered", async () => {
    const logConversationOperatorAction = vi.fn(async () => true);
    mockClientFns.streamStatus.mockResolvedValue({
      running: true,
      ffmpegAlive: true,
      uptime: 12,
      frameCount: 48,
      destination: { id: "dest-1", name: "555 TV" },
    });
    mockUseApp.mockReturnValue(
      createContext({
        onboardingHandoffPhase: "bootstrapping",
        selectedVrmIndex: 9,
        logConversationOperatorAction,
        plugins: [{ id: "five55-games", enabled: true, isActive: true }],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
      await Promise.resolve();
    });

    const launcher = tree?.root.findByProps({
      "data-testid": "companion-stage-actions-launcher",
    });

    await act(async () => {
      launcher?.props.onClick();
      await Promise.resolve();
    });

    const screenShareButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props.title === "aliceoperator.action.screenShare",
    );

    await act(async () => {
      await screenShareButton?.props.onClick();
      await Promise.resolve();
    });

    expect(logConversationOperatorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "aliceoperator.action.screenShare",
        kind: "stream",
      }),
    );
    expect(
      tree?.root.findAllByProps({
        "data-testid": "companion-stage-actions-bubble",
      }),
    ).toHaveLength(0);
  });

  it("opens the Alice go live modal from the header control", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        onboardingHandoffPhase: "bootstrapping",
        selectedVrmIndex: 9,
        ptySessions: [
          {
            sessionId: "pty-1",
            label: "Alice Ops",
            status: "active",
            lastActivity: "Running",
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
      await Promise.resolve();
    });

    const button = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "companion-header-go-live",
    );

    await act(async () => {
      button?.props.onClick();
      await Promise.resolve();
    });

    expect(
      tree?.root.findAllByProps({
        "data-go-live-stepper": true,
      }),
    ).toHaveLength(1);
  });

  it("plays the greeting emote only after teleport completion", async () => {
    vi.useFakeTimers();
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    mockUseApp.mockReturnValue(createContext());

    const events: Array<{ emoteId?: string; path?: string }> = [];
    const handleEmote = (event: Event) => {
      events.push(
        (event as CustomEvent<{ emoteId?: string; path?: string }>).detail ??
          {},
      );
    };
    window.addEventListener(APP_EMOTE_EVENT, handleEmote);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    try {
      await act(async () => {
        tree = TestRenderer.create(React.createElement(CompanionView));
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(events).toHaveLength(0);

      await act(async () => {
        window.dispatchEvent(new Event("eliza:vrm-teleport-complete"));
      });

      expect(events).toHaveLength(0);

      await act(async () => {
        vi.runAllTimers();
      });

      expect(events).toHaveLength(1);
      expect(events[0]?.emoteId).toBe("greeting");
      expect(events[0]?.path).toBe("/animations/greetings/greeting1.fbx.gz");
    } finally {
      window.removeEventListener(APP_EMOTE_EVENT, handleEmote);
      await act(async () => {
        tree?.unmount();
      });
      vi.useRealTimers();
      window.setTimeout = globalThis.setTimeout.bind(globalThis);
      window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    }
  });

  it("renders companion header with voice toggle and shell chrome", async () => {
    const setState = vi.fn();
    const handleStartDraftConversation = vi.fn(async () => {});
    const handleNewConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        setState,
        handleStartDraftConversation,
        handleNewConversation,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const headerShell = tree?.root.findByProps({
      "data-testid": "companion-header-shell",
    });
    const voiceButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "companion.agentVoiceOn",
    );

    expect(String(headerShell.props.className)).toContain("w-full");
    expect(voiceButton).toBeDefined();

    await act(async () => {
      voiceButton?.props.onClick();
    });
    expect(setState).toHaveBeenCalledWith("chatAgentVoiceMuted", true);
  });

  it("does not render the cloud status badge in companion header (desktop header only)", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        elizaCloudConnected: true,
        elizaCloudCredits: 87.5,
      }),
    );

    let connectedTree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      connectedTree = TestRenderer.create(React.createElement(CompanionView));
    });
    if (!connectedTree) {
      throw new Error("Failed to render connected CompanionView");
    }

    expect(
      connectedTree.root.findAllByProps({
        "data-testid": "companion-cloud-status",
      }),
    ).toHaveLength(0);

    mockUseApp.mockReturnValue(createContext());

    let disconnectedTree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      disconnectedTree = TestRenderer.create(
        React.createElement(CompanionView),
      );
    });
    if (!disconnectedTree) {
      throw new Error("Failed to render disconnected CompanionView");
    }

    expect(
      disconnectedTree.root.findAllByProps({
        "data-testid": "companion-cloud-status",
      }),
    ).toHaveLength(0);
  });

  it("keeps the shared companion scene wrapper height-bounded", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          CompanionSceneHost,
          { active: false },
          React.createElement("div", null, "Child"),
        ),
      );
    });

    const root = tree?.root.findByProps({ "data-testid": "companion-root" });
    expect(String(root?.props.className)).toContain("h-full");
    expect(String(root?.props.className)).toContain("min-h-0");
    expect(String(root?.props.className)).toContain("flex");
    expect(String(root?.props.className)).toContain("overflow-hidden");
  });

  it("pins companion mode to fast and hides the fast/pro toggle", async () => {
    const context = createContext();
    mockUseApp.mockReturnValue(context);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    expect(
      tree?.root.findAllByProps({
        "data-testid": "chat-mode-toggle-companion",
      }),
    ).toHaveLength(0);
    expect(context.setState).toHaveBeenCalledWith("chatMode", "simple");
  });

  it("orbits the companion camera from transcript drag and resets on release", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const setDragOrbitTarget = vi.fn();
    const resetDragOrbit = vi.fn();
    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget,
        resetDragOrbit,
        setCompanionZoomNormalized,
      });
    });

    expect(setCompanionZoomNormalized).toHaveBeenCalledWith(0.95);
    setDragOrbitTarget.mockClear();
    resetDragOrbit.mockClear();

    expect(tree).not.toBeNull();
    const root = tree?.root.findByProps({
      "data-testid": "companion-root",
    });
    const currentTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      clientWidth: 1440,
      clientHeight: 900,
    };
    const preventDefault = vi.fn();

    await act(async () => {
      root?.props.onPointerDownCapture({
        target: document.createElement("div"),
        currentTarget,
        pointerId: 7,
        clientX: 200,
        clientY: 300,
        stopPropagation: vi.fn(),
        preventDefault,
      });
      root?.props.onPointerMoveCapture({
        target: document.createElement("div"),
        currentTarget,
        pointerId: 7,
        clientX: 560,
        clientY: 120,
        preventDefault,
      });
      root?.props.onPointerUpCapture({
        target: document.createElement("div"),
        currentTarget,
        pointerId: 7,
      });
    });

    expect(currentTarget.setPointerCapture).toHaveBeenCalledWith(7);
    expect(setDragOrbitTarget).toHaveBeenCalledTimes(1);
    const [yaw, pitch] = setDragOrbitTarget.mock.calls[0];
    expect(yaw).toBeCloseTo(0.3375);
    expect(pitch).toBeCloseTo(0.17);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(resetDragOrbit).toHaveBeenCalledTimes(1);
    expect(currentTarget.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("ignores drag capture inside marked no-camera-drag controls", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const setDragOrbitTarget = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget,
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized: vi.fn(),
      });
    });
    setDragOrbitTarget.mockClear();

    const root = tree?.root.findByProps({
      "data-testid": "companion-root",
    });
    const currentTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      clientWidth: 1440,
      clientHeight: 900,
    };
    const composerControl = document.createElement("div");
    composerControl.setAttribute("data-no-camera-drag", "true");

    await act(async () => {
      root?.props.onPointerDownCapture({
        target: composerControl,
        currentTarget,
        pointerId: 7,
        clientX: 200,
        clientY: 300,
      });
      root?.props.onPointerMoveCapture({
        target: composerControl,
        currentTarget,
        pointerId: 7,
        clientX: 560,
        clientY: 120,
        preventDefault: vi.fn(),
      });
    });

    expect(currentTarget.setPointerCapture).not.toHaveBeenCalled();
    expect(setDragOrbitTarget).not.toHaveBeenCalled();
  });

  it("zooms the companion camera from root wheel input, including over overlay UI", async () => {
    mockUseApp.mockReturnValue(createContext());
    const rootMock = createCompanionRootMock();

    await act(async () => {
      renderWithCompanionRootMock(rootMock);
    });

    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized,
      });
    });
    setCompanionZoomNormalized.mockClear();

    const wheelListener = rootMock.getListener("wheel");
    const preventDefault = vi.fn();

    await act(async () => {
      wheelListener?.({
        deltaY: 120,
        deltaMode: 0,
        preventDefault,
        target: document.createElement("div"),
        ctrlKey: false,
      } as WheelEvent);
    });

    const lastZoom =
      setCompanionZoomNormalized.mock.calls.at(-1)?.[0] ?? Number.NaN;
    expect(lastZoom).toBeCloseTo(0.95 - 120 / 720, 5);
    expect(localStorage.setItem).toHaveBeenLastCalledWith(
      COMPANION_ZOOM_STORAGE_KEY,
      String(lastZoom),
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not zoom the companion camera while a text entry is focused", async () => {
    mockUseApp.mockReturnValue(createContext());
    const rootMock = createCompanionRootMock();

    await act(async () => {
      renderWithCompanionRootMock(rootMock);
    });

    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized,
      });
    });
    setCompanionZoomNormalized.mockClear();

    const focusedTextEntry = document.createElement("textarea");
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      value: focusedTextEntry,
    });
    const wheelListener = rootMock.getListener("wheel");
    const preventDefault = vi.fn();

    await act(async () => {
      wheelListener?.({
        ctrlKey: true,
        deltaY: -90,
        deltaMode: 0,
        preventDefault,
        target: document.createElement("div"),
      } as WheelEvent);
    });

    expect(setCompanionZoomNormalized).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not zoom the companion camera while the transcript handles wheel scroll", async () => {
    mockUseApp.mockReturnValue(createContext());
    const rootMock = createCompanionRootMock();

    await act(async () => {
      renderWithCompanionRootMock(rootMock);
    });

    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized,
      });
    });
    setCompanionZoomNormalized.mockClear();

    const transcript = document.createElement("div");
    transcript.setAttribute("data-no-camera-zoom", "true");
    const wheelListener = rootMock.getListener("wheel");
    const preventDefault = vi.fn();

    await act(async () => {
      wheelListener?.({
        target: transcript,
        deltaY: 120,
        deltaMode: 0,
        preventDefault,
        ctrlKey: false,
      } as WheelEvent);
    });

    expect(setCompanionZoomNormalized).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("zooms the companion camera from pinch input", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const setCompanionZoomNormalized = vi.fn();
    const resetDragOrbit = vi.fn();
    const currentTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      clientWidth: 1440,
      clientHeight: 900,
    };

    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit,
        setCompanionZoomNormalized,
      });
    });

    const root = tree?.root.findByProps({
      "data-testid": "companion-root",
    });

    await act(async () => {
      root?.props.onPointerDownCapture({
        currentTarget,
        pointerType: "touch",
        pointerId: 11,
        clientX: 200,
        clientY: 300,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      });
      root?.props.onPointerDownCapture({
        currentTarget,
        pointerType: "touch",
        pointerId: 12,
        clientX: 320,
        clientY: 300,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      });
      root?.props.onPointerMoveCapture({
        currentTarget,
        pointerType: "touch",
        pointerId: 12,
        clientX: 260,
        clientY: 300,
        preventDefault: vi.fn(),
      });
    });

    const zoomCalls = setCompanionZoomNormalized.mock.calls
      .map(([value]: [number]) => value)
      .filter((value) => value < 1);
    expect(resetDragOrbit).toHaveBeenCalledTimes(1);
    expect(zoomCalls.at(-1)).toBeLessThan(0.9);
  });

  it("restores persisted companion zoom on mount", async () => {
    localStorage.setItem(COMPANION_ZOOM_STORAGE_KEY, "0.62");
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized,
      });
    });

    expect(tree).not.toBeNull();
    expect(setCompanionZoomNormalized).toHaveBeenCalledWith(0.62);
  });

  it("uses the companion root as the interactive drag surface for camera orbit", async () => {
    mockUseApp.mockReturnValue(createContext());
    const rootMock = createCompanionRootMock();

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = renderWithCompanionRootMock(rootMock);
    });

    const dragLayer = tree?.root.findByProps({
      "data-testid": "companion-root",
    });

    expect(dragLayer?.props.className).toContain("cursor-grab");
    expect(dragLayer?.props.style).toMatchObject({
      touchAction: "none",
      overscrollBehavior: "none",
    });
    expect(typeof dragLayer?.props.onPointerDownCapture).toBe("function");
    expect(rootMock.node.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { capture: true, passive: false },
    );
  });
});
