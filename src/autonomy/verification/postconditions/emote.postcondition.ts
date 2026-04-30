/**
 * Post-conditions for the PLAY_EMOTE tool.
 *
 * @module autonomy/verification/postconditions/emote
 */

import type { PostCondition } from "../types.js";

/**
 * Check that the emote parameter is a non-empty string.
 */
export const emoteValidNameCondition: PostCondition = {
  id: "emote:valid-name",
  description: "Emote name is a non-empty string",
  check: async (ctx) => {
    const emote = ctx.params.emote;
    return typeof emote === "string" && emote.length > 0;
  },
  severity: "warning",
};

/**
 * Check that the emote result does not indicate an error.
 */
export const emoteSuccessCondition: PostCondition = {
  id: "emote:success",
  description: "Emote result does not indicate an error",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    if (result == null) return false;
    return !("error" in result);
  },
  severity: "critical",
};

/**
 * All emote post-conditions.
 */
export const emotePostConditions: PostCondition[] = [
  emoteValidNameCondition,
  emoteSuccessCondition,
];
