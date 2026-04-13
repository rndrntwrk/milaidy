/**
 * Personality / self-modification — bundled with advanced capabilities.
 * Replaces the standalone `@elizaos/plugin-personality` package for TypeScript core.
 */

export * from "./types.ts";
export { CharacterFileManager } from "./services/character-file-manager.ts";
export { modifyCharacterAction } from "./actions/modify-character.ts";
export { characterEvolutionEvaluator } from "./evaluators/character-evolution.ts";
export { userPersonalityProvider } from "./providers/user-personality.ts";
