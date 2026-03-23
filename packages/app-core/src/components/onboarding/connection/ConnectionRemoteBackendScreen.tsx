import { appNameInterpolationVars, useBranding } from "../../../config";
import type {
  ConnectionEffect,
  ConnectionEvent,
} from "../../../onboarding/connection-flow";
import { useApp } from "../../../state";

export function ConnectionRemoteBackendScreen({
  dispatch,
  onTransitionEffect,
}: {
  dispatch: (event: ConnectionEvent) => void;
  onTransitionEffect: (effect: ConnectionEffect) => void;
}) {
  const branding = useBranding();
  const {
    t,
    onboardingRemoteApiBase,
    onboardingRemoteToken,
    onboardingRemoteConnecting,
    onboardingRemoteError,
    onboardingRemoteConnected,
    handleOnboardingRemoteConnect,
    setState,
  } = useApp();

  return (
    <>
      <div
        className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.remoteTitle", appNameInterpolationVars(branding))}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.15)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,255,255,0.15)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <div
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        <div>
          <label
            htmlFor="remote-api-base"
            style={{
              display: "block",
              fontSize: "0.875rem",
              marginBottom: "0.375rem",
              color: "var(--muted)",
            }}
          >
            {t("onboarding.remoteAddress")}
          </label>
          <input
            id="remote-api-base"
            type="text"
            className="w-full px-[20px] py-[16px] bg-[rgba(10,14,20,0.24)] border border-[rgba(255,255,255,0.16)] rounded-[6px] text-[rgba(240,238,250,0.92)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[rgba(240,185,11,0.4)] focus:shadow-[0_0_12px_rgba(240,185,11,0.08)] placeholder:text-[rgba(240,238,250,0.4)]"
            placeholder={t("onboarding.remoteAddressPlaceholder")}
            value={onboardingRemoteApiBase}
            onChange={(e) =>
              setState("onboardingRemoteApiBase", e.target.value)
            }
          />
        </div>

        <div>
          <label
            htmlFor="remote-api-token"
            style={{
              display: "block",
              fontSize: "0.875rem",
              marginBottom: "0.375rem",
              color: "var(--muted)",
            }}
          >
            {t("onboarding.remoteAccessKey")}
          </label>
          <input
            id="remote-api-token"
            type="password"
            className="w-full px-[20px] py-[16px] bg-[rgba(10,14,20,0.24)] border border-[rgba(255,255,255,0.16)] rounded-[6px] text-[rgba(240,238,250,0.92)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[rgba(240,185,11,0.4)] focus:shadow-[0_0_12px_rgba(240,185,11,0.08)] placeholder:text-[rgba(240,238,250,0.4)]"
            placeholder={t("onboarding.remoteAccessKeyPlaceholder")}
            value={onboardingRemoteToken}
            onChange={(e) => setState("onboardingRemoteToken", e.target.value)}
          />
        </div>

        {onboardingRemoteError && (
          <p
            style={{
              color: "var(--danger)",
              fontSize: "0.8125rem",
            }}
          >
            {onboardingRemoteError}
          </p>
        )}
      </div>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
        <button
          className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
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
        </button>
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
            void handleOnboardingRemoteConnect();
          }}
          disabled={onboardingRemoteConnecting}
          type="button"
        >
          {onboardingRemoteConnecting
            ? t("onboarding.connecting")
            : t("onboarding.remoteConnect")}
        </button>
      </div>
    </>
  );
}
