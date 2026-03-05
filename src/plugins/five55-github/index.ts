import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55GithubPlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-github",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade GitHub actions.",
    providerName: "five55Github",
    providerTitle: "555 Arcade GitHub Legacy Surface",
    envKeys: ["ARCADE555_GITHUB_TOKEN", "GITHUB_API_TOKEN", "ALICE_GH_TOKEN"],
    actionNames: ["FIVE55_GITHUB_LIST_REPOS"],
  });
}

export default createFive55GithubPlugin;
