/**
 * StartupShell — renders the correct startup UI based on the coordinator state.
 *
 * When the coordinator is in a loading phase, shows a branded loading screen.
 * When in error/pairing/onboarding phases, delegates to the existing views.
 * When ready, renders nothing (children pass through in App.tsx).
 */

import { useEffect, useState } from "react";
import { useApp } from "../state";
import type { StartupErrorState } from "../state/types";
import { OnboardingWizard } from "./OnboardingWizard";
import { PairingView } from "./PairingView";
import { StartupFailureView } from "./StartupFailureView";

function phaseToStatusKey(phase: string): string {
  switch (phase) {
    case "restoring-session":
      return "startupshell.Starting";
    case "resolving-target":
    case "polling-backend":
      return "startupshell.ConnectingBackend";
    case "cloud-login-required":
      return "startupshell.SignInRequired";
    case "starting-runtime":
      return "startupshell.InitializingAgent";
    case "hydrating":
      return "startupshell.Loading";
    default:
      return "startupshell.Starting";
  }
}

export function StartupShell() {
  const {
    startupCoordinator,
    startupError,
    retryStartup,
    t,
    handleCloudLogin,
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
  } = useApp();
  const phase = startupCoordinator.phase;

  // When cloud login completes, advance the coordinator out of cloud-login-required.
  useEffect(() => {
    if (elizaCloudConnected && phase === "cloud-login-required") {
      startupCoordinator.dispatch({ type: "CLOUD_LOGIN_SUCCESS" });
    }
  }, [elizaCloudConnected, phase, startupCoordinator]);

  // Elapsed time counter
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    setElapsedSec(0);
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Error phase — delegate to StartupFailureView
  if (phase === "error") {
    const coordState = startupCoordinator.state;
    const errState = coordState.phase === "error" ? coordState : null;
    const errorState: StartupErrorState = startupError ?? {
      reason: errState?.reason ?? "unknown",
      message:
        errState?.message ?? "An unexpected error occurred during startup.",
      phase: "starting-backend" as const,
    };
    return <StartupFailureView error={errorState} onRetry={retryStartup} />;
  }

  // Pairing required — delegate to PairingView
  if (phase === "pairing-required") {
    return <PairingView />;
  }

  // Onboarding required — delegate to OnboardingWizard
  if (phase === "onboarding-required") {
    return <OnboardingWizard />;
  }

  // Ready — render nothing (App.tsx will render children)
  if (phase === "ready") {
    return null;
  }

  // Loading phases — retro-styled loading screen centered in the window
  const statusText = t(phaseToStatusKey(phase));
  const showSlow = elapsedSec >= 10;

  // Progress estimate based on phase (0-100)
  const progressPct =
    phase === "restoring-session" ? 15 :
    phase === "resolving-target" ? 25 :
    phase === "polling-backend" ? 45 :
    phase === "starting-runtime" ? 70 :
    phase === "hydrating" ? 90 : 10;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#ffe600] font-body text-black overflow-hidden">
      {/* Branded splash background — see CLAUDE.md § Startup Splash */}
      <img
        src="/splash-bg.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-right-bottom opacity-30"
      />

      {/* Centered loading card */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-8 w-full max-w-sm">
        {/* Status text */}
        <p className="text-sm font-bold uppercase tracking-widest text-black/80">
          {statusText}
        </p>

        {/* Retro progress bar */}
        <div className="w-full">
          <div className="h-6 w-full border-2 border-black/80 bg-black/10 overflow-hidden">
            <div
              className="h-full bg-black/80 transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            >
              {/* Segmented bar effect */}
              <div className="h-full w-full"
                style={{
                  backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(255,230,0,0.4) 8px, rgba(255,230,0,0.4) 10px)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Elapsed time */}
        <p className="text-xs text-black/50 tabular-nums font-mono">
          {Math.floor(elapsedSec / 60)}:{(elapsedSec % 60).toString().padStart(2, "0")}
        </p>

        {/* Slow startup warning */}
        {showSlow && (
          <p className="text-xs text-black/60">
            {t("startupshell.TakingLonger")}
          </p>
        )}

        {/* Cloud login button — shown when cloud auth is needed */}
        {phase === "cloud-login-required" && (
          <div className="flex flex-col items-center gap-3 mt-4">
            {elizaCloudLoginError && (
              <p className="text-xs text-red-700 font-medium text-center max-w-[20rem]">
                {elizaCloudLoginError}
              </p>
            )}
            <button
              type="button"
              disabled={elizaCloudLoginBusy}
              onClick={() => void handleCloudLogin()}
              className="flex items-center gap-2 rounded-md bg-black px-6 py-2.5 text-sm font-semibold text-[#ffe600] shadow hover:bg-black/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {elizaCloudLoginBusy && (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#ffe600] border-t-transparent" />
              )}
              {t("startupshell.SignInCloud", { defaultValue: "Sign in with Eliza Cloud" })}
            </button>
            <button
              type="button"
              onClick={() => {
                startupCoordinator.dispatch({ type: "CLOUD_LOGIN_SUCCESS" });
              }}
              className="text-xs text-black/50 hover:text-black/70 underline transition-colors"
            >
              {t("startupshell.SkipCloudLogin", { defaultValue: "Continue without cloud" })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
