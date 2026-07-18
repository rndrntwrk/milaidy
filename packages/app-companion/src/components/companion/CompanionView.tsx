// Static import: CharacterEditor is statically re-exported by app-core's
// browser entry, so the previous lazy() was eagerly merged back into the
// main chunk. Drop the wrapper to silence the dynamic↔static collision
// warning and remove the unnecessary Suspense boundary overhead.

import { PtyConsoleSidePanel } from "@elizaos/app-task-coordinator";
import {
  Button,
  CharacterEditor,
  ChatModalView,
  useApp,
  useMediaQuery,
  usePtySessions,
  useRenderGuard,
} from "@elizaos/ui";
import {
  memo,
  Suspense,
  type SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CompanionGoLiveModal } from "../operator/CompanionGoLiveModal";
import { CompanionStageOperatorOverlay } from "../operator/CompanionStageOperatorOverlay";
import { OperatorPill } from "../operator/OperatorPrimitives";
import { useCompanionStageOperator } from "../operator/useCompanionStageOperator";
import { CompanionHeader, type CompanionShellView } from "./CompanionHeader";
import { CompanionSceneHost } from "./CompanionSceneHost";
import { CompanionSettingsPanel } from "./CompanionSettingsPanel";
import { useCompanionSceneStatus } from "./companion-scene-status-context";
import { EmotePicker } from "./EmotePicker";
import { InferenceCloudAlertButton } from "./InferenceCloudAlertButton";
import { resolveCompanionInferenceNotice } from "./resolve-companion-inference-notice";
import { HEADER_BUTTON_STYLE } from "./shell-control-styles";

const COMPANION_UI_REVEAL_FALLBACK_MS = 1400;
const COMPANION_DOCK_HEIGHT = "min(42vh, 24rem)";
const SHELL_MODE_MOBILE_MEDIA_QUERY = "(max-width: 639px)";
const ALICE_GO_LIVE_STRIP_CLASSNAME =
  "pointer-events-auto inline-flex max-w-full items-center gap-1 rounded-lg border border-white/12 bg-black/48 px-1.5 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-xl";
const ALICE_GO_LIVE_BUTTON_CLASSNAME =
  "h-8 min-h-8 gap-2 rounded-lg border border-transparent px-3 text-[12px] font-semibold shadow-none transition-colors";
const ALICE_GO_LIVE_IDLE_CLASSNAME =
  "bg-white/[0.08] text-white/88 hover:bg-white/[0.12]";
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
  const [preferredMode, setPreferredMode] = useState<
    "camera" | "screen-share" | "play-games" | "reaction" | "radio"
  >("camera");
  const isMobileViewport = useMediaQuery(SHELL_MODE_MOBILE_MEDIA_QUERY);
  const liveDestinationName =
    operator.stream.activeDestination?.name?.trim() || null;
  const liveDestinationLabel = liveDestinationName
    ? liveDestinationName
        .split(",")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(" · ")
    : null;
  const liveStateLabel = t("statusbar.LiveShort", { defaultValue: "LIVE" });
  const goLiveLabel = t("statusbar.GoLive");
  const endLiveLabel = t("aliceoperator.action.endLive", {
    defaultValue: "End Live",
  });
  const liveActionLabel = operator.stream.live ? liveStateLabel : goLiveLabel;
  const actionAriaLabel = operator.stream.live ? endLiveLabel : goLiveLabel;
  const buttonTitle = operator.stream.live
    ? liveDestinationName
      ? t("aliceoperator.headerLiveDestinationTitle", {
          destination: liveDestinationName,
          defaultValue: `Live on ${liveDestinationName}. Click to end live.`,
        })
      : t("aliceoperator.headerLiveTitle", {
          defaultValue: "Alice is live. Click to end live.",
        })
    : operator.stream.available
      ? liveActionLabel
      : t("statusbar.InstallStreamingPlugin");
  const buttonClassName = `${ALICE_GO_LIVE_BUTTON_CLASSNAME} ${
    operator.stream.live
      ? ALICE_GO_LIVE_LIVE_CLASSNAME
      : ALICE_GO_LIVE_IDLE_CLASSNAME
  } ${isMobileViewport ? "!w-8 min-w-8 px-0" : ""}`;

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
          {operator.stream.live ? (
            <span className="pointer-events-none inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.14)]" />
          ) : (
            <AliceConnectionIcon className="pointer-events-none h-3.5 w-3.5 shrink-0" />
          )}
          {isMobileViewport ? null : (
            <span className="pointer-events-none">{liveActionLabel}</span>
          )}
        </Button>
        {operator.stream.live && liveDestinationLabel && !isMobileViewport ? (
          <OperatorPill
            tone="neutral"
            className={ALICE_GO_LIVE_DESTINATION_PILL_CLASSNAME}
            title={liveDestinationName ?? undefined}
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
 * Isolated wrapper for the PTY side panel so that CompanionViewOverlay doesn't
 * need to subscribe to ptySessions (which polls every 5 s) for a panel that is
 * only visible when the user has explicitly clicked a session.
 */
const CompanionPtyPanel = memo(function CompanionPtyPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const { ptySessions } = usePtySessions();
  if (ptySessions.length === 0) return null;
  return (
    <PtyConsoleSidePanel
      activeSessionId={sessionId}
      sessions={ptySessions}
      onClose={onClose}
    />
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
    setState,
    setTab,
    t,
  } = useApp();
  const operator = useCompanionStageOperator();

  const [companionView, setCompanionView] =
    useState<CompanionShellView>("companion");

  const [ptySidePanelSessionId, setPtySidePanelSessionId] = useState<
    string | null
  >(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const handleSidebarClose = useCallback(() => setHistoryOpen(false), []);
  const handlePtySessionClick = useCallback(
    (id: string) =>
      setPtySidePanelSessionId((prev) => (prev === id ? null : id)),
    [],
  );
  const handlePtyPanelClose = useCallback(
    () => setPtySidePanelSessionId(null),
    [],
  );
  const { avatarReady: sceneAvatarReady, teleportKey } =
    useCompanionSceneStatus();

  // Gate chat + header behind avatar load — don't show chat or play
  // greeting speech until the VRM finishes its teleport-in animation.
  const [avatarReadyFallbackKey, setAvatarReadyFallbackKey] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (sceneAvatarReady) {
      setAvatarReadyFallbackKey(null);
      return;
    }
    setAvatarReadyFallbackKey(null);
    const fallbackTimer = window.setTimeout(() => {
      setAvatarReadyFallbackKey(teleportKey);
    }, COMPANION_UI_REVEAL_FALLBACK_MS);
    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [sceneAvatarReady, teleportKey]);
  const avatarReady =
    sceneAvatarReady || avatarReadyFallbackKey === teleportKey;
  const showAliceGoLiveControl = avatarReady && operator.isAliceActive;
  const showAliceStageBubble = showAliceGoLiveControl;
  const hasCompanionMessages = conversationMessages.length > 0;

  const handleExitToDesktop = useCallback(() => {
    setState("activeOverlayApp", null);
    setTab("chat");
  }, [setState, setTab]);

  const handleSwitchToCharacter = useCallback(() => {
    setCompanionView("character");
  }, []);

  const handleOpenSettings = useCallback(() => {
    setCompanionView("settings");
  }, []);

  const handleSwitchToCompanion = useCallback(() => {
    setCompanionView("companion");
  }, []);

  useEffect(() => {
    setState(
      "chatMode",
      elizaCloudEnabled || elizaCloudConnected ? "power" : "simple",
    );
  }, [elizaCloudConnected, elizaCloudEnabled, setState]);

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
          onOpenSettings={handleOpenSettings}
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
          className="companion-chat-dock pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex justify-center px-1.5 sm:px-4"
          data-companion-chat-empty={!hasCompanionMessages || undefined}
          style={{
            paddingBottom: "calc(var(--safe-area-bottom, 0px) + 0.75rem)",
          }}
        >
          <div
            className="relative w-full max-w-5xl min-w-0"
            style={{
              height: hasCompanionMessages ? COMPANION_DOCK_HEIGHT : "7rem",
              minHeight: hasCompanionMessages ? "17rem" : "5.75rem",
            }}
          >
            <ChatModalView
              variant="companion-dock"
              showSidebar={historyOpen}
              onSidebarClose={handleSidebarClose}
              onPtySessionClick={handlePtySessionClick}
            />
          </div>
        </div>
      )}

      {avatarReady && companionView === "character" && (
        <Suspense fallback={null}>
          <CharacterEditor sceneOverlay />
        </Suspense>
      )}

      {avatarReady && companionView === "settings" && (
        <CompanionSettingsPanel />
      )}

      {/* PTY console side panel */}
      {ptySidePanelSessionId && companionView === "companion" && (
        <div className="pointer-events-auto">
          <CompanionPtyPanel
            sessionId={ptySidePanelSessionId}
            onClose={handlePtyPanelClose}
          />
        </div>
      )}

      <EmotePicker />

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
