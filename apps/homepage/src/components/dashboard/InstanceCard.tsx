import { useEffect, useRef, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import { formatUptime } from "../../lib/format";
import { StatusDot } from "../ui/StatusDot";

export interface InstanceCardProps {
  agent: ManagedAgent;
  onOpen: () => void;
  onCopyUrl: () => void;
  onOpenRaw: () => void;
  onDisconnect?: () => void;
}

const SOURCE_LABEL: Record<ManagedAgent["source"], string> = {
  local: "local",
  cloud: "cloud",
  remote: "remote",
};

/**
 * Runtime card — typography + data, no image.
 *
 * Anatomy (Linear/terminal influence, Binance market-row rhythm):
 *   row 1: status dot + label · source · uptime   (all inline meta)
 *   row 2: name (weight-dominant), model/runtime line (muted)
 *   row 3: primary "Open" + copy + overflow (icon-first)
 *
 * Auto height. One gold accent (the primary Open button). Subtle gold edge
 * glow on hover per `polish` skill. No aspect-ratio wrapper, no image slot.
 */
export function InstanceCard({
  agent,
  onOpen,
  onCopyUrl,
  onOpenRaw,
  onDisconnect,
}: InstanceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const uptimeLabel = agent.uptime ? formatUptime(agent.uptime) : null;
  const runtimeLabel = agent.model ?? "milady runtime";

  return (
    <article className="group relative flex flex-col gap-4 rounded-xl border border-border bg-[#0b0b10] p-5 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_0_0_1px_rgba(240,185,11,0.12),0_18px_40px_-20px_rgba(240,185,11,0.25)]">
      {/* Row 1 — inline meta strip */}
      <header className="flex items-center justify-between gap-3">
        <StatusDot status={agent.status} />
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          <span>{SOURCE_LABEL[agent.source]}</span>
          {uptimeLabel ? (
            <>
              <span aria-hidden="true" className="text-white/20">
                ·
              </span>
              <span className="normal-case tracking-[0.12em]">
                up {uptimeLabel}
              </span>
            </>
          ) : null}
        </div>
      </header>

      {/* Row 2 — name + runtime */}
      <div>
        <h3 className="truncate text-[19px] font-semibold leading-tight tracking-tight text-white">
          {agent.name}
        </h3>
        <p className="mt-1 truncate font-mono text-[11px] lowercase tracking-[0.08em] text-white/40">
          {runtimeLabel}
        </p>
      </div>

      {/* Row 3 — action strip */}
      <div className="mt-1 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="group/btn flex flex-1 items-center justify-between rounded-md bg-brand/90 px-3 py-2 text-[12px] font-semibold text-black transition duration-200 hover:bg-brand active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/70"
        >
          <span className="inline-flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Open</span>
          </span>
          <span
            aria-hidden="true"
            className="transition group-hover/btn:translate-x-0.5"
          >
            ↗
          </span>
        </button>
        <button
          type="button"
          onClick={onCopyUrl}
          aria-label={`Copy ${agent.name} URL`}
          title="Copy URL"
          className="rounded-md border border-border bg-transparent p-2 text-white/60 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/30"
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
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="rounded-md border border-border bg-transparent p-2 text-white/60 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/30"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-md border border-border bg-[#0d0d13] shadow-2xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenRaw();
                }}
                className="block w-full px-3 py-2 text-left text-[12px] text-white/80 transition hover:bg-white/[0.04] hover:text-white"
              >
                Open raw URL
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onCopyUrl();
                }}
                className="block w-full px-3 py-2 text-left text-[12px] text-white/80 transition hover:bg-white/[0.04] hover:text-white"
              >
                Copy URL
              </button>
              {onDisconnect ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDisconnect();
                  }}
                  className="block w-full border-t border-border px-3 py-2 text-left text-[12px] text-rose-300 transition hover:bg-rose-500/10"
                >
                  Remove connection
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
