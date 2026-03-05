import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55AdminPlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-admin",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade admin actions.",
    providerName: "five55Admin",
    providerTitle: "555 Arcade Admin Legacy Surface",
    envKeys: [
      "ARCADE555_ADMIN_API_URL",
      "ARCADE555_ADMIN_BEARER_TOKEN",
      "FIVE55_ADMIN_API_URL",
      "FIVE55_ADMIN_BEARER_TOKEN",
      "TWITTER_AGENT_MAIN_API_BASE",
      "TWITTER_BOT_MAIN_API_BASE",
      "ADMIN_API_TOKEN",
      "TWITTER_AGENT_KEY",
      "TWITTER_BOT_KEY",
    ],
    actionNames: [
      "FIVE55_THEME_SET",
      "FIVE55_EVENT_TRIGGER",
      "FIVE55_CABINET_POSSESS",
      "FIVE55_CABINET_RELEASE",
    ],
  });
}

export default createFive55AdminPlugin;
