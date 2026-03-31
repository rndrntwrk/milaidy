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
  } = useApp();
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

  // All other intermediate phases (restoring-session, polling-backend, etc.)
  // stay on the splash screen — show status text where the button was.
  const isLoading = phase !== "splash";
  const splashLoaded = phase === "splash"
    ? (startupCoordinator.state as { loaded?: boolean }).loaded
    : false;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#ffe600] font-body text-black overflow-hidden">
      <img
        src="/splash-bg.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-right-bottom"
      />
      <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center max-w-md">
        <h1 style={{ fontFamily: "'Press Start 2P', 'Courier New', monospace" }} className="text-3xl text-black drop-shadow-sm">
          MILADY
        </h1>
        <p style={{ fontFamily: "'Press Start 2P', 'Courier New', monospace" }} className="text-[8px] text-black/50 uppercase leading-relaxed">
          {t("startupshell.SplashTagline", { defaultValue: "Your local-first AI assistant" })}
        </p>

        {isLoading ? (
          <p style={{ fontFamily: "'Press Start 2P', 'Courier New', monospace" }} className="mt-4 text-[10px] text-black/60 uppercase tracking-wider animate-pulse">
            {t(phaseToStatusKey(phase))}
          </p>
        ) : (
          <button
            type="button"
            disabled={!splashLoaded}
            onClick={() => startupCoordinator.dispatch({ type: "SPLASH_CONTINUE" })}
            style={{ fontFamily: "'Press Start 2P', 'Courier New', monospace" }}
            className="mt-4 border-2 border-black bg-black px-6 py-3 text-[10px] uppercase text-[#ffe600] shadow-lg hover:bg-black/80 disabled:opacity-40 disabled:cursor-wait transition-all"
          >
            {splashLoaded
              ? t("startupshell.GetStarted", { defaultValue: "Press Start" })
              : t("startupshell.Loading", { defaultValue: "Loading..." })}
          </button>
        )}
      </div>
    </div>
  );
}
