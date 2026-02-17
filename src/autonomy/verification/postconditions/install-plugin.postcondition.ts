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
 * Independently verify that the plugin now appears in installed plugins.
 *
 * Falls back to pass when no independent query function is available.
 */
export const installPluginIndependentLookupCondition: PostCondition = {
  id: "install-plugin:independent-installed",
  description: "Installed plugin appears in independent plugin inventory",
  check: async (ctx) => {
    if (!ctx.query) return true;
    const pluginName =
      typeof ctx.params.pluginId === "string" ? ctx.params.pluginId : "";
    if (!pluginName) return false;
    const result = await ctx.query({
      query: "plugins:installed",
      payload: { pluginName },
    });
    return result === true;
  },
  severity: "warning",
};

/**
 * All install-plugin post-conditions.
 */
export const installPluginPostConditions: PostCondition[] = [
  installPluginSuccessCondition,
  installPluginIndependentLookupCondition,
];
