import { useRenderGuard } from "@miladyai/app-core/hooks";
import { useApp } from "@miladyai/app-core/state";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ChatModalView } from "./ChatModalView";
import { CloudStatusBadge } from "./CloudStatusBadge";
import { CompanionHeader } from "./companion/CompanionHeader";
import {
  CompanionSceneHost,
  hasCompanionTeleportCompletedOnce,
  useSharedCompanionScene,
} from "./companion/CompanionSceneHost";
import { InferenceCloudAlertButton } from "./companion/InferenceCloudAlertButton";
import { resolveCompanionInferenceNotice } from "./companion/resolve-companion-inference-notice";

const COMPANION_UI_REVEAL_FALLBACK_MS = 3500;

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
    elizaCloudCredits,
    elizaCloudCreditsCritical,
    elizaCloudCreditsError,
    elizaCloudCreditsLow,
    elizaCloudEnabled,
    handleNewConversation,
    navigation,
    setState,
    setTab,
    switchShellView,
    t,
  } = useApp();

  // Gate chat + header behind avatar load — don't show chat or play
  // greeting speech until the VRM finishes its teleport-in animation.
  // When the shared scene already completed teleport while this overlay was
  // unmounted (e.g. coming back from character edit), reveal immediately.
  const [avatarReady, setAvatarReady] = useState(() =>
    hasCompanionTeleportCompletedOnce(),
  );
  useEffect(() => {
    if (hasCompanionTeleportCompletedOnce()) {
      setAvatarReady(true);
      return;
    }
    const handler = () => {
      setAvatarReady(true);
    };
    const fallbackTimer = window.setTimeout(() => {
      setAvatarReady((prev) => (prev ? prev : true));
    }, COMPANION_UI_REVEAL_FALLBACK_MS);
    window.addEventListener("eliza:vrm-teleport-complete", handler);
    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("eliza:vrm-teleport-complete", handler);
    };
  }, []);

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

  const handleCloudStatusClick = useCallback(() => {
    switchShellView("desktop");
    navigation.scheduleAfterTabCommit(() => {
      setState("cloudDashboardView", "billing");
      setTab("settings");
    });
  }, [navigation, setState, setTab, switchShellView]);

  const companionHeaderRightExtras = (
    <>
      {inferenceNotice ? (
        <InferenceCloudAlertButton
          notice={inferenceNotice}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleInferenceAlertClick}
        />
      ) : null}
      <CloudStatusBadge
        connected={elizaCloudConnected}
        credits={elizaCloudCredits}
        creditsLow={elizaCloudCreditsLow}
        creditsCritical={elizaCloudCreditsCritical}
        authRejected={elizaCloudAuthRejected}
        creditsError={elizaCloudCreditsError}
        t={t}
        onClick={handleCloudStatusClick}
        dataTestId="companion-cloud-status"
      />
    </>
  );

  return (
    <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
      <div
        style={{
          opacity: avatarReady ? 1 : 0,
          transition: "opacity 0.5s ease-in",
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
          rightExtras={companionHeaderRightExtras}
        />
      </div>

      {avatarReady && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[45%] z-20 pointer-events-auto">
          <ChatModalView variant="companion-dock" />
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
