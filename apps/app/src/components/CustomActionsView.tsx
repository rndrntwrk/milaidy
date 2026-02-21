import { useState, useEffect, useCallback, useMemo } from "react";
import { client, type CustomActionDef } from "../api-client";
import { useApp } from "../AppContext";
import { CustomActionEditor } from "./CustomActionEditor";
import { collectFive55ActionTimeline } from "./five55ActionEnvelope";

export function CustomActionsView() {
  const { setTab, setActionNotice, plugins, conversationMessages } = useApp();
  const [actions, setActions] = useState<CustomActionDef[]>([]);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CustomActionDef | null>(null);
  const [loading, setLoading] = useState(true);

  type LayerStatus = "active" | "disabled" | "available";
  type QuickLayerDock = {
    id: string;
    label: string;
    pluginIds: string[];
  };

  const quickLayers = useMemo<QuickLayerDock[]>(
    () => [
      { id: "stream", label: "Stream", pluginIds: ["stream"] },
      { id: "go-live", label: "Go Live", pluginIds: ["stream"] },
      { id: "autonomous-run", label: "Autonomous", pluginIds: ["stream"] },
      { id: "screen-share", label: "Screen Share", pluginIds: ["stream555-control"] },
      { id: "ads", label: "Ads", pluginIds: ["stream555-control"] },
      { id: "invite-guest", label: "Invite Guest", pluginIds: ["stream555-control"] },
      { id: "radio", label: "Radio", pluginIds: ["stream555-control"] },
      { id: "pip", label: "PiP", pluginIds: ["stream555-control"] },
      { id: "reaction-segment", label: "Reaction", pluginIds: ["stream555-control"] },
      { id: "earnings", label: "Earnings", pluginIds: ["stream555-control"] },
      { id: "play-games", label: "Play Games", pluginIds: ["five55-games"] },
      { id: "end-live", label: "End Live", pluginIds: ["stream555-control"] },
      { id: "swap", label: "Swap", pluginIds: ["swap"] },
    ],
    [],
  );

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

  const triggerDockedLayer = useCallback(
    (layerId: string, layerLabel: string) => {
      setTab("chat");
      setActionNotice(`Running ${layerLabel} from Actions tab...`, "info", 2200);
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("milaidy:quick-layer:run", {
            detail: { layerId },
          }),
        );
      }, 120);
    },
    [setActionNotice, setTab],
  );

  const actionTimeline = useMemo(
    () => collectFive55ActionTimeline(conversationMessages),
    [conversationMessages],
  );
  const recentActionTimeline = useMemo(
    () => [...actionTimeline].reverse().slice(0, 80),
    [actionTimeline],
  );

  const loadActions = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.listCustomActions();
      setActions(result);
    } catch (error) {
      console.error("Failed to load custom actions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const handleCreate = useCallback(() => {
    setEditingAction(null);
    setEditorOpen(true);
  }, []);

  const handleEdit = useCallback((action: CustomActionDef) => {
    setEditingAction(action);
    setEditorOpen(true);
  }, []);

  const handleEditorClose = useCallback(() => {
    setEditorOpen(false);
    setEditingAction(null);
  }, []);

  const handleEditorSave = useCallback(async () => {
    setEditorOpen(false);
    setEditingAction(null);
    await loadActions();
  }, [loadActions]);

  const handleToggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    try {
      await client.updateCustomAction(id, { enabled });
      setActions(prev =>
        prev.map(action =>
          action.id === id ? { ...action, enabled } : action
        )
      );
    } catch (error) {
      console.error("Failed to toggle action:", error);
    }
  }, []);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await client.deleteCustomAction(id);
      setActions(prev => prev.filter(action => action.id !== id));
    } catch (error) {
      console.error("Failed to delete action:", error);
    }
  }, []);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const actionsToImport = Array.isArray(imported) ? imported : [imported];

      for (const action of actionsToImport) {
        await client.createCustomAction(action);
      }

      await loadActions();
      event.target.value = "";
    } catch (error) {
      console.error("Failed to import actions:", error);
      alert("Failed to import actions. Please check the file format.");
    }
  }, [loadActions]);

  const handleExport = useCallback(() => {
    const dataStr = JSON.stringify(actions, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "custom-actions.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [actions]);

  const filteredActions = actions.filter(action => {
    const searchLower = search.toLowerCase();
    return (
      action.name.toLowerCase().includes(searchLower) ||
      action.description?.toLowerCase().includes(searchLower)
    );
  });

  const getBadgeColor = (handlerType: string) => {
    switch (handlerType) {
      case "http":
        return "bg-blue-500/20 text-blue-400";
      case "shell":
        return "bg-green-500/20 text-green-400";
      case "code":
        return "bg-purple-500/20 text-purple-400";
      default:
        return "bg-bg-muted text-muted";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted">Loading actions...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Docked studio quick actions (moved from Chat view) */}
      <div className="border border-border bg-card rounded p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-txt">Studio Action Layers</h2>
            <p className="text-xs text-muted">
              Moved from Chat. Runs through the same quick-layer execution engine.
            </p>
          </div>
          <button
            onClick={() => setTab("plugins")}
            className="px-3 py-1.5 text-xs border border-border bg-surface text-muted rounded hover:bg-card transition-colors"
            title="Open plugin settings"
          >
            Manage Plugins
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickLayers.map((layer) => {
            const status = resolveLayerStatus(layer.pluginIds);
            const tone =
              status === "active"
                ? "border-accent text-accent bg-card"
                : status === "disabled"
                  ? "border-danger/40 text-danger bg-card"
                  : "border-border text-muted bg-card";
            return (
              <button
                key={layer.id}
                className={`px-2 py-1 text-xs border rounded transition-all ${tone}`}
                onClick={() => triggerDockedLayer(layer.id, layer.label)}
                title={`${layer.label} (${status})`}
              >
                {layer.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border border-border bg-card rounded p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-txt">Recent Action Timeline</h2>
            <p className="text-xs text-muted">
              Live execution envelopes captured from chat.
            </p>
          </div>
          <span className="text-xs text-muted">{actionTimeline.length} total</span>
        </div>
        {recentActionTimeline.length === 0 ? (
          <div className="text-xs text-muted">
            No action envelopes detected yet. Run a tool action in chat to populate this timeline.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {recentActionTimeline.map((entry) => {
              const { envelope } = entry;
              const stage =
                envelope.trace?.stage ?? (envelope.ok ? "succeeded" : "failed");
              const stageTone = envelope.ok ? "text-ok" : "text-danger";
              const timestamp = new Date(entry.timestamp).toLocaleTimeString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
              return (
                <div
                  key={`${entry.messageId}-${envelope.action}-${envelope.trace?.actionId ?? entry.timestamp}`}
                  className="border border-border rounded p-2 bg-bg-hover/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-txt">
                        {envelope.module} · {envelope.action}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {envelope.code} · status {envelope.status}
                        {envelope.retryable ? " · retryable" : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[11px] font-semibold ${stageTone}`}>
                        {stage}
                      </div>
                      <div className="text-[10px] text-muted">{timestamp}</div>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-txt whitespace-pre-wrap break-words">
                    {envelope.message}
                  </div>
                  {(envelope.trace?.sessionId ||
                    envelope.trace?.segmentId ||
                    envelope.trace?.actionId ||
                    envelope.trace?.idempotencyKey) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted">
                      {envelope.trace?.sessionId && (
                        <span className="px-1.5 py-0.5 border border-border rounded">
                          session {envelope.trace.sessionId}
                        </span>
                      )}
                      {envelope.trace?.segmentId && (
                        <span className="px-1.5 py-0.5 border border-border rounded">
                          segment {envelope.trace.segmentId}
                        </span>
                      )}
                      {envelope.trace?.actionId && (
                        <span className="px-1.5 py-0.5 border border-border rounded">
                          action {envelope.trace.actionId}
                        </span>
                      )}
                      {envelope.trace?.idempotencyKey && (
                        <span className="px-1.5 py-0.5 border border-border rounded">
                          idem {envelope.trace.idempotencyKey}
                        </span>
                      )}
                    </div>
                  )}
                  {(envelope.data !== undefined || envelope.details !== undefined) && (
                    <details className="mt-1.5">
                      <summary className="text-[11px] text-muted cursor-pointer">
                        payload
                      </summary>
                      <pre className="mt-1 text-[10px] text-muted bg-card border border-border rounded p-2 whitespace-pre-wrap break-words m-0">
                        {JSON.stringify(
                          envelope.data !== undefined ? envelope.data : envelope.details,
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-txt">Custom Actions</h1>
        <div className="flex items-center gap-2">
          <label className="px-3 py-1.5 text-sm border border-border bg-surface text-muted rounded cursor-pointer hover:bg-card transition-colors">
            Import
            <input
              type="file"
              accept="application/json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExport}
            disabled={actions.length === 0}
            className="px-3 py-1.5 text-sm border border-border bg-surface text-muted rounded hover:bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export
          </button>
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-sm border border-accent bg-accent text-txt rounded hover:bg-accent/80 transition-colors"
          >
            Create Action
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center">
        <input
          type="text"
          placeholder="Search actions by name or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-border bg-surface text-txt rounded focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Actions Grid */}
      {filteredActions.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 space-y-4">
          <p className="text-muted text-center">
            {search
              ? "No actions match your search."
              : "No custom actions yet. Create one to get started."}
          </p>
          {!search && (
            <button
              onClick={handleCreate}
              className="px-4 py-2 text-sm border border-accent bg-accent text-txt rounded hover:bg-accent/80 transition-colors"
            >
              Create Action
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-auto">
          {filteredActions.map((action) => (
            <div
              key={action.id}
              onClick={(e) => {
                // Don't open editor if clicking on interactive elements
                if (
                  e.target instanceof HTMLButtonElement ||
                  e.target instanceof HTMLInputElement
                ) {
                  return;
                }
                handleEdit(action);
              }}
              className="border border-border bg-card rounded p-4 space-y-3 cursor-pointer hover:border-accent/50 transition-colors"
            >
              {/* Name and Badge */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm text-txt flex-1 break-words">
                  {action.name}
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs rounded ${getBadgeColor(
                    action.handler.type
                  )}`}
                >
                  {action.handler.type}
                </span>
              </div>

              {/* Description */}
              {action.description && (
                <p className="text-xs text-muted line-clamp-3">
                  {action.description}
                </p>
              )}

              {/* Parameters Count */}
              <p className="text-xs text-muted">
                {action.parameters?.length || 0} parameter
                {action.parameters?.length === 1 ? "" : "s"}
              </p>

              {/* Actions Row */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={action.enabled}
                    onChange={(e) =>
                      handleToggleEnabled(action.id, e.target.checked)
                    }
                    className="cursor-pointer"
                  />
                  <span className="text-xs text-muted">Enabled</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(action);
                    }}
                    className="px-2 py-1 text-xs border border-border bg-surface text-muted rounded hover:bg-card transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(action.id, action.name);
                    }}
                    className="px-2 py-1 text-xs border border-border bg-surface text-danger rounded hover:bg-card transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {editorOpen && (
        <CustomActionEditor
          open={editorOpen}
          action={editingAction}
          onClose={handleEditorClose}
          onSave={handleEditorSave}
        />
      )}
    </div>
  );
}
