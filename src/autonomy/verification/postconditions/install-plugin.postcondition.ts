/**
 * Post-conditions for the INSTALL_PLUGIN tool.
 *
 * @module autonomy/verification/postconditions/install-plugin
 */

import type { PostCondition } from "../types.js";

/**
 * Check that the plugin install API response indicates success.
 */
export const installPluginSuccessCondition: PostCondition = {
  id: "install-plugin:success",
  description: "Plugin installation API response indicates success",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    return result?.success === true;
  },
  severity: "critical",
};

/**
 * All install-plugin post-conditions.
 */
export const installPluginPostConditions: PostCondition[] = [
  installPluginSuccessCondition,
];
