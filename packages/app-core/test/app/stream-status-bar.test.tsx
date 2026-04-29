// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { text } from "../../../../test/helpers/react-test";

type TestWindow = Window & {
  __electrobunWindowId?: number;
};

const mockUseApp = vi.fn(() => ({
  t: (key: string, opts?: Record<string, unknown>) =>
    typeof opts?.defaultValue === "string" ? opts.defaultValue : key,
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
        activeDestination: null,
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

describe("StatusBar passive stream pills", () => {
  afterEach(() => {
    delete (window as TestWindow).__electrobunWindowId;
    vi.restoreAllMocks();
  });

  it("renders passive status pills instead of interactive controls", () => {
    const tree = renderStatusBar();

    expect(
      tree.root.findAll((node) => node.type === "select"),
    ).toHaveLength(0);
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "button" &&
          String(node.props.children ?? "").includes("Go Live"),
      ),
    ).toHaveLength(0);
  });

  it("shows destination and live health as passive pills", () => {
    const tree = renderStatusBar({
      streamLive: true,
      activeDestination: { id: "twitch", name: "Twitch" },
      uptime: 65,
      frameCount: 144,
    });

    expect(
      tree.root.findAll((node) => text(node).includes("Twitch")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree.root.findAll((node) => text(node).includes("00:01:05 · 144f")).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
