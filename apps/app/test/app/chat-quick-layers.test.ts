import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

interface ChatContextStub {
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
  quickLayerStatuses: Record<string, "active" | "disabled" | "available">;
  autonomousRunOpen: boolean;
  autoRunMode: "newscast" | "topic" | "games" | "free";
  autoRunTopic: string;
  autoRunDurationMin: number;
  autoRunAvatarRuntime: "auto" | "local" | "premium";
  autoRunPreview: {
    profile: string;
    canStart: boolean;
    estimate: {
      totalCredits: number;
      runtimeCredits: number;
      grandTotalCredits: number;
    };
    balance?: { creditBalance: number };
  } | null;
  autoRunPreviewBusy: boolean;
  autoRunLaunching: boolean;
  runQuickLayer: (layerId: string) => Promise<void>;
  closeAutonomousRun: () => void;
  runAutonomousEstimate: () => Promise<unknown>;
  runAutonomousLaunch: () => Promise<void>;
  droppedFiles: string[];
  shareIngestNotice: string;
  selectedVrmIndex: number;
  chatPendingImages: Array<{
    id: string;
    name: string;
    mimeType: string;
    base64Data: string;
  }>;
  setChatPendingImages: (
    value:
      | Array<{
          id: string;
          name: string;
          mimeType: string;
          base64Data: string;
        }>
      | ((
          prev: Array<{
            id: string;
            name: string;
            mimeType: string;
            base64Data: string;
          }>,
        ) => Array<{
          id: string;
          name: string;
          mimeType: string;
          base64Data: string;
        }>),
  ) => void;
}

const { mockClient, mockUseApp, mockUseVoiceChat } = vi.hoisted(() => ({
  mockClient: {
    getConfig: vi.fn(),
    listFive55MasteryRuns: vi.fn(),
    startFive55MasteryRun: vi.fn(),
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
  overrides?: Partial<ChatContextStub>,
): ChatContextStub {
  return {
    agentStatus: { agentName: "Alice" },
    chatInput: "",
    chatSending: false,
    chatFirstTokenReceived: false,
    conversationMessages: [],
    handleChatSend: vi.fn(async () => {}),
    handleChatStop: vi.fn(),
    setState: vi.fn(),
    setTab: vi.fn(),
    setActionNotice: vi.fn(),
    quickLayerStatuses: {
      stream: "available",
      "go-live": "available",
      "autonomous-run": "available",
      "screen-share": "available",
      ads: "available",
      "invite-guest": "available",
      radio: "available",
      pip: "available",
      "reaction-segment": "available",
      earnings: "available",
      "play-games": "available",
      swap: "available",
      "end-live": "available",
    },
    autonomousRunOpen: true,
    autoRunMode: "games",
    autoRunTopic: "",
    autoRunDurationMin: 30,
    autoRunAvatarRuntime: "local",
    autoRunPreview: {
      profile: "standard",
      canStart: true,
      estimate: {
        totalCredits: 10,
        runtimeCredits: 4,
        grandTotalCredits: 14,
      },
      balance: { creditBalance: 200 },
    },
    autoRunPreviewBusy: false,
    autoRunLaunching: false,
    runQuickLayer: vi.fn(async () => {}),
    closeAutonomousRun: vi.fn(),
    runAutonomousEstimate: vi.fn(async () => null),
    runAutonomousLaunch: vi.fn(async () => {}),
    droppedFiles: [],
    shareIngestNotice: "",
    selectedVrmIndex: 0,
    chatPendingImages: [],
    setChatPendingImages: vi.fn(),
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
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

describe("ChatView autonomous run panel", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseVoiceChat.mockReset();
    mockClient.getConfig.mockReset();
    mockClient.listFive55MasteryRuns.mockReset();
    mockClient.startFive55MasteryRun.mockReset();

    mockUseVoiceChat.mockReturnValue({
      supported: false,
      isListening: false,
      interimTranscript: "",
      toggleListening: vi.fn(),
      mouthOpen: 0,
      isSpeaking: false,
      usingAudioAnalysis: false,
      speak: vi.fn(),
      queueAssistantSpeech: vi.fn(),
      stopSpeaking: vi.fn(),
    });
    mockClient.getConfig.mockResolvedValue({});
    mockClient.listFive55MasteryRuns.mockResolvedValue({ runs: [] });
    mockClient.startFive55MasteryRun.mockResolvedValue({ runId: "run-1" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the autonomous setup from shared app state", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    const text = JSON.stringify(tree!.toJSON());
    expect(text).toContain("Autonomous Run Setup");
    expect(text).toContain("Estimate Cost");
    expect(text).toContain("Start Autonomous Run");
  });

  it("routes estimate and launch actions through the shared app callbacks", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    await act(async () => {
      findButtonByText(tree!.root, "Estimate Cost").props.onClick();
    });
    expect(ctx.runAutonomousEstimate).toHaveBeenCalled();

    await act(async () => {
      findButtonByText(tree!.root, "Start Autonomous Run").props.onClick();
    });
    expect(ctx.runAutonomousLaunch).toHaveBeenCalled();
  });

  it("writes autonomous config changes back through setState", async () => {
    const ctx = createContext({
      autoRunMode: "topic",
      autoRunTopic: "market structure",
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    const selects = tree!.root.findAllByType("select");
    const inputs = tree!.root.findAllByType("input");

    await act(async () => {
      selects[0].props.onChange({ target: { value: "games" } });
      inputs.find((node) => node.props.type === "number")?.props.onChange({
        target: { value: "45" },
      });
      inputs.find((node) => node.props.type === "text")?.props.onChange({
        target: { value: "new focus" },
      });
    });

    expect(ctx.setState).toHaveBeenCalledWith("autoRunMode", "games");
    expect(ctx.setState).toHaveBeenCalledWith("autoRunDurationMin", 45);
    expect(ctx.setState).toHaveBeenCalledWith("autoRunTopic", "new focus");
  });
});
