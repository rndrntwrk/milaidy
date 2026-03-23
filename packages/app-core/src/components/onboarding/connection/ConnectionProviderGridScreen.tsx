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
      <div
        className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.neuralLinkTitle")}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      {onboardingRemoteConnected && (
        <p className="mx-auto mt-1.5 mb-3 max-w-[32ch] text-center text-[12px] leading-[1.35] text-[var(--onboarding-text-muted)]">
          {t(
            "onboarding.remoteConnectedDesc",
            appNameInterpolationVars(branding),
          )}
        </p>
      )}
      <div
        className="text-xl font-light leading-[1.4] text-[var(--onboarding-text-strong)] text-center mb-[18px]"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.chooseProvider")}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
        {sortedProviders.map((p: ProviderOption) => {
          const display = getProviderDisplay(p);
          const isRecommended = recommendedIds.has(p.id);
          const detectedLabel = getDetectedLabel(p.id);
          return (
            <Button
              type="button"
              key={p.id}
              className={`min-w-0 rounded-[10px] border px-[12px] py-[9px] text-left transition-all duration-300 backdrop-blur-[18px] backdrop-saturate-[1.2] ${isRecommended ? "min-[420px]:col-span-2 border-[var(--onboarding-recommended-border)] bg-[var(--onboarding-recommended-bg)] hover:bg-[var(--onboarding-recommended-bg-hover)] hover:border-[var(--onboarding-recommended-border-strong)]" : "border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] hover:bg-[var(--onboarding-card-bg-hover)] hover:border-[var(--onboarding-card-border-strong)]"}${detectedLabel ? " border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] hover:bg-[rgba(34,197,94,0.15)] hover:border-[rgba(34,197,94,0.5)]" : ""}`}
              onClick={() =>
                dispatch({ type: "selectProvider", providerId: p.id })
              }
            >
              <div className="flex min-h-[48px] items-center gap-[10px]">
                <img
                  src={getProviderLogo(p.id, true, getCustomLogo(p.id))}
                  alt={display.name}
                  className="h-6 w-6 shrink-0 rounded-md object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
                    style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
                  >
                    {display.name}
                  </div>
                  {display.description && (
                    <div
                      className="mt-0.5 truncate text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
                      style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
                    >
                      {display.description}
                    </div>
                  )}
                </div>
                {detectedLabel && (
                  <span
                    className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-[rgba(34,197,94,0.2)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[rgba(34,197,94,0.94)]"
                    style={{ textShadow: "0 1px 6px rgba(3,5,10,0.45)" }}
                  >
                    {detectedLabel}
                  </span>
                )}
                {isRecommended && !detectedLabel && (
                  <span className="ml-auto shrink-0 whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.12em] text-accent">
                    {t("onboarding.recommended") ?? "Recommended"}
                  </span>
                )}
              </div>
            </Button>
          );
        })}
      </div>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 pb-1 border-t border-[var(--onboarding-footer-border)]">
        <Button
          variant="ghost"
          className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer bg-transparent border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
          style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
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
        </Button>
        <span />
      </div>
    </>
  );
}
