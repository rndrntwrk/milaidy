/**
 * Post-conditions for the RESTART_AGENT tool.
 *
 * @module autonomy/verification/postconditions/restart
 */

import type { PostCondition } from "../types.js";

/**
 * Check that the restart signal was accepted.
 */
export const restartAcceptedCondition: PostCondition = {
  id: "restart:accepted",
  description: "Restart signal was accepted by the runtime",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    return result?.accepted === true;
  },
  severity: "critical",
};

/**
 * All restart post-conditions.
 */
export const restartPostConditions: PostCondition[] = [
  restartAcceptedCondition,
];
