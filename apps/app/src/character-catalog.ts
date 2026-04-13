/**
 * Milady character catalog derived from the shared character preset source.
 */
import type { CharacterCatalogData } from "@elizaos/app-core/config";
import { buildMiladyCharacterCatalog } from "@elizaos/shared/onboarding-presets";

export const MILADY_CHARACTER_CATALOG: CharacterCatalogData =
  buildMiladyCharacterCatalog() as CharacterCatalogData;
