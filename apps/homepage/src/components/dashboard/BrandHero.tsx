import { releaseData } from "../../generated/release-data";

export interface BrandHeroProps {
  /** Whether a local Milady runtime responded to the last health probe. */
  isLocalReady: boolean;
  /** True during the first few probes, before we give up on local. */
  isLocalProbing: boolean;
  /** Click handler when local is live. Launches the runtime. */
  onOpenLocal: () => void;
  /** Click handler when local is NOT live. Opens install / help surface. */
  onStartLocal: () => void;
  onAttachRemote: () => void;
}

/**
 * Zone 1 — narrative hero. Typography-dominant, full-width. No image slot
 * (agents don't have profile assets in the data model). A single soft gold
 * gradient accent sits behind the headline as atmosphere, never as content.
 *
 * Two CTAs only: the primary gold "Open Milady" and a ghost "Attach remote".
 * Cloud sign-in lives in the sidebar SessionTile — no need to nag here.
 */
export function BrandHero({
  isLocalReady,
  isLocalProbing,
  onOpenLocal,
  onStartLocal,
  onAttachRemote,
}: BrandHeroProps) {
  const primaryLabel = isLocalReady
    ? "Open local"
    : isLocalProbing
      ? "looking for local\u2026"
      : "Install milady";
  const primaryHandler = isLocalReady ? onOpenLocal : onStartLocal;
  const primaryHint = isLocalReady
    ? "local \u00b7 running"
    : isLocalProbing
      ? "probing localhost"
      : "no local runtime";

  return (
    <section className="relative isolate">
      {/* Ambient gold wash — further off-screen, lower opacity, wider
          falloff. Reads as weather, not as a glow. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-28 h-[520px] w-[520px] opacity-[0.22] blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, rgba(240,185,11,0.12) 0%, transparent 72%)",
        }}
      />

      <div className="relative max-w-[56ch]">
        <div className="font-mono text-[11px] lowercase tracking-[0.14em] text-white/45">
          milady
          <span className="mx-1.5 text-white/25">·</span>
          <span>{releaseData.release.tagName}</span>
        </div>

        <h1 className="mt-5 text-[34px] font-semibold leading-[1.08] tracking-[-0.025em] text-white/95 sm:text-[44px] lg:text-[52px]">
          your agents, in one place.
        </h1>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {isLocalReady ? (
            <button
              type="button"
              onClick={primaryHandler}
              aria-label="Open local Milady runtime"
              // Press feedback per taste-skill rule 5 (tactile: -1px on
              // active). Softer tinted shadow replaces the neon outer glow.
              className="group inline-flex items-center gap-2 rounded-md px-5 py-3 text-[13px] font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_24px_-10px_rgba(240,185,11,0.55)] transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              style={{ background: "var(--gold-gradient-primary)" }}
            >
              <span>{primaryLabel}</span>
              <span
                aria-hidden="true"
                className="transition group-hover:translate-x-0.5"
              >
                →
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={primaryHandler}
              disabled={isLocalProbing}
              aria-label={
                isLocalProbing
                  ? "Probing for local Milady"
                  : "No local runtime detected. Open install instructions."
              }
              className="group inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/[0.04] px-5 py-3 text-[13px] font-medium text-white transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white/[0.06] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLocalProbing ? (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 animate-pulse rounded-full bg-brand/80"
                />
              ) : null}
              <span>{primaryLabel}</span>
              <span
                aria-hidden="true"
                className="text-white/45 transition group-hover:translate-x-0.5 group-hover:text-white"
              >
                →
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onAttachRemote}
            className="rounded-md border border-border bg-white/[0.04] px-5 py-3 text-[13px] font-medium text-white transition duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.06] active:translate-y-0 active:scale-[0.98]"
          >
            Attach remote
          </button>
          <span
            aria-live="polite"
            className="font-mono text-[11px] lowercase tracking-[0.06em] text-white/50"
          >
            {primaryHint}
          </span>
        </div>
      </div>
    </section>
  );
}
