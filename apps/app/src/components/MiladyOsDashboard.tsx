import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext.js";
import { AgentCore } from "./AgentCore.js";
import { CommandDock } from "./CommandDock.js";
import { CognitiveTracePanel } from "./CognitiveTracePanel.js";
import { MissionQueuePanel } from "./MissionQueuePanel.js";
import { ThreadsDrawer } from "./ThreadsDrawer.js";
import { MemoryDrawer } from "./MemoryDrawer.js";
import { OpsDrawer } from "./OpsDrawer.js";
import { MiladyStatusStrip } from "./MiladyStatusStrip.js";
import {
  AssetVaultDrawer,
  miladyAssetSectionForTab,
  type AssetVaultSection,
} from "./AssetVaultDrawer.js";
import {
  ControlStackModal,
  miladyControlSectionForTab,
} from "./ControlStackModal.js";
import { MiladyRailBubble } from "./MiladyRailBubble.js";
import { SectionEmptyState } from "./SectionStates.js";
import { Sheet } from "./ui/Sheet.js";
import { Button } from "./ui/Button.js";
import { Badge } from "./ui/Badge.js";
import { ActivityIcon, CloseIcon, MissionIcon } from "./ui/Icons.js";

type ViewportMode = "mobile" | "tablet" | "desktop";

function resolveViewportMode(width: number): ViewportMode {
  if (width < 768) return "mobile";
  if (width < 1280) return "tablet";
  return "desktop";
}

export function MiladyOsDashboard() {
  const {
    tab,
    dockSurface,
    leftRailState,
    rightRailState,
    activeBubble,
    hudSurface,
    hudControlSection,
    hudAssetSection,
    chatSending,
    chatFirstTokenReceived,
    autonomousEvents,
    agentStatus,
    triggers,
    triggerHealth,
    openDockSurface,
    openHudControlStack,
    openHudAssetVault,
    closeHudSurface,
    setRailDisplay,
    collapseRails,
  } = useApp();
  const safeAutonomousEvents = autonomousEvents ?? [];
  const safeTriggers = triggers ?? [];
  const collapseRailsSafe = useMemo(() => collapseRails ?? (() => {}), [collapseRails]);
  const [viewportMode, setViewportMode] = useState<ViewportMode>(() =>
    typeof window === "undefined"
      ? "desktop"
      : resolveViewportMode(window.innerWidth),
  );

  const controlStackSection =
    hudControlSection ?? miladyControlSectionForTab(tab) ?? "settings";
  const assetVaultSection =
    hudAssetSection ?? miladyAssetSectionForTab(tab) ?? "identity";
  const activeSurface =
    hudSurface === "control-stack" ? "control-stack" : dockSurface;
  const executing = chatSending || chatFirstTokenReceived;
  const actionBadge = executing
    ? "•"
    : safeAutonomousEvents.length > 0
      ? `${Math.min(safeAutonomousEvents.length, 9)}`
      : undefined;
  const actionSummary = executing
    ? "Live execution updates are flowing to stage."
    : safeAutonomousEvents.length > 0
      ? "Recent public-safe execution updates are ready."
      : "No public actions yet.";
  const awaitingApproval = (agentStatus?.state ?? "").toLowerCase().includes("approval");
  const missionBadge = awaitingApproval
    ? "!"
    : safeTriggers.length > 0
      ? `${Math.min(safeTriggers.length, 9)}`
      : undefined;
  const nextTriggerLabel = useMemo(() => {
    if (safeTriggers.length === 0) return null;
    return safeTriggers[0]?.displayName ?? "Queued routine";
  }, [safeTriggers]);
  const missionSummary = awaitingApproval
    ? "Operator review is required before the next step."
    : nextTriggerLabel
      ? `Next routine: ${nextTriggerLabel}.`
      : triggerHealth
        ? "Automations are armed and standing by."
        : "No queued interventions.";

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportMode(resolveViewportMode(window.innerWidth));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        dockSurface === "none" &&
        hudSurface === "none" &&
        (leftRailState !== "collapsed" || rightRailState !== "collapsed")
      ) {
        collapseRailsSafe();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [collapseRailsSafe, dockSurface, hudSurface, leftRailState, rightRailState]);

  useEffect(() => {
    if (dockSurface !== "none" || hudSurface !== "none") {
      collapseRailsSafe();
    }
  }, [collapseRailsSafe, dockSurface, hudSurface]);

  const renderDesktop = () => (
    <div className="relative flex-1 overflow-visible px-5 pb-24 pt-4">
      <div className="pro-streamer-stage relative h-full overflow-visible rounded-[34px] border border-white/8 bg-[#05070b] shadow-[0_22px_64px_rgba(0,0,0,0.34)]">
        <div className="absolute inset-0 rounded-[34px] bg-[radial-gradient(860px_420px_at_50%_18%,rgba(255,255,255,0.03),transparent_58%),linear-gradient(180deg,rgba(0,0,0,0.74),rgba(0,0,0,0.96))]" />
        <MiladyStatusStrip />
        <div className="absolute inset-0 z-10">
          <AgentCore />
        </div>
      </div>

      <div className="absolute left-4 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
        <MiladyRailBubble
          title="Action Log"
          icon={<ActivityIcon width="16" height="16" />}
          side="left"
          state={leftRailState}
          badge={actionBadge}
          onToggleExpand={() =>
            setRailDisplay(
              "action-log",
              leftRailState === "expanded" ? "collapsed" : "expanded",
            )
          }
        />
      </div>

      <div className="absolute right-4 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
        <MiladyRailBubble
          title="Mission Stack"
          icon={<MissionIcon width="16" height="16" />}
          side="right"
          state={rightRailState}
          badge={missionBadge}
          onToggleExpand={() =>
            setRailDisplay(
              "mission-stack",
              rightRailState === "expanded" ? "collapsed" : "expanded",
            )
          }
        />
      </div>
    </div>
  );

  const renderTablet = () => (
    <div className="relative flex-1 overflow-y-auto px-3 pb-24 pt-3">
      <div className="pro-streamer-stage relative overflow-hidden rounded-[28px] border border-white/8 bg-[#05070b] shadow-[0_18px_48px_rgba(0,0,0,0.34)]">
        <div className="absolute inset-0 bg-[radial-gradient(720px_420px_at_50%_18%,rgba(255,255,255,0.03),transparent_58%),linear-gradient(180deg,rgba(0,0,0,0.78),rgba(0,0,0,0.96))]" />
        <MiladyStatusStrip />
        <div className="relative z-10 h-[min(44rem,calc(100dvh-11rem))] min-h-[34rem] pt-2">
          <AgentCore />
        </div>
      </div>
    </div>
  );

  const renderMobile = () => (
    <div className="relative flex-1 overflow-y-auto px-2 pb-32 pt-2">
      <div className="pro-streamer-stage relative overflow-hidden rounded-[24px] border border-white/8 bg-[#05070b] shadow-[0_16px_40px_rgba(0,0,0,0.34)]">
        <div className="absolute inset-0 bg-[radial-gradient(520px_320px_at_50%_18%,rgba(255,255,255,0.03),transparent_58%),linear-gradient(180deg,rgba(0,0,0,0.8),rgba(0,0,0,0.96))]" />
        <MiladyStatusStrip />
        <div className="relative z-10 h-[min(38rem,calc(100dvh-10.5rem))] min-h-[31rem] pt-2">
          <AgentCore />
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-surface font-body text-txt">
      {viewportMode === "desktop"
        ? renderDesktop()
        : viewportMode === "tablet"
          ? renderTablet()
          : renderMobile()}

      {viewportMode !== "desktop" ? (
        <div className="pointer-events-none absolute bottom-22 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 px-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/62 px-2 py-2 shadow-[0_14px_40px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
            <Button
              variant={activeBubble === "action-log" ? "secondary" : "outline"}
              size="icon"
              aria-label="Open action log"
              aria-haspopup="dialog"
              aria-expanded={leftRailState === "expanded"}
              title="Action Log"
              className="relative rounded-full"
              onClick={() =>
                setRailDisplay(
                  "action-log",
                  leftRailState === "expanded" ? "collapsed" : "expanded",
                )
              }
            >
              <ActivityIcon className="h-4 w-4" />
              {actionBadge ? (
                <Badge variant="outline" className="absolute -right-1 -top-1 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]">
                  {actionBadge}
                </Badge>
              ) : null}
            </Button>
            <Button
              variant={activeBubble === "mission-stack" ? "secondary" : "outline"}
              size="icon"
              aria-label="Open mission stack"
              aria-haspopup="dialog"
              aria-expanded={rightRailState === "expanded"}
              title="Mission Stack"
              className="relative rounded-full"
              onClick={() =>
                setRailDisplay(
                  "mission-stack",
                  rightRailState === "expanded" ? "collapsed" : "expanded",
                )
              }
            >
              <MissionIcon className="h-4 w-4" />
              {missionBadge ? (
                <Badge variant={awaitingApproval ? "danger" : "outline"} className="absolute -right-1 -top-1 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]">
                  {missionBadge}
                </Badge>
              ) : null}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center justify-center px-4">
        <div className="pointer-events-auto">
          <CommandDock
            activeSurface={activeSurface}
            onOpenThreads={() => openDockSurface("threads")}
            onOpenMemory={() => openDockSurface("memory")}
            onOpenOps={() => openDockSurface("ops")}
            onOpenVault={() => openHudAssetVault(assetVaultSection as AssetVaultSection)}
            onOpenControlStack={() => openHudControlStack(controlStackSection, tab)}
          />
        </div>
      </div>

      <ThreadsDrawer open={dockSurface === "threads"} onClose={closeHudSurface} />
      <MemoryDrawer open={dockSurface === "memory"} onClose={closeHudSurface} />
      <OpsDrawer open={dockSurface === "ops"} onClose={closeHudSurface} />
      <AssetVaultDrawer
        open={dockSurface === "vault" && Boolean(assetVaultSection)}
        section={(assetVaultSection ?? "identity") as AssetVaultSection}
        onClose={closeHudSurface}
      />
      <ControlStackModal
        open={hudSurface === "control-stack"}
        section={controlStackSection}
        onClose={closeHudSurface}
      />

      <Sheet
        open={leftRailState === "expanded"}
        side={viewportMode === "desktop" ? "left" : "bottom"}
        onClose={collapseRails}
        compact={viewportMode === "desktop"}
        className={viewportMode === "desktop" ? "w-[min(18rem,92vw)]" : "h-[min(24rem,78vh)]"}
      >
        <div className={`pro-streamer-summary-sheet flex min-h-0 flex-col ${viewportMode === "desktop" ? "max-h-[15rem]" : "h-full"}`}>
          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
            <div className="text-sm font-medium text-white/90">Action Log</div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={collapseRails}
              aria-label="Close action log"
            >
              <CloseIcon className="h-4 w-4" />
            </Button>
          </div>
          {safeAutonomousEvents.length === 0 ? (
            <div className="px-4 pb-4 pt-4">
              <SectionEmptyState
                title="No public actions yet"
                description="Public-safe activity summaries will appear here once the agent starts working."
                className="pro-streamer-empty-compact border-none bg-transparent shadow-none"
              />
            </div>
          ) : (
            <div className={`min-h-0 ${viewportMode === "desktop" ? "overflow-y-auto" : "flex-1 overflow-hidden"}`}>
              <CognitiveTracePanel embedded />
            </div>
          )}
        </div>
      </Sheet>

      <Sheet
        open={rightRailState === "expanded"}
        side={viewportMode === "desktop" ? "right" : "bottom"}
        onClose={collapseRails}
        compact={viewportMode === "desktop"}
        className={viewportMode === "desktop" ? "w-[min(18rem,92vw)]" : "h-[min(24rem,78vh)]"}
      >
        <div className={`pro-streamer-summary-sheet flex min-h-0 flex-col ${viewportMode === "desktop" ? "max-h-[15rem]" : "h-full"}`}>
          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
            <div className="text-sm font-medium text-white/90">Mission Stack</div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={collapseRails}
              aria-label="Close mission stack"
            >
              <CloseIcon className="h-4 w-4" />
            </Button>
          </div>
          {safeTriggers.length === 0 && !awaitingApproval ? (
            <div className="px-4 pb-4 pt-4">
              <SectionEmptyState
                title="No queued interventions"
                description="Approvals and scheduled routines will appear here when operator input is needed."
                className="pro-streamer-empty-compact border-none bg-transparent shadow-none"
              />
            </div>
          ) : (
            <div className={`min-h-0 ${viewportMode === "desktop" ? "overflow-y-auto" : "flex-1 overflow-hidden"}`}>
              <MissionQueuePanel embedded />
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
