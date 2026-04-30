/**
 * Post-conditions for custom action tools.
 *
 * @module autonomy/verification/postconditions/custom-action
 */

import type { PostCondition } from "../types.js";

/**
 * Check that the custom action handler returned a non-null result.
 */
export const customActionResultCondition: PostCondition = {
  id: "custom-action:result-exists",
  description: "Custom action handler returned a result",
  check: async (ctx) => {
    return ctx.result != null;
  },
  severity: "warning",
};

/**
 * All custom-action post-conditions.
 */
export const customActionPostConditions: PostCondition[] = [
  customActionResultCondition,
];
