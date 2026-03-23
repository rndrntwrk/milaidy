import type { ChangeEvent } from "react";
import type { ConnectionEvent } from "../../../onboarding/connection-flow";
import { useApp } from "../../../state";
import { useAdvanceOnboardingWhenElizaCloudOAuthConnected } from "./useAdvanceOnboardingWhenElizaCloudOAuthConnected";

export function ConnectionElizaCloudPreProviderScreen({
  dispatch,
}: {
  dispatch: (event: ConnectionEvent) => void;
}) {
  const {
    t,
    onboardingApiKey,
    onboardingElizaCloudTab,
    onboardingRunMode,
    onboardingCloudProvider,
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    handleCloudLogin,
    handleOnboardingNext,
    setState,
  } = useApp();

  const elizaCloudReady =
    elizaCloudConnected ||
    (onboardingRunMode === "cloud" &&
      onboardingCloudProvider === "elizacloud" &&
      onboardingApiKey.trim().length > 0);

  useAdvanceOnboardingWhenElizaCloudOAuthConnected({
    active: true,
    elizaCloudConnected,
    elizaCloudTab: onboardingElizaCloudTab,
    handleOnboardingNext,
  });

  const handleApiKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    setState("onboardingApiKey", e.target.value);
  };

  return (
    <>
      <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>Eliza Cloud</div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.15)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,255,255,0.15)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>

      <div style={{ width: "100%", textAlign: "left" }}>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1rem",
          }}
        >
          <button
            type="button"
            style={{
              fontSize: "0.875rem",
              paddingBottom: "0.5rem",
              color:
                onboardingElizaCloudTab === "login"
                  ? "#f0b90b"
                  : "var(--muted)",
              background: "none",
              border: "none",
              borderBottom:
                onboardingElizaCloudTab === "login"
                  ? "2px solid #f0b90b"
                  : "2px solid transparent",
              cursor: "pointer",
            }}
            onClick={() => dispatch({ type: "setElizaCloudTab", tab: "login" })}
          >
            {t("onboarding.login")}
          </button>
          <button
            type="button"
            style={{
              fontSize: "0.875rem",
              paddingBottom: "0.5rem",
              borderBottom:
                onboardingElizaCloudTab === "apikey"
                  ? "2px solid #f0b90b"
                  : "2px solid transparent",
              color:
                onboardingElizaCloudTab === "apikey"
                  ? "#f0b90b"
                  : "var(--muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
            onClick={() =>
              dispatch({ type: "setElizaCloudTab", tab: "apikey" })
            }
          >
            {t("onboarding.apiKey")}
          </button>
        </div>

        {onboardingElizaCloudTab === "login" ? (
          <div style={{ textAlign: "center" }}>
            {elizaCloudConnected ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1rem",
                  border: "1px solid var(--ok-muted)",
                  background: "var(--ok-subtle)",
                  color: "var(--ok)",
                  fontSize: "0.875rem",
                  borderRadius: "0.5rem",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>{t("onboarding.connected")}</title>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t("onboarding.connected")}
              </div>
            ) : (
              <button
                type="button"
                className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[rgba(240,185,11,0.18)] border border-[rgba(240,185,11,0.35)] rounded-[6px] text-[rgba(240,238,250,0.94)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[rgba(240,185,11,0.28)] hover:border-[rgba(240,185,11,0.6)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ textShadow: '0 1px 6px rgba(3,5,10,0.55)' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const circle = document.createElement("span");
                  const diameter = Math.max(rect.width, rect.height);
                  circle.style.width = circle.style.height = `${diameter}px`;
                  circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
                  circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
                  circle.className = "absolute rounded-full bg-[rgba(240,185,11,0.3)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
                  e.currentTarget.appendChild(circle);
                  setTimeout(() => circle.remove(), 600);
                  handleCloudLogin();
                }}
                disabled={elizaCloudLoginBusy}
              >
                {elizaCloudLoginBusy
                  ? t("onboarding.connecting")
                  : t("onboarding.connectAccount")}
              </button>
            )}
            {elizaCloudLoginError &&
              (() => {
                const urlMatch = elizaCloudLoginError.match(
                  /^Open this link to log in: (.+)$/,
                );
                if (urlMatch) {
                  return (
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        marginTop: "0.5rem",
                        color: "var(--text)",
                      }}
                    >
                      Open this link to log in:{" "}
                      <a
                        href={urlMatch[1]}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--text)",
                          textDecoration: "underline",
                        }}
                      >
                        Click here
                      </a>
                    </p>
                  );
                }
                return (
                  <p
                    style={{
                      color: "var(--danger)",
                      fontSize: "0.8125rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    {elizaCloudLoginError}
                  </p>
                );
              })()}
            <p className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3">{t("onboarding.freeCredits")}</p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="elizacloud-apikey-pre"
              style={{
                display: "block",
                fontSize: "0.875rem",
                marginBottom: "0.375rem",
                color: "var(--muted)",
              }}
            >
              {t("onboarding.apiKey")}
            </label>
            <input
              id="elizacloud-apikey-pre"
              type="password"
              className="w-full px-[20px] py-[16px] bg-[rgba(10,14,20,0.24)] border border-[rgba(255,255,255,0.16)] rounded-[6px] text-[rgba(240,238,250,0.92)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[rgba(240,185,11,0.4)] focus:shadow-[0_0_12px_rgba(240,185,11,0.08)] placeholder:text-[rgba(240,238,250,0.4)]"
              placeholder="ck-..."
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
            />
            <p className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3">
              {t("onboarding.useExistingKey")}{" "}
              <a
                href="https://elizacloud.ai/dashboard/settings"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text)" }}
              >
                {t("onboarding.getOneHere")}
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
        <button
          className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
          style={{ textShadow: '0 1px 8px rgba(3,5,10,0.45)' }}
          onClick={() => dispatch({ type: "backElizaCloudPreProvider" })}
          type="button"
        >
          {t("onboarding.back")}
        </button>
        <button
          className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[rgba(240,185,11,0.18)] border border-[rgba(240,185,11,0.35)] rounded-[6px] text-[rgba(240,238,250,0.94)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[rgba(240,185,11,0.28)] hover:border-[rgba(240,185,11,0.6)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ textShadow: '0 1px 6px rgba(3,5,10,0.55)' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const circle = document.createElement("span");
            const diameter = Math.max(rect.width, rect.height);
            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
            circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
            circle.className = "absolute rounded-full bg-[rgba(240,185,11,0.3)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
            e.currentTarget.appendChild(circle);
            setTimeout(() => circle.remove(), 600);
            void handleOnboardingNext();
          }}
          disabled={!elizaCloudReady}
          type="button"
        >
          {t("onboarding.confirm")}
        </button>
      </div>
    </>
  );
}
