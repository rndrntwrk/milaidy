import { Button } from "@miladyai/ui";
import type { ProviderOption } from "../../../api";
import { appNameInterpolationVars, useBranding } from "../../../config";
import type {
  ConnectionEffect,
  ConnectionEvent,
} from "../../../onboarding/connection-flow";
import { CONNECTION_RECOMMENDED_PROVIDER_IDS } from "../../../onboarding/connection-flow";
import { getProviderLogo } from "../../../providers";
import { useApp } from "../../../state";
import {
  getOnboardingChoiceCardClassName,
  onboardingChoiceCardDescriptionClassName,
  onboardingChoiceCardDetectedBadgeClassName,
  onboardingChoiceCardRecommendedLabelClassName,
  onboardingChoiceCardTitleClassName,
  onboardingHelperTextClassName,
  onboardingTextSupportClassName,
} from "../onboarding-form-primitives";
import {
  OnboardingSecondaryActionButton,
  OnboardingStepHeader,
  onboardingBodyTextShadowStyle,
  onboardingFooterClass,
} from "../onboarding-step-chrome";

const recommendedIds = new Set<string>(CONNECTION_RECOMMENDED_PROVIDER_IDS);

export function ConnectionProviderGridScreen({
  dispatch,
  onTransitionEffect,
  sortedProviders,
  getProviderDisplay,
  getCustomLogo,
  getDetectedLabel,
}: {
  dispatch: (event: ConnectionEvent) => void;
  onTransitionEffect: (effect: ConnectionEffect) => void;
  sortedProviders: ProviderOption[];
  getProviderDisplay: (provider: ProviderOption) => {
    name: string;
    description?: string;
  };
  getCustomLogo: (id: string) =>
    | {
        logoDark?: string;
        logoLight?: string;
      }
    | undefined;
  getDetectedLabel: (providerId: string) => string | null;
}) {
  const branding = useBranding();
  const { t, onboardingRemoteConnected } = useApp();

  return (
    <>
      <OnboardingStepHeader
        eyebrow={t("onboarding.neuralLinkTitle")}
        title={t("onboarding.chooseProvider")}
      />
      {onboardingRemoteConnected && (
        <p
          className={`${onboardingHelperTextClassName} ${onboardingTextSupportClassName} mx-auto mb-3 max-w-[32ch] text-center leading-[1.35]`}
          style={onboardingBodyTextShadowStyle}
        >
          {t(
            "onboarding.remoteConnectedDesc",
            appNameInterpolationVars(branding),
          )}
        </p>
      )}
      <div className="mb-4 grid grid-cols-1 gap-1.5 min-[440px]:grid-cols-2">
        {sortedProviders.map((p: ProviderOption) => {
          const display = getProviderDisplay(p);
          const isRecommended = recommendedIds.has(p.id);
          const detectedLabel = getDetectedLabel(p.id);
          return (
            <Button
              type="button"
              key={p.id}
              className={`${getOnboardingChoiceCardClassName({
                detected: Boolean(detectedLabel),
                recommended: isRecommended,
              })} h-auto min-w-0 justify-start overflow-hidden whitespace-normal px-[10px] py-[8px] ${isRecommended ? "min-[440px]:col-span-2" : ""}`}
              onClick={() =>
                dispatch({ type: "selectProvider", providerId: p.id })
              }
            >
              <div className="flex min-h-[52px] w-full items-start gap-2.5">
                <img
                  src={getProviderLogo(p.id, true, getCustomLogo(p.id))}
                  alt=""
                  className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-md object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className={`${onboardingChoiceCardTitleClassName} line-clamp-2`}>
                    {display.name}
                  </div>
                  {display.description && (
                    <div
                      className={`${onboardingChoiceCardDescriptionClassName} line-clamp-2`}
                    >
                      {display.description}
                    </div>
                  )}
                </div>
                {detectedLabel && (
                  <span
                    className={`${onboardingChoiceCardDetectedBadgeClassName} self-start`}
                  >
                    {detectedLabel}
                  </span>
                )}
                {isRecommended && !detectedLabel && (
                  <span
                    className={`${onboardingChoiceCardRecommendedLabelClassName} self-start`}
                  >
                    {t("onboarding.recommended") ?? "Recommended"}
                  </span>
                )}
              </div>
            </Button>
          );
        })}
      </div>
      <div className={`${onboardingFooterClass} pb-1`}>
        <OnboardingSecondaryActionButton
          onClick={() => {
            if (onboardingRemoteConnected) {
              onTransitionEffect("useLocalBackend");
              return;
            }
            dispatch({ type: "backRemoteOrGrid" });
          }}
          type="button"
        >
          {t("onboarding.back")}
        </OnboardingSecondaryActionButton>
        <span />
      </div>
    </>
  );
}
