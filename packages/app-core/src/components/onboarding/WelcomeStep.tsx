import { useBranding } from "@miladyai/app-core/config";
import { useApp } from "@miladyai/app-core/state";

export function WelcomeStep() {
  const branding = useBranding();
  const { setState, t } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.welcomeTitle", { name: branding.appName })}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <p className="onboarding-desc">{t("onboarding.welcomeDesc")}</p>
      <div className="onboarding-panel-footer">
        <span />
        <button
          className="onboarding-confirm-btn"
          onClick={() => void setState("onboardingStep", "identity")}
          type="button"
        >
          {t("onboarding.getStarted")}
        </button>
      </div>
    </>
  );
}
