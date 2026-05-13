/**
 * Milady character catalog derived from the shared character preset source.
 */
import type { CharacterCatalogData } from "@miladyai/app-core/config";
import { buildMiladyCharacterCatalog } from "@miladyai/shared/onboarding-presets";

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
