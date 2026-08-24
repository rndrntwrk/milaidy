import type { Plugin } from "@elizaos/core";

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

function hasDeclaredSurface(plugin: Plugin, field: keyof Plugin): boolean {
  const value = plugin[field];
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (field === "events") {
    return (
      value === null ||
      typeof value !== "object" ||
      Reflect.ownKeys(value).length > 0
    );
  }
  return true;
}

/**
 * Projects admitted packages onto the exact proposer-only registration shape.
 * SQL keeps only its adapter/schema initialization; its identity routes and
 * eager services are not required by Alice's response-only model boundary.
 */
export function constrainAliceProductionPluginSurface(
  pluginName: string,
  plugin: Plugin,
  env: AliceProductionPluginEnv = process.env,
): Plugin {
  if (!isAliceProductionPluginPolicyEnabled(env)) return plugin;
  if (!ALICE_PRODUCTION_PLUGIN_ALLOWLIST.has(pluginName)) {
    throw new Error("ALICE_PRODUCTION_PLUGIN_CLOSURE_INVALID");
  }

  for (const field of ["actions", "providers", "evaluators", "events"] as const) {
    if (hasDeclaredSurface(plugin, field)) {
      throw new Error("ALICE_PRODUCTION_PLUGIN_CLOSURE_INVALID");
    }
  }

  if (pluginName === "@elizaos/plugin-openai") {
    if (
      (plugin.name !== "openai" && plugin.name !== "@elizaos/plugin-openai") ||
      hasDeclaredSurface(plugin, "services") ||
      hasDeclaredSurface(plugin, "routes")
    ) {
      throw new Error("ALICE_PRODUCTION_PLUGIN_CLOSURE_INVALID");
    }
    return plugin;
  }

  if (plugin.name !== "@elizaos/plugin-sql") {
    throw new Error("ALICE_PRODUCTION_PLUGIN_CLOSURE_INVALID");
  }
  return {
    ...plugin,
    services: [],
    routes: [],
    dispose: undefined,
  };
}
