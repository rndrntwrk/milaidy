import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55SocialPlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-social",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade social actions.",
    providerName: "five55Social",
    providerTitle: "555 Arcade Social Legacy Surface",
    envKeys: ["ARCADE555_SOCIAL_API_URL", "FIVE55_SOCIAL_API_URL"],
    actionNames: ["FIVE55_SOCIAL_MONITOR", "FIVE55_SOCIAL_ASSIGN_POINTS"],
  });
}

export default createFive55SocialPlugin;
