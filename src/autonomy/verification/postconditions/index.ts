/**
 * Built-in post-conditions barrel export and registration.
 *
 * @module autonomy/verification/postconditions
 */

import type { PostConditionVerifierInterface } from "../types.js";
import { customActionPostConditions } from "./custom-action.postcondition.js";
import { emotePostConditions } from "./emote.postcondition.js";
import { installPluginPostConditions } from "./install-plugin.postcondition.js";
import { mediaPostConditions } from "./media.postcondition.js";
import { phettaPostConditions } from "./phetta.postcondition.js";
import { restartPostConditions } from "./restart.postcondition.js";
import { terminalPostConditions } from "./terminal.postcondition.js";
import { triggerPostConditions } from "./trigger.postcondition.js";

export { customActionPostConditions } from "./custom-action.postcondition.js";
export { emotePostConditions } from "./emote.postcondition.js";
export { installPluginPostConditions } from "./install-plugin.postcondition.js";
export { mediaPostConditions } from "./media.postcondition.js";
export { phettaPostConditions } from "./phetta.postcondition.js";
export { restartPostConditions } from "./restart.postcondition.js";
export { terminalPostConditions } from "./terminal.postcondition.js";
export { triggerPostConditions } from "./trigger.postcondition.js";

/**
 * Register all built-in post-conditions into a verifier.
 */
export function registerBuiltinPostConditions(
  verifier: PostConditionVerifierInterface,
): void {
  verifier.registerConditions("RUN_IN_TERMINAL", terminalPostConditions);
  verifier.registerConditions("INSTALL_PLUGIN", installPluginPostConditions);
  verifier.registerConditions("PLAY_EMOTE", emotePostConditions);
  verifier.registerConditions("GENERATE_IMAGE", mediaPostConditions);
  verifier.registerConditions("GENERATE_VIDEO", mediaPostConditions);
  verifier.registerConditions("GENERATE_AUDIO", mediaPostConditions);
  verifier.registerConditions("ANALYZE_IMAGE", mediaPostConditions);
  verifier.registerConditions("RESTART_AGENT", restartPostConditions);
  verifier.registerConditions("CUSTOM_ACTION", customActionPostConditions);
  verifier.registerConditions("CREATE_TASK", triggerPostConditions);
  verifier.registerConditions("PHETTA_NOTIFY", phettaPostConditions);
  verifier.registerConditions("PHETTA_SEND_EVENT", phettaPostConditions);
}
