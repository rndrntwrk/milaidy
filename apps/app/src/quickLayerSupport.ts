import type { PluginInfo } from "./api-client.js";
import {
  QUICK_LAYER_CATALOG,
  type QuickLayerId,
} from "./components/quickLayerCatalog.js";

export type QuickLayerStatus = "active" | "disabled" | "available";

export function resolvePluginStatus(
  plugins: readonly PluginInfo[],
  pluginId: string,
): QuickLayerStatus {
  const needle = pluginId.trim().toLowerCase();
  const plugin = plugins.find((entry) => {
    const entryId = entry.id.trim().toLowerCase();
    const entryName = entry.name.trim().toLowerCase();
    return (
      entryId === needle ||
      entryId === needle.replace(/^alice-/, "") ||
      entryName === needle ||
      entryName.includes(needle)
    );
  });

  if (!plugin) return "available";
  if (plugin.isActive === true) return "active";
  if (plugin.enabled === false) return "disabled";
  if (plugin.enabled === true && plugin.isActive === false) return "disabled";
  return "available";
}

export function hasPluginRegistration(
  plugins: readonly PluginInfo[],
  pluginId: string,
): boolean {
  const needle = pluginId.trim().toLowerCase();
  return plugins.some((entry) => {
    const entryId = entry.id.trim().toLowerCase();
    const entryName = entry.name.trim().toLowerCase();
    return (
      entryId === needle ||
      entryId === needle.replace(/^alice-/, "") ||
      entryName === needle ||
      entryName.includes(needle)
    );
  });
}

export function resolveQuickLayerStatus(
  plugins: readonly PluginInfo[],
  pluginIds: readonly string[],
): QuickLayerStatus {
  if (pluginIds.length === 0) return "available";
  const statuses = pluginIds.map((pluginId) => resolvePluginStatus(plugins, pluginId));
  if (statuses.every((status) => status === "active")) return "active";
  if (statuses.some((status) => status === "disabled")) return "disabled";
  return "available";
}

export function buildQuickLayerStatusRecord(
  plugins: readonly PluginInfo[],
): Record<QuickLayerId, QuickLayerStatus> {
  return QUICK_LAYER_CATALOG.reduce(
    (record, layer) => {
      record[layer.id] = resolveQuickLayerStatus(plugins, layer.pluginIds);
      return record;
    },
    {} as Record<QuickLayerId, QuickLayerStatus>,
  );
}
