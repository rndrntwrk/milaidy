import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { liveSourceKindLabel } from "../liveComposition.js";
import { Badge } from "./ui/Badge.js";
import { ConnectionIcon } from "./ui/Icons.js";

function normalizeMissionState(raw: string | null | undefined, chatSending: boolean): string {
  if (chatSending) return "executing";
  const value = (raw ?? "").toLowerCase();
  if (!value || value === "idle" || value === "ready" || value === "running") return "idle";
  if (value.includes("approval")) return "awaiting approval";
  if (value.includes("error")) return "attention";
  return "executing";
}

export function MiladyStatusStrip() {
  const {
    connected,
    agentStatus,
    plugins,
    chatSending,
    liveBroadcastState,
    liveLayoutMode,
    liveHeroSource,
  } = useApp();

  const channelBadges = useMemo(
    () =>
      [
        ["discord", "Discord"],
        ["telegram", "Telegram"],
        ["twitter", "Twitter"],
        ["direct", "Direct"],
      ].map(([match, label]) => {
        const plugin = plugins.find(
          (entry) =>
            entry.id.toLowerCase().includes(match) ||
            entry.name.toLowerCase().includes(match),
        );
        const active = Boolean(plugin?.enabled && plugin?.isActive);
        const enabled = Boolean(plugin?.enabled);
        return {
          label,
          variant: active ? "success" : enabled ? "accent" : "outline",
          state: active ? "live" : enabled ? "standby" : "offline",
        } as const;
      }),
    [plugins],
  );

  const missionState = normalizeMissionState(agentStatus?.state, chatSending);
  const model = agentStatus?.model || "unknown";
  const liveChannels = channelBadges.filter((badge) => badge.state === "live");
  const mode = liveBroadcastState === "live" ? "broadcast" : null;
  const showMode = Boolean(mode);
  const showMissionState = missionState !== "idle";
  const showModel = model && model !== "unknown";
  const showLiveHero = Boolean(liveHeroSource);
  const liveLayoutLabel =
    liveLayoutMode === "camera-hold" ? "camera hold" : "camera full";
  const heroLabel = liveHeroSource
    ? `${liveSourceKindLabel(liveHeroSource.kind)}: ${liveHeroSource.label}`
    : null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] justify-end sm:right-4 sm:top-4">
      <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-white/10 bg-black/52 px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.24)] backdrop-blur-2xl sm:flex-wrap sm:justify-end sm:px-3">
        <Badge variant={connected ? "success" : "danger"}>
          <ConnectionIcon className="h-3.5 w-3.5" />
          {connected ? "live" : "offline"}
        </Badge>
        <Badge variant={liveBroadcastState === "live" ? "accent" : "outline"}>
          {liveBroadcastState === "live" ? "on air" : "off air"}
        </Badge>
        <Badge variant="outline">{liveLayoutLabel}</Badge>
        {showLiveHero ? (
          <Badge variant="outline" className="hidden xl:inline-flex" title={heroLabel ?? undefined}>
            {heroLabel}
          </Badge>
        ) : null}
        {showModel ? <Badge variant="outline" className="hidden 2xl:inline-flex">{model}</Badge> : null}
        {showMode ? <Badge variant="outline" className="hidden lg:inline-flex">{mode}</Badge> : null}
        {showMissionState ? <Badge variant="outline">{missionState}</Badge> : null}
        {liveChannels.slice(0, 2).map((badge) => (
          <Badge key={badge.label} variant={badge.variant} title={`${badge.label} ${badge.state}`} className="hidden xl:inline-flex">
            {badge.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
