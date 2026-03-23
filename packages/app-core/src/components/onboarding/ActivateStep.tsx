import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import { useBranding } from "../../config/branding";

export function ActivateStep() {
  const branding = useBranding();
  const {
    onboardingName,
    handleOnboardingNext,
    handleOnboardingBack,
    t,
    onboardingRestarting,
  } = useApp();

  return (
    <>
      <div
        className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.readyTitle")}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <div
        className="text-xl font-light leading-[1.4] text-[var(--onboarding-text-strong)] text-center mb-[18px]"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.companionReady", {
          name: onboardingName || branding.appName,
        })}
      </div>
      <p
        className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
      >
        {t("onboarding.allConfigured")}
      </p>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-[var(--onboarding-footer-border)]">
        <Button
          variant="ghost"
          className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
          style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
          onClick={() => handleOnboardingBack()}
          type="button"
        >
          {t("onboarding.back")}
        </Button>
        <Button
          className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
          onClick={(e) => {
            if (e?.currentTarget) {
              const rect = e.currentTarget.getBoundingClientRect();
              const circle = document.createElement("span");
              const diameter = Math.max(rect.width, rect.height);
              circle.style.width = circle.style.height = `${diameter}px`;
              circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
              circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
              circle.className =
                "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
              e.currentTarget.appendChild(circle);
              setTimeout(() => circle.remove(), 600);
            }
            handleOnboardingNext();
          }}
          type="button"
          disabled={onboardingRestarting}
        >
          {onboardingRestarting ? (
            <div className="m-auto h-[18px] w-[18px] animate-spin rounded-full border-2 border-solid border-[color:var(--onboarding-text-faint)] border-t-[color:var(--onboarding-text-strong)]" />
          ) : (
            t("onboarding.enter")
          )}
        </Button>
      </div>
    </>
  );
}
