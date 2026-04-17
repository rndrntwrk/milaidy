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
    ? "Open Milady"
    : isLocalProbing
      ? "Looking for local Milady\u2026"
      : "Install Milady";
  const primaryHandler = isLocalReady ? onOpenLocal : onStartLocal;
  const primaryHint = isLocalReady
    ? "local \u00b7 running"
    : isLocalProbing
      ? "probing localhost"
      : "no local runtime detected";

  return (
    <section className="relative isolate">
      {/* Ambient gold blob — atmosphere, pointer-events-none, never a content
          slot. Bottom-right so the headline sits left-aligned with weight.
          Softer opacity + larger radius so it reads as a field rather than
          a detached orb (taste-skill §7 subdued atmospherics). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-20 h-[440px] w-[440px] opacity-[0.4] blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, rgba(240,185,11,0.14) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-[56ch]">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand/75">
          milady frontend
          <span className="mx-2 text-white/25">·</span>
          <span className="text-white/45">{releaseData.release.tagName}</span>
        </div>

        <h1 className="mt-6 text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] text-white sm:text-[60px] lg:text-[76px]">
          Milady is the frontend
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "var(--gold-gradient-primary)",
              WebkitBackgroundClip: "text",
            }}
          >
            for your agents.
          </span>
        </h1>

        <p className="mt-6 max-w-[54ch] text-[15px] leading-7 text-white/65 sm:text-[17px] sm:leading-8">
          Open local runtimes, attach remotes, manage cloud instances. One
          surface for every agent you run, without the provisioning theater.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
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
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55"
          >
            {primaryHint}
          </span>
        </div>
      </div>
    </section>
  );
}
