import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55BattlesPlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-battles",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade battle actions.",
    providerName: "five55Battles",
    providerTitle: "555 Arcade Battles Legacy Surface",
    envKeys: [
      "ARCADE555_BATTLES_API_URL",
      "ARCADE555_BATTLES_CREATE_ENDPOINT",
      "FIVE55_BATTLES_API_URL",
      "FIVE55_BATTLES_CREATE_ENDPOINT",
    ],
    actionNames: [
      "FIVE55_BATTLES_READ",
      "FIVE55_BATTLES_CREATE",
      "FIVE55_BATTLES_RESOLVE",
    ],
  });
}

export default createFive55BattlesPlugin;
