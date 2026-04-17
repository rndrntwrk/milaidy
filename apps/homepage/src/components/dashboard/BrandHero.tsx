import { releaseData } from "../../generated/release-data";

export interface BrandHeroProps {
  onOpenLocal: () => void;
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
export function BrandHero({ onOpenLocal, onAttachRemote }: BrandHeroProps) {
  return (
    <section className="relative isolate">
      {/* Ambient gold blob — atmosphere, pointer-events-none, never a content
          slot. Bottom-right so the headline sits left-aligned with weight. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-10 h-[360px] w-[360px] opacity-[0.55] blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, rgba(240,185,11,0.14) 0%, transparent 60%)",
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
          <button
            type="button"
            onClick={onOpenLocal}
            className="group inline-flex items-center gap-2 rounded-md px-5 py-3 text-[13px] font-semibold text-black shadow-[0_0_40px_rgba(240,185,11,0.28)] transition hover:-translate-y-0.5"
            style={{ background: "var(--gold-gradient-primary)" }}
          >
            <span>Open Milady</span>
            <span
              aria-hidden="true"
              className="transition group-hover:translate-x-0.5"
            >
              →
            </span>
          </button>
          <button
            type="button"
            onClick={onAttachRemote}
            className="rounded-md border border-border bg-white/[0.04] px-5 py-3 text-[13px] font-medium text-white transition hover:border-white/25 hover:bg-white/[0.06]"
          >
            Attach remote
          </button>
        </div>
      </div>
    </section>
  );
}
