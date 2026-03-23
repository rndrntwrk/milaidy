import { useApp } from "@miladyai/app-core/state";
import { Button, Input } from "@miladyai/ui";
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
        <div
          className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
          style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
        >
          {t("onboarding.rpcTitle")}
        </div>
        <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
          <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
        </div>
        <div
          className="text-xl font-light leading-[1.4] text-[var(--onboarding-text-strong)] text-center mb-[18px]"
          style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
        >
          {t("onboarding.rpcQuestion")}
        </div>
        <p className="mx-auto mt-1.5 mb-3 max-w-[32ch] text-center text-[12px] leading-[1.35] text-[var(--onboarding-text-muted)]">
          {t("onboarding.rpcDesc")}
        </p>

        <div className="mx-auto flex w-full max-w-[24rem] flex-col gap-2.5">
          {/* Eliza Cloud option */}
          <Button
            type="button"
            className="flex min-h-[48px] items-center justify-center gap-[10px] rounded-[10px] border border-[var(--onboarding-recommended-border)] bg-[var(--onboarding-recommended-bg)] px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300 hover:bg-[var(--onboarding-recommended-bg-hover)] hover:border-[var(--onboarding-recommended-border-strong)]"
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
          >
            <div className="min-w-0 text-center">
              <div
                className="text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
                style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
              >
                {t("onboarding.rpcElizaCloud")}
              </div>
              <div
                className="mt-0.5 line-clamp-1 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
                style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
              >
                {t("onboarding.rpcElizaCloudDesc")}
              </div>
            </div>
          </Button>

          {/* BYOK option */}
          <Button
            variant="outline"
            type="button"
            className="flex min-h-[48px] items-center justify-center gap-[10px] rounded-[10px] border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300 hover:bg-[var(--onboarding-card-bg-hover)] hover:border-[var(--onboarding-card-border-strong)]"
            onClick={() => setMode("byok")}
          >
            <div className="min-w-0 text-center">
              <div
                className="text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
                style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
              >
                {t("onboarding.rpcBringKeys")}
              </div>
              <div
                className="mt-0.5 line-clamp-1 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
                style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
              >
                Alchemy, QuickNode, Helius
              </div>
            </div>
          </Button>
        </div>

        <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-[var(--onboarding-footer-border)]">
          <Button
            variant="ghost"
            className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
            style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
            onClick={handleOnboardingBack}
            type="button"
          >
            {t("onboarding.back")}
          </Button>
          <Button
            variant="ghost"
            className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
            style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
            onClick={handleSkip}
            type="button"
          >
            {t("onboarding.rpcSkip")}
          </Button>
        </div>
      </>
    );
  }

  // ── Eliza Cloud mode ───────────────────────────────────────────────
  if (mode === "cloud") {
    return (
      <>
        <div
          className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
          style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
        >
          {t("onboarding.rpcTitle")}
        </div>
        <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
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
              <Button
                type="button"
                className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const circle = document.createElement("span");
                  const diameter = Math.max(rect.width, rect.height);
                  circle.style.width = circle.style.height = `${diameter}px`;
                  circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
                  circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
                  circle.className =
                    "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
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
              </Button>
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
              <p className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3">
                {t("onboarding.freeCredits")}
              </p>
            </>
          )}
        </div>

        <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-[var(--onboarding-footer-border)]">
          <Button
            variant="ghost"
            className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
            style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
            onClick={() => setMode("")}
            type="button"
          >
            {t("settings.change")}
          </Button>
          <Button
            className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
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
          </Button>
        </div>
      </>
    );
  }

  // ── BYOK mode ───────────────────────────────────────────────────────
  return (
    <>
      <div
        className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.rpcTitle")}
        <Button
          variant="ghost"
          type="button"
          className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
          style={{
            textShadow: "0 1px 8px rgba(3,5,10,0.45)",
            marginLeft: "0.5rem",
            fontSize: "0.75rem",
          }}
          onClick={() => setMode("")}
        >
          {t("settings.change")}
        </Button>
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
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
            className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
            style={{ marginBottom: "0.375rem", textAlign: "left" }}
          >
            Covers Ethereum, Base, Arbitrum, Optimism, Polygon, BSC
          </p>
          <Input
            id="rpc-alchemy"
            type="password"
            className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
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
            className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
            style={{ marginBottom: "0.375rem", textAlign: "left" }}
          >
            Solana mainnet RPC &amp; token data
          </p>
          <Input
            id="rpc-helius"
            type="password"
            className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
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
          <Input
            id="rpc-birdeye"
            type="password"
            className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
            placeholder="Enter Birdeye API key (optional)"
            value={rpcKeys.BIRDEYE_API_KEY ?? ""}
            onChange={(e) => setRpcKey("BIRDEYE_API_KEY", e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-[var(--onboarding-footer-border)]">
        <Button
          variant="ghost"
          className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
          style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
          onClick={() => setMode("")}
          type="button"
        >
          {t("onboarding.back")}
        </Button>
        <Button
          className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const circle = document.createElement("span");
            const diameter = Math.max(rect.width, rect.height);
            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
            circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
            circle.className =
              "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
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
        </Button>
      </div>
    </>
  );
}
