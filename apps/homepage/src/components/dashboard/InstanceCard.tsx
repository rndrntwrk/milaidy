import { useEffect, useRef, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import { resolveHomepageAssetUrl } from "../../lib/asset-url";
import { formatUptime } from "../../lib/format";
import { SourceBadge } from "../ui/SourceBadge";
import { StatusDot } from "../ui/StatusDot";

export interface InstanceCardProps {
  agent: ManagedAgent;
  onOpen: () => void;
  onCopyUrl: () => void;
  onOpenRaw: () => void;
  onDisconnect?: () => void;
}

/**
 * Redesigned instance card: VRM avatar lives as the hero asset at the top
 * (cropped 4:5), meta stacked underneath, a single primary CTA, overflow
 * menu for secondary actions.
 */
export function InstanceCard({
  agent,
  onOpen,
  onCopyUrl,
  onOpenRaw,
  onDisconnect,
}: InstanceCardProps) {
  const avatarIndex = agent.avatarIndex ?? 1;
  const avatarUrl = resolveHomepageAssetUrl(
    `vrms/previews/milady-${avatarIndex}.png`,
  );
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

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-[#0b0b10] transition hover:border-white/20 hover:-translate-y-1">
      {/* Avatar hero */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
        <img
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
        />
        {/* Gradient fade at bottom so source badge stays legible */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b0b10] to-transparent"
        />
        <div className="absolute right-3 top-3">
          <SourceBadge source={agent.source} variant="full" />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <StatusDot status={agent.status} />
        <div>
          <h3 className="truncate text-[18px] font-semibold tracking-tight text-white">
            {agent.name}
          </h3>
          <p className="mt-1 truncate text-[12px] text-white/45">
            {agent.model ?? "milady runtime"}
            {agent.uptime ? ` · up ${formatUptime(agent.uptime)}` : ""}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-1.5 pt-2">
          <button
            type="button"
            onClick={onOpen}
            className="group/btn flex flex-1 items-center justify-between rounded-md bg-brand/90 px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-brand"
          >
            <span>Open Milady</span>
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
            className="rounded-md border border-border bg-transparent p-2 text-white/60 transition hover:border-white/25 hover:text-white"
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
              className="rounded-md border border-border bg-transparent p-2 text-white/60 transition hover:border-white/25 hover:text-white"
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
      </div>
    </article>
  );
}
