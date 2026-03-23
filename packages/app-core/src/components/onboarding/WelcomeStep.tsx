import {
  appNameInterpolationVars,
  useBranding,
} from "@miladyai/app-core/config";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";

/** First screen; enters the custom setup track at `connection`. */
export function WelcomeStep() {
  const branding = useBranding();
  const {
    onboardingExistingInstallDetected,
    handleOnboardingUseLocalBackend,
    setState,
    goToOnboardingStep,
    t,
  } = useApp();

  const handleGetStarted = () => {
    // Default to Chen (blue-haired anime character) — character selection
    // happens after onboarding completes.
    setState("onboardingStyle", "chen");
    setState("onboardingName", "Chen");
    setState("selectedVrmIndex", 1);
    // WHY goToOnboardingStep: syncs Flamina guide in advanced mode; persisted
    // step still goes through the same setter as the rest of onboarding.
    goToOnboardingStep("hosting");
  };

  const handleUseExistingSetup = () => {
    setState("onboardingStep", "hosting");
  };

  return (
    <>
      <div
        className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.welcomeTitle", appNameInterpolationVars(branding))}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <p
        className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
      >
        {onboardingExistingInstallDetected
          ? t("onboarding.existingSetupDesc")
          : t("onboarding.welcomeDesc")}
      </p>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-[var(--onboarding-footer-border)]">
        {onboardingExistingInstallDetected ? (
          <Button
            variant="ghost"
            className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
            style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
            onClick={handleGetStarted}
            type="button"
          >
            {t("onboarding.customSetup")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
            style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
            onClick={() => handleOnboardingUseLocalBackend()}
            type="button"
          >
            {t("onboarding.checkExistingSetup")}
          </Button>
        )}
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

            if (onboardingExistingInstallDetected) {
              handleUseExistingSetup();
            } else {
              handleGetStarted();
            }
          }}
          type="button"
        >
          {onboardingExistingInstallDetected
            ? t("onboarding.useExistingSetup")
            : t("onboarding.getStarted")}
        </Button>
      </div>
    </>
  );
}
