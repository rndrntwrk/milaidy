/**
 * Post-conditions for media tools (GENERATE_IMAGE, GENERATE_VIDEO,
 * GENERATE_AUDIO, ANALYZE_IMAGE).
 *
 * @module autonomy/verification/postconditions/media
 */

import type { PostCondition } from "../types.js";

/**
 * Check that the media tool returned a non-null result.
 */
export const mediaResultExistsCondition: PostCondition = {
  id: "media:result-exists",
  description: "Media tool returned a non-null result",
  check: async (ctx) => {
    return ctx.result != null;
  },
  severity: "critical",
};

/**
 * Check that the media result does not contain an error.
 */
export const mediaNoErrorCondition: PostCondition = {
  id: "media:no-error",
  description: "Media result does not contain an error",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    if (result == null) return false;
    return !result.error;
  },
  severity: "critical",
};

/**
 * All media post-conditions.
 */
export const mediaPostConditions: PostCondition[] = [
  mediaResultExistsCondition,
  mediaNoErrorCondition,
];
