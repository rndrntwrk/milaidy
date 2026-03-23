import { useApp } from "@miladyai/app-core/state";
import { Button, Spinner } from "@miladyai/ui";
import { useEffect, useRef } from "react";

export function CloudLoginStep() {
  const {
    onboardingStep,
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    handleCloudLogin,
    handleOnboardingNext,
    handleOnboardingBack,
    t,
  } = useApp();

  // Auto-advance when cloud login succeeds — guarded to only fire once
  // and only while we're still on the cloudLogin step.
  const advancedRef = useRef(false);
  useEffect(() => {
    if (
      elizaCloudConnected &&
      onboardingStep === "providers" &&
      !advancedRef.current
    ) {
      advancedRef.current = true;
      void handleOnboardingNext();
    }
  }, [elizaCloudConnected, onboardingStep, handleOnboardingNext]);

  return (
    <>
      <div
        className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.cloudLoginTitle")}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <p
        className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
      >
        {t("onboarding.cloudLoginDesc")}
      </p>

      {elizaCloudConnected ? (
        <p
          className="text-sm text-[var(--ok)] text-center leading-relaxed mt-3"
          style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
        >
          {t("onboarding.cloudLoginConnected")}
        </p>
      ) : elizaCloudLoginBusy ? (
        <div
          className="flex items-center gap-2 text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
          style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
        >
          <Spinner size={16} className="text-current" />
          {t("onboarding.cloudLoginBusy")}
        </div>
      ) : (
        <>
          {elizaCloudLoginError && (
            <p
              className="text-sm text-[var(--danger)] text-center leading-relaxed mt-3 !mb-2"
              style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
            >
              {elizaCloudLoginError}
            </p>
          )}
          <Button
            className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
            onClick={(e) => {
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
              void handleCloudLogin();
            }}
            type="button"
          >
            {elizaCloudLoginError
              ? t("onboarding.cloudLoginRetry")
              : t("onboarding.cloudLoginBtn")}
          </Button>
        </>
      )}

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
      </div>
    </>
  );
}
