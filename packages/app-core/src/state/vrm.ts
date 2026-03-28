import { type BundledVrmAsset, getBootConfig } from "../config/boot-config";
import { resolveAppAssetUrl } from "../utils/asset-url";
import type { UiTheme } from "./ui-preferences";
import { DEFAULT_VISUAL_AVATAR_INDEX } from "@miladyai/shared/onboarding-presets";

// ---------------------------------------------------------------------------
// Bundled VRM asset roster
// ---------------------------------------------------------------------------

/**
 * When the boot roster is empty, still point at a real bundled asset.
 * WHY `"default"` was wrong: `public/vrms` ships `milady-1`…`milady-8` only;
 * a `default.vrm.gz` URL 404s and breaks the companion in desktop/WebView.
 */
const BUNDLED_VRM_FALLBACK_SLUG = "milady-1";

/**
 * Get the VRM asset roster from the boot config.
 * The host app passes its character roster via AppBootConfig.vrmAssets.
 * Returns an empty array if no assets were configured.
 */
function getAssets(): BundledVrmAsset[] {
  const assets = getBootConfig().vrmAssets;
  if (Array.isArray(assets) && assets.length > 0) {
    return assets;
  }
  return [];
}

export const DEFAULT_BUNDLED_VRM_INDEX = DEFAULT_VISUAL_AVATAR_INDEX;

export function getDefaultBundledVrmIndex(): number {
  const count = getAssets().length;
  if (count <= 0) return 1;
  return Math.min(DEFAULT_BUNDLED_VRM_INDEX, count);
}

/** Number of bundled VRM avatars shipped with the app. */
export function getVrmCount(): number {
  return getAssets().length;
}

// Legacy constant — prefer getVrmCount() for dynamic rosters.
export const VRM_COUNT = DEFAULT_BUNDLED_VRM_INDEX;

export function normalizeAvatarIndex(index: number): number {
  if (!Number.isFinite(index)) return getDefaultBundledVrmIndex();
  const n = Math.trunc(index);
  if (n === 0) return 0;
  const count = getAssets().length;
  if (count <= 0) return 1;
  if (n < 1 || n > count) return getDefaultBundledVrmIndex();
  return n;
}

/** Resolve a bundled VRM index (1–N) to its public asset URL. */
export function getVrmUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0)
    return resolveAppAssetUrl(`vrms/${BUNDLED_VRM_FALLBACK_SLUG}.vrm.gz`);
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : getDefaultBundledVrmIndex();
  const slug = assets[safe - 1]?.slug ?? assets[0]?.slug ?? "default";
  return resolveAppAssetUrl(`vrms/${slug}.vrm.gz`);
}

/** Resolve a bundled VRM index (1–N) to its preview thumbnail URL. */
export function getVrmPreviewUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0)
    return resolveAppAssetUrl(`vrms/previews/${BUNDLED_VRM_FALLBACK_SLUG}.png`);
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : getDefaultBundledVrmIndex();
  const slug = assets[safe - 1]?.slug ?? assets[0]?.slug ?? "default";
  return resolveAppAssetUrl(`vrms/previews/${slug}.png`);
}

/** Resolve a bundled VRM index (1-N) to its custom background URL. */
export function getVrmBackgroundUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0)
    return resolveAppAssetUrl(
      `vrms/backgrounds/${BUNDLED_VRM_FALLBACK_SLUG}.png`,
    );
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : getDefaultBundledVrmIndex();
  const slug = assets[safe - 1]?.slug ?? assets[0]?.slug ?? "default";
  return resolveAppAssetUrl(`vrms/backgrounds/${slug}.png`);
}

const COMPANION_THEME_BACKGROUND_INDEX: Record<UiTheme, number> = {
  light: 3,
  dark: 4,
};

/** Resolve the fixed companion-mode background for the current UI theme. */
export function getCompanionBackgroundUrl(theme: UiTheme): string {
  return getVrmBackgroundUrl(COMPANION_THEME_BACKGROUND_INDEX[theme]);
}

/** Human-readable roster title for bundled avatars. */
export function getVrmTitle(index: number): string {
  const assets = getAssets();
  if (assets.length === 0) return "Avatar";
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : getDefaultBundledVrmIndex();
  return assets[safe - 1]?.title ?? assets[0]?.title ?? "Avatar";
}

/** @deprecated Stub — always returns false. Retained for API compatibility. */
export function isOfficialVrmIndex(_index: number): boolean {
  return false;
}

/** @deprecated Stub — always returns false. Retained for API compatibility. */
export function getVrmNeedsFlip(_index: number): boolean {
  return false;
}
