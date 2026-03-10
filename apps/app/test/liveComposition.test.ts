import { describe, expect, it } from "vitest";
import {
  removeLiveSecondarySource,
  resolveLiveHeroSource,
  resolveLiveLayoutMode,
  resolveLiveSceneId,
  upsertLiveSecondarySource,
} from "../src/liveComposition.js";

describe("live composition helpers", () => {
  it("defaults to camera-full and default scene when no secondary source is active", () => {
    expect(resolveLiveLayoutMode([])).toBe("camera-full");
    expect(resolveLiveSceneId("camera-full")).toBe("default");
    expect(resolveLiveHeroSource([])).toBeNull();
  });

  it("switches to camera-hold and active-pip when any secondary source is active", () => {
    const sources = [
      {
        id: "screen-share",
        kind: "screen" as const,
        label: "Screen Share",
        activatedAt: 10,
      },
    ];
    expect(resolveLiveLayoutMode(sources)).toBe("camera-hold");
    expect(resolveLiveSceneId("camera-hold")).toBe("active-pip");
    expect(resolveLiveHeroSource(sources)?.id).toBe("screen-share");
  });

  it("prefers the most recently activated secondary source as the hero frame", () => {
    let sources = upsertLiveSecondarySource([], {
      id: "screen-share",
      kind: "screen",
      label: "Screen Share",
      activatedAt: 10,
    });
    sources = upsertLiveSecondarySource(sources, {
      id: "active-game",
      kind: "game",
      label: "Ninja",
      activatedAt: 20,
    });

    expect(resolveLiveHeroSource(sources)?.id).toBe("active-game");
  });

  it("returns to camera-full when the last secondary source is cleared", () => {
    const withGame = upsertLiveSecondarySource([], {
      id: "active-game",
      kind: "game",
      label: "Ninja",
      activatedAt: 20,
    });
    const cleared = removeLiveSecondarySource(withGame, "active-game");

    expect(resolveLiveLayoutMode(cleared)).toBe("camera-full");
    expect(resolveLiveSceneId(resolveLiveLayoutMode(cleared))).toBe("default");
    expect(resolveLiveHeroSource(cleared)).toBeNull();
  });
});
