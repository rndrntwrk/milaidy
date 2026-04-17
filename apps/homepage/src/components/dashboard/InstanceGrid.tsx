import { useMemo, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
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
  /** Opens the ProvisionAgentModal. Only rendered when signed in to cloud. */
  onProvisionAgent?: () => void;
  /** True when the user has an authenticated cloud client. */
  canProvision: boolean;
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
  onProvisionAgent,
  canProvision,
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
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
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
          {onProvisionAgent ? (
            <button
              type="button"
              onClick={onProvisionAgent}
              disabled={!canProvision}
              aria-label={
                canProvision
                  ? "Create new cloud agent"
                  : "Sign in to cloud to create an agent"
              }
              title={
                canProvision
                  ? "Create a new cloud agent"
                  : "Sign in to cloud to create an agent"
              }
              className="group/new inline-flex h-8 items-center gap-1.5 rounded-full border border-brand/45 bg-brand/[0.08] px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-brand transition duration-200 hover:border-brand/75 hover:bg-brand/[0.16] hover:shadow-[inset_0_0_0_1px_rgba(240,185,11,0.25)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span
                aria-hidden="true"
                className="inline-block transition duration-200 group-hover/new:rotate-90"
              >
                +
              </span>
              <span>new agent</span>
            </button>
          ) : null}
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
          onProvisionAgent={onProvisionAgent}
          canProvision={canProvision}
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

/**
 * GridSkeleton — taste-skill §5 (Skeletal loaders matching layout sizes).
 * The card shape/spacing mirrors `InstanceCard` exactly so the layout
 * doesn't jump when real data resolves. Shimmer sweep replaces generic
 * opacity pulse per taste-skill §8 (Skeleton Shimmer).
 */
function GridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading runtimes"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-xl border border-border bg-white/[0.02] p-5"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="skeleton-shimmer h-3 w-20 rounded" />
            <div className="skeleton-shimmer h-3 w-24 rounded opacity-60" />
          </div>
          <div className="space-y-2">
            <div className="skeleton-shimmer h-5 w-2/3 rounded" />
            <div className="skeleton-shimmer h-3 w-1/3 rounded opacity-60" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="skeleton-shimmer h-8 flex-1 rounded-md" />
            <div className="skeleton-shimmer h-8 w-8 rounded-md opacity-60" />
            <div className="skeleton-shimmer h-8 w-8 rounded-md opacity-60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  filter,
  onAttachRemote,
  onOpenLocal,
  onProvisionAgent,
  canProvision,
}: {
  filter: GridFilter;
  onAttachRemote: () => void;
  onOpenLocal: () => void;
  onProvisionAgent?: () => void;
  canProvision: boolean;
}) {
  const cloudCta: ReactCTA | undefined =
    canProvision && onProvisionAgent
      ? { label: "+ new cloud agent", onClick: onProvisionAgent, primary: true }
      : undefined;
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
      title: canProvision ? "No cloud runtimes yet." : "No cloud runtimes.",
      body: canProvision
        ? "Spin up your first cloud agent and it'll show up here."
        : "Sign into Eliza Cloud to discover hosted Milady instances attached to your account.",
      cta: cloudCta,
    },
    remote: {
      title: "No remote connections.",
      body: "Attach a VPS, LAN box, or any Milady/elizaOS runtime by URL.",
      cta: { label: "Attach remote", onClick: onAttachRemote },
    },
  };
  const state = copy[filter];
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-white/15 bg-[radial-gradient(ellipse_at_top,rgba(240,185,11,0.04),transparent_60%)] px-6 py-14 text-center">
      <div
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-xl border border-brand/40 bg-brand/[0.08] font-mono text-[11px] uppercase tracking-[0.22em] text-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        {filter === "all" ? "M" : filter.charAt(0).toUpperCase()}
      </div>
      <div className="max-w-md space-y-2">
        <h3 className="text-[18px] font-semibold tracking-tight text-white">
          {state.title}
        </h3>
        <p className="text-[14px] leading-6 text-white/70">{state.body}</p>
      </div>
      {state.cta ? (
        <button
          type="button"
          onClick={state.cta.onClick}
          className={`rounded-md px-4 py-2 text-[12px] font-semibold transition duration-200 active:scale-[0.98] ${
            state.cta.primary
              ? "bg-brand text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_16px_-8px_rgba(240,185,11,0.45)] hover:-translate-y-0.5 hover:bg-[var(--color-gold-300)]"
              : "border border-border text-white hover:-translate-y-0.5 hover:border-white/25"
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
