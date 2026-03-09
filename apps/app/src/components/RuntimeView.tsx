/**
 * RuntimeView — deep runtime state inspector for advanced debugging.
 *
 * Shows:
 * - Full runtime snapshot
 * - Split sections: actions/providers/plugins/services/evaluators
 * - Explicit load order metadata
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  client,
  type RuntimeDebugSnapshot,
  type RuntimeOrderItem,
  type RuntimeServiceOrderItem,
} from "../api-client";
import { formatDateTime } from "./shared/format";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Input } from "./ui/Input";

type RuntimeSectionKey =
  | "runtime"
  | "actions"
  | "providers"
  | "plugins"
  | "services"
  | "evaluators";

const SECTION_TABS: Array<{ key: RuntimeSectionKey; label: string }> = [
  { key: "runtime", label: "Runtime" },
  { key: "actions", label: "Actions" },
  { key: "providers", label: "Providers" },
  { key: "plugins", label: "Plugins" },
  { key: "services", label: "Services" },
  { key: "evaluators", label: "Evaluators" },
];

function nodeSummary(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    const compact = value.length > 100 ? `${value.slice(0, 100)}...` : value;
    return JSON.stringify(compact);
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const typeTag = typeof record.__type === "string" ? record.__type : null;
    if (typeTag === "array" && typeof record.length === "number") {
      return `Array(${String(record.length)})`;
    }
    if (typeTag === "map" && typeof record.size === "number") {
      return `Map(${String(record.size)})`;
    }
    if (typeTag === "set" && typeof record.size === "number") {
      return `Set(${String(record.size)})`;
    }
    if (typeTag === "object") {
      const className =
        typeof record.className === "string" ? record.className : "Object";
      const props =
        record.properties &&
        typeof record.properties === "object" &&
        !Array.isArray(record.properties)
          ? Object.keys(record.properties as Record<string, unknown>).length
          : 0;
      return `${className} {${props}}`;
    }
    return `${typeTag ?? "Object"} {${Object.keys(record).length}}`;
  }
  return String(value);
}

function isExpandable(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function nodeEntries(
  value: unknown,
  path: string,
): Array<{ key: string; value: unknown; path: string }> {
  if (Array.isArray(value)) {
    return value.map((entry, i) => ({
      key: `[${i}]`,
      value: entry,
      path: `${path}[${i}]`,
    }));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).map(
    ([key, entry]) => ({
      key,
      value: entry,
      path: `${path}.${key}`,
    }),
  );
}

function buildInitialExpanded(rootPath: string, value: unknown): Set<string> {
  const expanded = new Set<string>([rootPath]);
  const firstLayer = nodeEntries(value, rootPath).slice(0, 24);
  for (const entry of firstLayer) expanded.add(entry.path);
  return expanded;
}

function orderItemLabel(entry: RuntimeOrderItem): string {
  const idPart = entry.id ? ` (${entry.id})` : "";
  return `[${entry.index}] ${entry.name} :: ${entry.className}${idPart}`;
}

function TreeNode(props: {
  label: string;
  value: unknown;
  path: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const { label, value, path, depth, expanded, onToggle } = props;
  const canExpand = isExpandable(value);
  const open = expanded.has(path);
  const entries = canExpand ? nodeEntries(value, path) : [];

  return (
    <div>
      <div
        className="flex items-baseline gap-1 text-[11px] font-mono leading-5"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {canExpand ? (
          <button
            type="button"
            onClick={() => onToggle(path)}
            className="w-4 text-left text-[var(--muted)] hover:text-[var(--txt)]"
            title={open ? "Collapse" : "Expand"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="inline-block w-4 text-[var(--muted)]">·</span>
        )}
        <span className="text-[var(--muted)]">{label}</span>
        <span className="text-[var(--txt)]">{nodeSummary(value)}</span>
      </div>

      {canExpand && open && (
        <div>
          {entries.map((entry) => (
            <TreeNode
              key={entry.path}
              label={entry.key}
              value={entry.value}
              path={entry.path}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard(props: { title: string; entries: RuntimeOrderItem[] }) {
  const { title, entries } = props;
  return (
    <Card className="min-h-[170px] rounded-[24px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px]">
        {title} ({entries.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[190px] overflow-auto pt-0 text-[11px] font-mono leading-5 text-white/74">
        {entries.length === 0 ? (
          <div className="text-white/36">none</div>
        ) : (
          entries.map((entry) => (
            <div key={`${title}-${entry.index}`} className="text-white/82">
              {orderItemLabel(entry)}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ServicesOrderCard(props: { entries: RuntimeServiceOrderItem[] }) {
  const { entries } = props;
  return (
    <Card className="min-h-[170px] rounded-[24px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px]">
        Services ({entries.length} types)
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[190px] overflow-auto pt-0 text-[11px] font-mono leading-5 text-white/74">
        {entries.length === 0 ? (
          <div className="text-white/36">none</div>
        ) : (
          entries.map((serviceGroup) => (
            <div
              key={`${serviceGroup.serviceType}-${serviceGroup.index}`}
              className="mb-2"
            >
              <div className="text-white/82">
                [{serviceGroup.index}] {serviceGroup.serviceType} (
                {serviceGroup.count})
              </div>
              {serviceGroup.instances.map((instance) => (
                <div
                  key={`${serviceGroup.serviceType}-${instance.index}`}
                  className="pl-4 text-white/46"
                >
                  {orderItemLabel(instance)}
                </div>
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function RuntimeView() {
  const [snapshot, setSnapshot] = useState<RuntimeDebugSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] =
    useState<RuntimeSectionKey>("runtime");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const [depth, setDepth] = useState(10);
  const [maxArrayLength, setMaxArrayLength] = useState(1000);
  const [maxObjectEntries, setMaxObjectEntries] = useState(1000);

  const sectionData = snapshot?.sections[activeSection] ?? null;
  const rootPath = useMemo(() => `$${activeSection}`, [activeSection]);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await client.getRuntimeSnapshot({
        depth,
        maxArrayLength,
        maxObjectEntries,
      });
      setSnapshot(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load runtime snapshot",
      );
    } finally {
      setLoading(false);
    }
  }, [depth, maxArrayLength, maxObjectEntries]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    setExpandedPaths(buildInitialExpanded(rootPath, sectionData));
  }, [rootPath, sectionData]);

  const handleTogglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <Card className="rounded-[28px]">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="mr-2">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">
              Runtime
            </div>
            <div className="text-sm font-semibold text-white/88">
              Snapshot controls
            </div>
          </div>
          <label className="flex min-w-[7rem] items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
            <span>Depth</span>
            <Input
            type="number"
            min={1}
            max={24}
            value={depth}
            onChange={(e) =>
              setDepth(Math.max(1, Math.min(24, Number(e.target.value) || 1)))
            }
            className="h-10 w-20 rounded-2xl px-3 text-sm"
          />
        </label>
          <label className="flex min-w-[8.5rem] items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
            <span>Array cap</span>
            <Input
            type="number"
            min={1}
            max={5000}
            value={maxArrayLength}
            onChange={(e) =>
              setMaxArrayLength(
                Math.max(1, Math.min(5000, Number(e.target.value) || 1)),
              )
            }
            className="h-10 w-24 rounded-2xl px-3 text-sm"
          />
        </label>
          <label className="flex min-w-[8.5rem] items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
            <span>Object cap</span>
            <Input
            type="number"
            min={1}
            max={5000}
            value={maxObjectEntries}
            onChange={(e) =>
              setMaxObjectEntries(
                Math.max(1, Math.min(5000, Number(e.target.value) || 1)),
              )
            }
            className="h-10 w-24 rounded-2xl px-3 text-sm"
          />
        </label>
          <Button onClick={() => void loadSnapshot()} disabled={loading} variant="outline" size="sm">
          {loading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            onClick={() => setExpandedPaths(new Set([rootPath]))}
            variant="ghost"
            size="sm"
          >
          Collapse
          </Button>
          <Button
            onClick={() =>
              setExpandedPaths(buildInitialExpanded(rootPath, sectionData))
            }
            variant="ghost"
            size="sm"
          >
          Expand Top
          </Button>
          <div className="ml-auto text-[11px] text-white/42">
          {snapshot
            ? `Last updated: ${formatDateTime(snapshot.generatedAt, { fallback: "n/a" })}`
            : "No snapshot loaded"}
          </div>
        </CardContent>
      </Card>

      {snapshot && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <OrderCard title="Plugins" entries={snapshot.order.plugins} />
          <OrderCard title="Actions" entries={snapshot.order.actions} />
          <OrderCard title="Providers" entries={snapshot.order.providers} />
          <OrderCard title="Evaluators" entries={snapshot.order.evaluators} />
          <ServicesOrderCard entries={snapshot.order.services} />
          <Card className="rounded-[24px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px]">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-[11px] text-white/68">
              <div className="flex items-center justify-between">
                <span>Runtime</span>
                <Badge variant={snapshot.runtimeAvailable ? "success" : "warning"}>
                  {snapshot.runtimeAvailable ? "available" : "offline"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Agent</span>
                <span className="truncate font-mono text-white/84">{snapshot.meta.agentName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>State</span>
                <span className="truncate font-mono text-white/84">{snapshot.meta.agentState}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Model</span>
                <span className="truncate font-mono text-white/84">{snapshot.meta.model ?? "n/a"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Badge variant="outline">Plugins {snapshot.meta.pluginCount}</Badge>
                <Badge variant="outline">Actions {snapshot.meta.actionCount}</Badge>
                <Badge variant="outline">Providers {snapshot.meta.providerCount}</Badge>
                <Badge variant="outline">Services {snapshot.meta.serviceCount}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {SECTION_TABS.map((tab) => {
          const active = tab.key === activeSection;
          return (
            <Button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              variant={active ? "secondary" : "ghost"}
              size="sm"
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      <Card className="flex-1 min-h-0 overflow-auto rounded-[28px]">
        <CardContent className="p-3">
        {error ? (
          <div className="p-3 text-xs text-danger">{error}</div>
        ) : !snapshot ? (
          <div className="p-3 text-xs text-white/42">
            {loading
              ? "Loading runtime snapshot..."
              : "No runtime snapshot available."}
          </div>
        ) : !snapshot.runtimeAvailable ? (
          <div className="p-3 text-xs text-white/42">
            Agent runtime is not running. Start the runtime and refresh.
          </div>
        ) : (
          <TreeNode
            label={activeSection}
            value={sectionData}
            path={rootPath}
            depth={0}
            expanded={expandedPaths}
            onToggle={handleTogglePath}
          />
        )}
        </CardContent>
      </Card>
    </div>
  );
}
