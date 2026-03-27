import { useApp } from "@miladyai/app-core/state";
import { Button, Spinner } from "@miladyai/ui";
import { useEffect, useRef } from "react";
import { useBranding } from "../../config";
import { openExternalUrl } from "../../utils";
import {
  onboardingCardSurfaceClassName,
  onboardingHelperTextClassName,
  OnboardingStatusBanner,
  onboardingReadableTextMutedClassName,
  onboardingSubtleTextClassName,
  onboardingTextSupportClassName,
} from "./onboarding-form-primitives";
import {
  OnboardingLinkActionButton,
  OnboardingSecondaryActionButton,
  OnboardingStepHeader,
  onboardingBodyTextShadowStyle,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "./onboarding-step-chrome";

const statusCardClass =
  "mx-auto mt-4 flex w-full max-w-[25rem] items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-[0_18px_50px_rgba(3,5,10,0.2)] backdrop-blur-sm";

const busyCardClass = `${statusCardClass} ${onboardingCardSurfaceClassName} ${onboardingReadableTextMutedClassName}`;

const errorCardClass = `${statusCardClass} border-[color:color-mix(in_srgb,var(--danger)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]`;

function ConnectedIcon({ title }: { title: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{title}</title>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function CloudLoginStep() {
  const branding = useBranding();
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
      <OnboardingStepHeader
        eyebrow={t("onboarding.cloudLoginTitle")}
        description={t("onboarding.cloudLoginDesc")}
        descriptionClassName="mx-auto mt-1 max-w-[34ch] text-balance"
      />
      <p
        className={`${onboardingHelperTextClassName} ${onboardingTextSupportClassName} mx-auto max-w-[40ch] text-center`}
        style={onboardingBodyTextShadowStyle}
      >
        {t("onboarding.cloudProviderBehaviorHint")}
      </p>

      {elizaCloudConnected ? (
        <OnboardingStatusBanner tone="success" className="mt-4">
          <ConnectedIcon title={t("onboarding.connected")} />
          {t("onboarding.cloudLoginConnected")}
        </OnboardingStatusBanner>
      ) : elizaCloudLoginBusy ? (
        <div
          className={busyCardClass}
          role="status"
          aria-live="polite"
          style={onboardingBodyTextShadowStyle}
        >
          <Spinner size={16} className="text-current" />
          {t("onboarding.cloudLoginBusy")}
        </div>
      ) : (
        <>
          {elizaCloudLoginError ? (
            <>
              <div
                className={errorCardClass}
                role="alert"
                style={onboardingBodyTextShadowStyle}
              >
                {elizaCloudLoginError}
              </div>
              <OnboardingLinkActionButton
                type="button"
                className="mx-auto mt-2"
                onClick={() => openExternalUrl(branding.bugReportUrl)}
              >
                {t("onboarding.reportIssue")}
              </OnboardingLinkActionButton>
            </>
          ) : null}
          <Button
            className={`${onboardingPrimaryActionClass} mx-auto mt-4 flex w-full max-w-[25rem]`}
            style={onboardingPrimaryActionTextShadowStyle}
            onClick={(event) => {
              spawnOnboardingRipple(event.currentTarget, {
                x: event.clientX,
                y: event.clientY,
              });
              void handleCloudLogin();
            }}
            type="button"
          >
            {elizaCloudLoginError
              ? t("onboarding.cloudLoginRetry")
              : t("onboarding.cloudLoginBtn")}
          </Button>
          <p
            className={`${onboardingSubtleTextClassName} mx-auto mt-3 max-w-[40ch] text-center`}
            style={onboardingBodyTextShadowStyle}
          >
            {t("onboarding.restartAfterProviderChangeHint")}
          </p>
        </>
      )}

      <div className={onboardingFooterClass}>
        <OnboardingSecondaryActionButton
          onClick={() => handleOnboardingBack()}
          type="button"
        >
          {t("onboarding.back")}
        </OnboardingSecondaryActionButton>
      </div>
    </>
  );
}
