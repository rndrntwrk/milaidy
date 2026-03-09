/**
 * Loading screen — ASCII Pro Streamer logo with per-character dither fade.
 */

import { useEffect, useMemo, useState } from "react";
import type { StartupPhase } from "../AppContext";
import { MiladyBootShell } from "./MiladyBootShell.js";

const BOOT_ART = [
  "PPPPP   RRRRR    OOOOO",
  "P   PP  R   RR  OO   OO",
  "PPPPP   RRRRR   OO   OO",
  "P       R  RR   OO   OO",
  "P       R   RR   OOOOO ",
  "",
  " SSSSS TTTTT RRRRR  EEEEE   AAA   MM   MM EEEEE RRRRR ",
  "SS       T   R   RR E      A   A  MMM MMM E     R   RR",
  " SSSS    T   RRRRR  EEEE   AAAAA  MM M MM EEEE  RRRRR ",
  "    SS   T   R  RR  E      A   A  MM   MM E     R  RR ",
  "SSSSS    T   R   RR EEEEE  A   A  MM   MM EEEEE R   RR",
];

interface CharCell {
  char: string;
  delay: number;
  duration: number;
}

const PHASE_LABELS: Record<StartupPhase, string> = {
  "starting-backend": "starting backend",
  "initializing-agent": "initializing agent",
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

  const artGrid = useMemo<CharCell[][]>(
    () =>
      BOOT_ART.map((line) =>
        [...line].map((char) => ({
          char,
          delay: Math.random() * 1.6,
          duration: 1.4 + Math.random() * 1.4,
        })),
      ),
    [],
  );

  return (
    <MiladyBootShell
      title="PRO STREAMER"
      subtitle="Broadcast shell online"
      status={`${PHASE_LABELS[phase]} (${displayedElapsedSeconds}s)`}
      identityLabel="rasp"
      panelClassName="overflow-hidden"
    >
      <div className="flex flex-col items-center justify-center gap-6 px-4 py-10 sm:px-8 sm:py-14">
        <pre
          className="m-0 overflow-x-auto text-center"
          aria-live="polite"
          style={{
            fontFamily: "var(--mono)",
            fontSize: "clamp(14px, 2.1vw, 26px)",
            lineHeight: 1.08,
            color: "var(--accent)",
            userSelect: "none",
          }}
        >
          {artGrid.map((line, lineIndex) => (
            <div key={`boot-line-${lineIndex}`}>
              {line.map((cell, charIndex) => (
                <span
                  key={`boot-char-${lineIndex}-${charIndex}`}
                  className={cell.char === " " ? "inline-block" : "dither-char inline-block"}
                  style={{
                    animationDelay: `${(charIndex * 0.03 + lineIndex * 0.12).toFixed(2)}s`,
                    animationDuration: `${cell.duration.toFixed(2)}s`,
                    width: cell.char === " " ? "0.6ch" : undefined,
                  }}
                >
                  {cell.char}
                </span>
              ))}
            </div>
          ))}
        </pre>
        <div className="rounded-full border border-accent/30 bg-accent/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.28em] text-accent/80">
          [{PHASE_LABELS[phase]} ({displayedElapsedSeconds}s)]
        </div>
      </div>
    </MiladyBootShell>
  );
}
