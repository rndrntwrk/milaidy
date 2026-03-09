import { useEffect, useMemo, useState } from "react";
import {
  client,
  type KnowledgeSearchResult,
  type KnowledgeStats,
} from "../api-client.js";
import { useApp } from "../AppContext.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { ScrollArea } from "./ui/ScrollArea.js";

export function MemoryConsolePanel() {
  const { droppedFiles, shareIngestNotice, setTab } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const nextStats = await client.getKnowledgeStats();
        if (!cancelled) {
          setStats(nextStats);
          setStatsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setStatsError(error instanceof Error ? error.message : "Stats unavailable");
        }
      }
    };
    void loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await client.searchKnowledge(query, {
          threshold: 0.3,
          limit: 5,
        });
        setResults(res.results);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const ingestLabel = useMemo(() => {
    if (droppedFiles.length > 0) {
      return `${droppedFiles.length} queued for ingest`;
    }
    if (shareIngestNotice.trim()) {
      return shareIngestNotice.trim();
    }
    if (stats) {
      return `${stats.documentCount} docs indexed`;
    }
    if (statsError) {
      return statsError;
    }
    return "Memory is idle";
  }, [droppedFiles.length, shareIngestNotice, stats, statsError]);

  return (
    <Card className="flex min-h-[16rem] flex-1 flex-col border-white/10 bg-black/32 shadow-none">
      <CardHeader className="border-b border-white/8 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Memory</CardTitle>
          <span className="font-mono text-xs text-white/62">
            {searching
              ? "searching"
              : query.trim()
                ? `${results.length} hit${results.length === 1 ? "" : "s"}`
                : "ready"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.2em]">
          <div className="rounded-xl border border-border bg-bg/50 p-2 text-muted">
            <div>Documents</div>
            <div className="mt-1 text-sm text-txt">{stats?.documentCount ?? "--"}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg/50 p-2 text-muted">
            <div>Fragments</div>
            <div className="mt-1 text-sm text-txt">{stats?.fragmentCount ?? "--"}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg/50 p-2 text-muted">
            <div>Ingest</div>
            <div className="mt-1 truncate text-sm text-txt" title={ingestLabel}>
              {droppedFiles.length > 0 ? "active" : shareIngestNotice ? "sync" : "idle"}
            </div>
          </div>
        </div>

        <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-white/58">
          {ingestLabel}
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <div className="shrink-0 space-y-2">
            <Input
              placeholder="Search memory"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="text-sm"
            />
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted">
              {query.trim()
                ? "Recent fragment hits"
                : "Search indexed memory or jump into deeper knowledge tools"}
            </div>
          </div>
          <ScrollArea className="flex-1 space-y-2">
            {results.length === 0 && query.trim() && !searching ? (
              <div className="mt-4 text-center text-xs text-muted">
                No matches found.
              </div>
            ) : null}
            {results.map((result, index) => (
              <div
                key={`${result.id}-${index}`}
                className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/66 transition-colors hover:border-white/18 hover:bg-white/[0.05]"
              >
                <div className="mb-1 flex justify-between gap-2">
                  <span className="truncate pr-2 text-white/88">
                    {result.documentTitle || "Unknown document"}
                  </span>
                  <span className="text-[10px] text-white/46">
                    {(result.similarity * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="line-clamp-3 leading-relaxed group-hover:line-clamp-none">
                  {result.text}
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            onClick={() => setTab("knowledge")}
            variant="secondary"
            className="justify-start rounded-xl"
          >
            Open memory
          </Button>
          <Button
            onClick={() => setTab("database")}
            variant="outline"
            className="justify-start rounded-xl"
          >
            Vector store
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
