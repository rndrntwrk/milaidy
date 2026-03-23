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
      <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
        {t("onboarding.neuralLinkTitle")}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.15)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,255,255,0.15)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      {onboardingRemoteConnected && (
        <p className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3" style={{ marginBottom: "1rem" }}>
          {t(
            "onboarding.remoteConnectedDesc",
            appNameInterpolationVars(branding),
          )}
        </p>
      )}
      <div className="text-xl font-light leading-[1.4] text-[rgba(240,238,250,0.95)] text-center mb-[18px]" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
        {t("onboarding.chooseProvider")}
      </div>
      <div
        className="flex flex-col gap-1.5 mb-4"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}
      >
        {sortedProviders.map((p: ProviderOption) => {
          const display = getProviderDisplay(p);
          const isRecommended = recommendedIds.has(p.id);
          const detectedLabel = getDetectedLabel(p.id);
          return (
            <button
              type="button"
              key={p.id}
              className={`flex items-center justify-between gap-[8px] px-[14px] py-[10px] min-h-[52px] bg-[rgba(10,14,20,0.24)] backdrop-blur-[18px] backdrop-saturate-[1.2] border border-[rgba(255,255,255,0.1)] rounded-[8px] cursor-pointer transition-all duration-300 text-left hover:bg-[rgba(10,14,20,0.34)] hover:border-[rgba(255,255,255,0.16)]${isRecommended ? " bg-[rgba(240,185,11,0.1)] border-[rgba(240,185,11,0.24)] hover:bg-[rgba(240,185,11,0.14)] hover:border-[rgba(240,185,11,0.4)]" : ""}${detectedLabel ? " border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] hover:bg-[rgba(34,197,94,0.15)] hover:border-[rgba(34,197,94,0.5)]" : ""}`}
              style={{
                gridColumn: isRecommended ? "span 2" : "span 1",
                minWidth: 0,
              }}
              onClick={() =>
                dispatch({ type: "selectProvider", providerId: p.id })
              }
            >
              <img
                src={getProviderLogo(p.id, false, getCustomLogo(p.id))}
                alt={display.name}
                className="w-6 h-6 rounded-md object-contain shrink-0"
              />
              <div>
                <div className="text-xs text-[rgba(240,238,250,0.88)] leading-[1.3]" style={{ textShadow: '0 1px 8px rgba(3,5,10,0.6)' }}>{display.name}</div>
                {display.description && (
                  <div className="text-[10px] text-[rgba(240,238,250,0.58)] leading-[1.3] line-clamp-2" style={{ textShadow: '0 1px 8px rgba(3,5,10,0.5)' }}>
                    {display.description}
                  </div>
                )}
              </div>
              {detectedLabel && (
                <span className="text-[9px] tracking-[0.08em] uppercase bg-[rgba(34,197,94,0.2)] text-[rgba(34,197,94,0.94)] px-2 py-0.5 rounded-full font-semibold ml-auto shrink-0 whitespace-nowrap" style={{ textShadow: '0 1px 6px rgba(3,5,10,0.45)' }}>
                  {detectedLabel}
                </span>
              )}
              {isRecommended && !detectedLabel && (
                <span className="text-[9px] tracking-[0.08em] uppercase text-[rgba(240,238,250,0.94)] bg-[rgba(240,185,11,0.18)] px-2 py-0.5 rounded-full font-semibold ml-auto shrink-0 whitespace-nowrap" style={{ textShadow: '0 1px 6px rgba(3,5,10,0.45)' }}>
                  {t("onboarding.recommended") ?? "Recommended"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
        <button
          className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
          style={{ textShadow: '0 1px 8px rgba(3,5,10,0.45)' }}
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
        </button>
        <span />
      </div>
    </>
  );
}
