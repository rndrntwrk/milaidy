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
  CHAT_AVATAR_VOICE_EVENT: "milady:chat-avatar-voice",
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

  it("passes the shared chat voice state through to the companion avatar", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(VrmStage, {
          vrmPath: "/vrms/milady-1.vrm",
          fallbackPreviewUrl: "/vrms/previews/milady-1.png",
          t: (key: string) => key,
        }),
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("milady:chat-avatar-voice", {
          detail: { mouthOpen: 0.42, isSpeaking: false },
        }),
      );
    });

    expect(tree).not.toBeNull();
    expect(viewerPropsRef.current).toMatchObject({
      mouthOpen: 0.42,
      isSpeaking: false,
    });
  });

  it("disables canvas parallax and forwards the ready engine callback", async () => {
    const handleEngineReady = vi.fn();
    const setCameraAnimation = vi.fn();
    const setPointerParallaxEnabled = vi.fn();
    const engine = {
      setCameraAnimation,
      setPointerParallaxEnabled,
    };

    await act(async () => {
      TestRenderer.create(
        React.createElement(VrmStage, {
          vrmPath: "/vrms/milady-1.vrm",
          fallbackPreviewUrl: "/vrms/previews/milady-1.png",
          onEngineReady: handleEngineReady,
          t: (key: string) => key,
        }),
      );
    });

    expect(viewerPropsRef.current).not.toBeNull();
    expect(viewerPropsRef.current?.pointerParallax).toBeUndefined();

    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.(engine);
    });

    expect(setCameraAnimation).toHaveBeenCalledTimes(1);
    expect(setPointerParallaxEnabled).toHaveBeenCalledWith(false);
    expect(handleEngineReady).toHaveBeenCalledWith(engine);
  });
});
