/**
 * TrajectoriesView — view and analyze LLM call trajectories.
 *
 * Shows all captured LLM interactions with token counts, latency, and context.
 * Supports filtering, search, export, and clearing trajectories.
 */

import { useCallback, useEffect, useState } from "react";
import {
  client,
  type TrajectoryConfig,
  type TrajectoryListResult,
  type TrajectoryRecord,
  type TrajectoryStats,
} from "../api-client";
import {
  formatTrajectoryDuration,
  formatTrajectoryTimestamp,
  formatTrajectoryTokenCount,
} from "./trajectory-format";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";

type StatusFilter = "" | "active" | "completed" | "error";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: "rgba(59, 130, 246, 0.15)", fg: "rgb(59, 130, 246)" },
  completed: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  error: { bg: "rgba(239, 68, 68, 0.15)", fg: "rgb(239, 68, 68)" },
};

const SOURCE_COLORS: Record<string, { bg: string; fg: string }> = {
  chat: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  telegram: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  discord: { bg: "rgba(88, 101, 242, 0.15)", fg: "rgb(88, 101, 242)" },
  api: { bg: "rgba(156, 163, 175, 0.15)", fg: "rgb(156, 163, 175)" },
};

interface TrajectoriesViewProps {
  onSelectTrajectory?: (id: string) => void;
}

export function TrajectoriesView({
  onSelectTrajectory,
}: TrajectoriesViewProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TrajectoryListResult | null>(null);
  const [stats, setStats] = useState<TrajectoryStats | null>(null);
  const [config, setConfig] = useState<TrajectoryConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Actions
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadTrajectories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trajResult, statsResult, configResult] = await Promise.all([
        client.getTrajectories({
          limit: pageSize,
          offset: page * pageSize,
          status: statusFilter || undefined,
          source: sourceFilter || undefined,
          search: searchQuery || undefined,
        }),
        client.getTrajectoryStats(),
        client.getTrajectoryConfig(),
      ]);
      setResult(trajResult);
      setStats(statsResult);
      setConfig(configResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load trajectories",
      );
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, sourceFilter, searchQuery]);

  useEffect(() => {
    void loadTrajectories();
  }, [loadTrajectories]);

  const handleEnableLogging = async () => {
    try {
      const updated = await client.updateTrajectoryConfig({ enabled: true });
      setConfig(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update config");
    }
  };

  const handleExport = async (
    format: "json" | "csv" | "zip",
    includePrompts: boolean,
  ) => {
    setExporting(true);
    try {
      const blob = await client.exportTrajectories({ format, includePrompts });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trajectories-${new Date().toISOString().split("T")[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        "Are you sure you want to delete ALL trajectories? This cannot be undone.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await client.clearAllTrajectories();
      void loadTrajectories();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clear trajectories",
      );
    } finally {
      setClearing(false);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter("");
    setSourceFilter("");
    setSearchQuery("");
    setPage(0);
  };

  const hasActiveFilters =
    statusFilter !== "" || sourceFilter !== "" || searchQuery !== "";
  const trajectories = result?.trajectories ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const sources = stats?.bySource ? Object.keys(stats.bySource) : [];

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Stats summary */}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Card className="rounded-[22px]"><CardContent className="p-4 text-xs"><div className="text-white/42 uppercase tracking-[0.18em]">Total</div><div className="mt-2 text-lg font-semibold text-white/88">
              {stats.totalTrajectories.toLocaleString()}
          </div></CardContent></Card>
          <Card className="rounded-[22px]"><CardContent className="p-4 text-xs"><div className="text-white/42 uppercase tracking-[0.18em]">LLM Calls</div><div className="mt-2 text-lg font-semibold text-white/88">
              {stats.totalLlmCalls.toLocaleString()}
          </div></CardContent></Card>
          <Card className="rounded-[22px]"><CardContent className="p-4 text-xs"><div className="text-white/42 uppercase tracking-[0.18em]">Tokens</div><div className="mt-2 text-lg font-semibold text-accent">
              {formatTrajectoryTokenCount(
                stats.totalPromptTokens + stats.totalCompletionTokens,
                { emptyLabel: "0" },
              )}
          </div>
            <div className="mt-1 text-[10px] text-white/42">
              (
              {formatTrajectoryTokenCount(stats.totalPromptTokens, {
                emptyLabel: "0",
              })}
              ↑{" "}
              {formatTrajectoryTokenCount(stats.totalCompletionTokens, {
                emptyLabel: "0",
              })}
              ↓)
            </div></CardContent></Card>
          <Card className="rounded-[22px]"><CardContent className="p-4 text-xs"><div className="text-white/42 uppercase tracking-[0.18em]">Avg Duration</div><div className="mt-2 text-lg font-semibold text-white/88">
              {formatTrajectoryDuration(stats.averageDurationMs)}
          </div></CardContent></Card>
          <Card className="rounded-[22px]"><CardContent className="flex h-full items-center justify-between gap-3 p-4 text-xs"><div><div className="text-white/42 uppercase tracking-[0.18em]">Logging</div><div className="mt-2"><Badge variant={config?.enabled ? "success" : "warning"}>{config?.enabled ? "enabled" : "disabled"}</Badge></div></div><Button onClick={handleEnableLogging} disabled={config?.enabled} variant="outline" size="sm">{config?.enabled ? "On" : "Enable"}</Button></CardContent></Card>
        </div>
      )}

      {/* Filters row */}
      <Card className="rounded-[24px]">
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
        <Input
          type="text"
          placeholder="Search..."
          className="h-10 w-52 rounded-2xl"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0);
          }}
        />

        <Select
          className="h-10 w-44 rounded-2xl"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(0);
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
        </Select>

        {sources.length > 0 && (
          <Select
            className="h-10 w-44 rounded-2xl"
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            onClick={() => void loadTrajectories()}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
          <Button
            onClick={() => handleExport("json", true)}
            disabled={exporting || trajectories.length === 0}
            variant="ghost"
            size="sm"
          >
            {exporting ? "Exporting..." : "JSON"}
          </Button>
          <Button
            onClick={() => handleExport("csv", false)}
            disabled={exporting || trajectories.length === 0}
            variant="ghost"
            size="sm"
          >
            CSV
          </Button>
          <Button
            onClick={() => handleExport("zip", true)}
            disabled={exporting || trajectories.length === 0}
            variant="ghost"
            size="sm"
          >
            ZIP
          </Button>

          <Button
            onClick={handleClearAll}
            disabled={clearing || stats?.totalTrajectories === 0}
            variant="outline"
            size="sm"
            className="border-danger/35 text-danger hover:border-danger hover:bg-danger/10"
          >
            {clearing ? "Clearing..." : "Clear All"}
          </Button>
        </div>
        </CardContent>
      </Card>

      {/* Error display */}
      {error && (
        <div className="text-xs text-danger border border-danger/30 bg-danger/10 px-3 py-2">
          {error}
        </div>
      )}

      {/* Trajectories list */}
      <Card className="flex-1 min-h-0 overflow-hidden rounded-[28px]">
        <CardContent className="h-full overflow-y-auto p-0">
        {loading && trajectories.length === 0 ? (
          <div className="py-8 text-center text-white/42">
            Loading trajectories...
          </div>
        ) : trajectories.length === 0 ? (
          <div className="py-8 text-center text-white/42">
            No trajectories {hasActiveFilters ? "matching filters" : "yet"}.
            {!config?.enabled && (
              <div className="mt-2 text-[11px] text-warn">
                Trajectory logging should auto-enable; click ENABLE if startup
                is still settling.
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white/[0.05] backdrop-blur">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Time</th>
                <th className="text-left px-2 py-1.5 font-medium">Source</th>
                <th className="text-left px-2 py-1.5 font-medium">Status</th>
                <th className="text-right px-2 py-1.5 font-medium">Calls</th>
                <th className="text-right px-2 py-1.5 font-medium">Tokens</th>
                <th className="text-right px-2 py-1.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {trajectories.map((traj: TrajectoryRecord) => {
                const statusColor =
                  STATUS_COLORS[traj.status] ?? STATUS_COLORS.completed;
                const sourceColor =
                  SOURCE_COLORS[traj.source] ?? SOURCE_COLORS.api;
                return (
                  <tr
                    key={traj.id}
                    className="cursor-pointer border-t border-white/8 hover:bg-white/[0.04]"
                    onClick={() => onSelectTrajectory?.(traj.id)}
                  >
                    <td className="px-2 py-1.5 text-muted whitespace-nowrap">
                      {formatTrajectoryTimestamp(traj.createdAt, "smart")}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className="inline-block rounded-full px-2 py-1 text-[10px]"
                        style={{
                          background: sourceColor.bg,
                          color: sourceColor.fg,
                        }}
                      >
                        {traj.source}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className="inline-block rounded-full px-2 py-1 text-[10px]"
                        style={{
                          background: statusColor.bg,
                          color: statusColor.fg,
                        }}
                      >
                        {traj.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {traj.llmCallCount}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      <span className="text-accent">
                        {formatTrajectoryTokenCount(
                          traj.totalPromptTokens + traj.totalCompletionTokens,
                          { emptyLabel: "0" },
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted font-mono">
                      {formatTrajectoryDuration(traj.durationMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">
            Showing {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              variant="ghost"
              size="sm"
            >
              Prev
            </Button>
            <Button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              variant="ghost"
              size="sm"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
