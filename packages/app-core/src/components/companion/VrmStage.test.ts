// @vitest-environment jsdom
import React from "react";
import type { ReactTestRenderer } from "react-test-renderer";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  viewerProps: null as Record<string, unknown> | null,
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useChatAvatarVoiceState: () => ({ mouthOpen: 0, isSpeaking: false }),
  useRenderGuard: () => {},
}));

vi.mock("@miladyai/app-core/utils", () => ({
  resolveAppAssetUrl: (path: string) => path,
  resolveRootPublicAssetUrl: (path: string) => path,
}));

vi.mock("../character/AvatarLoader", () => ({
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
}));

vi.mock("../avatar/VrmViewer", () => ({
  VrmViewer: (props: Record<string, unknown>) => {
    testState.viewerProps = props;
    return React.createElement("div", {
      "data-testid": "vrm-viewer",
      "data-vrm-path": props.vrmPath ?? "",
      "data-environment-theme": props.environmentTheme ?? "",
      "data-active": String((props.active as boolean | undefined) ?? true),
    });
  },
}));

import { VrmStage } from "./VrmStage";

function getViewerNode(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    (node) => node.props["data-testid"] === "vrm-viewer",
  );
}

function renderStage(props: {
  vrmPath: string;
  environmentTheme?: "light" | "dark";
  fallbackPreviewUrl: string;
}): React.ReactElement {
  return React.createElement(VrmStage, {
    ...props,
    t: (key: string) => key,
  });
}

describe("VrmStage", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    testState.viewerProps = null;
    renderer = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = null;
    }
    vi.useRealTimers();
  });

  it("renders a single VrmViewer with vrmPath and environmentTheme", async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        renderStage({
          vrmPath: "/vrms/eliza-1.vrm.gz",
          environmentTheme: "light",
          fallbackPreviewUrl: "/vrms/previews/eliza-1.png",
        }),
      );
    });

    const viewers = getViewerNode(renderer!);
    expect(viewers).toHaveLength(1);
    expect(viewers[0]?.props["data-vrm-path"]).toBe("/vrms/eliza-1.vrm.gz");
    expect(viewers[0]?.props["data-environment-theme"]).toBe("light");
  });

  it("keeps the same single VrmViewer when vrmPath changes (theme stays stable)", async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        renderStage({
          vrmPath: "/vrms/eliza-1.vrm.gz",
          environmentTheme: "light",
          fallbackPreviewUrl: "/vrms/previews/eliza-1.png",
        }),
      );
    });

    await act(async () => {
      renderer?.update(
        renderStage({
          vrmPath: "/vrms/eliza-4.vrm.gz",
          environmentTheme: "light",
          fallbackPreviewUrl: "/vrms/previews/eliza-4.png",
        }),
      );
    });

    // Still only one VrmViewer — same engine, just different vrmPath
    const viewers = getViewerNode(renderer!);
    expect(viewers).toHaveLength(1);
    expect(viewers[0]?.props["data-vrm-path"]).toBe("/vrms/eliza-4.vrm.gz");
    // environmentTheme stays the same — background is decoupled from character
    expect(viewers[0]?.props["data-environment-theme"]).toBe("light");
  });

  it("does not show a loader overlay when avatar loading exceeds four seconds", async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        renderStage({
          vrmPath: "/vrms/eliza-1.vrm.gz",
          fallbackPreviewUrl: "/vrms/previews/eliza-1.png",
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });

    // VRM loads silently — no loading overlay or AvatarLoader rendered
    expect(renderer?.root.findAllByType("img")).toHaveLength(0);
    expect(
      renderer?.root.findAll(
        (node) =>
          node.type === "div" &&
          Array.isArray(node.children) &&
          node.children.includes("AvatarLoader"),
      ),
    ).toHaveLength(0);
  });

  it("shows the static preview only after a real avatar load error", async () => {
    const vrmPath = "/vrms/eliza-1.vrm.gz";
    const fallbackPreviewUrl = "/vrms/previews/eliza-1.png";

    await act(async () => {
      renderer = TestRenderer.create(
        renderStage({
          vrmPath,
          fallbackPreviewUrl,
        }),
      );
    });

    await act(async () => {
      const onEngineState = testState.viewerProps?.onEngineState as
        | ((state: Record<string, unknown>) => void)
        | undefined;
      onEngineState?.({ vrmLoaded: false, loadError: "failed to load" });
    });

    const previewImages = renderer?.root.findAllByType("img") ?? [];
    expect(previewImages).toHaveLength(1);
    expect(previewImages[0]?.props.src).toBe(fallbackPreviewUrl);
  });

  it("acknowledges an emote only after the real VrmEngine starts it", async () => {
    const detail = {
      emoteId: "dance-happy",
      path: "/animations/emotes/dance-happy.glb",
      duration: 3,
      loop: false,
    };
    const playEmote = vi.fn().mockResolvedValue(true);
    const acknowledgements: unknown[] = [];
    const onApplied = (event: Event) => {
      acknowledgements.push((event as CustomEvent).detail);
    };
    window.addEventListener("eliza:app-emote-applied", onApplied);

    try {
      await act(async () => {
        renderer = TestRenderer.create(
          renderStage({
            vrmPath: "/vrms/eliza-1.vrm.gz",
            fallbackPreviewUrl: "/vrms/previews/eliza-1.png",
          }),
        );
      });
      await act(async () => {
        const onEngineReady = testState.viewerProps?.onEngineReady as
          | ((engine: {
              playEmote: typeof playEmote;
              setCameraAnimation: ReturnType<typeof vi.fn>;
              setPointerParallaxEnabled: ReturnType<typeof vi.fn>;
            }) => void)
          | undefined;
        onEngineReady?.({
          playEmote,
          setCameraAnimation: vi.fn(),
          setPointerParallaxEnabled: vi.fn(),
        });
        window.dispatchEvent(new CustomEvent("eliza:app-emote", { detail }));
        await Promise.resolve();
      });

      expect(playEmote).toHaveBeenCalledWith(
        "/animations/emotes/dance-happy.glb",
        3,
        false,
      );
      expect(acknowledgements).toEqual([detail]);
    } finally {
      window.removeEventListener("eliza:app-emote-applied", onApplied);
    }
  });

  it("does not acknowledge an emote that the VrmEngine cannot start", async () => {
    const playEmote = vi.fn().mockResolvedValue(false);
    const onApplied = vi.fn();
    window.addEventListener("eliza:app-emote-applied", onApplied);

    try {
      await act(async () => {
        renderer = TestRenderer.create(
          renderStage({
            vrmPath: "/vrms/eliza-1.vrm.gz",
            fallbackPreviewUrl: "/vrms/previews/eliza-1.png",
          }),
        );
      });
      await act(async () => {
        const onEngineReady = testState.viewerProps?.onEngineReady as
          | ((engine: {
              playEmote: typeof playEmote;
              setCameraAnimation: ReturnType<typeof vi.fn>;
              setPointerParallaxEnabled: ReturnType<typeof vi.fn>;
            }) => void)
          | undefined;
        onEngineReady?.({
          playEmote,
          setCameraAnimation: vi.fn(),
          setPointerParallaxEnabled: vi.fn(),
        });
        window.dispatchEvent(
          new CustomEvent("eliza:app-emote", {
            detail: {
              emoteId: "jump",
              path: "/animations/emotes/jump.glb",
              duration: 2,
              loop: false,
            },
          }),
        );
        await Promise.resolve();
      });

      expect(playEmote).toHaveBeenCalledTimes(1);
      expect(onApplied).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("eliza:app-emote-applied", onApplied);
    }
  });
});
