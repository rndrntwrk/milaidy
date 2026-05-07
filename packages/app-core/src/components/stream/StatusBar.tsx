/**
 * StatusBar — Passive stream status pills for the current shell header.
 */

import { useApp } from "@miladyai/app-core/state";
import { type CSSProperties } from "react";
import { IS_POPOUT } from "./helpers";
import { OperatorPill } from "../operator/OperatorPrimitives";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function StatusBar({
  agentName,
  streamAvailable,
  streamLive,
  activeDestination,
  uptime,
  frameCount,
}: {
  agentName: string;
  streamAvailable: boolean;
  streamLive: boolean;
  activeDestination: { id: string; name: string } | null;
  uptime: number;
  frameCount: number;
}) {
  const { t } = useApp();

  return (
    <div
      className="flex items-center justify-between border-b border-border/60 bg-card/80 shadow-sm backdrop-blur-xl shrink-0 px-3 py-2 lg:px-4"
      style={
        IS_POPOUT ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            streamLive
              ? "bg-danger ring-2 ring-danger/25 animate-pulse"
              : "bg-muted"
          }`}
        />
        <span className="text-sm font-semibold text-txt-strong">
          {agentName}
        </span>
      </div>

      <div
        className="flex items-center gap-2 lg:gap-3 text-xs text-muted"
        style={
          IS_POPOUT
            ? ({ WebkitAppRegion: "no-drag" } as CSSProperties)
            : undefined
        }
      >
        <OperatorPill tone={streamAvailable ? (streamLive ? "danger" : "neutral") : "warning"}>
          {streamAvailable
            ? streamLive
              ? t("statusbar.LiveShort", { defaultValue: "LIVE" })
              : t("statusbar.OfflineShort", { defaultValue: "OFFLINE" })
            : t("statusbar.StreamUnavailable", {
                defaultValue: "Unavailable",
              })}
        </OperatorPill>
        {activeDestination ? (
          <OperatorPill tone="accent">{activeDestination.name}</OperatorPill>
        ) : null}
        {streamLive ? (
          <OperatorPill className="font-mono normal-case tracking-[0.08em]">
            {formatUptime(uptime)} · {frameCount.toLocaleString()}f
          </OperatorPill>
        ) : null}
      </div>
    </div>
  );
}
