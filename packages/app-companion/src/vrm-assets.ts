import { DEFAULT_VISUAL_AVATAR_INDEX } from "@elizaos/shared/onboarding-presets";
import { resolveAppAssetUrl, type UiTheme } from "@elizaos/ui";
import { type BundledVrmAsset, getBootConfig } from "@miladyai/app-core/config";

const BUNDLED_VRM_FALLBACK_SLUG = "milady-1";
const BUNDLED_AVATAR_IMAGE_VERSION_BY_SLUG: Record<string, string> = {
  "milady-9": "20260413-alice-capture",
};
const COMPANION_THEME_BACKGROUND_INDEX: Record<UiTheme, number> = {
  light: 3,
  dark: 4,
};

function resolveBundledAvatarImageUrl(assetPath: string, slug: string): string {
  const version = BUNDLED_AVATAR_IMAGE_VERSION_BY_SLUG[slug];
  const versionedPath = version ? `${assetPath}?v=${version}` : assetPath;
  return resolveAppAssetUrl(versionedPath);
}

function getAssets(): BundledVrmAsset[] {
  const assets = getBootConfig().vrmAssets;
  return Array.isArray(assets) && assets.length > 0 ? assets : [];
}

export function getVrmCount(): number {
  return getAssets().length;
}

export const DEFAULT_BUNDLED_VRM_INDEX = DEFAULT_VISUAL_AVATAR_INDEX;

function findAliceBundledVrmIndex(assets: BundledVrmAsset[]): number | null {
  return getBundledAssetForIndex(assets, DEFAULT_VISUAL_AVATAR_INDEX)
    ? DEFAULT_VISUAL_AVATAR_INDEX
    : null;
}

function rosterUsesIndexedSlugs(assets: BundledVrmAsset[]): boolean {
  return assets.some((asset) => /-\d+$/.test(asset.slug));
}

function getBundledAssetForIndex(
  assets: BundledVrmAsset[],
  index: number,
): BundledVrmAsset | undefined {
  if (index < 1) return undefined;
  const indexed = assets.find((asset) => asset.slug.endsWith(`-${index}`));
  if (indexed) return indexed;
  if (rosterUsesIndexedSlugs(assets)) return undefined;
  return assets[index - 1];
}

export function getDefaultBundledVrmIndex(): number {
  const assets = getAssets();
  const count = assets.length;
  if (count <= 0) return 1;
  return findAliceBundledVrmIndex(assets) ?? 1;
}

export const VRM_COUNT = DEFAULT_BUNDLED_VRM_INDEX;

export function normalizeAvatarIndex(index: number): number {
  if (!Number.isFinite(index)) return getDefaultBundledVrmIndex();
  const n = Math.trunc(index);
  if (n === 0) return 0;
  const assets = getAssets();
  if (assets.length <= 0) return 1;
  if (!getBundledAssetForIndex(assets, n)) return getDefaultBundledVrmIndex();
  return n;
}

export function isAliceBundledAvatarIndex(index: number): boolean {
  if (!Number.isFinite(index)) return false;
  return Math.trunc(index) === DEFAULT_VISUAL_AVATAR_INDEX;
}

export function getVrmUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0) {
    return resolveAppAssetUrl(`vrms/${BUNDLED_VRM_FALLBACK_SLUG}.vrm.gz`);
  }
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : getDefaultBundledVrmIndex();
  const slug =
    getBundledAssetForIndex(assets, safe)?.slug ?? assets[0]?.slug ?? "default";
  return resolveAppAssetUrl(`vrms/${slug}.vrm.gz`);
}

export function getVrmPreviewUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0) {
    return resolveAppAssetUrl(`vrms/previews/${BUNDLED_VRM_FALLBACK_SLUG}.png`);
  }
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : getDefaultBundledVrmIndex();
  const slug =
    getBundledAssetForIndex(assets, safe)?.slug ?? assets[0]?.slug ?? "default";
  return resolveBundledAvatarImageUrl(`vrms/previews/${slug}.png`, slug);
}

export function getVrmBackgroundUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0) {
    return resolveAppAssetUrl(
      `vrms/backgrounds/${BUNDLED_VRM_FALLBACK_SLUG}.png`,
    );
  }
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : getDefaultBundledVrmIndex();
  const slug =
    getBundledAssetForIndex(assets, safe)?.slug ?? assets[0]?.slug ?? "default";
  return resolveBundledAvatarImageUrl(`vrms/backgrounds/${slug}.png`, slug);
}

export function getCompanionBackgroundUrl(theme: UiTheme): string {
  return getVrmBackgroundUrl(COMPANION_THEME_BACKGROUND_INDEX[theme]);
}

export function getVrmTitle(index: number): string {
  const assets = getAssets();
  if (assets.length === 0) return "Avatar";
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : getDefaultBundledVrmIndex();
  return (
    getBundledAssetForIndex(assets, safe)?.title ?? assets[0]?.title ?? "Avatar"
  );
}
