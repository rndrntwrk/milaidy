import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55RewardsPlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-rewards",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade reward actions.",
    providerName: "five55Rewards",
    providerTitle: "555 Arcade Rewards Legacy Surface",
    envKeys: ["ARCADE555_REWARDS_API_URL", "FIVE55_REWARDS_API_URL"],
    actionNames: ["FIVE55_REWARDS_PROJECT", "FIVE55_REWARDS_ALLOCATE"],
  });
}

export default createFive55RewardsPlugin;
