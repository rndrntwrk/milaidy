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

describe("AgentCore layout", () => {
  beforeEach(() => {
    composerHeight = 200;
    mockGetConfig.mockRejectedValue(new Error("skip"));
    mockUseVoiceChat.mockReturnValue({
      isListening: false,
      toggleListening: vi.fn(),
    });
    mockUseApp.mockReturnValue({
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
    });

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
});
