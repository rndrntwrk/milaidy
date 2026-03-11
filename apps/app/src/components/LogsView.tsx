/**
 * Logs view component — logs viewer with filtering.
 */

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { LogEntry } from "../api-client";
import { formatTime } from "./shared/format";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";

/** Per-tag badge colour map. */
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  agent: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  server: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  system: { bg: "rgba(156, 163, 175, 0.15)", fg: "rgb(156, 163, 175)" },
  cloud: { bg: "rgba(59, 130, 246, 0.15)", fg: "rgb(59, 130, 246)" },
  plugins: { bg: "rgba(168, 85, 247, 0.15)", fg: "rgb(168, 85, 247)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  websocket: { bg: "rgba(20, 184, 166, 0.15)", fg: "rgb(20, 184, 166)" },
};

export function LogsView() {
  const [searchQuery, setSearchQuery] = useState("");

  const {
    logs,
    logSources,
    logTags,
    logTagFilter,
    logLevelFilter,
    logSourceFilter,
    loadLogs,
    setState,
  } = useApp();

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("logLevelFilter", e.target.value);
    void loadLogs();
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("logSourceFilter", e.target.value);
    void loadLogs();
  };

  const handleClearFilters = () => {
    setState("logTagFilter", "");
    setState("logLevelFilter", "");
    setState("logSourceFilter", "");
    setSearchQuery("");
    void loadLogs();
  };

  const hasActiveFilters =
    logTagFilter !== "" ||
    logLevelFilter !== "" ||
    logSourceFilter !== "" ||
    searchQuery.trim() !== "";

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredLogs = useMemo(() => {
    if (!normalizedSearch) return logs;
    return logs.filter((entry) => {
      const haystack = [
        entry.message ?? "",
        entry.source ?? "",
        entry.level ?? "",
        ...(entry.tags ?? []),
      ];
      return haystack.some((part) =>
        part.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [logs, normalizedSearch]);

  const summary = useMemo(() => {
    const errors = filteredLogs.filter((entry) => entry.level === "error").length;
    const warnings = filteredLogs.filter((entry) => entry.level === "warn").length;
    const infos = filteredLogs.filter((entry) => entry.level === "info").length;
    return { errors, warnings, infos };
  }, [filteredLogs]);

  const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("logTagFilter", e.target.value);
    void loadLogs();
  };

  return (
    <div className="flex flex-col h-full">
      <Card className="mb-3 rounded-[22px]">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
            {filteredLogs.length} visible
          </Badge>
          <Badge variant={summary.errors > 0 ? "danger" : "outline"} className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
            {summary.errors} errors
          </Badge>
          <Badge variant={summary.warnings > 0 ? "warning" : "outline"} className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
            {summary.warnings} warnings
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
            {summary.infos} info
          </Badge>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => void loadLogs()}
        >
          Refresh
        </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-1.5 mb-2.5 items-center">
        <Input
          type="text"
          className="h-10 min-w-56 rounded-2xl text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search logs..."
          aria-label="Search logs"
        />

        <Select
          className="h-10 rounded-2xl text-sm"
          value={logLevelFilter}
          onChange={handleLevelChange}
        >
          <option value="">All levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </Select>

        <Select
          className="h-10 rounded-2xl text-sm"
          value={logSourceFilter}
          onChange={handleSourceChange}
        >
          <option value="">All sources</option>
          {logSources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        {logTags.length > 0 && (
          <Select
            className="h-10 rounded-2xl text-sm"
            value={logTagFilter}
            onChange={handleTagChange}
          >
            <option value="">All tags</option>
            {logTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </Select>
        )}

        {hasActiveFilters && (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={handleClearFilters}
          >
            Clear filters
          </Button>
        )}
      </div>

      <Card className="flex-1 min-h-0 overflow-hidden rounded-[24px]">
        <CardContent className="font-mono flex-1 min-h-0 overflow-y-auto p-2 text-xs">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-white/45">
            No log entries
            {hasActiveFilters ? " matching filters" : " yet"}.
          </div>
        ) : (
          filteredLogs.map((entry: LogEntry) => (
            <div
              key={`${entry.timestamp}-${entry.source}-${entry.level}-${entry.message}`}
              className="font-mono text-xs px-3 py-2 border-b border-white/8 flex gap-2 items-baseline"
              data-testid="log-entry"
            >
              {/* Timestamp */}
              <span className="text-muted whitespace-nowrap">
                {formatTime(entry.timestamp, { fallback: "—" })}
              </span>

              {/* Level */}
              <span
                className={`font-semibold w-[44px] uppercase text-[11px] ${
                  entry.level === "error"
                    ? "text-danger"
                    : entry.level === "warn"
                      ? "text-warn"
                      : "text-muted"
                }`}
              >
                {entry.level}
              </span>

              {/* Source */}
              <span className="text-muted w-16 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
                [{entry.source}]
              </span>

              {/* Tag badges */}
              <span className="inline-flex gap-0.5 shrink-0">
                {(entry.tags ?? []).map((t: string) => {
                  const c = TAG_COLORS[t];
                  return (
                    <span
                      key={t}
                className="inline-block text-[10px] px-1.5 py-px rounded-full mr-0.5"
                      style={{
                        background: c ? c.bg : "var(--bg-muted)",
                        color: c ? c.fg : "var(--muted)",
                        fontFamily: "var(--font-body, sans-serif)",
                      }}
                    >
                      {t}
                    </span>
                  );
                })}
              </span>

              {/* Message */}
              <span className="flex-1 break-all">{entry.message}</span>
            </div>
          ))
        )}
        </CardContent>
      </Card>
    </div>
  );
}
