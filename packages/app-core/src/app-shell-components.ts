/**
 * Shell component subset — curated re-exports consumed by App.tsx.
 *
 * When adding a new shell/page component, add it here AND in
 * `./components/index.ts`. Both files must stay in sync.
 */
export { AdvancedPageView } from "./components/pages/AdvancedPageView";
export { AppsPageView } from "./components/pages/AppsPageView";
export { AvatarLoader } from "./components/character/AvatarLoader";
export { BugReportModal } from "./components/shell/BugReportModal";
export { CharacterEditor } from "./components/character/CharacterEditor";
export { ChatView } from "./components/pages/ChatView";
export { SharedCompanionScene } from "./components/companion/CompanionSceneHost";
export { CompanionShell } from "./components/shell/CompanionShell";
export { CompanionView } from "./components/pages/CompanionView";
export { ConnectionFailedBanner } from "./components/shell/ConnectionFailedBanner";
export { ConnectorsPageView } from "./components/pages/ConnectorsPageView";
export { ConversationsSidebar } from "./components/conversations/ConversationsSidebar";
export { CustomActionEditor } from "./components/custom-actions/CustomActionEditor";
export { CustomActionsPanel } from "./components/custom-actions/CustomActionsPanel";
export { GameViewOverlay } from "./components/apps/GameViewOverlay";
export { Header } from "./components/shell/Header";
export {
  HeartbeatsDesktopShell,
  HeartbeatsView,
} from "./components/pages/HeartbeatsView";
export { InventoryView } from "./components/pages/InventoryView";
export { KnowledgeView } from "./components/pages/KnowledgeView";
export { OnboardingWizard } from "./components/onboarding/OnboardingWizard";

export { PairingView } from "./components/shell/PairingView";
export { SaveCommandModal } from "./components/chat/SaveCommandModal";
export { SettingsView } from "./components/pages/SettingsView";
export { ShellOverlays } from "./components/shell/ShellOverlays";
export { StartupFailureView } from "./components/shell/StartupFailureView";
export { StartupShell } from "./components/shell/StartupShell";
export { StreamView } from "./components/pages/StreamView";
export { SystemWarningBanner } from "./components/shell/SystemWarningBanner";
