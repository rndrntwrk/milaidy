import { useMemo, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import { resolveHomepageAssetUrl } from "../../lib/asset-url";
import { FilterChips } from "../ui/FilterChips";
import { InstanceCard } from "./InstanceCard";

export type GridFilter = "all" | "local" | "cloud" | "remote";

export interface InstanceGridProps {
  agents: ManagedAgent[];
  loading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpen: (agent: ManagedAgent) => void;
  onCopyUrl: (agent: ManagedAgent) => void;
  onOpenRaw: (agent: ManagedAgent) => void;
  onDisconnect: (agent: ManagedAgent) => void;
  onAttachRemote: () => void;
  onOpenLocal: () => void;
}

/**
 * Zone 2 — unified instance grid. Replaces the three duplicated
 * InstanceGroup sections with a single grid + filter chips.
 */
export function InstanceGrid({
  agents,
  loading,
  isRefreshing,
  onRefresh,
  onOpen,
  onCopyUrl,
  onOpenRaw,
  onDisconnect,
  onAttachRemote,
  onOpenLocal,
}: InstanceGridProps) {
  const [filter, setFilter] = useState<GridFilter>("all");

  const counts = useMemo(
    () => ({
      all: agents.length,
      local: agents.filter((a) => a.source === "local").length,
      cloud: agents.filter((a) => a.source === "cloud").length,
      remote: agents.filter((a) => a.source === "remote").length,
    }),
    [agents],
  );

  const filtered = useMemo(
    () =>
      filter === "all" ? agents : agents.filter((a) => a.source === filter),
    [filter, agents],
  );

  return (
    <section aria-labelledby="runtimes-heading" className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            control surface
          </div>
          <h2
            id="runtimes-heading"
            className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-white sm:text-[32px]"
          >
            Your runtimes
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            ariaLabel="Filter runtimes by source"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "all", count: counts.all },
              { value: "local", label: "local", count: counts.local },
              { value: "cloud", label: "cloud", count: counts.cloud },
              { value: "remote", label: "remote", count: counts.remote },
            ]}
          />
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh runtimes"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={isRefreshing ? "animate-spin" : ""}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </header>

      {loading ? (
        <GridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          filter={filter}
          onAttachRemote={onAttachRemote}
          onOpenLocal={onOpenLocal}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((agent) => (
            <InstanceCard
              key={agent.id}
              agent={agent}
              onOpen={() => onOpen(agent)}
              onCopyUrl={() => onCopyUrl(agent)}
              onOpenRaw={() => onOpenRaw(agent)}
              onDisconnect={
                agent.source === "remote"
                  ? () => onDisconnect(agent)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="aspect-[4/5] animate-pulse rounded-xl border border-border bg-white/[0.03]"
        />
      ))}
    </div>
  );
}

function EmptyState({
  filter,
  onAttachRemote,
  onOpenLocal,
}: {
  filter: GridFilter;
  onAttachRemote: () => void;
  onOpenLocal: () => void;
}) {
  const copy: Record<
    GridFilter,
    { title: string; body: string; cta?: ReactCTA }
  > = {
    all: {
      title: "No runtimes yet.",
      body: "Open local Milady to begin, or attach a remote runtime by URL.",
      cta: { label: "Open local Milady", onClick: onOpenLocal, primary: true },
    },
    local: {
      title: "No local runtime responded.",
      body: "Launch Milady locally, then refresh. We scan common local ports and any configured sandboxes.",
      cta: { label: "Open local Milady", onClick: onOpenLocal, primary: true },
    },
    cloud: {
      title: "No cloud runtimes.",
      body: "Sign into Eliza Cloud to discover hosted Milady instances attached to your account.",
    },
    remote: {
      title: "No remote connections.",
      body: "Attach a VPS, LAN box, or any Milady/elizaOS runtime by URL.",
      cta: { label: "Attach remote", onClick: onAttachRemote },
    },
  };
  const state = copy[filter];
  const heroUrl = resolveHomepageAssetUrl("vrms/previews/milady-5.png");
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-border bg-black/[0.2] px-6 py-16 text-center">
      <img
        src={heroUrl}
        alt=""
        aria-hidden="true"
        className="h-32 w-24 rounded-lg border border-white/10 object-cover object-top opacity-80"
      />
      <div className="max-w-md space-y-2">
        <h3 className="text-[18px] font-semibold tracking-tight text-white">
          {state.title}
        </h3>
        <p className="text-[14px] leading-6 text-white/60">{state.body}</p>
      </div>
      {state.cta ? (
        <button
          type="button"
          onClick={state.cta.onClick}
          className={`rounded-md px-4 py-2 text-[12px] font-semibold transition ${
            state.cta.primary
              ? "bg-brand text-black hover:bg-[var(--color-gold-300)]"
              : "border border-border text-white hover:border-white/25"
          }`}
        >
          {state.cta.label}
        </button>
      ) : null}
    </div>
  );
}

interface ReactCTA {
  label: string;
  onClick: () => void;
  primary?: boolean;
}
