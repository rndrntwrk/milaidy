import { useCallback, useEffect, useMemo, useState } from "react";
import { client, type CustomActionDef } from "../api-client";
import { useApp } from "../AppContext";
import { QUICK_LAYER_DOCK } from "./quickLayerCatalog";

interface CustomActionsPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenEditor: (action?: CustomActionDef | null) => void;
}

type LayerStatus = "active" | "disabled" | "available";

const HANDLER_TYPE_COLORS: Record<string, string> = {
  http: "bg-blue-500/20 text-blue-400",
  shell: "bg-green-500/20 text-green-400",
  code: "bg-purple-500/20 text-purple-400",
};

export function CustomActionsPanel({
  open,
  onClose,
  onOpenEditor,
}: CustomActionsPanelProps) {
  const { plugins, setActionNotice, setTab } = useApp();
  const [actions, setActions] = useState<CustomActionDef[]>([]);
  const [loading, setLoading] = useState(false);

  const loadActions = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.listCustomActions();
      setActions(result || []);
    } catch (error) {
      console.error("Failed to load custom actions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const resolvePluginStatus = useCallback(
    (id: string): LayerStatus => {
      const needle = id.trim().toLowerCase();
      const plugin = plugins.find((p) => {
        const pluginId = p.id.trim().toLowerCase();
        const pluginName = p.name.trim().toLowerCase();
        return (
          pluginId === needle ||
          pluginId === needle.replace(/^alice-/, "") ||
          pluginName === needle ||
          pluginName.includes(needle)
        );
      });

      if (!plugin) return "available";
      if (plugin.isActive === true) return "active";
      if (plugin.enabled === false) return "disabled";
      if (plugin.enabled === true && plugin.isActive === false) return "disabled";
      return "available";
    },
    [plugins],
  );

  const resolveLayerStatus = useCallback(
    (pluginIds: string[]): LayerStatus => {
      if (pluginIds.length === 0) return "available";
      const statuses = pluginIds.map((id) => resolvePluginStatus(id));
      if (statuses.every((status) => status === "active")) return "active";
      if (statuses.some((status) => status === "disabled")) return "disabled";
      return "available";
    },
    [resolvePluginStatus],
  );

  const layerStatuses = useMemo(
    () =>
      new Map(
        QUICK_LAYER_DOCK.map((layer) => [
          layer.id,
          resolveLayerStatus(layer.pluginIds),
        ]),
      ),
    [resolveLayerStatus],
  );

  const triggerDockedLayer = useCallback(
    (layerId: string, layerLabel: string) => {
      setTab("chat");
      setActionNotice(`Running ${layerLabel} from Actions drawer...`, "info", 2200);
      onClose();
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("milaidy:quick-layer:run", {
            detail: { layerId },
          }),
        );
      }, 120);
    },
    [onClose, setActionNotice, setTab],
  );

  useEffect(() => {
    if (open) {
      loadActions();
    }
  }, [loadActions, open]);

  const handleToggleEnabled = async (action: CustomActionDef) => {
    try {
      await client.updateCustomAction(action.id, {
        enabled: !action.enabled,
      });
      await loadActions();
    } catch (error) {
      console.error("Failed to toggle action:", error);
    }
  };

  const handleDelete = async (action: CustomActionDef) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${action.name}"?`
    );
    if (!confirmed) return;

    try {
      await client.deleteCustomAction(action.id);
      await loadActions();
    } catch (error) {
      console.error("Failed to delete action:", error);
    }
  };

  const handleEdit = (action: CustomActionDef) => {
    onOpenEditor(action);
  };

  const handleCreate = () => {
    onOpenEditor(null);
  };

  return (
    <div
      className={`border-l border-border bg-card flex flex-col transition-all duration-200 ${
        open ? "w-72" : "w-0 overflow-hidden"
      }`}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-txt">Custom Actions</h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-txt transition-colors"
              aria-label="Close panel"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 4L4 12M4 4l8 8" />
              </svg>
            </button>
          </div>

          {/* Default stream/runtime quick actions */}
          <div className="px-3 pt-3 pb-2 border-b border-border">
            <div className="text-xs font-semibold text-txt">Studio Quick Actions</div>
            <div className="text-[11px] text-muted mt-1">
              Default 555 stream/game controls in the dock.
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_LAYER_DOCK.map((layer) => {
                const status = layerStatuses.get(layer.id) ?? "available";
                const tone =
                  status === "active"
                    ? "border-accent text-accent bg-card"
                    : status === "disabled"
                      ? "border-danger/40 text-danger bg-card"
                      : "border-border text-muted bg-card";
                return (
                  <button
                    key={layer.id}
                    onClick={() => triggerDockedLayer(layer.id, layer.label)}
                    className={`px-2 py-1 text-[11px] border rounded transition-all ${tone}`}
                    title={`${layer.label} (${status})`}
                  >
                    {layer.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="text-[11px] text-muted uppercase tracking-wide px-0.5">
              Custom Actions
            </div>
            {loading ? (
              <div className="text-center text-muted text-xs py-8">
                Loading...
              </div>
            ) : actions.length === 0 ? (
              <div className="text-center text-muted text-xs py-8">
                No custom actions yet
              </div>
            ) : (
              actions.map((action) => (
                <div
                  key={action.id}
                  className="border border-border bg-surface rounded p-2 space-y-2"
                >
                  {/* Action Name */}
                  <div className="font-semibold text-xs text-txt truncate">
                    {action.name}
                  </div>

                  {/* Description */}
                  {action.description && (
                    <div className="text-xs text-muted line-clamp-2">
                      {action.description}
                    </div>
                  )}

                  {/* Bottom Row: Badge, Toggle, Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Handler Type Badge */}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        HANDLER_TYPE_COLORS[action.handler.type] ||
                        "bg-surface text-muted"
                      }`}
                    >
                      {action.handler.type}
                    </span>

                    <div className="flex-1" />

                    {/* Enabled Toggle */}
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={action.enabled}
                        onChange={() => handleToggleEnabled(action)}
                        className="w-3 h-3 cursor-pointer accent-accent"
                      />
                      <span className="text-xs text-muted">on</span>
                    </label>

                    {/* Edit Button */}
                    <button
                      onClick={() => handleEdit(action)}
                      className="text-xs text-accent hover:text-accent/80 transition-colors"
                      title="Edit action"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z" />
                      </svg>
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(action)}
                      className="text-xs text-danger hover:text-danger/80 transition-colors"
                      title="Delete action"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l1 9h6l1-9" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-border">
            <button
              onClick={handleCreate}
              className="w-full bg-accent text-txt hover:bg-accent/90 transition-colors rounded px-3 py-2 text-sm font-medium"
            >
              Create Action
            </button>
          </div>
        </>
      )}
    </div>
  );
}
