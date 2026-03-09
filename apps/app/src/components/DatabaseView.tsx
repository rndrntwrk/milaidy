/**
 * Database View — Supabase-style table browser + SQL editor.
 *
 * Two modes:
 *  - Table browser: sidebar with schema tree, spreadsheet-like data grid
 *  - SQL editor: code textarea with run button and results grid
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ColumnInfo,
  client,
  type DatabaseStatus,
  type QueryResult,
  type TableInfo,
  type TableRowsResponse,
} from "../api-client";
import { SectionEmptyState, SectionErrorState, SectionLoadingState } from "./SectionStates.js";
import { SectionShell } from "./SectionShell.js";
import { Button } from "./ui/Button.js";
import { CloseIcon } from "./ui/Icons";
import { Input } from "./ui/Input.js";

type DbView = "tables" | "query";
type SortDir = "asc" | "desc" | null;

/** Format a cell value for display. */
function formatCell(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/** Abbreviated type label for column badges. */
function typeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("int")) return "int";
  if (t.includes("serial")) return "serial";
  if (t.includes("bool")) return "bool";
  if (
    t.includes("float") ||
    t.includes("double") ||
    t.includes("numeric") ||
    t.includes("real")
  )
    return "float";
  if (t.includes("json")) return "json";
  if (t.includes("uuid")) return "uuid";
  if (t.includes("timestamp")) return "time";
  if (t.includes("date")) return "date";
  if (t.includes("text") || t.includes("char") || t.includes("varchar"))
    return "text";
  if (t.includes("vector")) return "vector";
  if (t.includes("bytea")) return "bytes";
  return type.slice(0, 6);
}

/** Color for column type badge. */
function typeBadgeColor(type: string): string {
  const t = type.toLowerCase();
  if (
    t.includes("int") ||
    t.includes("serial") ||
    t.includes("float") ||
    t.includes("numeric") ||
    t.includes("real") ||
    t.includes("double")
  )
    return "text-amber-400 bg-amber-400/10";
  if (t.includes("bool")) return "text-purple-400 bg-purple-400/10";
  if (t.includes("json")) return "text-orange-400 bg-orange-400/10";
  if (t.includes("uuid")) return "text-cyan-400 bg-cyan-400/10";
  if (t.includes("timestamp") || t.includes("date"))
    return "text-pink-400 bg-pink-400/10";
  if (t.includes("text") || t.includes("char"))
    return "text-green-400 bg-green-400/10";
  if (t.includes("vector")) return "text-blue-400 bg-blue-400/10";
  return "text-[var(--muted)] bg-[var(--muted)]/10";
}

// ── Cell inspect popover ──────────────────────────────────────────────

function CellPopover({
  value,
  onClose,
}: {
  value: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[var(--card)] border border-[var(--border)] shadow-lg p-3 max-w-[500px] max-h-[300px] overflow-auto"
      style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[var(--muted)] uppercase font-bold">
          Cell Value
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full text-[var(--muted)] hover:text-[var(--txt)]"
          onClick={onClose}
          aria-label="Close cell value"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      <pre className="text-xs text-[var(--txt)] font-mono whitespace-pre-wrap break-all m-0">
        {value}
      </pre>
    </div>
  );
}

// ── Results grid (shared between table browser and SQL editor) ─────────

function ResultsGrid({
  columns,
  rows,
  columnMeta,
  sortCol,
  sortDir,
  onSort,
  onCellClick,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  columnMeta?: Map<string, ColumnInfo>;
  sortCol?: string;
  sortDir?: SortDir;
  onSort?: (col: string) => void;
  onCellClick?: (value: string) => void;
}) {
  return (
    <div
      className="overflow-auto border border-[var(--border)] bg-[var(--card)]"
      style={{ maxHeight: "calc(100vh - 340px)" }}
    >
      <table className="w-full border-collapse text-[12px] font-mono">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[var(--bg)]">
            {/* Row number column */}
            <th className="w-[50px] min-w-[50px] px-2 py-2 text-[10px] text-[var(--muted)] font-medium text-right border-b border-r border-[var(--border)] bg-[var(--bg)]">
              #
            </th>
            {columns.map((col) => {
              const meta = columnMeta?.get(col);
              const isSorted = sortCol === col;
              return (
                <th
                  key={col}
                  className="px-3 py-2 text-left border-b border-r border-[var(--border)] bg-[var(--bg)] whitespace-nowrap cursor-pointer select-none hover:bg-[var(--border)]/30 transition-colors"
                  onClick={() => onSort?.(col)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--txt)] font-semibold">
                      {col}
                    </span>
                    {meta && (
                      <span
                        className={`text-[9px] px-1 py-px rounded font-medium ${typeBadgeColor(meta.type)}`}
                      >
                        {typeLabel(meta.type)}
                      </span>
                    )}
                    {meta?.isPrimaryKey && (
                      <span className="text-[9px] px-1 py-px rounded font-bold text-yellow-400 bg-yellow-400/10">
                        PK
                      </span>
                    )}
                    {isSorted && (
                      <span className="text-[10px] text-[var(--accent)]">
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={JSON.stringify(row)}
              className="border-b border-[var(--border)] hover:bg-[var(--accent)]/5 transition-colors"
            >
              <td className="px-2 py-1.5 text-[10px] text-[var(--muted)] text-right border-r border-[var(--border)] bg-[var(--bg)]/50 tabular-nums">
                {i + 1}
              </td>
              {columns.map((col) => {
                const raw = row[col];
                const display = formatCell(raw);
                const isNull = raw === null || raw === undefined;
                const isExpandable = display.length > 40 && !!onCellClick;
                return (
                  <td
                    key={col}
                    className="px-3 py-1.5 border-r border-[var(--border)] max-w-[280px] truncate cursor-default"
                    title={display}
                    onClick={() => {
                      if (isExpandable) onCellClick(display);
                    }}
                    onKeyDown={(e) => {
                      if (!isExpandable) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCellClick(display);
                      }
                    }}
                    role={isExpandable ? "button" : undefined}
                    tabIndex={isExpandable ? 0 : undefined}
                  >
                    {isNull ? (
                      <span className="text-[var(--muted)] italic opacity-50">
                        NULL
                      </span>
                    ) : (
                      <span className="text-[var(--txt)]">{display}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pagination bar ────────────────────────────────────────────────────

function PaginationBar({
  total,
  offset,
  limit,
  onPrev,
  onNext,
}: {
  total: number;
  offset: number;
  limit: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = offset + 1;
  const end = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between px-3 py-2 border border-t-0 border-[var(--border)] bg-[var(--bg)] text-[11px] text-[var(--muted)]">
      <span>
        {total.toLocaleString()} row{total !== 1 ? "s" : ""}
        {total > 0 && ` · showing ${start}-${end}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full px-3 text-[11px]"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          Prev
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full px-3 text-[11px]"
          disabled={!hasNext}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function DatabaseView() {
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState<TableRowsResponse | null>(null);
  const [columnMeta, setColumnMeta] = useState<Map<string, ColumnInfo>>(
    new Map(),
  );
  const [view, setView] = useState<DbView>("tables");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [rowOffset, setRowOffset] = useState(0);
  const [cellInspect, setCellInspect] = useState<string | null>(null);

  // SQL editor state
  const [queryText, setQueryText] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  const ROW_LIMIT = 50;

  const loadStatus = useCallback(async (): Promise<DatabaseStatus | null> => {
    try {
      const status = await client.getDatabaseStatus();
      setDbStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const loadTables = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const { tables: t } = await client.getDatabaseTables();
      setTables(t);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      // Don't show error if database is simply not connected (cloud mode, agent not running)
      if (!msg.includes("Database not available")) {
        setErrorMessage(`Failed to load tables: ${msg}`);
      }
    }
    setLoading(false);
  }, []);

  const loadTableData = useCallback(
    async (
      tableName: string,
      opts?: { sort?: string; order?: "asc" | "desc"; offset?: number },
    ) => {
      setLoading(true);
      setErrorMessage("");
      try {
        const data = await client.getDatabaseRows(tableName, {
          limit: ROW_LIMIT,
          offset: opts?.offset ?? 0,
          sort: opts?.sort,
          order: opts?.order,
        });
        setTableData(data);
        setSelectedTable(tableName);

        // Get column metadata for the table
        const info = tables.find((t) => t.name === tableName);
        if (info?.columns) {
          const meta = new Map<string, ColumnInfo>();
          for (const col of info.columns) meta.set(col.name, col);
          setColumnMeta(meta);
        }
      } catch (err) {
        setErrorMessage(
          `Failed to load table: ${err instanceof Error ? err.message : "error"}`,
        );
      }
      setLoading(false);
    },
    [tables],
  );

  const handleSort = useCallback(
    (col: string) => {
      let newDir: SortDir;
      if (sortCol !== col) {
        newDir = "asc";
      } else if (sortDir === "asc") {
        newDir = "desc";
      } else {
        newDir = null;
      }
      setSortCol(newDir ? col : "");
      setSortDir(newDir);
      setRowOffset(0);
      if (selectedTable) {
        loadTableData(selectedTable, {
          sort: newDir ? col : undefined,
          order: newDir ?? undefined,
          offset: 0,
        });
      }
    },
    [sortCol, sortDir, selectedTable, loadTableData],
  );

  const handleSelectTable = useCallback(
    (tableName: string) => {
      setSortCol("");
      setSortDir(null);
      setRowOffset(0);
      loadTableData(tableName);
    },
    [loadTableData],
  );

  const handlePrev = useCallback(() => {
    const newOffset = Math.max(0, rowOffset - ROW_LIMIT);
    setRowOffset(newOffset);
    loadTableData(selectedTable, {
      sort: sortDir ? sortCol : undefined,
      order: sortDir ?? undefined,
      offset: newOffset,
    });
  }, [rowOffset, selectedTable, sortCol, sortDir, loadTableData]);

  const handleNext = useCallback(() => {
    const newOffset = rowOffset + ROW_LIMIT;
    setRowOffset(newOffset);
    loadTableData(selectedTable, {
      sort: sortDir ? sortCol : undefined,
      order: sortDir ?? undefined,
      offset: newOffset,
    });
  }, [rowOffset, selectedTable, sortCol, sortDir, loadTableData]);

  const runQuery = useCallback(async () => {
    if (!queryText.trim()) return;
    setQueryLoading(true);
    setErrorMessage("");
    try {
      const result = await client.executeDatabaseQuery(queryText);
      setQueryResult(result);
      setQueryHistory((prev) => {
        const next = [queryText, ...prev.filter((q) => q !== queryText)];
        return next.slice(0, 20);
      });
    } catch (err) {
      setErrorMessage(
        `Query failed: ${err instanceof Error ? err.message : "error"}`,
      );
    }
    setQueryLoading(false);
  }, [queryText]);

  useEffect(() => {
    const init = async () => {
      const status = await loadStatus();
      if (status?.connected) {
        await loadTables();
      }
    };
    void init();
  }, [loadStatus, loadTables]);

  const filteredTables = tables.filter(
    (t) =>
      !sidebarSearch ||
      t.name.toLowerCase().includes(sidebarSearch.toLowerCase()),
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={view === "tables" ? "secondary" : "outline"}
        onClick={() => setView("tables")}
      >
        Tables
      </Button>
      <Button
        type="button"
        variant={view === "query" ? "secondary" : "outline"}
        onClick={() => setView("query")}
      >
        SQL
      </Button>
      {view === "tables" ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setSidebarCollapsed((current) => !current)}
        >
          {sidebarCollapsed ? "Show list" : "Hide list"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          const status = await loadStatus();
          if (status?.connected) {
            await loadTables();
          }
        }}
      >
        Refresh
      </Button>
    </div>
  );

  return (
    <SectionShell
      title={view === "tables" ? "Database" : "SQL editor"}
      description={
        dbStatus?.connected
          ? `${dbStatus.provider} · ${dbStatus.tableCount} tables indexed`
          : "Browse local tables and query results."
      }
      toolbar={toolbar}
      className="h-full"
      contentClassName="flex min-h-0 flex-1 flex-col gap-4"
    >

      {dbStatus && !dbStatus.connected && (
        <SectionEmptyState
          className="mb-3"
          title="Database not available"
          description="This browser needs a local agent with an attached database connection. In cloud mode the data layer is managed remotely."
          actionLabel="Refresh"
          onAction={() => {
            void loadStatus();
          }}
        />
      )}

      {errorMessage && (
        <SectionErrorState
          className="mb-3"
          title="Database action failed"
          description="The last database request did not complete successfully."
          actionLabel="Dismiss"
          onAction={() => setErrorMessage("")}
          details={errorMessage}
        />
      )}

      {view === "tables" ? (
        <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
          <SectionShell
            title="Table list"
            description="Choose a table to inspect."
            className={sidebarCollapsed ? "hidden xl:block xl:min-w-0 xl:opacity-0" : ""}
            contentClassName="gap-3"
          >
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  placeholder="Filter tables..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="flex-1 min-w-0 text-[11px]"
                />
              </div>
              {loading && tables.length === 0 ? (
                <SectionLoadingState
                  title="Loading tables"
                  description="Pulling the latest schema and row counts."
                  className="border-none bg-transparent shadow-none"
                />
              ) : (
                <div className="flex flex-col gap-2 max-h-[calc(100vh-24rem)] overflow-auto">
                  {filteredTables.map((t) => (
                    <button
                      type="button"
                      key={t.name}
                      onClick={() => handleSelectTable(t.name)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors ${
                        selectedTable === t.name
                          ? "border-white/18 bg-white/[0.1] text-white"
                          : "border-white/8 bg-white/[0.02] text-[var(--txt)] hover:border-white/14 hover:bg-white/[0.05]"
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="ml-2 flex-shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                        {t.rowCount}
                      </span>
                    </button>
                  ))}
                </div>
              )}
          </SectionShell>

          <SectionShell
            title={selectedTable || "Table data"}
            description={
              selectedTable
                ? "Browse rows, sort columns, and inspect values."
                : "Select a table to browse rows."
            }
            toolbar={
              selectedTable && columnMeta.size > 0 ? (
                <span className="text-sm text-white/55">{columnMeta.size} columns</span>
              ) : undefined
            }
            className="min-h-0"
            contentClassName="flex min-h-0 flex-1 flex-col gap-4"
          >
            {!selectedTable ? (
              <div className="flex-1 flex items-center justify-center">
                <SectionEmptyState
                  title="Select a table"
                  description="Pick a table from the list to inspect rows, columns, and values."
                  className="max-w-md border-none bg-transparent shadow-none"
                />
              </div>
            ) : loading && !tableData ? (
              <div className="flex-1 flex items-center justify-center">
                <SectionLoadingState
                  title="Loading table"
                  description="Fetching rows and schema for the selected table."
                  className="max-w-md border-none bg-transparent shadow-none"
                />
              </div>
            ) : tableData ? (
              <>
                <div className="flex-1 min-h-0">
                  {tableData.rows.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <SectionEmptyState
                        title="Table is empty"
                        description="This table has no rows yet."
                        className="max-w-md border-none bg-transparent shadow-none"
                      />
                    </div>
                  ) : (
                    <ResultsGrid
                      columns={tableData.columns}
                      rows={tableData.rows}
                      columnMeta={columnMeta}
                      sortCol={sortCol}
                      sortDir={sortDir}
                      onSort={handleSort}
                      onCellClick={(v) => setCellInspect(v)}
                    />
                  )}
                </div>

                {/* Pagination */}
                <PaginationBar
                  total={tableData.total}
                  offset={rowOffset}
                  limit={ROW_LIMIT}
                  onPrev={handlePrev}
                  onNext={handleNext}
                />
              </>
            ) : null}
          </SectionShell>
        </div>
      ) : (
        <SectionShell
          title="Query editor"
          description="Run ad hoc SQL and inspect results."
          className="flex-1"
          contentClassName="flex min-h-0 flex-1 flex-col gap-4"
        >
          {/* Editor area */}
          <div className="flex flex-col">
            <div className="relative">
              <textarea
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    runQuery();
                  }
                }}
                placeholder="SELECT * FROM memories LIMIT 50;"
                rows={6}
                className="min-h-[10rem] w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-[13px] font-mono leading-relaxed text-[var(--txt)]"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={queryLoading || !queryText.trim()}
                onClick={runQuery}
              >
                {queryLoading ? "Running..." : "Run"}
              </Button>
              <span className="text-[10px] text-[var(--muted)]">
                {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter
              </span>
              {queryResult && (
                <span className="text-[10px] text-[var(--muted)] ml-auto">
                  {queryResult.rowCount} row
                  {queryResult.rowCount !== 1 ? "s" : ""} ·{" "}
                  {queryResult.durationMs}ms
                </span>
              )}
            </div>
          </div>

          {/* Query history dropdown */}
          {queryHistory.length > 0 && !queryResult && (
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
              <div className="px-3 py-2 text-[11px] text-[var(--muted)] border-b border-white/8">
                Recent queries
              </div>
              {queryHistory.slice(0, 5).map((q) => (
                <button
                  type="button"
                  key={q}
                  className="w-full px-3 py-2 text-[11px] font-mono text-[var(--txt)] text-left bg-transparent border-0 border-b border-white/8 cursor-pointer hover:bg-[var(--accent)]/5 truncate"
                  onClick={() => setQueryText(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          {queryResult && queryResult.rows.length > 0 && (
            <div className="flex-1 min-h-0">
              <ResultsGrid
                columns={queryResult.columns}
                rows={queryResult.rows}
                onCellClick={(v) => setCellInspect(v)}
              />
            </div>
          )}

          {queryResult && queryResult.rows.length === 0 && (
            <SectionEmptyState
              title="Query returned no rows"
              description="Run another query or broaden the result set."
            />
          )}
        </SectionShell>
      )}

      {/* Cell inspect overlay */}
      {cellInspect !== null && (
        <CellPopover value={cellInspect} onClose={() => setCellInspect(null)} />
      )}
    </SectionShell>
  );
}
