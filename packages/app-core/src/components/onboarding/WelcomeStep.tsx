import {
  appNameInterpolationVars,
  useBranding,
} from "@miladyai/app-core/config";
import { useApp } from "@miladyai/app-core/state";

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
    setState("onboardingStyle", "Let's get to work!");
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
        className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.welcomeTitle", appNameInterpolationVars(branding))}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.15)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,255,255,0.15)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <p
        className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
      >
        {onboardingExistingInstallDetected
          ? t("onboarding.existingSetupDesc")
          : t("onboarding.welcomeDesc")}
      </p>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
        {onboardingExistingInstallDetected ? (
          <button
            className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
            style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
            onClick={handleGetStarted}
            type="button"
          >
            {t("onboarding.customSetup")}
          </button>
        ) : (
          <button
            className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
            style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
            onClick={() => handleOnboardingUseLocalBackend()}
            type="button"
          >
            {t("onboarding.checkExistingSetup")}
          </button>
        )}
        <button
          className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[rgba(240,185,11,0.18)] border border-[rgba(240,185,11,0.35)] rounded-[6px] text-[rgba(240,238,250,0.94)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[rgba(240,185,11,0.28)] hover:border-[rgba(240,185,11,0.6)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const circle = document.createElement("span");
            const diameter = Math.max(rect.width, rect.height);
            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
            circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
            circle.className =
              "absolute rounded-full bg-[rgba(240,185,11,0.3)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
            e.currentTarget.appendChild(circle);
            setTimeout(() => circle.remove(), 600);

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
        </button>
      </div>
    </>
  );
}
