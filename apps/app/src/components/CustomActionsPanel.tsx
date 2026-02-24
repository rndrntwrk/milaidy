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

const HANDLER_TYPE_NAMES: Record<string, string> = {
  http: "HTTP",
  shell: "Shell",
  code: "Code",
};

export function CustomActionsPanel({
  open,
  onClose,
  onOpenEditor,
}: CustomActionsPanelProps) {
  const { plugins, setActionNotice, setTab } = useApp();
  const [actions, setActions] = useState<CustomActionDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const loadActions = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await client.listCustomActions();
      setActions(result || []);
    } catch (err) {
      console.error("Failed to load custom actions:", err);
      setError("Failed to load custom actions. Please retry.");
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
      void loadActions();
    }
  }, [loadActions, open]);

  const handleToggleEnabled = async (action: CustomActionDef) => {
    try {
      const next = !action.enabled;
      await client.updateCustomAction(action.id, {
        enabled: next,
      });
      setActions((prev) =>
        prev.map((item) =>
          item.id === action.id
            ? {
                ...item,
                enabled: next,
              }
            : item,
        ),
      );
    } catch (err) {
      console.error("Failed to toggle action:", err);
      setError("Failed to update this action. Try again.");
    }
  };

  const handleDelete = async (action: CustomActionDef) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${action.name}"?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await client.deleteCustomAction(action.id);
      setActions((prev) => prev.filter((item) => item.id !== action.id));
    } catch (err) {
      console.error("Failed to delete action:", err);
      setError("Failed to delete action. Try again.");
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
        open ? "w-80" : "w-0 overflow-hidden"
      }`}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-txt">Custom Actions</h2>
              <p className="text-xs text-muted mt-0.5">
                {actions.length} action{actions.length === 1 ? "" : "s"} ·{" "}
                {enabledCount} enabled
              </p>
            </div>
            <button
              type="button"
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
                <title>Close panel</title>
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
                Loading your actions...
              </div>
            ) : filteredActions.length === 0 ? (
              <div className="text-center text-muted text-xs py-8">
                {search
                  ? "No actions match this search."
                  : "No custom actions yet. Create one to get started."}
              </div>
            ) : (
              filteredActions.map((action) => (
                <div
                  key={action.id}
                  className="border border-border bg-surface rounded p-2 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-txt truncate">
                        {action.name}
                      </div>
                      <p className="text-[10px] text-muted mt-0.5">
                        {action.parameters?.length || 0} parameter
                        {(action.parameters?.length || 0) === 1 ? "" : "s"}
                        {action.similes?.length
                          ? ` • ${action.similes.length} alias`.concat(
                              action.similes.length === 1 ? "" : "es",
                            )
                          : ""}
                      </p>
                    </div>

                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${
                        HANDLER_TYPE_COLORS[action.handler.type] ||
                        "bg-surface text-muted"
                      }`}
                    >
                      {HANDLER_TYPE_NAMES[action.handler.type] ??
                        action.handler.type}
                    </span>
                  </div>

                  {action.description && (
                    <p className="text-xs text-muted line-clamp-2 break-words">
                      {action.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <label className="flex items-center gap-1 cursor-pointer text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={action.enabled}
                        onChange={() => handleToggleEnabled(action)}
                        className="w-3 h-3 cursor-pointer accent-accent"
                      />
                      <span>Enabled</span>
                    </label>

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(action)}
                        className="text-xs text-accent hover:text-accent/80 transition-colors"
                        title="Edit action"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(action)}
                        className="text-xs text-danger hover:text-danger/80 transition-colors"
                        title="Delete action"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
