import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55LeaderboardPlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-leaderboard",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade leaderboard actions.",
    providerName: "five55Leaderboard",
    providerTitle: "555 Arcade Leaderboard Legacy Surface",
    envKeys: ["ARCADE555_LEADERBOARD_API_URL", "FIVE55_LEADERBOARD_API_URL"],
    actionNames: ["FIVE55_LEADERBOARD_READ", "FIVE55_LEADERBOARD_WRITE"],
  });
}

export default createFive55LeaderboardPlugin;
