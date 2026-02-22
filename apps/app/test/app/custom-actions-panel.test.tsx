import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

interface PluginStub {
  id: string;
  name: string;
  enabled?: boolean;
  isActive?: boolean;
}

interface AppContextStub {
  plugins: PluginStub[];
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  setTab: (tab: string) => void;
}

const { mockUseApp, mockClient } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    listCustomActions: vi.fn(),
    updateCustomAction: vi.fn(),
    deleteCustomAction: vi.fn(),
  },
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
}));

import { CustomActionsPanel } from "../../src/components/CustomActionsPanel";

function createContext(overrides?: Partial<AppContextStub>): AppContextStub {
  return {
    plugins: [],
    setActionNotice: vi.fn(),
    setTab: vi.fn(),
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
  if (!matches[0]) throw new Error(`Button "${label}" not found`);
  return matches[0];
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("CustomActionsPanel default dock actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseApp.mockReset();
    mockClient.listCustomActions.mockReset();
    mockClient.updateCustomAction.mockReset();
    mockClient.deleteCustomAction.mockReset();
    mockClient.listCustomActions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders built-in stream quick actions in the drawer", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CustomActionsPanel, {
          open: true,
          onClose: vi.fn(),
          onOpenEditor: vi.fn(),
        }),
      );
    });
    await flush();

    expect(findButtonByText(tree!.root, "Go Live")).toBeTruthy();
    expect(findButtonByText(tree!.root, "Screen Share")).toBeTruthy();
    expect(findButtonByText(tree!.root, "PiP")).toBeTruthy();
    expect(findButtonByText(tree!.root, "End Live")).toBeTruthy();
  });

  it("dispatches quick-layer event from drawer and closes panel", async () => {
    const ctx = createContext();
    const onClose = vi.fn();
    mockUseApp.mockReturnValue(ctx);

    let receivedLayerId: string | undefined;
    const listener = (raw: Event) => {
      const event = raw as CustomEvent<{ layerId?: string }>;
      receivedLayerId = event.detail?.layerId;
    };
    window.addEventListener("milaidy:quick-layer:run", listener as EventListener);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CustomActionsPanel, {
          open: true,
          onClose,
          onOpenEditor: vi.fn(),
        }),
      );
    });
    await flush();

    await act(async () => {
      findButtonByText(tree!.root, "Go Live").props.onClick();
      vi.advanceTimersByTime(130);
    });

    expect(ctx.setTab).toHaveBeenCalledWith("chat");
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      expect.stringContaining("Go Live"),
      "info",
      2200,
    );
    expect(onClose).toHaveBeenCalled();
    expect(receivedLayerId).toBe("go-live");

    window.removeEventListener("milaidy:quick-layer:run", listener as EventListener);
  });

  it("marks quick action as disabled when plugin is disabled", async () => {
    const ctx = createContext({
      plugins: [
        {
          id: "stream555-control",
          name: "stream555-control",
          enabled: false,
          isActive: false,
        },
      ],
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CustomActionsPanel, {
          open: true,
          onClose: vi.fn(),
          onOpenEditor: vi.fn(),
        }),
      );
    });
    await flush();

    const goLiveButton = findButtonByText(tree!.root, "Go Live");
    expect(goLiveButton.props.title).toContain("(disabled)");
  });
});
