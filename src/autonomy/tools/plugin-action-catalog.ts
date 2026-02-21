/**
 * Plugin action catalog discovery for canonical tool inventory.
 *
 * @module autonomy/tools/plugin-action-catalog
 */

type PluginLike = {
  name: string;
  description: string;
  actions?: unknown;
  providers?: unknown;
  services?: unknown;
  evaluators?: unknown;
  routes?: unknown;
};

export type PluginActionCatalogEntry = {
  pluginName: string;
  pluginId: string;
  runtimePluginName: string;
  actionNames: string[];
  actionCount: number;
};

export type PluginActionCatalogFailure = {
  pluginName: string;
  reason: string;
};

export type PluginActionCatalog = {
  entries: PluginActionCatalogEntry[];
  failures: PluginActionCatalogFailure[];
  actionNames: string[];
};

export type PluginModuleImporter = (
  specifier: string,
) => Promise<Record<string, unknown>>;

function looksLikePlugin(value: unknown): value is PluginLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const hasCollections = ["actions", "providers", "services", "evaluators", "routes"].some(
    (key) => Array.isArray(candidate[key]),
  );
  return (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.description === "string" &&
    hasCollections
  );
}

function extractPlugin(mod: Record<string, unknown>): PluginLike | null {
  if (looksLikePlugin(mod.default)) return mod.default;
  if (looksLikePlugin(mod.plugin)) return mod.plugin;
  for (const [key, value] of Object.entries(mod)) {
    if (key === "default" || key === "plugin") continue;
    if (key.toLowerCase().endsWith("plugin") && looksLikePlugin(value)) {
      return value;
    }
  }
  if (looksLikePlugin(mod)) return mod as unknown as PluginLike;
  for (const value of Object.values(mod)) {
    if (looksLikePlugin(value)) return value;
  }
  return null;
}

function toActionNames(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  return Array.from(
    new Set(
      actions
        .map((action) => {
          if (!action || typeof action !== "object") return "";
          const name =
            typeof (action as Record<string, unknown>).name === "string"
              ? (action as Record<string, unknown>).name
              : "";
          return name.trim();
        })
        .filter((name) => name.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export function pluginIdFromPackageName(pluginName: string): string {
  if (pluginName.startsWith("@elizaos/plugin-")) {
    return pluginName.slice("@elizaos/plugin-".length);
  }
  if (pluginName.startsWith("@milaidy/plugin-")) {
    return pluginName.slice("@milaidy/plugin-".length);
  }
  if (pluginName.startsWith("plugin-")) {
    return pluginName.slice("plugin-".length);
  }
  const slash = pluginName.indexOf("/");
  if (slash >= 0) {
    return pluginName.slice(slash + 1);
  }
  return pluginName;
}

export function resolvePluginImportSpecifier(pluginName: string): string {
  if (pluginName === "@milaidy/plugin-telegram-enhanced") {
    return "../../plugins/telegram-enhanced/index.js";
  }
  return pluginName;
}

const defaultImporter: PluginModuleImporter = async (specifier) =>
  (await import(specifier)) as Record<string, unknown>;

export async function loadPluginActionCatalog(input: {
  pluginNames: string[];
  importer?: PluginModuleImporter;
}): Promise<PluginActionCatalog> {
  const importer = input.importer ?? defaultImporter;
  const pluginNames = Array.from(new Set(input.pluginNames)).sort((a, b) =>
    a.localeCompare(b),
  );

  const entries: PluginActionCatalogEntry[] = [];
  const failures: PluginActionCatalogFailure[] = [];

  for (const pluginName of pluginNames) {
    const specifier = resolvePluginImportSpecifier(pluginName);
    try {
      const mod = await importer(specifier);
      const plugin = extractPlugin(mod);
      if (!plugin) {
        failures.push({
          pluginName,
          reason: "No plugin export was found in module",
        });
        continue;
      }

      const actionNames = toActionNames(plugin.actions);
      entries.push({
        pluginName,
        pluginId: pluginIdFromPackageName(pluginName),
        runtimePluginName: plugin.name,
        actionNames,
        actionCount: actionNames.length,
      });
    } catch (err) {
      failures.push({
        pluginName,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const actionNames = Array.from(
    new Set(entries.flatMap((entry) => entry.actionNames)),
  ).sort((a, b) => a.localeCompare(b));

  return { entries, failures, actionNames };
}
