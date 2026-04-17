import type { ManagedAgent } from "../../lib/AgentProvider";

const SHORT: Record<ManagedAgent["source"], string> = {
  local: "L",
  cloud: "C",
  remote: "R",
};

const FULL: Record<ManagedAgent["source"], string> = {
  local: "local",
  cloud: "cloud",
  remote: "remote",
};

export function SourceBadge({
  source,
  variant = "short",
}: {
  source: ManagedAgent["source"];
  variant?: "short" | "full";
}) {
  const label = variant === "short" ? SHORT[source] : FULL[source];
  return (
    <span
      className="inline-flex items-center rounded-md border border-white/15 bg-black/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm"
      title={FULL[source]}
    >
      {label}
    </span>
  );
}
