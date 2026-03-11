import { useEffect, useMemo, useState } from "react";
import type { StartupPhase } from "../AppContext";
import { MiladyBootShell } from "./MiladyBootShell.js";

const ASCII_LINES = [
  "        miladym                        iladym      ",
  "    iladymil                                ady    ",
  "    mil                                         ad   ",
  "ymi                                   ladymila     ",
  "dym                                    ila dymila    ",
  "dy       miladymil                     ady   milady   ",
  "    miladymilad                     ymila dymilady  ",
  "    mi    ladymila                   dymiladymil     ",
  "adymiladymiladymi                  l  adymila d    ",
  "ym   iladymiladymil                 ad ymilad  y    ",
  "m  il  adymiladym  i                  l   ad   y     ",
  "    mi  ladymila  dy                    mi           ",
  "    la          dy                         mil      ",
  "        ad      ym                                   ",
  "        iladym",
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
  currentTheme?: string;
  agentName?: string | null;
}

export function LoadingScreen({
  phase = "starting-backend",
  elapsedSeconds,
  currentTheme,
  agentName,
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
      ASCII_LINES.map((line) =>
        [...line].map((char) => ({
          char,
          delay: Math.random() * 5,
          duration: 1.4 + Math.random() * 3,
        })),
      ),
    [],
  );
  const resolvedIdentityLabel =
    typeof agentName === "string" && agentName.trim().length > 0
      ? agentName.trim()
      : undefined;
  const phaseLabel = `${PHASE_LABELS[phase]} (${displayedElapsedSeconds}s)`;
  const art = (
    <div className="flex flex-col items-center justify-center gap-6 px-4 py-10 sm:px-8 sm:py-14">
      <div
        aria-live="polite"
        style={{
          fontFamily: "var(--mono)",
          fontSize:
            currentTheme === "milady-os"
              ? "clamp(7px, 1.2vw, 13px)"
              : "clamp(7px, 1.4vw, 14px)",
          lineHeight: currentTheme === "milady-os" ? 1.28 : 1.35,
          color: currentTheme === "milady-os" ? "var(--accent)" : "var(--text)",
          userSelect: "none",
        }}
      >
        {artGrid.map((line) => (
          <div
            key={line.map((c) => c.char).join("")}
            style={{ whiteSpace: "pre" }}
          >
            {line.map((cell) =>
              cell.char !== " " ? (
                <span
                  key={`${cell.char}-${cell.delay.toFixed(3)}-${cell.duration.toFixed(3)}`}
                  className="dither-char"
                  style={{
                    animationDelay: `${cell.delay.toFixed(2)}s`,
                    animationDuration: `${cell.duration.toFixed(2)}s`,
                  }}
                >
                  {cell.char}
                </span>
              ) : (
                <span
                  key={`${cell.char}-${cell.delay.toFixed(3)}-${cell.duration.toFixed(3)}`}
                >
                  {cell.char}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      <div
        className={
          currentTheme === "milady-os"
            ? "rounded-full border border-accent/30 bg-accent/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.28em] text-accent/80"
            : "text-muted text-xs tracking-widest uppercase"
        }
        style={{ fontFamily: "var(--mono)" }}
      >
        {currentTheme === "milady-os" ? `[${phaseLabel}]` : phaseLabel}
      </div>
    </div>
  );

  if (currentTheme !== "milady-os") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg gap-8">
        {art}
      </div>
    );
  }

  return (
    <MiladyBootShell
      title="PRO STREAMER"
      subtitle="Broadcast shell online"
      status={phaseLabel}
      identityLabel={resolvedIdentityLabel}
      panelClassName="overflow-hidden"
    >
      {art}
    </MiladyBootShell>
  );
}
