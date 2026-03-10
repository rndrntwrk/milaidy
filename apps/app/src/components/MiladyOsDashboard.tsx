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
} from "./AssetVaultDrawer.js";
import { ControlStackModal } from "./ControlStackModal.js";
import { MiladyRailBubble } from "./MiladyRailBubble.js";
import { SectionEmptyState } from "./SectionStates.js";
import { Sheet } from "./ui/Sheet.js";
import { Button } from "./ui/Button.js";
import { Badge } from "./ui/Badge.js";
import { ActivityIcon, CloseIcon, MissionIcon } from "./ui/Icons.js";
import {
  assetVaultSectionForTab,
  controlSectionForTab,
  type HudAssetSection,
} from "../miladyHudRouting.js";

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
    quickLayerStatuses,
    activeGameViewerUrl,
    activeGameDisplayName,
    gameOverlayEnabled,
    openDockSurface,
    closeDockSurface,
    openHudControlStack,
    openHudAssetVault,
    closeHudSurface,
    runQuickLayer,
    setState,
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
    hudControlSection ?? controlSectionForTab(tab) ?? "settings";
  const assetVaultSection =
    hudAssetSection ?? assetVaultSectionForTab(tab) ?? "identity";
  const activeSurface =
    hudSurface === "control-stack" ? "control-stack" : dockSurface;
  const executing = chatSending || chatFirstTokenReceived;
  const actionBadge = executing
    ? "•"
    : safeAutonomousEvents.length > 0
      ? `${Math.min(safeAutonomousEvents.length, 9)}`
      : undefined;
  const awaitingApproval = (agentStatus?.state ?? "").toLowerCase().includes("approval");
  const missionBadge = awaitingApproval
    ? "!"
    : safeTriggers.length > 0
      ? `${Math.min(safeTriggers.length, 9)}`
      : undefined;
  const liveTrayActions = [
    { id: "go-live", label: "Go Live" },
    { id: "screen-share", label: "Screen Share" },
    { id: "play-games", label: "Play Games" },
    { id: "ads", label: "Ads" },
    { id: "reaction-segment", label: "Reaction" },
    { id: "end-live", label: "End Live" },
  ] as const;
  const hasActiveGame = activeGameViewerUrl.trim().length > 0;

  const renderActionLogLiveDock = () => (
    <div
      className="border-b border-white/8 px-4 py-4"
      data-action-log-live-controls
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">
            Live Controls
          </div>
          <div className="mt-1 text-sm leading-relaxed text-white/68">
            Quick broadcast actions stay pinned here while the public action feed scrolls below.
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          Pinned
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {liveTrayActions.map((action) => {
          const status = quickLayerStatuses[action.id];
          return (
            <Button
              key={action.id}
              type="button"
              variant={status === "disabled" ? "outline" : "secondary"}
              size="sm"
              className="rounded-full"
              disabled={status === "disabled"}
              onClick={() => void runQuickLayer(action.id)}
            >
              {action.label}
            </Button>
          );
        })}
        {hasActiveGame ? (
          <Button
            type="button"
            variant={gameOverlayEnabled ? "secondary" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setState("gameOverlayEnabled", true)}
          >
            {gameOverlayEnabled
              ? `Viewing ${activeGameDisplayName || "game"}`
              : `Resume ${activeGameDisplayName || "Game"}`}
          </Button>
        ) : null}
      </div>
    </div>
  );

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
      <div className="pro-streamer-stage relative h-full overflow-hidden rounded-[34px] border border-white/8 bg-transparent shadow-[0_22px_64px_rgba(0,0,0,0.34)]">
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
      <div className="pro-streamer-stage relative overflow-hidden rounded-[28px] border border-white/8 bg-transparent shadow-[0_18px_48px_rgba(0,0,0,0.34)]">
        <MiladyStatusStrip />
        <div className="relative z-10 h-[min(44rem,calc(100dvh-11rem))] min-h-[34rem] pt-2">
          <AgentCore />
        </div>
      </div>
    </div>
  );

  const renderMobile = () => (
    <div className="relative flex-1 overflow-y-auto px-2 pb-32 pt-2">
      <div className="pro-streamer-stage relative overflow-hidden rounded-[24px] border border-white/8 bg-transparent shadow-[0_16px_40px_rgba(0,0,0,0.34)]">
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
            onOpenVault={() => openHudAssetVault(assetVaultSection)}
            onOpenControlStack={() => openHudControlStack(controlStackSection, tab)}
          />
        </div>
      </div>

      <ThreadsDrawer open={dockSurface === "threads"} onClose={closeDockSurface} />
      <MemoryDrawer open={dockSurface === "memory"} onClose={closeDockSurface} />
      <OpsDrawer open={dockSurface === "ops"} onClose={closeDockSurface} />
      <AssetVaultDrawer
        open={dockSurface === "vault" && Boolean(assetVaultSection)}
        section={(assetVaultSection ?? "identity") as HudAssetSection}
        onClose={closeDockSurface}
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
        className={
          viewportMode === "desktop"
            ? "w-[min(22rem,92vw)] sm:max-h-[min(34rem,calc(100vh-8rem))] md:max-h-[min(36rem,calc(100vh-9rem))]"
            : "h-[min(28rem,82vh)]"
        }
      >
        <div className="pro-streamer-summary-sheet flex h-full min-h-0 flex-col">
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
          {renderActionLogLiveDock()}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
            <CognitiveTracePanel mode="content" />
          </div>
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
