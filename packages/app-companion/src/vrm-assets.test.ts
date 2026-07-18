import { DEFAULT_VISUAL_AVATAR_INDEX, getStylePresets } from "@elizaos/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

type BootConfig = { branding: Record<string, unknown>; vrmAssets?: VrmAsset[] };
type VrmAsset = { title: string; slug: string };

let bootConfig: BootConfig = { branding: {} };

vi.mock("@miladyai/app-core/config", () => ({
  getBootConfig: () => bootConfig,
  setBootConfig: (config: BootConfig) => {
    bootConfig = config;
  },
}));

vi.mock("@elizaos/ui", () => ({
  resolveAppAssetUrl: (assetPath: string) =>
    `/${assetPath.replace(/^\/+/, "")}`,
}));

const vrmAssets = await import("./vrm-assets");

function configureMiladyRoster(): void {
  bootConfig = {
    branding: {},
    vrmAssets: getStylePresets()
      .slice()
      .sort((left, right) => left.avatarIndex - right.avatarIndex)
      .map((preset) => ({
        title: preset.name,
        slug: `milady-${preset.avatarIndex}`,
      })),
  };
}

describe("companion Alice VRM assets", () => {
  afterEach(() => {
    bootConfig = { branding: {} };
  });

  it("normalizes invalid bundled indices to Alice when Alice is in the roster", () => {
    configureMiladyRoster();

    expect(DEFAULT_VISUAL_AVATAR_INDEX).toBe(9);
    expect(vrmAssets.getDefaultBundledVrmIndex()).toBe(9);
    expect(vrmAssets.normalizeAvatarIndex(Number.POSITIVE_INFINITY)).toBe(9);
    expect(vrmAssets.normalizeAvatarIndex(42)).toBe(9);
    expect(vrmAssets.normalizeAvatarIndex(9)).toBe(9);
    expect(vrmAssets.normalizeAvatarIndex(0)).toBe(0);
    expect(vrmAssets.isAliceBundledAvatarIndex(9)).toBe(true);
  });

  it("resolves Alice companion assets with cache-busted preview imagery", () => {
    configureMiladyRoster();

    expect(vrmAssets.getVrmUrl(42)).toBe("/vrms/milady-9.vrm.gz");
    expect(vrmAssets.getVrmPreviewUrl(42)).toBe(
      "/vrms/previews/milady-9.png?v=20260413-alice-capture",
    );
    expect(vrmAssets.getVrmBackgroundUrl(42)).toBe(
      "/vrms/backgrounds/milady-9.png?v=20260413-alice-capture",
    );
    expect(vrmAssets.getVrmTitle(42)).toBe("Alice");
  });

  it("keeps Alice on the verified Milady 9 asset pair", () => {
    configureMiladyRoster();

    expect(DEFAULT_VISUAL_AVATAR_INDEX).toBe(9);
    expect(vrmAssets.getVrmUrl(9)).toBe("/vrms/milady-9.vrm.gz");
    expect(vrmAssets.getVrmPreviewUrl(9)).toBe(
      "/vrms/previews/milady-9.png?v=20260413-alice-capture",
    );
    expect(vrmAssets.getVrmBackgroundUrl(9)).toBe(
      "/vrms/backgrounds/milady-9.png?v=20260413-alice-capture",
    );
    expect(vrmAssets.getVrmTitle(9)).toBe("Alice");
  });
});
