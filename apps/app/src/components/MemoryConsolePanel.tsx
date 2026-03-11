import { useEffect, useMemo, useState } from "react";
import {
  client,
  type KnowledgeSearchResult,
  type KnowledgeStats,
} from "../api-client.js";
import { useApp } from "../AppContext.js";
import { SectionEmptyState, SectionErrorState, SectionSkeleton } from "./SectionStates.js";
import { SectionShell } from "./SectionShell.js";
import { SummaryStatRow } from "./SummaryStatRow.js";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import { ScrollArea } from "./ui/ScrollArea.js";

export function MemoryConsolePanel() {
  const { droppedFiles, shareIngestNotice, setTab } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      const nextStats = await client.getKnowledgeStats();
      setStats(nextStats);
      setStatsError(null);
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : "Stats unavailable");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadStatsSafe = async () => {
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
    void loadStatsSafe();
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
    return "Ready to search indexed memory";
  }, [droppedFiles.length, shareIngestNotice, stats]);

  const summaryItems = useMemo(
    () => [
      {
        label: "Documents",
        value: stats?.documentCount !== undefined ? String(stats.documentCount) : "—",
      },
      {
        label: "Fragments",
        value: stats?.fragmentCount !== undefined ? String(stats.fragmentCount) : "—",
      },
      {
        label: "Ingest",
        value: droppedFiles.length > 0 ? "Active" : shareIngestNotice ? "Syncing" : "Idle",
        tone: droppedFiles.length > 0 ? "warning" : "default",
      },
    ],
    [droppedFiles.length, shareIngestNotice, stats?.documentCount, stats?.fragmentCount],
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionShell
        title="Indexed memory"
        description="Search indexed memory and check ingest status."
        toolbar={
          <span className="font-mono text-xs text-white/54">
            {searching
              ? "searching"
              : query.trim()
                ? `${results.length} hit${results.length === 1 ? "" : "s"}`
                : "ready"}
          </span>
        }
      >
        {!stats && !statsError ? (
          <SectionSkeleton lines={1} className="border-none bg-transparent shadow-none" />
        ) : (
          <SummaryStatRow items={summaryItems} />
        )}
        {statsError && !stats ? (
          <SectionErrorState
            title="Memory summary unavailable"
            description="Search still works, but the indexed memory summary could not be refreshed."
            actionLabel="Retry"
            onAction={() => {
              void loadStats();
            }}
            details={statsError}
            className="border-none bg-transparent shadow-none"
          />
        ) : (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/62">
            {ingestLabel}
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Search"
        description="Search indexed memory or open deeper knowledge tools."
        contentClassName="gap-4"
      >
        <Input
          placeholder="Search memory"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="text-sm"
        />
        <ScrollArea className="max-h-[18rem]">
          <div className="space-y-2">
            {results.length === 0 && query.trim() && !searching ? (
              <SectionEmptyState
                title="No memory matches"
                description="Try a broader query or open the deeper memory tools."
                className="border-none bg-transparent shadow-none"
              />
            ) : null}
            {results.map((result, index) => (
              <div
                key={`${result.id}-${index}`}
                className="group rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/68 transition-colors hover:border-white/18 hover:bg-white/[0.05]"
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
          </div>
        </ScrollArea>
        <div className="grid grid-cols-2 gap-2">
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
      </SectionShell>
    </div>
  );
}
