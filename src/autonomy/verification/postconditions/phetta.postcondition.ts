/**
 * Post-conditions for Phetta Companion tools.
 *
 * @module autonomy/verification/postconditions/phetta
 */

import type { PostCondition } from "../types.js";

export const phettaSuccessCondition: PostCondition = {
  id: "phetta:success",
  description: "Phetta action indicates success",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    return result?.success === true;
  },
  severity: "warning",
};

export const phettaPostConditions: PostCondition[] = [
  phettaSuccessCondition,
];
