// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext.js", () => ({
  useApp: () => mockUseApp(),
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

vi.mock("../../src/components/ui/Icons.js", () => ({
  ConnectionIcon: () => React.createElement("span", null, "Connect"),
  StopIcon: () => React.createElement("span", null, "Stop"),
}));

import { MiladyStatusStrip } from "../../src/components/MiladyStatusStrip.js";

function makeContext(overrides?: Record<string, unknown>) {
  return {
    connected: true,
    agentStatus: null,
    plugins: [],
    chatSending: false,
    liveBroadcastState: "offline",
    liveHeroSource: null,
    quickLayerStatuses: {
      "go-live": "disabled",
      "end-live": "available",
    },
    runQuickLayer: vi.fn(async () => {}),
    openGoLiveModal: vi.fn(),
    ...overrides,
  };
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
) {
  return root.find(
    (node) =>
      node.type === "button" &&
      node.children.some(
        (child) => typeof child === "string" && child.includes(label),
      ),
  );
}

describe("MiladyStatusStrip", () => {
  it("opens the go-live modal instead of dispatching the quick layer when offline", async () => {
    const ctx = makeContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(MiladyStatusStrip));
    });

    await act(async () => {
      findButtonByText(tree!.root, "Go Live").props.onClick();
    });

    expect(ctx.openGoLiveModal).toHaveBeenCalled();
    expect(ctx.runQuickLayer).not.toHaveBeenCalled();
  });

  it("still uses the end-live quick layer when already live", async () => {
    const ctx = makeContext({
      liveBroadcastState: "live",
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(MiladyStatusStrip));
    });

    await act(async () => {
      findButtonByText(tree!.root, "End Live").props.onClick();
    });

    expect(ctx.runQuickLayer).toHaveBeenCalledWith("end-live");
  });
});
