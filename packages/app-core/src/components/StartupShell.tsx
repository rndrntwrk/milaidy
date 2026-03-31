/**
 * StartupShell — renders the correct startup UI based on the coordinator state.
 *
 * When the coordinator is in a loading phase, shows a branded loading screen.
 * When in error/pairing/onboarding phases, delegates to the existing views.
 * When ready, renders nothing (children pass through in App.tsx).
 */

import { useEffect, useState } from "react";
import { useBranding } from "../config/branding";
import { useApp } from "../state";
import type { StartupErrorState } from "../state/types";
import { OnboardingWizard } from "./OnboardingWizard";
import { PairingView } from "./PairingView";
import { StartupFailureView } from "./StartupFailureView";

function phaseToStatusText(phase: string): string {
  switch (phase) {
    case "booting":
    case "restoring-session":
      return "Starting\u2026";
    case "resolving-target":
    case "polling-backend":
      return "Connecting to backend\u2026";
    case "starting-runtime":
      return "Initializing agent\u2026";
    case "hydrating":
      return "Loading\u2026";
    default:
      return "Starting\u2026";
  }
}

export function StartupShell() {
  const { startupCoordinator, startupError, retryStartup } = useApp();
  const branding = useBranding();
  const phase = startupCoordinator.phase;

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
    const errPhase = startupCoordinator as Extract<
      typeof startupCoordinator,
      { phase: "error" }
    >;
    const errorState: StartupErrorState = startupError ?? {
      reason: errPhase.reason ?? "unknown",
      message:
        errPhase.message ?? "An unexpected error occurred during startup.",
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

  // Loading phases — branded loading screen
  const statusText = phaseToStatusText(phase);
  const showSlow = elapsedSec >= 10;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-start bg-[#ffe600] font-body text-black overflow-hidden">
      {/*
        Branded splash background — intentionally included as a product identity
        element. This is the Milady character art chosen by the project owner.
        Do NOT remove or replace with a generic loading screen.
      */}
      <img
        src="/splash-bg.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
      />

      {/* Status overlay — bottom-left, over the MILADY text area */}
      <div className="relative z-10 flex flex-col gap-3 p-8 pb-12 max-w-sm">
        {/* Spinner + status */}
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black animate-spin shrink-0" />
          <p className="text-sm font-medium text-black/80">{statusText}</p>
        </div>

        {/* Elapsed time */}
        {elapsedSec > 0 && (
          <p className="text-xs text-black/50 tabular-nums pl-8">
            {Math.floor(elapsedSec / 60)}:
            {(elapsedSec % 60).toString().padStart(2, "0")} elapsed
          </p>
        )}

        {/* Slow startup warning */}
        {showSlow && (
          <p className="text-xs text-black/60 pl-8">
            Taking longer than expected&hellip;
          </p>
        )}
      </div>
    </div>
  );
}
