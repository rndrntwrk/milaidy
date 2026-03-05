import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55GamesPlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-games",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade game orchestration and mastery actions.",
    providerName: "five55Games",
    providerTitle: "555 Arcade Games Legacy Surface",
    envKeys: [
      "ARCADE555_BASE_URL",
      "ARCADE555_AGENT_TOKEN",
      "FIVE55_GAMES_API_URL",
      "STREAM555_BASE_URL",
    ],
    actionNames: [
      "FIVE55_GAMES_CATALOG",
      "FIVE55_GAMES_PLAY",
      "FIVE55_GAMES_SWITCH",
      "FIVE55_GAMES_STOP",
      "FIVE55_GAMES_MASTERY_BRIEF",
      "FIVE55_GAMES_MASTERY_CERTIFY",
      "FIVE55_GAMES_MASTERY_STATUS",
      "FIVE55_GAMES_MASTERY_VALIDATE",
      "FIVE55_GAMES_MASTERY_EVIDENCE",
      "FIVE55_GAMES_GO_LIVE_PLAY",
      "FIVE55_GAMES_LIVE_CAPABILITY_SPRINT",
    ],
  });
}

export default createFive55GamesPlugin;
