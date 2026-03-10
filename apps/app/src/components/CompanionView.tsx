import { useCallback, useState } from "react";
import {
  getVrmBackgroundUrl,
  getVrmNeedsFlip,
  getVrmPreviewUrl,
  getVrmUrl,
  useApp,
} from "../AppContext";
import { ChatModalView } from "./ChatModalView";
import { CompanionHeader } from "./companion/CompanionHeader";
import { CompanionHubNav } from "./companion/CompanionHubNav";
import { VrmStage } from "./companion/VrmStage";

export function CompanionView() {
  const {
    selectedVrmIndex,
    customVrmUrl,
    customBackgroundUrl,
    uiLanguage,
    setUiLanguage,
    setTab,
    setUiShellMode,
    // Header properties
    agentStatus,
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsCritical,
    cloudCreditsLow,
    cloudTopUpUrl,
    walletAddresses,
    lifecycleBusy,
    lifecycleAction,
    handlePauseResume,
    handleRestart,
    t,
  } = useApp();

  // Compute Header properties
  const name = agentStatus?.agentName ?? "Milady";
  const agentState = agentStatus?.state ?? "not_started";

  const stateColor =
    agentState === "running"
      ? "text-ok border-ok"
      : agentState === "paused" ||
          agentState === "restarting" ||
          agentState === "starting"
        ? "text-warn border-warn"
        : agentState === "error"
          ? "text-danger border-danger"
          : "text-muted border-muted";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseResumeBusy = lifecycleBusy;
  const pauseResumeDisabled =
    lifecycleBusy || agentState === "restarting" || agentState === "starting";

  const creditColor = cloudCreditsCritical
    ? "border-danger text-danger"
    : cloudCreditsLow
      ? "border-warn text-warn"
      : "border-ok text-ok";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 4)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;

  const [chatDockOpen, setChatDockOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 1024 : true,
  );

  const handleSwitchToNativeShell = useCallback(() => {
    setUiShellMode("native");
    setTab("chat");
  }, [setTab, setUiShellMode]);

  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const vrmPath =
    selectedVrmIndex === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreviewUrl =
    selectedVrmIndex > 0
      ? getVrmPreviewUrl(safeSelectedVrmIndex)
      : getVrmPreviewUrl(1);
  const vrmBackgroundUrl =
    selectedVrmIndex === 0 && customVrmUrl
      ? customBackgroundUrl || getVrmBackgroundUrl(1)
      : getVrmBackgroundUrl(safeSelectedVrmIndex);
  const needsFlip =
    selectedVrmIndex > 0 && getVrmNeedsFlip(safeSelectedVrmIndex);

  return (
    <div
      className="anime-comp-screen font-display"
      style={{
        backgroundImage: `url("${vrmBackgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="anime-comp-bg-graphic" />

      {/* Model Layer */}
      <VrmStage
        vrmPath={vrmPath}
        fallbackPreviewUrl={fallbackPreviewUrl}
        needsFlip={needsFlip}
        chatDockOpen={chatDockOpen}
        t={t}
      />

      {/* UI Overlay */}
      <div className="anime-comp-ui-layer">
        {/* Top Header */}
        <CompanionHeader
          chatDockOpen={chatDockOpen}
          setChatDockOpen={setChatDockOpen}
          name={name}
          agentState={agentState}
          stateColor={stateColor}
          lifecycleBusy={lifecycleBusy}
          restartBusy={restartBusy}
          pauseResumeBusy={pauseResumeBusy}
          pauseResumeDisabled={pauseResumeDisabled}
          handlePauseResume={handlePauseResume}
          handleRestart={handleRestart}
          cloudEnabled={cloudEnabled}
          cloudConnected={cloudConnected}
          cloudCredits={cloudCredits}
          creditColor={creditColor}
          cloudTopUpUrl={cloudTopUpUrl}
          evmShort={evmShort}
          solShort={solShort}
          handleSwitchToNativeShell={handleSwitchToNativeShell}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          t={t}
        />

        <div
          className={`anime-comp-chat-dock-anchor ${chatDockOpen ? "is-open" : ""}`}
          data-testid="companion-chat-dock"
        >
          <ChatModalView
            variant="companion-dock"
            onRequestClose={() => setChatDockOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <div className="anime-comp-main-grid">
          {/* Center (Empty to show character) */}
          <div className="anime-comp-center" />

          {/* Right Panel: Actions + Game HUD Menu */}
          <aside className="anime-comp-right-panel">
            {/* Game HUD Icon Menu */}
            <CompanionHubNav setTab={setTab} t={t} />
          </aside>
        </div>
      </div>
    </div>
  );
}
