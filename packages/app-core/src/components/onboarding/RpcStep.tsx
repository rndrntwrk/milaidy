import { useApp } from "@miladyai/app-core/state";
import { useState } from "react";

type RpcMode = "" | "cloud" | "byok";

export function RpcStep() {
  const {
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingApiKey,
    handleCloudLogin,
    handleOnboardingNext,
    handleOnboardingBack,
    onboardingRpcKeys,
    setState,
    t,
  } = useApp();

  const elizaCloudReady =
    elizaCloudConnected ||
    (onboardingRunMode === "cloud" &&
      onboardingCloudProvider === "elizacloud" &&
      onboardingApiKey.trim().length > 0);
  const [mode, setMode] = useState<RpcMode>(elizaCloudReady ? "cloud" : "");

  const rpcKeys = onboardingRpcKeys as Record<string, string>;

  const setRpcKey = (key: string, value: string) => {
    setState("onboardingRpcKeys", { ...rpcKeys, [key]: value });
  };

  const handleSkip = () => {
    // Clear any partial RPC config and advance
    void handleOnboardingNext();
  };

  // ── No mode chosen yet — show two option cards ──────────────────────
  if (!mode) {
    return (
      <>
        <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
          {t("onboarding.rpcTitle")}
        </div>
        <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.15)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,255,255,0.15)] after:to-transparent">
          <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
        </div>
        <div className="text-xl font-light leading-[1.4] text-[rgba(240,238,250,0.95)] text-center mb-[18px]" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>{t("onboarding.rpcQuestion")}</div>
        <p className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3">{t("onboarding.rpcDesc")}</p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            width: "100%",
            maxWidth: "22rem",
            margin: "0 auto",
          }}
        >
          {/* Eliza Cloud option */}
          <button
            type="button"
            className="flex items-center justify-between gap-[8px] px-[14px] py-[10px] min-h-[52px] bg-[rgba(240,185,11,0.1)] backdrop-blur-[18px] backdrop-saturate-[1.2] border border-[rgba(240,185,11,0.24)] rounded-[8px] cursor-pointer transition-all duration-300 text-left hover:bg-[rgba(240,185,11,0.14)] hover:border-[rgba(240,185,11,0.4)]"
            onClick={() => {
              if (elizaCloudConnected) {
                // Already connected — just mark cloud and advance
                setState("onboardingRpcSelections", {
                  evm: "eliza-cloud",
                  bsc: "eliza-cloud",
                  solana: "eliza-cloud",
                });
                setMode("cloud");
              } else {
                setMode("cloud");
              }
            }}
            style={{ justifyContent: "center" }}
          >
            <div>
              <div className="text-xs text-[rgba(240,238,250,0.88)] leading-[1.3]" style={{ textShadow: '0 1px 8px rgba(3,5,10,0.6)' }}>
                {t("onboarding.rpcElizaCloud")}
              </div>
              <div className="text-[10px] text-[rgba(240,238,250,0.58)] leading-[1.3] line-clamp-2" style={{ textShadow: '0 1px 8px rgba(3,5,10,0.5)' }}>
                {t("onboarding.rpcElizaCloudDesc")}
              </div>
            </div>
          </button>

          {/* BYOK option */}
          <button
            type="button"
            className="flex items-center justify-between gap-[8px] px-[14px] py-[10px] min-h-[52px] bg-[rgba(10,14,20,0.24)] backdrop-blur-[18px] backdrop-saturate-[1.2] border border-[rgba(255,255,255,0.1)] rounded-[8px] cursor-pointer transition-all duration-300 text-left hover:bg-[rgba(10,14,20,0.34)] hover:border-[rgba(255,255,255,0.16)]"
            onClick={() => setMode("byok")}
            style={{ justifyContent: "center" }}
          >
            <div>
              <div className="text-xs text-[rgba(240,238,250,0.88)] leading-[1.3]" style={{ textShadow: '0 1px 8px rgba(3,5,10,0.6)' }}>
                {t("onboarding.rpcBringKeys")}
              </div>
              <div className="text-[10px] text-[rgba(240,238,250,0.58)] leading-[1.3] line-clamp-2" style={{ textShadow: '0 1px 8px rgba(3,5,10,0.5)' }}>
                Alchemy, QuickNode, Helius
              </div>
            </div>
          </button>
        </div>

        <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
          <button
            className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
            style={{ textShadow: '0 1px 8px rgba(3,5,10,0.45)' }}
            onClick={handleOnboardingBack}
            type="button"
          >
            {t("onboarding.back")}
          </button>
          <button
            className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
            style={{ textShadow: '0 1px 8px rgba(3,5,10,0.45)' }}
            onClick={handleSkip}
            type="button"
          >
            {t("onboarding.rpcSkip")}
          </button>
        </div>
      </>
    );
  }

  // ── Eliza Cloud mode ───────────────────────────────────────────────
  if (mode === "cloud") {
    return (
      <>
        <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
          {t("onboarding.rpcTitle")}
        </div>
        <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.15)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,255,255,0.15)] after:to-transparent">
          <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
        </div>

        <div style={{ width: "100%", textAlign: "center" }}>
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
              {t("onboarding.rpcConnectedCloud")}
            </div>
          ) : (
            <>
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
                disabled={elizaCloudLoginBusy || elizaCloudReady}
              >
                {elizaCloudLoginBusy
                  ? t("onboarding.connecting")
                  : elizaCloudReady
                    ? t("onboarding.connected")
                    : t("onboarding.connectAccount")}
              </button>
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
            </>
          )}
        </div>

        <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
          <button
            className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
            style={{ textShadow: '0 1px 8px rgba(3,5,10,0.45)' }}
            onClick={() => setMode("")}
            type="button"
          >
            {t("settings.change")}
          </button>
          <button
            className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[rgba(240,185,11,0.18)] border border-[rgba(240,185,11,0.35)] rounded-[6px] text-[rgba(240,238,250,0.94)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[rgba(240,185,11,0.28)] hover:border-[rgba(240,185,11,0.6)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ textShadow: '0 1px 6px rgba(3,5,10,0.55)' }}
            onClick={() => {
              setState("onboardingRpcSelections", {
                evm: "eliza-cloud",
                bsc: "eliza-cloud",
                solana: "eliza-cloud",
              });
              void handleOnboardingNext();
            }}
            disabled={!elizaCloudReady}
            type="button"
          >
            {t("onboarding.next") ?? "Next"}
          </button>
        </div>
      </>
    );
  }

  // ── BYOK mode ───────────────────────────────────────────────────────
  return (
    <>
      <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
        {t("onboarding.rpcTitle")}
        <button
          type="button"
          className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
          style={{ textShadow: '0 1px 8px rgba(3,5,10,0.45)', marginLeft: "0.5rem", fontSize: "0.75rem" }}
          onClick={() => setMode("")}
        >
          {t("settings.change")}
        </button>
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
          gap: "1rem",
        }}
      >
        {/* Alchemy — all EVM chains */}
        <div>
          <label
            htmlFor="rpc-alchemy"
            style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              marginBottom: "0.375rem",
              color: "var(--text)",
            }}
          >
            {t("onboarding.rpcAlchemyKey")}
          </label>
          <p
            className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3"
            style={{ marginBottom: "0.375rem", textAlign: "left" }}
          >
            Covers Ethereum, Base, Arbitrum, Optimism, Polygon, BSC
          </p>
          <input
            id="rpc-alchemy"
            type="password"
            className="w-full px-[20px] py-[16px] bg-[rgba(10,14,20,0.24)] border border-[rgba(255,255,255,0.16)] rounded-[6px] text-[rgba(240,238,250,0.92)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[rgba(240,185,11,0.4)] focus:shadow-[0_0_12px_rgba(240,185,11,0.08)] placeholder:text-[rgba(240,238,250,0.4)]"
            placeholder="Enter Alchemy API key"
            value={rpcKeys.ALCHEMY_API_KEY ?? ""}
            onChange={(e) => setRpcKey("ALCHEMY_API_KEY", e.target.value)}
          />
        </div>

        {/* Helius — Solana specific */}
        <div>
          <label
            htmlFor="rpc-helius"
            style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              marginBottom: "0.375rem",
              color: "var(--text)",
            }}
          >
            {t("onboarding.rpcHeliusKey")}
          </label>
          <p
            className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3"
            style={{ marginBottom: "0.375rem", textAlign: "left" }}
          >
            Solana mainnet RPC &amp; token data
          </p>
          <input
            id="rpc-helius"
            type="password"
            className="w-full px-[20px] py-[16px] bg-[rgba(10,14,20,0.24)] border border-[rgba(255,255,255,0.16)] rounded-[6px] text-[rgba(240,238,250,0.92)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[rgba(240,185,11,0.4)] focus:shadow-[0_0_12px_rgba(240,185,11,0.08)] placeholder:text-[rgba(240,238,250,0.4)]"
            placeholder="Enter Helius API key"
            value={rpcKeys.HELIUS_API_KEY ?? ""}
            onChange={(e) => setRpcKey("HELIUS_API_KEY", e.target.value)}
          />
        </div>

        {/* Birdeye — Solana token data (optional) */}
        <div>
          <label
            htmlFor="rpc-birdeye"
            style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              marginBottom: "0.375rem",
              color: "var(--text)",
            }}
          >
            {t("onboarding.rpcBirdeyeKey")}
          </label>
          <input
            id="rpc-birdeye"
            type="password"
            className="w-full px-[20px] py-[16px] bg-[rgba(10,14,20,0.24)] border border-[rgba(255,255,255,0.16)] rounded-[6px] text-[rgba(240,238,250,0.92)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[rgba(240,185,11,0.4)] focus:shadow-[0_0_12px_rgba(240,185,11,0.08)] placeholder:text-[rgba(240,238,250,0.4)]"
            placeholder="Enter Birdeye API key (optional)"
            value={rpcKeys.BIRDEYE_API_KEY ?? ""}
            onChange={(e) => setRpcKey("BIRDEYE_API_KEY", e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
        <button
          className="text-[10px] text-[rgba(240,238,250,0.62)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[rgba(240,238,250,0.9)]"
          style={{ textShadow: '0 1px 8px rgba(3,5,10,0.45)' }}
          onClick={() => setMode("")}
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
            
            // Build RPC selections based on what keys were entered
            const selections: Record<string, string> = {};
            if (rpcKeys.ALCHEMY_API_KEY) {
              selections.evm = "alchemy";
              selections.bsc = "alchemy";
            }
            if (rpcKeys.HELIUS_API_KEY) {
              selections.solana = "helius-birdeye";
            }
            setState("onboardingRpcSelections", selections);
            void handleOnboardingNext();
          }}
          type="button"
        >
          {t("onboarding.next") ?? "Next"}
        </button>
      </div>
    </>
  );
}
