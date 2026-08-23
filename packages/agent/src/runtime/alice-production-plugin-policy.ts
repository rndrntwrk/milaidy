type AliceProductionPluginEnv = Pick<
  NodeJS.ProcessEnv,
  "ALICE_RUNTIME_AUTHORITY_MODE"
>;

export const ALICE_PRODUCTION_PLUGIN_ALLOWLIST = new Set([
  "@elizaos/plugin-sql",
  "@elizaos/plugin-openai",
]);

export function isAliceProductionPluginPolicyEnabled(
  env: AliceProductionPluginEnv = process.env,
): boolean {
  return env.ALICE_RUNTIME_AUTHORITY_MODE?.trim() === "proposer-only";
}

/** Mutates the resolver load set and returns every fail-closed removal. */
export function enforceAliceProductionPluginPolicy(
  pluginNames: Set<string>,
  env: AliceProductionPluginEnv = process.env,
): string[] {
  if (!isAliceProductionPluginPolicyEnabled(env)) return [];

  const removed: string[] = [];
  for (const pluginName of pluginNames) {
    if (!ALICE_PRODUCTION_PLUGIN_ALLOWLIST.has(pluginName)) {
      pluginNames.delete(pluginName);
      removed.push(pluginName);
    }
  }
  return removed;
}
