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
import { GoLiveModal } from "./GoLiveModal.js";
import { MiladyRailBubble } from "./MiladyRailBubble.js";
import { SectionEmptyState } from "./SectionStates.js";
import {
  AVATAR_EMOTE_GROUP_ICONS,
  AVATAR_EMOTE_GROUP_LABELS,
  AVATAR_EMOTE_GROUP_ORDER,
  getAvatarEmoteIcon,
} from "../avatarEmoteUi.js";
import { Sheet } from "./ui/Sheet.js";
import { Button } from "./ui/Button.js";
import { Badge } from "./ui/Badge.js";
import { Card } from "./ui/Card.js";
import {
  ActivityIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  MissionIcon,
  StopIcon,
} from "./ui/Icons.js";
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
    actionLogInlineNotice,
    chatSending,
    chatFirstTokenReceived,
    autonomousEvents,
    agentStatus,
    triggers,
    quickLayerStatuses,
    availableEmotes,
    activeAvatarEmoteId,
    avatarMotionMode,
    activeGameViewerUrl,
    activeGameDisplayName,
    gameOverlayEnabled,
    openDockSurface,
    closeDockSurface,
    openHudControlStack,
    openHudAssetVault,
    closeHudSurface,
    runQuickLayer,
    openGoLiveModal,
    dismissActionLogInlineNotice,
    playAvatarEmote,
    stopAvatarEmote,
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
  const [avatarActionsExpanded, setAvatarActionsExpanded] = useState(false);

  const controlStackSection =
    hudControlSection ?? controlSectionForTab(tab) ?? "settings";
  const assetVaultSection =
    hudAssetSection ?? assetVaultSectionForTab(tab) ?? "identity";
  const activeSurface =
    hudSurface === "control-stack" ? "control-stack" : dockSurface;
  const executing = chatSending || chatFirstTokenReceived;
  const actionBadge = actionLogInlineNotice
    ? "!"
    : executing
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
  const activeAvatarEmote = useMemo(
    () =>
      activeAvatarEmoteId
        ? availableEmotes.find((emote) => emote.id === activeAvatarEmoteId) ?? null
        : null,
    [activeAvatarEmoteId, availableEmotes],
  );
  const drawerAvatarActions = useMemo(
    () =>
      availableEmotes
        .filter((emote) => !emote.idleVariant)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [availableEmotes],
  );
  const pinnedAvatarActions = useMemo(
    () => drawerAvatarActions.filter((emote) => emote.pinnedInActionDrawer),
    [drawerAvatarActions],
  );
  const moreAvatarActions = useMemo(() => {
    const groups = new Map<
      (typeof AVATAR_EMOTE_GROUP_ORDER)[number],
      typeof drawerAvatarActions
    >();

    for (const group of AVATAR_EMOTE_GROUP_ORDER) {
      if (group === "idle") continue;
      const motions = drawerAvatarActions.filter(
        (emote) => !emote.pinnedInActionDrawer && emote.drawerGroup === group,
      );
      if (motions.length > 0) {
        groups.set(group, motions);
      }
    }

    return groups;
  }, [drawerAvatarActions]);
  const avatarMotionLabel =
    avatarMotionMode === "idle"
      ? "Idle pool active"
      : activeAvatarEmote
        ? `${avatarMotionMode === "manual" ? "Manual" : "Auto"}: ${activeAvatarEmote.name}`
        : avatarMotionMode === "manual"
          ? "Manual motion"
          : "Auto motion";

  const renderActionLogInlineNotice = () => {
    if (!actionLogInlineNotice) return null;
    const toneClasses =
      actionLogInlineNotice.tone === "warning"
        ? "border-warn/24 bg-warn/10 text-warn"
        : actionLogInlineNotice.tone === "error"
          ? "border-danger/24 bg-danger/10 text-danger"
          : actionLogInlineNotice.tone === "success"
            ? "border-ok/24 bg-ok/10 text-ok"
            : "border-accent/24 bg-accent/10 text-accent";

    return (
      <Card
        className={`rounded-[22px] border px-4 py-3 shadow-none ${toneClasses}`}
        data-action-log-inline-notice
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.22em] opacity-70">
              {actionLogInlineNotice.title ?? "Action Log"}
            </div>
            <div className="mt-1 text-sm leading-relaxed">
              {actionLogInlineNotice.message}
            </div>
            {actionLogInlineNotice.actionLabel ? (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  data-action-log-inline-cta
                  onClick={() => setRailDisplay("action-log", "expanded")}
                >
                  {actionLogInlineNotice.actionLabel}
                </Button>
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Dismiss action log notice"
            onClick={dismissActionLogInlineNotice}
          >
            <CloseIcon className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    );
  };

  const renderActionLogLiveDock = () => (
    <div
      className="border-b border-white/8 pb-3.5"
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
      <div className="mt-2.5 flex flex-wrap gap-2">
        {liveTrayActions.map((action) => {
          const status = quickLayerStatuses[action.id];
          const isGoLiveAction = action.id === "go-live";
          return (
            <Button
              key={action.id}
              type="button"
              variant={
                isGoLiveAction || status !== "disabled" ? "secondary" : "outline"
              }
              size="sm"
              className="rounded-full"
              disabled={!isGoLiveAction && status === "disabled"}
              onClick={() =>
                isGoLiveAction
                  ? openGoLiveModal()
                  : void runQuickLayer(action.id)
              }
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

      <div className="mt-3.5 border-t border-white/8 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/46">
              <ActivityIcon className="h-3.5 w-3.5" />
              Avatar Actions
            </div>
            <div className="mt-1 text-sm leading-relaxed text-white/68">
              Trigger Alice motions directly here. She can still choose her own contextual motions in chat.
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">
            {avatarMotionMode === "idle" ? "Idle" : "Active"}
          </Badge>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-white/48">
          {activeAvatarEmote ? (
            (() => {
              const ActiveIcon = getAvatarEmoteIcon(activeAvatarEmote);
              return <ActiveIcon className="h-3.5 w-3.5" />;
            })()
          ) : (
            <ActivityIcon className="h-3.5 w-3.5" />
          )}
          <span>{avatarMotionLabel}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {pinnedAvatarActions.map((action) => {
            const ActionIcon = getAvatarEmoteIcon(action);
            const isActive = activeAvatarEmoteId === action.id;
            return (
              <Button
                key={action.id}
                type="button"
                variant={isActive ? "secondary" : "outline"}
                size="sm"
                className="rounded-full pl-2.5"
                onClick={() => void playAvatarEmote(action.id)}
              >
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/18">
                  <ActionIcon className="h-3.5 w-3.5" />
                </span>
                {action.name}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full pl-2.5"
            onClick={stopAvatarEmote}
          >
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/18">
              <StopIcon className="h-3.5 w-3.5" />
            </span>
            Stop
          </Button>
        </div>
        {moreAvatarActions.size > 0 ? (
          <div className="mt-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full px-3 text-white/72 hover:text-white"
              onClick={() => setAvatarActionsExpanded((current) => !current)}
            >
              {avatarActionsExpanded ? (
                <ChevronUpIcon className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <ChevronDownIcon className="mr-1.5 h-3.5 w-3.5" />
              )}
              More Motions
            </Button>
            {avatarActionsExpanded ? (
              <div className="mt-2.5 space-y-2.5">
                {Array.from(moreAvatarActions.entries()).map(([group, motions]) => {
                  const GroupIcon = AVATAR_EMOTE_GROUP_ICONS[group];
                  return (
                    <div key={group}>
                      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
                        <GroupIcon className="h-3.5 w-3.5" />
                        {AVATAR_EMOTE_GROUP_LABELS[group]}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {motions.map((motion) => {
                          const MotionIcon = getAvatarEmoteIcon(motion);
                          const isActive = activeAvatarEmoteId === motion.id;
                          return (
                            <Button
                              key={motion.id}
                              type="button"
                              variant={isActive ? "secondary" : "outline"}
                              size="sm"
                              className="rounded-full pl-2.5"
                              onClick={() => void playAvatarEmote(motion.id)}
                            >
                              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/18">
                                <MotionIcon className="h-3.5 w-3.5" />
                              </span>
                              {motion.name}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
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
      <GoLiveModal />

      <Sheet
        open={leftRailState === "expanded"}
        side={viewportMode === "desktop" ? "left" : "bottom"}
        onClose={collapseRails}
        floating={viewportMode === "desktop"}
        className={viewportMode === "desktop" ? undefined : "h-[80dvh]"}
      >
        <div
          className="pro-streamer-summary-sheet flex h-full min-h-0 flex-col overflow-hidden"
          data-action-log-shell
        >
          <div
            className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/8 bg-[rgba(9,13,20,0.96)] px-4 py-3 backdrop-blur-xl"
            data-action-log-header
          >
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
          <div className="shrink-0 border-b border-white/8" data-action-log-pinned-region>
            <div className="max-h-[min(38vh,28rem)] overflow-y-auto overscroll-contain px-4 py-3">
              <div data-action-log-inline-notice-slot>{renderActionLogInlineNotice()}</div>
              {renderActionLogLiveDock()}
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
            data-action-log-feed-region
          >
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
