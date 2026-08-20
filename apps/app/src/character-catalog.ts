/**
 * Milady character catalog derived from the shared character preset source.
 */
import type { CharacterCatalogData } from "@miladyai/app-core/config";
import {
  buildMiladyCharacterCatalog,
  DEFAULT_VISUAL_AVATAR_INDEX,
  getStylePresets,
} from "@miladyai/shared/onboarding-presets";

export const APP_VRM_ASSET_NAMESPACE = "milady";
export const ALICE_CAMERA_DISTANCE_SCALE = 1.3;
export const ALICE_EDGE_VRM_URL =
  "https://assets.rndrntwrk.com/alice/vrms/milady-9-ccbe2ea31713e33d08c1d0cd6be3aab6c90155ff6488ce2d9bc23e86d5d66ac2.vrm.gz";
export const APP_STYLE_PRESETS = getStylePresets();

export function buildAppVrmAssets(
  stylePresets = getStylePresets(),
) {
  const presetsByAvatarIndex = new Map<number, (typeof stylePresets)[number]>();

  for (const preset of stylePresets) {
    const avatarIndex = Math.trunc(preset.avatarIndex);
    if (!Number.isFinite(avatarIndex) || avatarIndex < 1) continue;
    if (!presetsByAvatarIndex.has(avatarIndex)) {
      presetsByAvatarIndex.set(avatarIndex, preset);
    }
  }

  return [...presetsByAvatarIndex.values()]
    .sort((left, right) => left.avatarIndex - right.avatarIndex)
    .map((preset) => ({
      title: preset.name,
      slug: `${APP_VRM_ASSET_NAMESPACE}-${preset.avatarIndex}`,
      ...(preset.avatarIndex === DEFAULT_VISUAL_AVATAR_INDEX
        ? {
            cameraDistanceScale: ALICE_CAMERA_DISTANCE_SCALE,
            vrmUrl: ALICE_EDGE_VRM_URL,
          }
        : {}),
    }));
}

export const APP_VRM_ASSETS = buildAppVrmAssets(APP_STYLE_PRESETS);

export const MILADY_CHARACTER_CATALOG: CharacterCatalogData =
  buildMiladyCharacterCatalog() as CharacterCatalogData;

/**
 * Upstream-compatible alias for the generic boot config surface.
 *
 * PR #150 brought the upstream baseline of `apps/app/src/main.tsx` into
 * alice. Upstream's main.tsx imports `APP_CHARACTER_CATALOG` from
 * `./character-catalog` — but alice's file still only exports the legacy
 * `MILADY_CHARACTER_CATALOG` name. Rollup fails the static bind in the
 * SPA build (deploy #43).
 *
 * Same additive shape as PR #181's `APP_ENV_PREFIX` / `APP_ENV_ALIASES`
 * aliases in `brand-env.ts`: keep `MILADY_*` as the canonical alice
 * symbol, expose `APP_*` as the upstream-name alias.
 */
export const APP_CHARACTER_CATALOG = MILADY_CHARACTER_CATALOG;
