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
import { PHETTA_NOTIFY, PHETTA_SEND_EVENT } from "./phetta.schema.js";
import { RESTART_AGENT } from "./restart.schema.js";
import { RUN_IN_TERMINAL } from "./terminal.schema.js";
import { CREATE_TASK } from "./trigger.schema.js";

export { createCustomActionContract } from "./custom-action.schema.js";
export { BUILTIN_TOOL_FIXTURES } from "./fixtures.js";
export { PLAY_EMOTE } from "./emote.schema.js";
export { INSTALL_PLUGIN } from "./install-plugin.schema.js";
export {
  ANALYZE_IMAGE,
  GENERATE_AUDIO,
  GENERATE_IMAGE,
  GENERATE_VIDEO,
} from "./media.schema.js";
export { PHETTA_NOTIFY, PHETTA_SEND_EVENT } from "./phetta.schema.js";
export { RESTART_AGENT } from "./restart.schema.js";
export { RUN_IN_TERMINAL } from "./terminal.schema.js";
export { CREATE_TASK } from "./trigger.schema.js";

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
  CREATE_TASK,
  PHETTA_NOTIFY,
  PHETTA_SEND_EVENT,
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
