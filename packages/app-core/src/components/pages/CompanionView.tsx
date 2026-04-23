import { useMediaQuery, useRenderGuard } from "@miladyai/app-core/hooks";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SVGProps,
} from "react";
import { ChatModalView } from "./ChatModalView";
import { useCompanionSceneStatus } from "../companion/companion-scene-status-context";
import {
  CompanionHeader,
  type CompanionShellView,
} from "../companion/CompanionHeader";
import { CompanionSceneHost } from "../companion/CompanionSceneHost";
import { HEADER_BUTTON_STYLE } from "../companion/shell-control-styles";
import { InferenceCloudAlertButton } from "../companion/InferenceCloudAlertButton";
import { resolveCompanionInferenceNotice } from "../companion/resolve-companion-inference-notice";
import { PtyConsoleSidePanel } from "../coding/PtyConsoleSidePanel";
import { CompanionGoLiveModal } from "../operator/CompanionGoLiveModal";
import { OperatorPill } from "../operator/OperatorPrimitives";
import { CompanionStageOperatorOverlay } from "../operator/CompanionStageOperatorOverlay";
import { useCompanionStageOperator } from "../operator/useCompanionStageOperator";

const CharacterEditor = lazy(() =>
  import("../character/CharacterEditor").then((m) => ({
    default: m.CharacterEditor,
  })),
);

const COMPANION_UI_REVEAL_FALLBACK_MS = 1400;
const COMPANION_DOCK_HEIGHT = "min(42vh, 24rem)";
const SHELL_MODE_MOBILE_MEDIA_QUERY = "(max-width: 639px)";
const ALICE_STAGE_BUBBLE_HIDE_MEDIA_QUERY = "(max-width: 767px)";
const ALICE_GO_LIVE_STRIP_CLASSNAME =
  "pointer-events-auto inline-flex max-w-full items-center gap-1 rounded-lg border border-white/12 bg-black/48 px-1.5 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-xl";
const ALICE_GO_LIVE_BUTTON_CLASSNAME =
  "h-8 min-h-8 gap-2 rounded-lg border border-transparent px-3 text-[12px] font-semibold shadow-none transition-colors";
const ALICE_GO_LIVE_IDLE_CLASSNAME =
  "bg-white/[0.08] text-white/88 hover:bg-white/[0.12]";
// STARTING: cooler neutral tint (slate/blue) — distinct from DEGRADED's amber
// so a cold boot doesn't read as a delivery failure. Intentionally calmer
// than LIVE/DEGRADED since the operator hasn't done anything wrong yet.
const ALICE_GO_LIVE_STARTING_CLASSNAME =
  "bg-[linear-gradient(180deg,#4a5a72,#36455a)] text-white hover:bg-[linear-gradient(180deg,#53647e,#3c4c63)]";
const ALICE_GO_LIVE_DEGRADED_CLASSNAME =
  "bg-[linear-gradient(180deg,#c98d1f,#a96d00)] text-white hover:bg-[linear-gradient(180deg,#d59a2d,#b87805)]";
const ALICE_GO_LIVE_LIVE_CLASSNAME =
  "bg-[linear-gradient(180deg,#ef5a50,#d83d35)] text-white hover:bg-[linear-gradient(180deg,#f36960,#df463e)]";
const ALICE_GO_LIVE_DESTINATION_PILL_CLASSNAME =
  "pointer-events-none max-w-[11rem] shrink-0 truncate rounded-lg border border-white/10 bg-white/[0.04] px-3 py-0 text-[12px] font-medium normal-case tracking-[0.01em] text-white/76 shadow-none";

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

const AliceGoLiveHeaderControl = memo(function AliceGoLiveHeaderControl({
  operator,
}: {
  operator: ReturnType<typeof useCompanionStageOperator>;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [preferredMode, setPreferredMode] = useState<"camera" | "screen-share" | "play-games" | "reaction" | "radio">("camera");
  const isMobileViewport = useMediaQuery(SHELL_MODE_MOBILE_MEDIA_QUERY);
  const liveDestinationName = operator.stream.activeDestination?.name?.trim() || null;
  const liveDestinationLabel = liveDestinationName
    ? liveDestinationName
        .split(",")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(" · ")
    : null;
  const liveStateLabel = t("statusbar.LiveShort", { defaultValue: "LIVE" });
  const degradedStateLabel = t("aliceoperator.streamDegraded", {
    defaultValue: "DEGRADED",
  });
  const startingStateLabel = t("aliceoperator.streamStarting", {
    defaultValue: "STARTING…",
  });
  const goLiveLabel = t("statusbar.GoLive");
  const endLiveLabel = t("aliceoperator.action.endLive", {
    defaultValue: "End Live",
  });
  // liveLike: any running state (live OR degraded OR starting). Clicking in
  // any of these calls endLive(), which is safe to invoke mid-boot — it
  // cancels the launch regardless of which phase the server is in.
  const liveLike =
    operator.stream.live ||
    operator.stream.degraded ||
    operator.stream.starting;
  const liveActionLabel = operator.stream.live
    ? liveStateLabel
    : operator.stream.degraded
      ? degradedStateLabel
      : operator.stream.starting
        ? startingStateLabel
        : goLiveLabel;
  const actionAriaLabel = liveLike ? endLiveLabel : goLiveLabel;
  const buttonTitle = operator.stream.live
    ? liveDestinationName
      ? t("aliceoperator.headerLiveDestinationTitle", {
          destination: liveDestinationName,
          defaultValue: `Live on ${liveDestinationName}. Click to end live.`,
        })
      : t("aliceoperator.headerLiveTitle", {
          defaultValue: "Alice is live. Click to end live.",
        })
    : operator.stream.degraded
      ? liveDestinationName
        ? t("aliceoperator.headerDegradedDestinationTitle", {
            destination: liveDestinationName,
            defaultValue: `Delivery is degraded on ${liveDestinationName}. Click to end live.`,
          })
        : t("aliceoperator.headerDegradedTitle", {
            defaultValue: "Delivery is degraded. Click to end live.",
          })
      : operator.stream.starting
        ? liveDestinationName
          ? t("aliceoperator.headerStartingDestinationTitle", {
              destination: liveDestinationName,
              defaultValue: `Starting stream to ${liveDestinationName}. Click to cancel.`,
            })
          : t("aliceoperator.headerStartingTitle", {
              defaultValue: "Starting stream. Click to cancel.",
            })
        : operator.stream.available
          ? liveActionLabel
          : t("statusbar.InstallStreamingPlugin");
  const buttonClassName = `${ALICE_GO_LIVE_BUTTON_CLASSNAME} ${
    operator.stream.live
      ? ALICE_GO_LIVE_LIVE_CLASSNAME
      : operator.stream.degraded
        ? ALICE_GO_LIVE_DEGRADED_CLASSNAME
        : operator.stream.starting
          ? ALICE_GO_LIVE_STARTING_CLASSNAME
          : ALICE_GO_LIVE_IDLE_CLASSNAME
  } ${isMobileViewport ? "!w-8 min-w-8 px-0" : ""}`;

  const handleClick = () => {
    if (liveLike) {
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
          variant="ghost"
          aria-label={actionAriaLabel}
          title={buttonTitle}
          className={buttonClassName}
          onClick={handleClick}
          onPointerDown={(event) => event.stopPropagation()}
          style={HEADER_BUTTON_STYLE}
          data-no-camera-drag="true"
          data-no-camera-zoom="true"
          data-testid="companion-header-go-live"
        >
          {liveLike ? (
            <span className="pointer-events-none inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.14)]" />
          ) : (
            <AliceConnectionIcon className="pointer-events-none h-3.5 w-3.5 shrink-0" />
          )}
          {isMobileViewport ? null : (
            <span className="pointer-events-none">{liveActionLabel}</span>
          )}
        </Button>
        {liveLike && liveDestinationLabel && !isMobileViewport ? (
          <OperatorPill
            tone="neutral"
            className={ALICE_GO_LIVE_DESTINATION_PILL_CLASSNAME}
            title={liveDestinationName}
            data-testid="companion-header-live-destination"
          >
            {liveDestinationLabel}
          </OperatorPill>
        ) : null}
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
    t,
  } = useApp();
  const operator = useCompanionStageOperator();
  const hideAliceStageBubble = useMediaQuery(ALICE_STAGE_BUBBLE_HIDE_MEDIA_QUERY);

  const [companionView, setCompanionView] =
    useState<CompanionShellView>("companion");

  const [ptySidePanelSessionId, setPtySidePanelSessionId] = useState<
    string | null
  >(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { avatarReady: sceneAvatarReady, teleportKey } =
    useCompanionSceneStatus();

  // Gate chat + header behind avatar load — don't show chat or play
  // greeting speech until the VRM finishes its teleport-in animation.
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

  const handleExitToDesktop = useCallback(() => {
    setState("activeOverlayApp", null);
    setTab("chat");
  }, [setState, setTab]);

  const handleSwitchToCharacter = useCallback(() => {
    setCompanionView("character");
  }, []);

  const handleSwitchToCompanion = useCallback(() => {
    setCompanionView("companion");
  }, []);

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
    setState("activeOverlayApp", null);
    navigation.scheduleAfterTabCommit(() => {
      setTab("settings");
      if (inferenceNotice.kind === "cloud") {
        setState("cloudDashboardView", "billing");
      }
    });
  }, [inferenceNotice, navigation, setState, setTab]);

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
          pointerEvents: avatarReady ? "auto" : "none",
        }}
      >
        <CompanionHeader
          activeView={companionView}
          onExitToDesktop={handleExitToDesktop}
          onExitToCharacter={handleSwitchToCharacter}
          onSwitchToCompanion={handleSwitchToCompanion}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          uiTheme={uiTheme}
          setUiTheme={setUiTheme}
          t={t}
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

      {avatarReady && companionView === "companion" && (
        <div
          // `companion-chat-dock` class is a stable hook used by the
          // shared DialogContent effect (packages/ui/.../dialog.tsx) to
          // hide the chat dock while any Dialog is open — the dock's
          // stacking context otherwise renders chat bubbles and the
          // compose bar above the Dialog overlay on the companion view.
          className="companion-chat-dock pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex justify-center px-1.5 sm:px-4"
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

      {avatarReady && companionView === "character" && (
        <Suspense fallback={null}>
          <CharacterEditor sceneOverlay />
        </Suspense>
      )}

      {/* PTY console side panel */}
      {ptySidePanelSessionId &&
        companionView === "companion" &&
        ptySessions.length > 0 && (
        <div className="pointer-events-auto">
          <PtyConsoleSidePanel
            activeSessionId={ptySidePanelSessionId}
            sessions={ptySessions}
            onClose={() => setPtySidePanelSessionId(null)}
          />
        </div>
      )}

      {/* Center (empty to show character) */}
      <div className="flex-1 grid grid-cols-[1fr_auto] gap-6 min-h-0 relative">
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
  return (
    <CompanionSceneHost active>
      <CompanionViewOverlay />
    </CompanionSceneHost>
  );
});
