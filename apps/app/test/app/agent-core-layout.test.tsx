// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockUseVoiceChat,
  mockGetConfig,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUseVoiceChat: vi.fn(),
  mockGetConfig: vi.fn(),
}));

vi.mock("../../src/AppContext.js", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/api-client.js", () => ({
  client: {
    getConfig: () => mockGetConfig(),
  },
}));

vi.mock("../../src/hooks/useVoiceChat.js", () => ({
  useVoiceChat: (options: unknown) => mockUseVoiceChat(options),
}));

vi.mock("../../src/components/ProStreamerStageComposition.js", () => ({
  ProStreamerStageComposition: () =>
    React.createElement("div", { "data-stage-composition": true }),
}));

vi.mock("../../src/components/ui/Badge.js", () => ({
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>
    React.createElement("span", props, children),
}));

vi.mock("../../src/components/ui/Button.js", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", props, children),
}));

vi.mock("../../src/components/ui/ScrollArea.js", () => ({
  ScrollArea: React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
  >(({ children, ...props }, ref) => React.createElement("div", { ref, ...props }, children)),
}));

vi.mock("../../src/components/ui/Textarea.js", () => ({
  Textarea: ({
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
    React.createElement("textarea", props),
}));

vi.mock("../../src/components/ui/Icons.js", () => ({
  AgentIcon: () => React.createElement("span", null, "AgentIcon"),
  MicIcon: () => React.createElement("span", null, "MicIcon"),
  OperatorIcon: () => React.createElement("span", null, "OperatorIcon"),
  SendIcon: () => React.createElement("span", null, "SendIcon"),
  StopIcon: () => React.createElement("span", null, "StopIcon"),
  SystemIcon: () => React.createElement("span", null, "SystemIcon"),
  ThreadsIcon: () => React.createElement("span", null, "ThreadsIcon"),
  ChevronDownIcon: () => React.createElement("span", null, "ChevronDownIcon"),
  ChevronUpIcon: () => React.createElement("span", null, "ChevronUpIcon"),
  ActivityIcon: () => React.createElement("span", null, "ActivityIcon"),
  BroadcastIcon: () => React.createElement("span", null, "BroadcastIcon"),
  CameraIcon: () => React.createElement("span", null, "CameraIcon"),
  PlayIcon: () => React.createElement("span", null, "PlayIcon"),
  SparkIcon: () => React.createElement("span", null, "SparkIcon"),
  VideoIcon: () => React.createElement("span", null, "VideoIcon"),
}));

import { AgentCore } from "../../src/components/AgentCore.js";

let composerHeight = 200;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;
const resizeObservers = new Set<{
  callback: ResizeObserverCallback;
  target: Element | null;
}>();

class ResizeObserverMock {
  private readonly record: {
    callback: ResizeObserverCallback;
    target: Element | null;
  };

  constructor(private readonly callback: ResizeObserverCallback) {
    this.record = {
      callback,
      target: null,
    };
    resizeObservers.add(this.record);
  }

  observe(target: Element) {
    this.record.target = target;
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  disconnect() {
    resizeObservers.delete(this.record);
  }

  unobserve() {}
}

function triggerComposerResize() {
  for (const observer of resizeObservers) {
    if (!observer.target) continue;
    observer.callback(
      [{ target: observer.target } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  }
}

function buildUseAppState(overrides: Record<string, unknown> = {}) {
  return {
    chatAvatarSpeaking: false,
    conversationMessages: [
      {
        id: "assistant-1",
        timestamp: Date.now(),
        role: "assistant",
        text: "Latest assistant reply",
      },
    ],
    chatInput: "",
    chatSending: false,
    chatFirstTokenReceived: false,
    agentStatus: { agentName: "rasp" },
    chatPendingImages: [],
    autonomousEvents: [],
    activeGameDisplayName: "",
    activeGameSandbox: "",
    activeGameViewerUrl: "",
    liveHeroSource: null,
    liveLayoutMode: "camera-full",
    setState: vi.fn(),
    handleChatSend: vi.fn(async () => {}),
    handleChatStop: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("AgentCore layout", () => {
  beforeEach(() => {
    composerHeight = 200;
    mockGetConfig.mockRejectedValue(new Error("skip"));
    mockUseVoiceChat.mockReturnValue({
      isListening: false,
      toggleListening: vi.fn(),
    });
    mockUseApp.mockReturnValue(buildUseAppState());

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this instanceof HTMLElement && this.dataset.composerShell !== undefined) {
        return {
          x: 0,
          y: 0,
          width: 1200,
          height: composerHeight,
          top: 0,
          right: 1200,
          bottom: composerHeight,
          left: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        width: 1200,
        height: 0,
        top: 0,
        right: 1200,
        bottom: 0,
        left: 0,
        toJSON() {
          return {};
        },
      } as DOMRect;
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    resizeObservers.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps the conversation viewport above the measured composer height", () => {
    act(() => {
      root?.render(React.createElement(AgentCore));
    });

    const viewport = container?.querySelector("[data-conversation-viewport]") as HTMLDivElement | null;
    const composer = container?.querySelector("[data-composer-shell]") as HTMLFormElement | null;

    expect(composer).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(viewport?.style.bottom).toBe("240px");

    composerHeight = 280;

    act(() => {
      triggerComposerResize();
    });

    expect(viewport?.style.bottom).toBe("320px");
  });

  it("renders operator action blocks as pills instead of raw prompt text in the stage lane", () => {
    mockUseApp.mockReturnValue(
      buildUseAppState({
        conversationMessages: [
          {
            id: "operator-action-1",
            timestamp: Date.now(),
            role: "user",
            text: "internal prompt text that should not render",
            blocks: [
              {
                type: "action-pill",
                label: "Backflip",
                kind: "avatar",
                detail: "One-shot motion",
              },
            ],
            source: "operator_action",
          },
        ],
      }),
    );

    act(() => {
      root?.render(React.createElement(AgentCore));
    });

    const timeline = container?.querySelector("[data-conversation-timeline]");
    const text = timeline?.textContent ?? "";
    const pillEntry = container?.querySelector(
      '[data-stage-entry-role="operator"][data-stage-entry-kind="action-pill"]',
    );

    expect(pillEntry).toBeTruthy();
    expect(text).toContain("Backflip");
    expect(text).toContain("One-shot motion");
    expect(text).not.toContain("internal prompt text that should not render");
  });

  it("collapses legacy operator-action messages into a chip with opt-in details", () => {
    mockUseApp.mockReturnValue(
      buildUseAppState({
        conversationMessages: [
          {
            id: "operator-action-legacy-1",
            timestamp: Date.now(),
            role: "user",
            text: "Open clip vault\ninternal prompt payload that should stay hidden",
            source: "operator_action",
          },
        ],
      }),
    );

    act(() => {
      root?.render(React.createElement(AgentCore));
    });

    const chipEntry = container?.querySelector(
      '[data-stage-entry-role="operator"][data-stage-entry-kind="action-chip"]',
    ) as HTMLDivElement | null;
    const detailsButton = chipEntry?.querySelector("button") as HTMLButtonElement | null;

    expect(chipEntry).toBeTruthy();
    expect(chipEntry?.textContent).toContain("Open clip vault");
    expect(chipEntry?.textContent).not.toContain(
      "internal prompt payload that should stay hidden",
    );

    act(() => {
      detailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(chipEntry?.textContent).toContain(
      "internal prompt payload that should stay hidden",
    );
    expect(container?.querySelector("[data-stage-entry-detail]")).toBeTruthy();
  });

  it("renders operator and assistant bubbles plus centered system events with stable selectors", () => {
    mockUseApp.mockReturnValue(
      buildUseAppState({
        conversationMessages: [
          {
            id: "assistant-1",
            timestamp: 10,
            role: "assistant",
            text: "Assistant reply",
          },
          {
            id: "user-1",
            timestamp: 20,
            role: "user",
            text: "Operator message",
          },
        ],
        autonomousEvents: [
          {
            eventId: "evt-1",
            ts: 30,
            stream: "action",
            payload: {
              actionName: "Switch Scene",
              status: "Live scene updated.",
            },
          },
        ],
      }),
    );

    act(() => {
      root?.render(React.createElement(AgentCore));
    });

    const assistantBubble = container?.querySelector(
      '[data-stage-entry-role="assistant"][data-stage-entry-kind="bubble"]',
    );
    const operatorBubble = container?.querySelector(
      '[data-stage-entry-role="operator"][data-stage-entry-kind="bubble"]',
    );
    const systemEvent = container?.querySelector(
      '[data-stage-entry-role="system"][data-stage-entry-kind="system-event"]',
    );

    expect(assistantBubble?.textContent).toContain("Assistant reply");
    expect(operatorBubble?.textContent).toContain("Operator message");
    expect(systemEvent?.textContent).toContain("Executing Switch Scene");
    expect(systemEvent?.textContent).toContain("Live scene updated.");
  });

  it("renders the same timeline entry set without breakpoint-driven hiding", () => {
    mockUseApp.mockReturnValue(
      buildUseAppState({
        conversationMessages: Array.from({ length: 5 }, (_, index) => ({
          id: `message-${index}`,
          timestamp: index + 1,
          role: index % 2 === 0 ? "assistant" : "user",
          text: `Message ${index + 1}`,
        })),
      }),
    );

    act(() => {
      root?.render(React.createElement(AgentCore));
    });

    const stageEntries = Array.from(
      container?.querySelectorAll("[data-stage-entry-role][data-stage-entry-kind]") ?? [],
    ) as HTMLDivElement[];

    expect(stageEntries).toHaveLength(5);
    expect(stageEntries.every((entry) => !entry.className.includes("hidden"))).toBe(true);
  });
});
