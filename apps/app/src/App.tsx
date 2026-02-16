/**
 * Root App component — routing shell.
 */

import { useState, useEffect, useCallback } from "react";
import { useApp } from "./AppContext.js";
import { TAB_GROUPS } from "./navigation.js";
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
import { useContextMenu } from "./hooks/useContextMenu.js";
import { TerminalPanel } from "./components/TerminalPanel.js";
import { ToastContainer } from "./components/ui/Toast.js";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.js";

function ViewRouter() {
  const { tab } = useApp();
  switch (tab) {
    case "apps": return <AppsPageView />;
    case "character": return <CharacterView />;
    case "wallets": return <InventoryView />;
    case "knowledge": return <KnowledgeView />;
    case "connectors": return <ConnectorsPageView />;
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
    case "logs":
      return <AdvancedPageView />;
    case "settings": return <SettingsView />;
    default: return <ChatView />;
  }
}

export function App() {
  const {
    onboardingLoading,
    startupPhase,
    authRequired,
    onboardingComplete,
    tab,
    toasts,
    dismissToast,
  } = useApp();
  const contextMenu = useContextMenu();

  const [customActionsPanelOpen, setCustomActionsPanelOpen] = useState(false);
  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<import("./api-client").CustomActionDef | null>(null);

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

  if (onboardingLoading) {
    return <LoadingScreen phase={startupPhase} />;
  }

  if (authRequired) return <PairingView />;
  if (!onboardingComplete) return <ErrorBoundary><OnboardingWizard /></ErrorBoundary>;

  const isChat = tab === "chat";
  const advancedTabs = new Set(TAB_GROUPS.find(g => g.label === "Advanced")?.tabs ?? []);
  const isAdvancedTab = advancedTabs.has(tab);

  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10001] focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-fg focus:rounded">
        Skip to content
      </a>
      {isChat ? (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav />
          <div className="flex flex-1 min-h-0 relative">
            <ConversationsSidebar />
            <main id="main-content" className="flex flex-col flex-1 min-w-0 overflow-visible pt-3 px-5">
              <ErrorBoundary><ChatView /></ErrorBoundary>
            </main>
            <AutonomousPanel />
            <CustomActionsPanel
              open={customActionsPanelOpen}
              onClose={() => setCustomActionsPanelOpen(false)}
              onOpenEditor={(action) => {
                setEditingAction(action ?? null);
                setCustomActionsEditorOpen(true);
              }}
            />
          </div>
          <TerminalPanel />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav />
          <main id="main-content" className={`flex-1 min-h-0 py-6 px-5 ${isAdvancedTab ? "overflow-hidden" : "overflow-y-auto"}`}>
            <ErrorBoundary><ViewRouter /></ErrorBoundary>
          </main>
          <TerminalPanel />
        </div>
      )}
      <CommandPalette />
      <EmotePicker />
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
        onClose={() => { setCustomActionsEditorOpen(false); setEditingAction(null); }}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
