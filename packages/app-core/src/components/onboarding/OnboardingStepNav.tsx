/**
 * Left-rail step list for the onboarding wizard.
 * WHY getOnboardingNavMetas from flow.ts: sidebar order and labels must match
 * the same track as handleOnboardingNext/Back. WHY buttons only for completed
 * steps: backward-only jumps—forward jumps would bypass finish/login validation
 * (enforced in AppContext via canRevertOnboardingTo).
 */
import { useApp } from "@miladyai/app-core/state";
import { useBranding } from "../../config/branding";
import { getOnboardingNavMetas } from "../../onboarding/flow";

export function OnboardingStepNav() {
  const { onboardingStep, handleOnboardingJumpToStep, t } = useApp();
  const branding = useBranding();

  const isCloudOnly = !!branding.cloudOnly;
  const activeSteps = getOnboardingNavMetas(onboardingStep, isCloudOnly);

  const currentIndex = activeSteps.findIndex((s) => s.id === onboardingStep);

  return (
    <div className="flex flex-col justify-center py-[60px] pl-[90px] pr-0 relative z-10 max-md:flex-row max-md:justify-center max-md:p-4">
      <div
        style={
          {
            "--tw-after-height":
              currentIndex === 0
                ? "0px"
                : `calc((100% - 28px) * ${Math.min(currentIndex, 5)} / 5)`,
          } as React.CSSProperties
        }
        {...{
          className: `flex flex-col relative before:hidden after:absolute after:left-[6px] after:top-[14px] after:w-[1px] after:bg-gradient-to-b after:from-[rgba(240,185,11,0.4)] after:to-[rgba(240,185,11,0.12)] after:transition-all after:duration-[800ms] after:ease-[cubic-bezier(0.25,0.46,0.45,0.94)] after:z-0 after:h-[var(--tw-after-height)]`,
        }}
      >
        {activeSteps.map((step, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          const isClickable = isDone;

          const rowClass = `flex items-center gap-[20px] py-[19px] relative group ${isClickable ? "cursor-pointer w-full border-none bg-transparent m-0 text-left text-inherit focus-visible:outline-2 focus-visible:outline-[rgba(240,185,11,0.55)] focus-visible:outline-offset-3" : ""}`;

          // Dot classes
          let dotClass =
            "w-[14px] h-[14px] border border-[rgba(255,255,255,0.12)] rotate-45 shrink-0 relative z-10 bg-[#0c0e14] transition-all duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]";
          if (isDone) {
            dotClass +=
              " !bg-[rgba(240,185,11,0.35)] !border-[rgba(240,185,11,0.5)]";
          } else if (isActive) {
            dotClass +=
              " !bg-[#f0b90b] !border-[var(--text)] shadow-[0_0_12px_rgba(240,185,11,0.5)] animate-[onboarding-dot-pulse_2s_ease-in-out_infinite]";
          }

          // Name classes
          let nameClass =
            "text-[15px] tracking-[0.08em] font-medium drop-shadow-[0_2px_10px_rgba(3,5,10,0.65)] transition-all duration-500";
          if (isDone) {
            nameClass +=
              " text-[rgba(240,238,250,0.72)] group-hover:text-[rgba(240,238,250,0.85)]";
          } else if (isActive) {
            nameClass += " text-[rgba(240,238,250,0.92)] font-semibold";
          } else {
            nameClass += " text-[rgba(240,238,250,0.58)]";
          }

          // Subtitle classes
          let subClass =
            "text-[13px] tracking-[0.05em] drop-shadow-[0_2px_10px_rgba(3,5,10,0.55)] transition-all duration-500";
          if (isActive) {
            subClass += " text-[rgba(240,185,11,0.8)]";
          } else {
            subClass += " text-[rgba(240,238,250,0.38)]";
          }

          if (isClickable) {
            return (
              <button
                key={step.id}
                type="button"
                className={rowClass}
                onClick={() => handleOnboardingJumpToStep(step.id)}
              >
                <div className={dotClass} />
                <div className="flex flex-col gap-0.5">
                  <span className={nameClass}>{t(step.name)}</span>
                  <span className={subClass}>{t(step.subtitle)}</span>
                </div>
              </button>
            );
          }

          return (
            <div
              key={step.id}
              className={rowClass}
              {...(isActive ? { "aria-current": "step" as const } : {})}
            >
              <div className={dotClass} />
              <div className="flex flex-col gap-0.5">
                <span className={nameClass}>{t(step.name)}</span>
                <span className={subClass}>{t(step.subtitle)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
