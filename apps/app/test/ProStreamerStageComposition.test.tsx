// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/components/ChatAvatar", () => ({
  ChatAvatar: ({
    isSpeaking,
    sceneMark,
    scenePreset,
  }: {
    isSpeaking?: boolean;
    sceneMark?: string;
    scenePreset?: string;
  }) =>
    React.createElement(
      "div",
      {
        "data-chat-avatar": isSpeaking ? "speaking" : "idle",
        "data-scene-mark": sceneMark ?? "stage",
        "data-scene-preset": scenePreset ?? "default",
      },
      "ChatAvatar",
    ),
}));

import { ProStreamerStageComposition } from "../src/components/ProStreamerStageComposition";

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

function renderStage(
  props: React.ComponentProps<typeof ProStreamerStageComposition>,
) {
  let tree: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    tree = TestRenderer.create(<ProStreamerStageComposition {...props} />);
  });
  if (!tree) throw new Error("failed to render stage");
  return tree;
}

describe("ProStreamerStageComposition", () => {
  it("renders Alice camera full when no hero source is active", () => {
    const tree = renderStage({
      agentName: "Alice",
      activeGameDisplayName: "",
      activeGameSandbox: "",
      activeGameViewerUrl: "",
      isSpeaking: false,
      liveHeroSource: null,
      liveLayoutMode: "camera-full",
    });

    const layoutNode = tree.root.findByProps({ "data-stage-layout": "camera-full" });
    expect(layoutNode).toBeDefined();
    expect(textOf(tree.root)).toContain("Alice Camera");
    expect(
      tree.root.findByProps({ "data-stage-context-pill": true }).children.join(""),
    ).toContain("Alice Camera");
    expect(tree.root.findAllByType("iframe")).toHaveLength(0);
    expect(
      tree.root.findByProps({
        "data-scene-mark": "stage",
        "data-scene-preset": "pro-streamer-stage",
      }),
    ).toBeDefined();
  });

  it("renders the active game as hero and keeps Alice in hold", () => {
    const tree = renderStage({
      agentName: "Alice",
      activeGameDisplayName: "Hyper Racer",
      activeGameSandbox: "allow-scripts allow-same-origin",
      activeGameViewerUrl: "https://games.example/hyper-racer",
      isSpeaking: true,
      liveHeroSource: {
        id: "active-game",
        kind: "game",
        label: "Hyper Racer",
        activatedAt: 100,
        viewerUrl: "https://games.example/hyper-racer",
      },
      liveLayoutMode: "camera-hold",
    });

    expect(tree.root.findByProps({ "data-stage-layout": "camera-hold" })).toBeDefined();
    expect(tree.root.findByProps({ "data-stage-camera-hold": true })).toBeDefined();

    const iframe = tree.root.findByType("iframe");
    expect(iframe.props.src).toBe("https://games.example/hyper-racer");
    expect(iframe.props.title).toBe("Hyper Racer hero feed");
    expect(
      tree.root.findByProps({ "data-stage-context-pill": true }).children.join(""),
    ).toContain("Game · Hyper Racer");
    expect(textOf(tree.root)).toContain("Alice");
    expect(
      tree.root.findByProps({
        "data-scene-mark": "portrait",
        "data-scene-preset": "pro-streamer-stage",
      }),
    ).toBeDefined();
    expect(tree.root.findAllByProps({ "data-chat-avatar": "speaking" })).toHaveLength(1);
  });

  it("shows a placeholder hero when the source is active but not locally viewable", () => {
    const tree = renderStage({
      agentName: "Alice",
      activeGameDisplayName: "",
      activeGameSandbox: "",
      activeGameViewerUrl: "",
      isSpeaking: false,
      liveHeroSource: {
        id: "screen-share",
        kind: "screen",
        label: "Screen Share",
        activatedAt: 200,
      },
      liveLayoutMode: "camera-hold",
    });

    expect(tree.root.findByProps({ "data-stage-hero-placeholder": true })).toBeDefined();
    expect(tree.root.findAllByType("iframe")).toHaveLength(0);
    expect(textOf(tree.root)).toContain("Screen Hero");
    expect(textOf(tree.root)).toContain("Screen share active");
    expect(
      tree.root.findByProps({
        "data-scene-mark": "portrait",
        "data-scene-preset": "pro-streamer-stage",
      }),
    ).toBeDefined();
  });
});
