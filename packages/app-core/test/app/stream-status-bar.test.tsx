// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

type TestWindow = Window & {
  __electrobunWindowId?: number;
};

const mockUseApp = vi.fn(() => ({
  t: (key: string) => key,
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import { StatusBar } from "../../src/components/stream/StatusBar";

function renderStatusBar(
  overrides: Partial<React.ComponentProps<typeof StatusBar>> = {},
) {
  let tree: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    tree = TestRenderer.create(
      React.createElement(StatusBar, {
        agentName: "Eliza",
        streamAvailable: true,
        streamLive: false,
        streamLoading: false,
        onToggleStream: vi.fn(),
        destinations: [],
        activeDestination: null,
        onDestinationChange: vi.fn(),
        uptime: 0,
        frameCount: 0,
        ...overrides,
      }),
    );
  });
  if (!tree) {
    throw new Error("Expected StatusBar test renderer to be created.");
  }
  return tree;
}

describe("StatusBar stream popout button", () => {
  afterEach(() => {
    delete (window as TestWindow).__electrobunWindowId;
    vi.restoreAllMocks();
  });

  it("hides the browser popout control inside Electrobun", () => {
    (window as TestWindow).__electrobunWindowId = 1;

    const tree = renderStatusBar();

    expect(
      tree.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props.title === "statusbar.PopOutStreamView",
      ),
    ).toHaveLength(0);
  });

  it("keeps the browser popout control on the web", () => {
    const tree = renderStatusBar();

    expect(
      tree.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props.title === "statusbar.PopOutStreamView",
      ),
    ).toHaveLength(1);
  });

  it("renders a destination selector when streaming destinations exist", () => {
    const onDestinationChange = vi.fn();
    const tree = renderStatusBar({
      destinations: [
        { id: "twitch", name: "Twitch" },
        { id: "youtube", name: "YouTube" },
      ],
      activeDestination: { id: "twitch", name: "Twitch" },
      onDestinationChange,
    });

    const select = tree.root.findByType("select");
    expect(select.props.value).toBe("twitch");

    act(() => {
      select.props.onChange({ target: { value: "youtube" } });
    });

    expect(onDestinationChange).toHaveBeenCalledWith("youtube");
  });
});
