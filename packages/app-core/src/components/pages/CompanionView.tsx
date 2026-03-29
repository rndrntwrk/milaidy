import { useMediaQuery, useRenderGuard } from "@miladyai/app-core/hooks";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import { memo, useCallback, useEffect, useMemo, useState, type SVGProps } from "react";
import { ChatModalView } from "./ChatModalView";
import { useCompanionSceneStatus } from "./companion-scene-status-context";
import { CompanionHeader } from "./companion/CompanionHeader";
import { HEADER_BUTTON_STYLE } from "./companion/ShellHeaderControls";
import {
  CompanionSceneHost,
  useSharedCompanionScene,
} from "./companion/CompanionSceneHost";
import { InferenceCloudAlertButton } from "./companion/InferenceCloudAlertButton";
import { resolveCompanionInferenceNotice } from "./companion/resolve-companion-inference-notice";
import { CompanionGoLiveModal } from "./operator/CompanionGoLiveModal";
import { CompanionStageOperatorOverlay } from "./operator/CompanionStageOperatorOverlay";
import { useCompanionStageOperator } from "./operator/useCompanionStageOperator";
import { PtyConsoleSidePanel } from "./PtyConsoleSidePanel";

const COMPANION_UI_REVEAL_FALLBACK_MS = 1400;
const COMPANION_DOCK_HEIGHT = "min(42vh, 24rem)";
const SHELL_MODE_MOBILE_MEDIA_QUERY = "(max-width: 639px)";
const ALICE_STAGE_BUBBLE_HIDE_MEDIA_QUERY = "(max-width: 767px)";
const ALICE_GO_LIVE_STRIP_CLASSNAME =
  "pointer-events-auto inline-flex h-11 min-h-[44px] max-w-full items-center !rounded-xl border border-white/10 bg-black/52 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.24)] ring-1 ring-inset ring-white/6 backdrop-blur-2xl";
const ALICE_GO_LIVE_BUTTON_CLASSNAME =
  "h-9 min-h-9 !rounded-[10px] px-3.5 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]";
const ALICE_GO_LIVE_IDLE_CLASSNAME =
  "border-accent/40 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.22),rgba(var(--accent-rgb),0.12))] text-txt-strong hover:border-accent/65 hover:bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.28),rgba(var(--accent-rgb),0.16))]";
const ALICE_GO_LIVE_LIVE_CLASSNAME =
  "border-danger/45 bg-[linear-gradient(180deg,rgba(239,68,68,0.92),rgba(220,38,38,0.86))] text-white hover:border-danger/70 hover:bg-[linear-gradient(180deg,rgba(239,68,68,0.98),rgba(220,38,38,0.92))]";

function AliceConnectionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="2.5" />
      <path d="M5 12a7 7 0 0 1 14 0" />
      <path d="M2.5 12a9.5 9.5 0 0 1 19 0" />
    </svg>
  );
}

function AliceStopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

const AliceGoLiveHeaderControl = memo(function AliceGoLiveHeaderControl({
  operator,
}: {
  operator: ReturnType<typeof useCompanionStageOperator>;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [preferredMode, setPreferredMode] = useState<"camera" | "screen-share" | "play-games" | "reaction" | "radio">("camera");
  const isMobileViewport = useMediaQuery(SHELL_MODE_MOBILE_MEDIA_QUERY);
  const liveActionLabel = operator.stream.live
    ? t("aliceoperator.action.endLive", { defaultValue: "End Live" })
    : t("statusbar.GoLive");
  const buttonTitle = operator.stream.live
    ? liveActionLabel
    : operator.stream.available
      ? liveActionLabel
      : t("statusbar.InstallStreamingPlugin");
  const buttonClassName = `${ALICE_GO_LIVE_BUTTON_CLASSNAME} ${
    operator.stream.live
      ? ALICE_GO_LIVE_LIVE_CLASSNAME
      : ALICE_GO_LIVE_IDLE_CLASSNAME
  } ${isMobileViewport ? "!w-9 min-w-9 px-0" : ""}`;

  const handleClick = () => {
    if (operator.stream.live) {
      void operator.stream.endLive();
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <div
        className={ALICE_GO_LIVE_STRIP_CLASSNAME}
        data-no-camera-drag="true"
        data-no-camera-zoom="true"
      >
        <Button
          type="button"
          size="sm"
          variant={operator.stream.live ? "destructive" : "secondary"}
          aria-label={liveActionLabel}
          title={buttonTitle}
          className={buttonClassName}
          onClick={handleClick}
          onPointerDown={(event) => event.stopPropagation()}
          style={HEADER_BUTTON_STYLE}
          data-no-camera-drag="true"
          data-no-camera-zoom="true"
          data-testid="companion-header-go-live"
        >
          {operator.stream.live ? (
            <AliceStopIcon className="pointer-events-none h-3.5 w-3.5 shrink-0" />
          ) : (
            <AliceConnectionIcon className="pointer-events-none h-3.5 w-3.5 shrink-0" />
          )}
          {isMobileViewport ? null : (
            <span className="pointer-events-none">{liveActionLabel}</span>
          )}
        </Button>
      </div>
      <CompanionGoLiveModal
        open={open}
        onOpenChange={setOpen}
        preferredMode={preferredMode}
        onPreferredModeChange={setPreferredMode}
        operator={operator}
      />
    </>
  );
});

/**
 * Inner overlay that subscribes to useApp() for frequently-changing data
 * (conversationMessages, chatLastUsage, etc.). Extracted so that
 * CompanionView itself doesn't subscribe — keeping the children prop
 * passed to CompanionSceneHost referentially stable and avoiding
 * cascading re-renders into the 3D scene.
 */
const CompanionViewOverlay = memo(function CompanionViewOverlay() {
  useRenderGuard("CompanionView");
  const {
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    chatAgentVoiceMuted,
    chatLastUsage,
    conversationMessages,
    elizaCloudAuthRejected,
    elizaCloudConnected,
    elizaCloudCreditsError,
    elizaCloudEnabled,
    handleNewConversation,
    navigation,
    onboardingHandoffPhase,
    ptySessions,
    setState,
    setTab,
    switchShellView,
    t,
  } = useApp();
  const operator = useCompanionStageOperator();
  const hideAliceStageBubble = useMediaQuery(ALICE_STAGE_BUBBLE_HIDE_MEDIA_QUERY);

  const [ptySidePanelSessionId, setPtySidePanelSessionId] = useState<
    string | null
  >(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { avatarReady: sceneAvatarReady, teleportKey } =
    useCompanionSceneStatus();

  // Gate chat + header behind avatar load — don't show chat or play
  // greeting speech until the VRM finishes its teleport-in animation.
  // When the shared scene is already ready (e.g. coming back from character
  // edit without changing avatars), reveal immediately from scene context.
  const [avatarReadyFallback, setAvatarReadyFallback] = useState(false);
  useEffect(() => {
    if (sceneAvatarReady) {
      setAvatarReadyFallback(false);
      return;
    }
    setAvatarReadyFallback(false);
    const fallbackTimer = window.setTimeout(() => {
      setAvatarReadyFallback(true);
    }, COMPANION_UI_REVEAL_FALLBACK_MS);
    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [sceneAvatarReady, teleportKey]);
  const onboardingHandoffActive =
    onboardingHandoffPhase != null && onboardingHandoffPhase !== "idle";
  const avatarReady =
    sceneAvatarReady || avatarReadyFallback || onboardingHandoffActive;
  const showAliceGoLiveControl = avatarReady && operator.isAliceActive;
  const showAliceStageBubble = showAliceGoLiveControl && !hideAliceStageBubble;

  const handleShellViewChange = useCallback(
    (view: "companion" | "character" | "desktop") => {
      switchShellView(view);
    },
    [switchShellView],
  );

  useEffect(() => {
    setState("chatMode", "simple");
  }, [setState]);

  const hasInterruptedAssistant = useMemo(
    () =>
      conversationMessages.some((m) => m.role === "assistant" && m.interrupted),
    [conversationMessages],
  );

  const inferenceNotice = useMemo(
    () =>
      resolveCompanionInferenceNotice({
        elizaCloudConnected,
        elizaCloudAuthRejected,
        elizaCloudCreditsError,
        elizaCloudEnabled,
        chatLastUsageModel: chatLastUsage?.model,
        hasInterruptedAssistant,
        t,
      }),
    [
      chatLastUsage?.model,
      elizaCloudAuthRejected,
      elizaCloudConnected,
      elizaCloudCreditsError,
      elizaCloudEnabled,
      hasInterruptedAssistant,
      t,
    ],
  );

  const handleInferenceAlertClick = useCallback(() => {
    if (!inferenceNotice) return;
    switchShellView("desktop");
    navigation.scheduleAfterTabCommit(() => {
      setTab("settings");
      if (inferenceNotice.kind === "cloud") {
        setState("cloudDashboardView", "billing");
      }
    });
  }, [inferenceNotice, navigation, setState, setTab, switchShellView]);

  const companionHeaderRightExtras = (
    <>
      {inferenceNotice ? (
        <InferenceCloudAlertButton
          notice={inferenceNotice}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleInferenceAlertClick}
        />
      ) : null}
    </>
  );

  return (
    <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
      <div
        style={{
          opacity: avatarReady ? 1 : 0,
          transition: "opacity 0.35s ease-out",
          // Explicit auto so header hit-testing is not ambiguous under a `pointer-events-none` ancestor.
          pointerEvents: avatarReady ? "auto" : "none",
        }}
      >
        <CompanionHeader
          activeShellView="companion"
          onShellViewChange={handleShellViewChange}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          uiTheme={uiTheme}
          setUiTheme={setUiTheme}
          t={t}
          showCompanionControls
          chatAgentVoiceMuted={chatAgentVoiceMuted}
          onToggleVoiceMute={() =>
            setState("chatAgentVoiceMuted", !chatAgentVoiceMuted)
          }
          onNewChat={() => void handleNewConversation()}
          companionControlsExtras={
            showAliceGoLiveControl ? (
              <AliceGoLiveHeaderControl operator={operator} />
            ) : null
          }
          rightExtras={companionHeaderRightExtras}
        />
      </div>

      {showAliceStageBubble ? (
        <CompanionStageOperatorOverlay operator={operator} />
      ) : null}

      {avatarReady && (
        <div
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex justify-center px-1.5 sm:px-4"
          style={{
            paddingBottom: "calc(var(--safe-area-bottom, 0px) + 0.75rem)",
          }}
        >
          <div
            className="relative w-full max-w-5xl min-w-0"
            style={{ height: COMPANION_DOCK_HEIGHT, minHeight: "17rem" }}
          >
            <ChatModalView
              variant="companion-dock"
              showSidebar={historyOpen}
              onSidebarClose={() => setHistoryOpen(false)}
              showAgentActivityBox
              onPtySessionClick={(id) =>
                setPtySidePanelSessionId((prev) => (prev === id ? null : id))
              }
            />
          </div>
        </div>
      )}

      {/* PTY console side panel */}
      {ptySidePanelSessionId && ptySessions.length > 0 && (
        <div className="pointer-events-auto">
          <PtyConsoleSidePanel
            activeSessionId={ptySidePanelSessionId}
            sessions={ptySessions}
            onClose={() => setPtySidePanelSessionId(null)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-[1fr_auto] gap-6 min-h-0 relative">
        {/* Center (Empty to show character) */}
        <div className="w-full h-full" />
      </div>
    </div>
  );
});

/**
 * CompanionView — thin shell that composes CompanionSceneHost + overlay.
 * Does NOT subscribe to useApp() so CompanionSceneHost receives stable
 * children and avoids re-rendering the 3D scene on unrelated state changes.
 */
export const CompanionView = memo(function CompanionView() {
  const hasSharedCompanionScene = useSharedCompanionScene();

  return hasSharedCompanionScene ? (
    <CompanionViewOverlay />
  ) : (
    <CompanionSceneHost active>
      <CompanionViewOverlay />
    </CompanionSceneHost>
  );
});
