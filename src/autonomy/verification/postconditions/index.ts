/**
 * Built-in post-conditions barrel export and registration.
 *
 * @module autonomy/verification/postconditions
 */

import type { PostConditionVerifierInterface } from "../types.js";
import { installPluginPostConditions } from "./install-plugin.postcondition.js";
import { terminalPostConditions } from "./terminal.postcondition.js";

export { installPluginPostConditions } from "./install-plugin.postcondition.js";
export { terminalPostConditions } from "./terminal.postcondition.js";

/**
 * Register all built-in post-conditions into a verifier.
 */
export function registerBuiltinPostConditions(
  verifier: PostConditionVerifierInterface,
): void {
  verifier.registerConditions("RUN_IN_TERMINAL", terminalPostConditions);
  verifier.registerConditions("INSTALL_PLUGIN", installPluginPostConditions);
}
