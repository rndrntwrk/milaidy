/**
 * Built-in tool schemas barrel export and registration.
 *
 * @module autonomy/tools/schemas
 */

import type { ToolRegistryInterface } from "../types.js";
import { PLAY_EMOTE } from "./emote.schema.js";
import { INSTALL_PLUGIN } from "./install-plugin.schema.js";
import {
  ANALYZE_IMAGE,
  GENERATE_AUDIO,
  GENERATE_IMAGE,
  GENERATE_VIDEO,
} from "./media.schema.js";
import { RESTART_AGENT } from "./restart.schema.js";
import { RUN_IN_TERMINAL } from "./terminal.schema.js";

export { createCustomActionContract } from "./custom-action.schema.js";
export { PLAY_EMOTE } from "./emote.schema.js";
export { INSTALL_PLUGIN } from "./install-plugin.schema.js";
export {
  ANALYZE_IMAGE,
  GENERATE_AUDIO,
  GENERATE_IMAGE,
  GENERATE_VIDEO,
} from "./media.schema.js";
export { RESTART_AGENT } from "./restart.schema.js";
export { RUN_IN_TERMINAL } from "./terminal.schema.js";

/**
 * All built-in tool contracts.
 */
export const BUILTIN_CONTRACTS = [
  RUN_IN_TERMINAL,
  INSTALL_PLUGIN,
  GENERATE_IMAGE,
  GENERATE_VIDEO,
  GENERATE_AUDIO,
  ANALYZE_IMAGE,
  PLAY_EMOTE,
  RESTART_AGENT,
] as const;

/**
 * Register all built-in tool contracts into a registry.
 */
export function registerBuiltinToolContracts(
  registry: ToolRegistryInterface,
): void {
  for (const contract of BUILTIN_CONTRACTS) {
    registry.register(contract);
  }
}
