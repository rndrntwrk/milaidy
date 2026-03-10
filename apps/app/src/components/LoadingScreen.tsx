/**
 * Loading screen — ASCII "milady" logo with per-character dither fade.
 *
 * Each letter independently cycles through quantised opacity steps on its
 * own random schedule, producing a constantly shifting dither pattern that
 * resolves into the logo and dissolves again.
 */

import { useEffect, useMemo, useState } from "react";
import type { StartupPhase } from "../AppContext";

/* ── Types ─────────────────────────────────────────────────────────── */

interface CharCell {
  char: string;
  isLetter: boolean;
  /** Random animation-delay in seconds */
  delay: number;
  /** Random animation-duration in seconds */
  duration: number;
}

/* ── Component ─────────────────────────────────────────────────────── */

const PHASE_LABELS: Record<StartupPhase, string> = {
  "starting-backend": "starting backend",
  "initializing-agent": "initializing agent",
  ready: "ready",
};

interface LoadingScreenProps {
  phase?: StartupPhase;
  elapsedSeconds?: number;
}

export function LoadingScreen({
  phase = "starting-backend",
  elapsedSeconds,
}: LoadingScreenProps) {
  const [runtimeElapsedSeconds, setRuntimeElapsedSeconds] = useState(0);

  useEffect(() => {
    if (typeof elapsedSeconds === "number") return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRuntimeElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [elapsedSeconds]);

  const displayedElapsedSeconds =
    typeof elapsedSeconds === "number"
      ? Math.max(0, Math.floor(elapsedSeconds))
      : runtimeElapsedSeconds;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg gap-8">
      <div
        className="text-muted text-xs tracking-widest uppercase"
        style={{ fontFamily: "var(--mono)" }}
      >
        {PHASE_LABELS[phase]} ({displayedElapsedSeconds}s)
      </div>
    </div>
  );
}
