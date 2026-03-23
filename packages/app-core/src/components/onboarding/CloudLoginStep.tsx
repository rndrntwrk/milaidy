import { useApp } from "@miladyai/app-core/state";
import { Spinner } from "@miladyai/ui";
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
        className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.cloudLoginTitle")}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.15)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,255,255,0.15)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <p
        className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3"
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
          className="flex items-center gap-2 text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3"
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
              void handleCloudLogin();
            }}
            type="button"
          >
            {elizaCloudLoginError
              ? t("onboarding.cloudLoginRetry")
              : t("onboarding.cloudLoginBtn")}
          </button>
        </>
      )}

      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
        <button
          className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
          style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
          onClick={() => handleOnboardingBack()}
          type="button"
        >
          {t("onboarding.back")}
        </button>
      </div>
    </>
  );
}
