import { useCallback, useEffect, useMemo, useState } from "react";
import { client, type CustomActionDef } from "../api-client";
import { useApp } from "../AppContext";
import { QUICK_LAYER_DOCK } from "./quickLayerCatalog";
import { Button } from "./ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import {
  CloseIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  StackIcon,
  TrashIcon,
} from "./ui/Icons";

interface CustomActionsPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenEditor: (action?: CustomActionDef | null) => void;
}
const HANDLER_TYPE_COLORS: Record<string, string> = {
  http: "bg-blue-500/20 text-blue-300",
  shell: "bg-emerald-500/20 text-emerald-300",
  code: "bg-violet-500/20 text-violet-300",
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
  const { setActionNotice, quickLayerStatuses, runQuickLayer } = useApp();
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

  const layerStatuses = useMemo(
    () =>
      new Map(
        QUICK_LAYER_DOCK.map((layer) => [
          layer.id,
          quickLayerStatuses[layer.id],
        ]),
      ),
    [quickLayerStatuses],
  );

  const triggerDockedLayer = useCallback(
    (layerId: (typeof QUICK_LAYER_DOCK)[number]["id"], layerLabel: string) => {
      setActionNotice(`Running ${layerLabel} from Actions drawer...`, "info", 2200);
      onClose();
      void runQuickLayer(layerId);
    },
    [onClose, runQuickLayer, setActionNotice],
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

  const enabledCount = useMemo(
    () => actions.filter((action) => action.enabled).length,
    [actions],
  );

  const filteredActions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) => {
      const aliases = (action.similes ?? []).join(" ").toLowerCase();
      return (
        action.name.toLowerCase().includes(needle) ||
        (action.description ?? "").toLowerCase().includes(needle) ||
        aliases.includes(needle) ||
        action.handler.type.toLowerCase().includes(needle)
      );
    });
  }, [actions, search]);

  return (
    <div
      className={`flex flex-col border-l border-white/10 bg-white/[0.03] backdrop-blur-xl transition-all duration-200 ${
        open ? "w-80" : "w-0 overflow-hidden"
      }`}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/88">
                Custom Actions
              </h2>
              <p className="mt-1 text-xs text-white/48">
                {actions.length} action{actions.length === 1 ? "" : "s"} · {" "}
                {enabledCount} enabled
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleCreate}>
                <PlusIcon className="h-3.5 w-3.5" />
                Create
              </Button>
              <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close panel">
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3 border-b border-white/10 p-3">
            <Card className="border-white/8 bg-white/[0.03]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <StackIcon className="h-4 w-4 text-white/70" />
                  Studio quick actions
                </CardTitle>
                <CardDescription>
                  Broadcast and game controls routed through the same operator action layer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="relative block">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search actions or aliases"
                    className="h-11 w-full rounded-full border border-white/10 bg-black/30 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/20"
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_LAYER_DOCK.map((layer) => {
                    const status = layerStatuses.get(layer.id) ?? "available";
                    const tone =
                      status === "active"
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : status === "disabled"
                          ? "border-danger/40 bg-danger/10 text-danger"
                          : "border-white/10 bg-white/[0.04] text-white/58";
                    return (
                      <button
                        key={layer.id}
                        onClick={() => triggerDockedLayer(layer.id, layer.label)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] transition-all ${tone}`}
                        title={`${layer.label} (${status})`}
                      >
                        {layer.label}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            {error ? <div className="text-xs text-danger">{error}</div> : null}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="px-0.5 text-[11px] uppercase tracking-[0.22em] text-white/40">
              Custom actions
            </div>
            {loading ? (
              <div className="py-8 text-center text-xs text-white/45">
                Loading your actions...
              </div>
            ) : filteredActions.length === 0 ? (
              <Card className="border-dashed border-white/10 bg-white/[0.03]">
                <CardContent className="py-10 text-center text-xs text-white/45">
                  {search
                    ? "No actions match this search."
                    : "No custom actions yet. Create one to get started."}
                </CardContent>
              </Card>
            ) : (
              filteredActions.map((action) => (
                <Card
                  key={action.id}
                  className="border-white/10 bg-white/[0.04]"
                >
                  <CardContent className="space-y-3 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white/86">
                          {action.name}
                        </div>
                        <p className="mt-1 text-[10px] text-white/42">
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
                        className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${
                          HANDLER_TYPE_COLORS[action.handler.type] ||
                          "bg-white/[0.06] text-white/58"
                        }`}
                      >
                        {HANDLER_TYPE_NAMES[action.handler.type] ??
                          action.handler.type}
                      </span>
                    </div>

                    {action.description && (
                      <p className="line-clamp-2 break-words text-xs text-white/56">
                        {action.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 border-t border-white/8 pt-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-white/54">
                        <input
                          type="checkbox"
                          checked={action.enabled}
                          onChange={() => handleToggleEnabled(action)}
                          className="h-3 w-3 cursor-pointer accent-accent"
                        />
                        <span>Enabled</span>
                      </label>

                      <div className="ml-auto flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(action)}
                          title="Edit action"
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(action)}
                          title="Delete action"
                          className="text-danger hover:text-danger"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
