import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

interface PluginStub {
  id: string;
  name: string;
  enabled?: boolean;
  isActive?: boolean;
}

interface ChatQuickLayerContextStub {
  agentStatus: { agentName: string } | null;
  chatInput: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
  conversationMessages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: number;
    source?: string;
  }>;
  handleChatSend: (mode: "simple" | "power") => Promise<void>;
  handleChatStop: () => void;
  setState: (key: string, value: unknown) => void;
  setTab: (tab: string) => void;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  plugins: PluginStub[];
  activeGameViewerUrl: string;
  droppedFiles: string[];
  shareIngestNotice: string;
  selectedVrmIndex: number;
}

const { mockClient, mockUseApp, mockUseVoiceChat } = vi.hoisted(() => ({
  mockClient: {
    getConfig: vi.fn(),
    executeAutonomyPlan: vi.fn(),
    getFive55GamesCatalog: vi.fn(),
    playFive55Game: vi.fn(),
  },
  mockUseApp: vi.fn(),
  mockUseVoiceChat: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: () => null,
}));

vi.mock("../../src/hooks/useVoiceChat", () => ({
  useVoiceChat: () => mockUseVoiceChat(),
}));

vi.mock("../../src/components/ChatAvatar", () => ({
  ChatAvatar: () => null,
}));

vi.mock("../../src/components/MessageContent", () => ({
  MessageContent: ({ message }: { message: { text: string } }) =>
    React.createElement("span", null, message.text),
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
}));

import { ChatView } from "../../src/components/ChatView";

function createContext(
  overrides?: Partial<ChatQuickLayerContextStub>,
): ChatQuickLayerContextStub {
  return {
    agentStatus: { agentName: "Milaidy" },
    chatInput: "",
    chatSending: false,
    chatFirstTokenReceived: false,
    conversationMessages: [],
    handleChatSend: vi.fn(async () => {}),
    handleChatStop: vi.fn(),
    setState: vi.fn(),
    setTab: vi.fn(),
    setActionNotice: vi.fn(),
    plugins: [],
    activeGameViewerUrl: "",
    droppedFiles: [],
    shareIngestNotice: "",
    selectedVrmIndex: 0,
    ...overrides,
  };
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim();
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && text(node) === label,
  );
  if (!matches[0]) {
    throw new Error(`Button "${label}" not found`);
  }
  return matches[0];
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("ChatView quick layers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseApp.mockReset();
    mockUseVoiceChat.mockReset();
    mockClient.getConfig.mockReset();
    mockClient.executeAutonomyPlan.mockReset();
    mockClient.getFive55GamesCatalog.mockReset();
    mockClient.playFive55Game.mockReset();

    mockUseVoiceChat.mockReturnValue({
      supported: false,
      isListening: false,
      interimTranscript: "",
      toggleListening: vi.fn(),
      mouthOpen: 0,
      isSpeaking: false,
      usingAudioAnalysis: false,
      speak: vi.fn(),
      stopSpeaking: vi.fn(),
    });
    mockClient.getConfig.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("Go Live primes stream prompt and sends in power mode", async () => {
    const ctx = createContext({
      plugins: [{ id: "stream", name: "stream", enabled: true, isActive: true }],
    });
    mockUseApp.mockReturnValue(ctx);
    mockClient.executeAutonomyPlan.mockResolvedValue({
      ok: true,
      allSucceeded: true,
      stoppedEarly: false,
      failedStepIndex: null,
      stopOnFailure: false,
      successCount: 3,
      failedCount: 0,
      results: [],
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    await act(async () => {
      findButtonByText(tree!.root, "Go Live").props.onClick();
    });

    expect(mockClient.executeAutonomyPlan).toHaveBeenCalled();
    expect(ctx.setState).toHaveBeenCalledWith(
      "chatInput",
      expect.stringContaining("You are now live. Give a concise on-air opener"),
    );

    await act(async () => {
      vi.advanceTimersByTime(35);
    });
    expect(ctx.handleChatSend).toHaveBeenCalledWith("power");
  });

  it("Play Games launches autonomous spectate viewer and nudges chat with active game context", async () => {
    const ctx = createContext({
      plugins: [
        { id: "five55-games", name: "five55-games", enabled: true, isActive: true },
      ],
    });
    mockUseApp.mockReturnValue(ctx);
    mockClient.getFive55GamesCatalog.mockResolvedValue({
      games: [
        {
          id: "ninja-evilcorp",
          title: "ninja_vs_evilcorp.555",
          description: "Stealth platformer",
          category: "arcade",
          difficulty: "hard",
          path: "/games/ninja/index.html",
        },
      ],
      total: 1,
      includeBeta: true,
      category: "all",
    });
    mockClient.executeAutonomyPlan.mockResolvedValue({
      ok: true,
      allSucceeded: true,
      stoppedEarly: false,
      failedStepIndex: null,
      stopOnFailure: true,
      successCount: 1,
      failedCount: 0,
      results: [
        {
          success: true,
          result: {
            text: JSON.stringify({
              ok: true,
              action: "FIVE55_GAMES_PLAY",
              message: "game play started",
              status: 200,
              data: {
                game: {
                  id: "ninja-evilcorp",
                  title: "ninja_vs_evilcorp.555",
                },
                mode: "spectate",
                viewer: {
                  url: "https://555.example/games/ninja/index.html?bot=true&spectate=1",
                  sandbox:
                    "allow-scripts allow-same-origin allow-popups allow-forms",
                  postMessageAuth: false,
                },
                launchUrl:
                  "https://555.example/games/ninja/index.html?bot=true&spectate=1",
              },
            }),
          },
        },
      ],
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree!.root, "Play Games").props.onClick();
    });

    expect(mockClient.getFive55GamesCatalog).toHaveBeenCalledWith({
      includeBeta: true,
    });
    expect(mockClient.executeAutonomyPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          id: "quick-layer-play-games-autonomous",
        }),
      }),
    );
    expect(mockClient.playFive55Game).not.toHaveBeenCalled();

    expect(ctx.setState).toHaveBeenCalledWith("activeGameApp", "five55:ninja-evilcorp");
    expect(ctx.setState).toHaveBeenCalledWith(
      "activeGameViewerUrl",
      "https://555.example/games/ninja/index.html?bot=true&spectate=1",
    );
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "games");
    expect(ctx.setTab).toHaveBeenCalledWith("apps");
    expect(ctx.setState).toHaveBeenCalledWith(
      "chatInput",
      expect.stringContaining("in autonomous bot mode"),
    );

    await act(async () => {
      vi.advanceTimersByTime(35);
    });
    expect(ctx.handleChatSend).toHaveBeenCalledWith("power");
  });
});
