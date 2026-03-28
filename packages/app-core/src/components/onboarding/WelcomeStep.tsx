import {
  appNameInterpolationVars,
  useBranding,
} from "@miladyai/app-core/config";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import {
  OnboardingSecondaryActionButton,
  OnboardingStepHeader,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "./onboarding-step-chrome";
import {
  DEFAULT_VISUAL_AVATAR_INDEX,
  DEFAULT_VISUAL_STYLE_PRESET_ID,
  DEFAULT_VISUAL_STYLE_PRESET_NAME,
} from "@miladyai/shared/onboarding-presets";

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
    // Default to Alice on fresh setup; user can still change character on the
    // next identity step before onboarding completes.
    setState("onboardingStyle", DEFAULT_VISUAL_STYLE_PRESET_ID);
    setState("onboardingName", DEFAULT_VISUAL_STYLE_PRESET_NAME);
    setState("selectedVrmIndex", DEFAULT_VISUAL_AVATAR_INDEX);
    // WHY goToOnboardingStep: syncs Flamina guide in advanced mode; persisted
    // step still goes through the same setter as the rest of onboarding.
    goToOnboardingStep("identity");
  };

  const handleUseExistingSetup = () => {
    setState("onboardingStep", "identity");
  };

  return (
    <>
      <OnboardingStepHeader
        eyebrow={t(
          "onboarding.welcomeTitle",
          appNameInterpolationVars(branding),
        )}
        description={
          onboardingExistingInstallDetected
            ? t("onboarding.existingSetupDesc")
            : t("onboarding.welcomeDesc")
        }
        descriptionClassName="mt-1"
      />
      <div className={onboardingFooterClass}>
        {onboardingExistingInstallDetected ? (
          <OnboardingSecondaryActionButton
            onClick={handleGetStarted}
            type="button"
          >
            {t("onboarding.customSetup")}
          </OnboardingSecondaryActionButton>
        ) : (
          <OnboardingSecondaryActionButton
            onClick={() => handleOnboardingUseLocalBackend()}
            type="button"
          >
            {t("onboarding.checkExistingSetup")}
          </OnboardingSecondaryActionButton>
        )}
        <Button
          className={onboardingPrimaryActionClass}
          style={onboardingPrimaryActionTextShadowStyle}
          onClick={(e) => {
            spawnOnboardingRipple(e.currentTarget, {
              x: e.clientX,
              y: e.clientY,
            });

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
