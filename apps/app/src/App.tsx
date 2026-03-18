/**
 * Root App component — routing shell.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "./AppContext.js";
import { TAB_GROUPS, pathForTab } from "./navigation.js";
import { Header } from "./components/Header.js";
import { Nav } from "./components/Nav.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { EmotePicker } from "./components/EmotePicker.js";
import { SaveCommandModal } from "./components/SaveCommandModal.js";
import { PairingView } from "./components/PairingView.js";
import { OnboardingWizard } from "./components/OnboardingWizard.js";
import { ChatView } from "./components/ChatView.js";
import { ConversationsSidebar } from "./components/ConversationsSidebar.js";
import { AutonomousPanel } from "./components/AutonomousPanel.js";
import { CustomActionsPanel } from "./components/CustomActionsPanel.js";
import { CustomActionEditor } from "./components/CustomActionEditor.js";
import { AppsPageView } from "./components/AppsPageView.js";
import { AdvancedPageView } from "./components/AdvancedPageView.js";
import { CharacterView } from "./components/CharacterView.js";
import { ConnectorsPageView } from "./components/ConnectorsPageView.js";
import { InventoryView } from "./components/InventoryView.js";
import { KnowledgeView } from "./components/KnowledgeView.js";
import { SettingsView } from "./components/SettingsView.js";
import { LoadingScreen } from "./components/LoadingScreen.js";
import { StartupFailureView } from "./components/StartupFailureView.js";
import { GameViewOverlay } from "./components/GameViewOverlay.js";
import { BugReportModal } from "./components/BugReportModal.js";
import { useContextMenu } from "./hooks/useContextMenu.js";
import { BugReportProvider, useBugReportState } from "./hooks/useBugReport.js";
import { TerminalPanel } from "./components/TerminalPanel.js";
import { ToastContainer } from "./components/ui/Toast.js";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.js";
import { MiladyOsDashboard } from "./components/MiladyOsDashboard.js";
import { MiladyBootShell } from "./components/MiladyBootShell.js";
import { ActivityIcon, ThreadsIcon } from "./components/ui/Icons.js";
import { StreamView } from "./components/StreamView.js";
import {
  COMPANION_OVERLAY_TABS,
  CompanionShell,
} from "./components/CompanionShell.js";
import { CompanionView } from "./components/CompanionView.js";
import { ConnectionFailedBanner } from "./components/ConnectionFailedBanner.js";
import { ShellOverlays } from "./components/ShellOverlays.js";
import { SystemWarningBanner } from "./components/SystemWarningBanner.js";
import { LifoSandboxView } from "./components/LifoSandboxView.js";
import { useLifoAutoPopout } from "./hooks/useLifoAutoPopout.js";
import { useStreamPopoutNavigation } from "./hooks/useStreamPopoutNavigation.js";
import { isLifoPopoutMode, isLifoPopoutValue } from "./lifo-popout.js";
import type { Tab } from "./navigation.js";

const advancedTabs = new Set(TAB_GROUPS.find(g => g.label === "Advanced")?.tabs ?? []);
const CHAT_MOBILE_BREAKPOINT_PX = 1024;

/** Check if we're in pop-out mode (StreamView only, no chrome).
 *  Excludes lifo popout values — those use the dedicated LifoSandboxView shell. */
function useIsPopout(): boolean {
  const [popout] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(
      window.location.search || window.location.hash.split("?")[1] || "",
    );
    if (!params.has("popout")) return false;
    return !isLifoPopoutValue(params.get("popout"));
  });
  return popout;
}

function ViewRouter() {
  const { tab } = useApp();
  switch (tab) {
    case "apps": return <AppsPageView />;
    case "character": return <CharacterView />;
    case "wallets": return <InventoryView />;
    case "knowledge": return <KnowledgeView />;
    case "connectors": return <ConnectorsPageView />;
    case "stream": return <StreamView />;
    case "companion": return <CompanionView />;
    case "advanced":
    case "plugins":
    case "skills":
    case "actions":
    case "triggers":
    case "identity":
    case "approvals":
    case "safe-mode":
    case "governance":
    case "fine-tuning":
    case "trajectories":
    case "runtime":
    case "database":
    case "lifo":
    case "logs":
    case "security":
      return <AdvancedPageView />;
    case "voice":
    case "settings": return <SettingsView />;
    default: return <ChatView />;
  }
}

export function App() {
  const {
    onboardingLoading,
    startupPhase,
    startupError,
    authRequired,
    onboardingComplete,
    retryStartup,
    tab,
    currentTheme,
    setTab,
    actionNotice,
    uiShellMode,
    agentStatus,
    unreadConversations,
    activeGameViewerUrl,
    gameOverlayEnabled,
    toasts,
    dismissToast,
    setActionNotice,
  } = useApp();

  const isPopout = useIsPopout();
  const shellMode =
    currentTheme === "milady-os"
      ? (uiShellMode ?? "native")
      : (uiShellMode ?? "companion");
  const effectiveTab: Tab =
    shellMode === "native" && tab === "companion"
      ? "chat"
      : shellMode === "companion" && tab === "chat"
        ? "companion"
        : tab;
  const contextMenu = useContextMenu();

  useStreamPopoutNavigation(setTab);

  const [customActionsPanelOpen, setCustomActionsPanelOpen] = useState(false);
  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<
    import("./api-client.js").CustomActionDef | null
  >(null);
  const [isChatMobileLayout, setIsChatMobileLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth < CHAT_MOBILE_BREAKPOINT_PX
      : false,
  );
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [mobileAutonomousOpen, setMobileAutonomousOpen] = useState(false);

  const isChat = tab === "chat";
  const isAdvancedTab = advancedTabs.has(tab);
  const unreadCount = unreadConversations?.size ?? 0;
  const statusIndicatorClass =
    agentStatus?.state === "running"
      ? "bg-ok shadow-[0_0_8px_color-mix(in_srgb,var(--ok)_60%,transparent)]"
      : agentStatus?.state === "paused" ||
        agentStatus?.state === "starting" ||
        agentStatus?.state === "restarting"
        ? "bg-warn"
        : agentStatus?.state === "error"
          ? "bg-danger"
          : "bg-muted";
  const mobileChatControls = isChatMobileLayout ? (
    <div className="flex items-center gap-2 w-max">
      <button
        type="button"
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-md text-[12px] font-semibold transition-all cursor-pointer ${mobileConversationsOpen
          ? "border-accent bg-accent-subtle text-accent"
          : "border-border bg-card text-txt hover:border-accent hover:text-accent"
          }`}
        onClick={() => {
          setMobileAutonomousOpen(false);
          setMobileConversationsOpen(true);
        }}
        aria-label="Open chats panel"
      >
        <ThreadsIcon width="14" height="14" aria-hidden />
        Chats
        {unreadCount > 0 && (
          <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-accent text-accent-fg text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-md text-[12px] font-semibold transition-all cursor-pointer ${mobileAutonomousOpen
          ? "border-accent bg-accent-subtle text-accent"
          : "border-border bg-card text-txt hover:border-accent hover:text-accent"
          }`}
        onClick={() => {
          setMobileConversationsOpen(false);
          setMobileAutonomousOpen(true);
        }}
        aria-label="Open status panel"
      >
        <ActivityIcon width="14" height="14" aria-hidden />
        Status
        <span
          className={`w-2 h-2 rounded-full ${statusIndicatorClass}`}
          aria-hidden
        />
      </button>
    </div>
  ) : undefined;

  // Keep hook order stable across onboarding/auth state transitions.
  // Otherwise React can throw when onboarding completes and the main shell mounts.
  useEffect(() => {
    const handler = () => setCustomActionsPanelOpen((v) => !v);
    window.addEventListener("toggle-custom-actions-panel", handler);
    return () => window.removeEventListener("toggle-custom-actions-panel", handler);
  }, []);

  const handleEditorSave = useCallback(() => {
    setCustomActionsEditorOpen(false);
    setEditingAction(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setIsChatMobileLayout(window.innerWidth < CHAT_MOBILE_BREAKPOINT_PX);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isChatMobileLayout) {
      setMobileConversationsOpen(false);
      setMobileAutonomousOpen(false);
    }
  }, [isChatMobileLayout]);

  useEffect(() => {
    if (!isChat) {
      setMobileConversationsOpen(false);
      setMobileAutonomousOpen(false);
    }
  }, [isChat]);

  const bugReport = useBugReportState();
  const lifoPopoutMode = useMemo(() => isLifoPopoutMode(), []);

  useLifoAutoPopout({
    enabled:
      !lifoPopoutMode &&
      !onboardingLoading &&
      onboardingComplete &&
      !authRequired,
    targetPath: pathForTab("lifo", import.meta.env.BASE_URL),
    onPopupBlocked: () => {
      setActionNotice(
        "Lifo popout blocked by the browser. Allow popups to watch agent computer-use live.",
        "error",
        3800,
      );
    },
  });

  const agentStarting = agentStatus?.state === "starting";

  useEffect(() => {
    const STARTUP_TIMEOUT_MS = 300_000;
    if ((startupPhase as string) !== "ready" && !startupError) {
      const timer = setTimeout(() => {
        retryStartup();
      }, STARTUP_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [startupPhase, startupError, retryStartup]);

  // Pop-out mode — render only StreamView, skip startup gates.
  // Platform init is skipped in main.tsx; AppProvider hydrates WS in background.
  if (isPopout) {
    return (
      <div className="flex flex-col h-screen w-screen font-body text-txt bg-bg overflow-hidden">
        <StreamView />
      </div>
    );
  }

  if (startupError) {
    return (
      <StartupFailureView
        error={startupError}
        onRetry={retryStartup}
        currentTheme={currentTheme}
        agentName={agentStatus?.agentName}
      />
    );
  }

  if (onboardingLoading || agentStarting) {
    return (
      <LoadingScreen
        phase={agentStarting ? "initializing-agent" : startupPhase}
        currentTheme={currentTheme}
        agentName={agentStatus?.agentName}
      />
    );
  }

  if (authRequired) return <PairingView />;
  if (!onboardingComplete) {
    return currentTheme === "milady-os" ? (
      <MiladyBootShell
        title="PRO STREAMER SETUP"
        subtitle="Calibrate the node before the broadcast stage unlocks"
        status="system calibration"
        identityLabel={agentStatus?.agentName}
        panelClassName="mx-auto max-w-6xl"
      >
        <ErrorBoundary>
          <div className="max-h-[85vh] overflow-y-auto p-4 sm:p-6">
            <OnboardingWizard />
          </div>
        </ErrorBoundary>
      </MiladyBootShell>
    ) : (
      <ErrorBoundary><OnboardingWizard /></ErrorBoundary>
    );
  }

  if (lifoPopoutMode) {
    return (
      <BugReportProvider value={bugReport}>
        <div className="flex h-screen w-screen min-h-0 bg-bg text-txt">
          <main className="flex-1 min-h-0 overflow-hidden p-3 xl:p-4">
            <LifoSandboxView />
          </main>
        </div>
      </BugReportProvider>
    );
  }

  /* ── Companion shell mode ─────────────────────────────────────────── */
  if (shellMode === "companion" && COMPANION_OVERLAY_TABS.has(effectiveTab)) {
    return (
      <BugReportProvider value={bugReport}>
        <CompanionShell tab={effectiveTab} actionNotice={actionNotice} />
        <ShellOverlays actionNotice={actionNotice} />
      </BugReportProvider>
    );
  }

  /* ── Native shell mode (all fork features intact) ─────────────────── */
  return (
    <BugReportProvider value={bugReport}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10001] focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-fg focus:rounded">
        Skip to content
      </a>
      {currentTheme === "milady-os" ? (
        <ErrorBoundary><MiladyOsDashboard /></ErrorBoundary>
      ) : tab === "stream" ? (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <main className="flex-1 min-h-0 overflow-hidden">
            <StreamView />
          </main>
        </div>
      ) : isChat ? (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header mobileLeft={mobileChatControls} />
          <div className="flex flex-1 min-h-0 relative">
            {isChatMobileLayout ? (
              <>
                <main className="flex flex-col flex-1 min-w-0 overflow-visible pt-2 px-2">
                  <ErrorBoundary>
                    <ChatView />
                  </ErrorBoundary>
                </main>

                {mobileConversationsOpen && (
                  <div className="fixed inset-0 z-[120] bg-bg">
                    <ConversationsSidebar
                      mobile
                      onClose={() => setMobileConversationsOpen(false)}
                    />
                  </div>
                )}

                {mobileAutonomousOpen && (
                  <div className="fixed inset-0 z-[120] bg-bg">
                    <AutonomousPanel
                      mobile
                      onClose={() => setMobileAutonomousOpen(false)}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <ConversationsSidebar />
                <main
                  id="main-content"
                  className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden pt-2 px-3 sm:pt-3 sm:px-5"
                >
                  <ErrorBoundary>
                    <ChatView />
                  </ErrorBoundary>
                </main>
                <AutonomousPanel />
              </>
            )}
            <CustomActionsPanel
              open={customActionsPanelOpen}
              onClose={() => setCustomActionsPanelOpen(false)}
              onOpenEditor={(action) => {
                setEditingAction(action ?? null);
                setCustomActionsEditorOpen(true);
              }}
            />
          </div>
          {/* <TerminalPanel /> */}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav />
          <main id="main-content" className={`flex-1 min-h-0 py-4 px-3 sm:py-6 sm:px-5 ${isAdvancedTab ? "overflow-hidden" : "overflow-y-auto"}`}>
            <ErrorBoundary><ViewRouter /></ErrorBoundary>
          </main>
          {/* <TerminalPanel /> */}
        </div>
      )}
      {/* Persistent game overlay — stays visible across all tabs */}
      {activeGameViewerUrl && gameOverlayEnabled && tab !== "apps" && (
        <GameViewOverlay />
      )}
      <ShellOverlays actionNotice={actionNotice} />
      <SaveCommandModal
        open={contextMenu.saveCommandModalOpen}
        text={contextMenu.saveCommandText}
        onSave={contextMenu.confirmSaveCommand}
        onClose={contextMenu.closeSaveCommandModal}
      />
      <CustomActionEditor
        open={customActionsEditorOpen}
        action={editingAction}
        onSave={handleEditorSave}
        onClose={() => {
          setCustomActionsEditorOpen(false);
          setEditingAction(null);
        }}
      />
      <BugReportModal />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <ConnectionFailedBanner />
      <SystemWarningBanner />
    </BugReportProvider>
  );
}
