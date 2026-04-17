import { releaseData } from "../../generated/release-data";
import { resolveHomepageAssetUrl } from "../../lib/asset-url";

export interface BrandHeroProps {
  onOpenLocal: () => void;
  onAttachRemote: () => void;
  onSignIntoCloud: () => void;
  cloudAuthed: boolean;
  cloudSigningIn?: boolean;
  /** Visible heroart VRM index 1-8. */
  heroAvatarIndex?: number;
}

/**
 * Zone 1 of the dashboard: the narrative hero. One eyebrow, one display
 * headline, one supporting paragraph, three CTAs in priority order, and
 * the VRM hero asset on the right at lg+.
 */
export function BrandHero({
  onOpenLocal,
  onAttachRemote,
  onSignIntoCloud,
  cloudAuthed,
  cloudSigningIn,
  heroAvatarIndex = 3,
}: BrandHeroProps) {
  const avatarUrl = resolveHomepageAssetUrl(
    `vrms/previews/milady-${heroAvatarIndex}.png`,
  );

  return (
    <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand/75">
          milady frontend
          <span className="ml-2 text-white/30">·</span>
          <span className="ml-2 text-white/45">
            {releaseData.release.tagName}
          </span>
        </div>

        <h1 className="mt-5 max-w-[16ch] text-[44px] font-extrabold leading-[1.04] tracking-[-0.035em] text-white sm:text-[56px] lg:text-[68px]">
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

        <p className="mt-5 max-w-[52ch] text-[15px] leading-7 text-white/65 sm:text-[16px]">
          Open local runtimes, attach remotes, sign into Eliza Cloud. One
          surface for every agent you run, without the provisioning theater.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
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
          <button
            type="button"
            onClick={onSignIntoCloud}
            className="rounded-md px-5 py-3 text-[13px] font-medium text-white/70 transition hover:text-white"
          >
            {cloudAuthed
              ? "Open cloud"
              : cloudSigningIn
                ? "Waiting for sign-in…"
                : "Sign into cloud"}
          </button>
        </div>
      </div>

      {/* VRM hero — right side on lg+, below on mobile */}
      <div className="relative mx-auto w-full max-w-[280px] lg:max-w-none">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 scale-90 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(240,185,11,0.28) 0%, transparent 60%)",
          }}
        />
        <img
          src={avatarUrl}
          alt="Milady"
          className="relative mx-auto aspect-[3/4] w-full max-w-[280px] rounded-[20px] border border-white/10 object-cover object-top shadow-[0_30px_80px_rgba(0,0,0,0.5)] lg:max-w-[320px]"
        />
      </div>
    </section>
  );
}
