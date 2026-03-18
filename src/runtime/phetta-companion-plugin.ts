import type { Plugin } from "@elizaos/core";

export interface PhettaCompanionOptions {
  enabled: boolean;
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function resolvePhettaCompanionOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PhettaCompanionOptions {
  return {
    enabled:
      parseBool(env.PHETTA_COMPANION_ENABLED) ||
      parseBool(env.MILAIDY_PHETTA_COMPANION_ENABLED),
  };
}

export function createPhettaCompanionPlugin(
  _options: PhettaCompanionOptions,
): Plugin {
  return {
    name: "milaidy-phetta-companion",
    description:
      "Compatibility stub for branches that do not bundle the Phetta companion plugin.",
  } as Plugin;
}
