import { useState, useEffect, useCallback, useMemo } from "react";
import { client, type CustomActionDef } from "../api-client";
import { useApp } from "../AppContext";
import { CustomActionEditor } from "./CustomActionEditor";
import { collectFive55ActionTimeline } from "./five55ActionEnvelope";
import { QUICK_LAYER_DOCK } from "./quickLayerCatalog";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card.js";

export function CustomActionsView() {
  const { setTab, setActionNotice, plugins, conversationMessages } = useApp();
  const [actions, setActions] = useState<CustomActionDef[]>([]);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CustomActionDef | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  type LayerStatus = "active" | "disabled" | "available";
  const quickLayers = QUICK_LAYER_DOCK;

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

  const handleToggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await client.updateCustomAction(id, { enabled });
        setActions((prev) =>
          prev.map((action) =>
            action.id === id ? { ...action, enabled } : action,
          ),
        );
      } catch (error) {
        console.error("Failed to toggle action:", error);
      }
    },
    [],
  );

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await client.deleteCustomAction(id);
      setActions((prev) => prev.filter((action) => action.id !== id));
    } catch (error) {
      console.error("Failed to delete action:", error);
    }
  }, []);

  const handleImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [loadActions],
  );

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

  const filteredActions = actions.filter((action) => {
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
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md px-6 py-8 text-center">
          <div className="text-sm uppercase tracking-[0.2em] text-white/55">Loading actions...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Studio Action Layers</CardTitle>
              <CardDescription>
                Moved from Chat. Runs through the same quick-layer execution engine.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => setTab("plugins")} title="Open plugin settings" className="rounded-2xl">
              Manage Plugins
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {quickLayers.map((layer) => {
              const status = resolveLayerStatus(layer.pluginIds);
              const tone =
                status === "active"
                  ? "border-white/18 bg-white/[0.14] text-white"
                  : status === "disabled"
                    ? "border-danger/25 bg-danger/10 text-danger"
                    : "border-white/10 bg-white/[0.04] text-white/65";
              return (
                <Button
                  key={layer.id}
                  variant="ghost"
                  className={`h-9 rounded-2xl border px-3 text-[11px] uppercase tracking-[0.18em] ${tone}`}
                  onClick={() => triggerDockedLayer(layer.id, layer.label)}
                  title={`${layer.label} (${status})`}
                >
                  {layer.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Recent Action Timeline</CardTitle>
              <CardDescription>
                Live execution envelopes captured from chat.
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
              {actionTimeline.length} total
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {recentActionTimeline.length === 0 ? (
            <div className="text-xs text-white/52">
              No action envelopes detected yet. Run a tool action in chat to populate this timeline.
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
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
                    className="rounded-2xl border border-white/8 bg-black/14 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-white/88">
                          {envelope.module} · {envelope.action}
                        </div>
                        <div className="mt-0.5 text-[11px] text-white/50">
                          {envelope.code} · status {envelope.status}
                          {envelope.retryable ? " · retryable" : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[11px] font-semibold ${stageTone}`}>
                          {stage}
                        </div>
                        <div className="text-[10px] text-white/40">{timestamp}</div>
                      </div>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-xs text-white/76">
                      {envelope.message}
                    </div>
                    {(envelope.trace?.sessionId ||
                      envelope.trace?.segmentId ||
                      envelope.trace?.actionId ||
                      envelope.trace?.idempotencyKey) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-white/45">
                        {envelope.trace?.sessionId && (
                          <span className="rounded-full border border-white/10 px-1.5 py-0.5">
                            session {envelope.trace.sessionId}
                          </span>
                        )}
                        {envelope.trace?.segmentId && (
                          <span className="rounded-full border border-white/10 px-1.5 py-0.5">
                            segment {envelope.trace.segmentId}
                          </span>
                        )}
                        {envelope.trace?.actionId && (
                          <span className="rounded-full border border-white/10 px-1.5 py-0.5">
                            action {envelope.trace.actionId}
                          </span>
                        )}
                        {envelope.trace?.idempotencyKey && (
                          <span className="rounded-full border border-white/10 px-1.5 py-0.5">
                            idem {envelope.trace.idempotencyKey}
                          </span>
                        )}
                      </div>
                    )}
                    {(envelope.data !== undefined || envelope.details !== undefined) && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[11px] text-white/50">
                          payload
                        </summary>
                        <pre className="m-0 mt-1 rounded-2xl border border-white/8 bg-black/18 p-2 text-[10px] whitespace-pre-wrap break-words text-white/50">
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
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white/92">Custom Actions</h1>
          <p className="text-xs text-white/48">Build and manage reusable operator actions.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-2xl border border-white/12 bg-black/20 px-4 text-[11px] font-medium uppercase tracking-[0.22em] text-white/72 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white">
            Import
            <input
              type="file"
              accept="application/json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <Button variant="outline" onClick={handleExport} disabled={actions.length === 0} className="rounded-2xl">
            Export
          </Button>
          <Button variant="default" onClick={handleCreate} className="rounded-2xl">
            Create Action
          </Button>
        </div>
      </div>

      <div className="flex items-center">
        <input
          type="text"
          placeholder="Search actions by name or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search actions"
          className="flex-1 rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/20"
        />
      </div>

      {filteredActions.length === 0 ? (
        <Card className="flex flex-1 flex-col items-center justify-center space-y-4 p-8 text-center">
          <p className="text-white/52">
            {search
              ? "No actions match your search."
              : "No custom actions yet. Create one to get started."}
          </p>
          {!search && (
            <Button variant="default" onClick={handleCreate} className="rounded-2xl">
              Create Action
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 overflow-auto md:grid-cols-2 lg:grid-cols-3">
          {filteredActions.map((action) => (
            <Card
              key={action.id}
              className="space-y-3 p-4 transition-colors hover:border-white/18"
            >
              <button
                type="button"
                className="m-0 w-full cursor-pointer border-0 bg-transparent p-0 text-left"
                onClick={() => handleEdit(action)}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="flex-1 break-words text-sm font-semibold text-white/90">
                    {action.name}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${getBadgeColor(
                      action.handler.type,
                    )}`}
                  >
                    {action.handler.type}
                  </span>
                </div>

                {action.description && (
                  <p className="line-clamp-3 text-xs text-white/52">
                    {action.description}
                  </p>
                )}

                <p className="text-xs text-white/45">
                  {action.parameters?.length || 0} parameter
                  {action.parameters?.length === 1 ? "" : "s"}
                </p>
              </button>

              <div className="flex items-center justify-between border-t border-white/8 pt-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={action.enabled}
                    onChange={(e) =>
                      handleToggleEnabled(action.id, e.target.checked)
                    }
                    className="cursor-pointer"
                  />
                  <span className="text-xs text-white/50">Enabled</span>
                </label>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(action)} className="rounded-xl">
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(action.id, action.name)} className="rounded-xl border-danger/25 text-danger hover:bg-danger/10">
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
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
