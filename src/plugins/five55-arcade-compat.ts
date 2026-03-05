import type { Action, Plugin, Provider, ProviderResult } from "@elizaos/core";
import {
  legacyActionAliases as arcade555LegacyActionAliases,
} from "@rndrntwrk/plugin-555arcade";

const LEGACY_ARCADE555_ACTION_NAMES = Object.freeze([
  "FIVE55_GAMES_*",
  "FIVE55_SCORE_CAPTURE_*",
  "FIVE55_LEADERBOARD_*",
  "FIVE55_QUESTS_*",
  "FIVE55_BATTLES_*",
  "FIVE55_REWARDS_*",
  "FIVE55_SOCIAL_*",
  "FIVE55_THEME_SET",
  "FIVE55_EVENT_TRIGGER",
  "FIVE55_CABINET_*",
  "FIVE55_GITHUB_LIST_REPOS",
]);

type LegacyArcadeWrapperOptions = {
  pluginName: string;
  description: string;
  providerName: string;
  providerTitle: string;
  envKeys: string[];
  actionNames: string[];
};

function buildProviderText(
  providerTitle: string,
  envKeys: string[],
  actionNames: string[],
): string {
  const configured = envKeys.some((key) => {
    const value = process.env[key];
    return typeof value === "string" && value.trim().length > 0;
  });

  return [
    `## ${providerTitle}`,
    "",
    "Compatibility wrapper around canonical 555 Arcade package actions.",
    `Canonical source: @rndrntwrk/plugin-555arcade`,
    `Legacy namespaces: ${LEGACY_ARCADE555_ACTION_NAMES.join(", ")}`,
    `Actions: ${actionNames.join(", ")}`,
    `Configured env: ${configured ? "yes" : "no"} (${envKeys.join("|")})`,
  ].join("\n");
}

export function createLegacyArcadeWrapperPlugin(
  options: LegacyArcadeWrapperOptions,
): Plugin {
  const actionSet = new Set(options.actionNames.map((name) => name.trim().toUpperCase()));
  const actions = arcade555LegacyActionAliases.filter((action) =>
    actionSet.has(action.name.trim().toUpperCase()),
  ) as unknown as Action[];

  const provider: Provider = {
    name: options.providerName,
    description: options.description,
    dynamic: true,
    async get(): Promise<ProviderResult> {
      return {
        text: buildProviderText(
          options.providerTitle,
          options.envKeys,
          options.actionNames,
        ),
        values: {
          canonicalPlugin: "@rndrntwrk/plugin-555arcade",
          deprecated: true,
          pluginName: options.pluginName,
          actionNames: options.actionNames,
        },
        data: {
          canonicalPlugin: "@rndrntwrk/plugin-555arcade",
          deprecated: true,
          pluginName: options.pluginName,
          actionNames: options.actionNames,
        },
      };
    },
  };

  return {
    name: options.pluginName,
    description: options.description,
    init: async () => {
      console.warn(
        `[milaidy] ${options.pluginName} is a deprecated compatibility wrapper for @rndrntwrk/plugin-555arcade.`,
      );
    },
    providers: [provider],
    actions,
  } as Plugin;
}
