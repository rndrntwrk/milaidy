import type { ManagedAgent } from "../../lib/AgentProvider";

export interface MiladyAppTileProps {
  /** First local agent, if present. Drives the tile state + launch URL. */
  localAgent: ManagedAgent | null;
  /** Fallback URL when no local agent is discovered yet. */
  fallbackUrl: string;
  /** Called when user activates the tile and there's a live agent. */
  onOpen: (url: string) => void;
}

/**
 * The pinned "Milady APP" tile at the top of the sidebar. Gold-gradient,
 * the single loudest element on the page. Dims to a ghost state when no
 * local agent is reachable.
 *
 * Typographic mark only — agents don't have profile images, so the mark is
 * a stylized "M" that breathes when a live local runtime is connected.
 */
export function MiladyAppTile({
  localAgent,
  fallbackUrl,
  onOpen,
}: MiladyAppTileProps) {
  const hasLocal = Boolean(localAgent);
  const launchUrl =
    localAgent?.webUiUrl ?? localAgent?.sourceUrl ?? fallbackUrl;
  const statusLabel = hasLocal ? "local · running" : "start local milady";

  return (
    <button
      type="button"
      onClick={() => onOpen(launchUrl)}
      disabled={!hasLocal}
      aria-label={hasLocal ? "Open Milady APP" : "Start local Milady"}
      // Gold tile is the loudest element on the page but still restrained:
      // an inner white-edge highlight simulates refraction, and the outer
      // shadow is low-opacity + short-radius (taste-skill §7 NO-NEON-GLOWS).
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition active:scale-[0.99] ${
        hasLocal
          ? "border-brand/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_30px_-14px_rgba(240,185,11,0.45)]"
          : "border-white/10 opacity-55 hover:opacity-80"
      }`}
      style={
        hasLocal
          ? {
              background: "var(--gold-gradient-primary)",
            }
          : undefined
      }
    >
      {/* Typographic mark */}
      <div
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
          hasLocal
            ? "border-black/25 bg-black/15"
            : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`font-mono text-[20px] font-bold leading-none tracking-tight ${
            hasLocal ? "text-black sol-breathe" : "text-white/70"
          }`}
        >
          M
        </span>
        {hasLocal ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-black bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.35)]"
          />
        ) : null}
      </div>

      {/* Label */}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[13px] font-bold tracking-tight ${
            hasLocal ? "text-black" : "text-white"
          }`}
        >
          Milady APP
        </div>
        <div
          className={`mt-0.5 truncate text-[11px] ${
            hasLocal ? "text-black/65" : "text-white/50"
          }`}
        >
          {statusLabel}
        </div>
      </div>

      {/* Chevron */}
      <span
        aria-hidden="true"
        className={`shrink-0 text-sm transition ${
          hasLocal
            ? "text-black/60 group-hover:translate-x-0.5 group-hover:text-black"
            : "text-white/30"
        }`}
      >
        →
      </span>
    </button>
  );
}
