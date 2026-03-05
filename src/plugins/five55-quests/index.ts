import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55QuestsPlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-quests",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade quest actions.",
    providerName: "five55Quests",
    providerTitle: "555 Arcade Quests Legacy Surface",
    envKeys: ["ARCADE555_QUESTS_API_URL", "FIVE55_QUESTS_API_URL"],
    actionNames: [
      "FIVE55_QUESTS_READ",
      "FIVE55_QUESTS_CREATE",
      "FIVE55_QUESTS_COMPLETE",
    ],
  });
}

export default createFive55QuestsPlugin;
