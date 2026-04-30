/**
 * Post-conditions for the RUN_IN_TERMINAL tool.
 *
 * @module autonomy/verification/postconditions/terminal
 */

import type { PostCondition } from "../types.js";

/**
 * Check that the terminal command result indicates success.
 */
export const terminalSuccessCondition: PostCondition = {
  id: "terminal:success",
  description: "Terminal command result indicates success",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    return result?.success === true;
  },
  severity: "critical",
};

/**
 * Check that the terminal command exited with code 0.
 */
export const terminalExitCodeCondition: PostCondition = {
  id: "terminal:exit-code-zero",
  description: "Terminal command exited with code 0",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    return result?.exitCode === 0;
  },
  severity: "warning",
};

/**
 * All terminal post-conditions.
 */
export const terminalPostConditions: PostCondition[] = [
  terminalSuccessCondition,
  terminalExitCodeCondition,
];
