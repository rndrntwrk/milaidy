// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const viewerPropsRef: {
  current: null | Record<string, unknown>;
} = { current: null };

vi.mock("@milady/app-core/api", () => ({
  client: {
    onWsEvent: vi.fn(() => () => {}),
  },
}));

vi.mock("@milady/app-core/events", () => ({
  STOP_EMOTE_EVENT: "stop-emote",
}));

vi.mock("@milady/app-core/utils", () => ({
  resolveAppAssetUrl: (path: string) => path,
}));

vi.mock("../../src/components/avatar/VrmViewer", () => ({
  VrmViewer: (props: Record<string, unknown>) => {
    viewerPropsRef.current = props;
    return React.createElement("div", null, "VrmViewer");
  },
}));

vi.mock("../../src/components/avatar/AvatarLoader", () => ({
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
}));

vi.mock("../../src/components/BubbleEmote", () => ({
  BubbleEmote: () => React.createElement("div", null, "BubbleEmote"),
}));

import { VrmStage } from "../../src/components/companion/VrmStage";

describe("VrmStage", () => {
  beforeEach(() => {
    viewerPropsRef.current = null;
  });

  it("renders the stage layer without a stage-level opacity gate", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(VrmStage, {
          vrmPath: "/vrms/milady-1.vrm",
          worldUrl: "/worlds/companion-day.spz",
          fallbackPreviewUrl: "/vrms/previews/milady-1.png",
          t: (key: string) => key,
        }),
      );
    });

    expect(tree).not.toBeNull();
    const stageLayer = tree?.root.find(
      (node) =>
        node.type === "div" &&
        node.props.style &&
        Object.hasOwn(node.props.style, "opacity"),
    );
    expect(stageLayer?.props.style.opacity).toBe(1);
  });
});
