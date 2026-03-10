import type { AgentState } from "../../api-client";
import type { UiLanguage } from "../../i18n/messages";
import { AgentModeDropdown } from "../shared/AgentModeDropdown";
import { LanguageDropdown } from "../shared/LanguageDropdown";
import { MessageSquare, Menu, Loader2, Play, Pause, RefreshCw, Coins, Maximize } from "lucide-react";
import type { TranslatorFn } from "./walletUtils";

/** Map raw backend agent-state strings to i18n keys */
const STATE_I18N: Record<string, string> = {
  running: "header.statusRunning",
  paused: "header.statusPaused",
  error: "header.statusError",
  restarting: "header.statusRestarting",
  starting: "header.statusStarting",
  not_started: "header.statusNotStarted",
  stopped: "header.statusStopped",
};

function translateAgentState(state: string, t: TranslatorFn): string {
  const key = STATE_I18N[state];
  return key ? t(key) : state;
}

export interface CompanionHeaderProps {
  // Chat toggle
  chatDockOpen: boolean;
  setChatDockOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Agent identity & state
  name: string;
  agentState: AgentState | string;
  stateColor: string;
  // Lifecycle
  lifecycleBusy: boolean;
  restartBusy: boolean;
  pauseResumeBusy: boolean;
  pauseResumeDisabled: boolean;
  handlePauseResume: () => Promise<void>;
  handleRestart: () => Promise<void>;
  // Cloud
  cloudEnabled: boolean;
  cloudConnected: boolean;
  cloudCredits: number | null;
  creditColor: string;
  cloudTopUpUrl: string;
  // Wallets (display only — full trading panel in separate PR)
  evmShort: string | null;
  solShort: string | null;
  // Character / UI
  handleSwitchToNativeShell: () => void;
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  // Translator
  t: TranslatorFn;
}

export function CompanionHeader(props: CompanionHeaderProps) {
  const {
    chatDockOpen,
    setChatDockOpen,
    agentState,
    stateColor,
    lifecycleBusy,
    restartBusy,
    pauseResumeBusy,
    pauseResumeDisabled,
    handlePauseResume,
    handleRestart,
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    creditColor,
    cloudTopUpUrl,
    evmShort,
    solShort,
    handleSwitchToNativeShell,
    uiLanguage,
    setUiLanguage,
    t,
  } = props;

  return (
    <header className="relative flex justify-center items-center mb-6 w-full z-10">
      <div className="absolute left-0 flex items-center gap-4">
        <button
          type="button"
          `className={`flex items-center justify-center p-2.5 rounded-full backdrop-blur-md transition-all duration-300 ease-out border shadow-lg ${chatDockOpen ? "bg-white/10 border-sky-400/50 shadow-[0_0_15px_rgba(56,189,248,0.3)] text-sky-300 translate-y-px" : "bg-black/30 border-white/10 text-white/80 hover:bg-white/15 hover:border-white/30 hover:text-white hover:-translate-y-0.5"}`}``}
          onClick={() => setChatDockOpen((open) => !open)}
          title={chatDockOpen ? t("chat.modal.back") : t("nav.chat")}
          data-testid="companion-chat-toggle"
        >
          {chatDockOpen ? (
            <MessageSquare className="w-5 h-5" />
          ) : (
            <Menu className="w-[18px] h-[18px]" />
          )}
        </button>
      </div>

      {/* Hub Header Elements — centered */}
      <div className="flex items-center gap-3 relative">
        {/* Agent Status */}
        <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-white/90 font-medium text-sm tracking-wide transition-all shadow-inner relative overflow-hidden group">
          <span
            `className={`uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md ${stateColor}`}`
            data-testid="status-pill"
          >
            {translateAgentState(agentState as string, t)}
          </span>
          {(agentState as string) === "restarting" ||
          (agentState as string) === "starting" ||
          (agentState as string) === "not_started" ||
          (agentState as string) === "stopped" ? (
            <span className="flex items-center justify-center opacity-60 ml-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  void handlePauseResume();
                }}
                title={
                  agentState === "paused"
                    ? t("header.resumeAutonomy")
                    : t("header.pauseAutonomy")
                }
                `className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 ${pauseResumeDisabled || lifecycleBusy || agentState === "restarting" ? "opacity-30 cursor-not-allowed bg-transparent" : "bg-white/5 hover:bg-white/20 hover:scale-110 border border-transparent hover:border-white/30 cursor-pointer"}`}`
                disabled={pauseResumeDisabled}
              >
                {pauseResumeBusy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : agentState === "paused" ? (
                  <Play className="w-3 h-3 fill-current" />
                ) : (
                  <Pause className="w-3 h-3 fill-current" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleRestart();
                }}
                title={t("header.restartAgent")}
                `className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 ${pauseResumeDisabled || lifecycleBusy || agentState === "restarting" ? "opacity-30 cursor-not-allowed bg-transparent" : "bg-white/5 hover:bg-white/20 hover:scale-110 border border-transparent hover:border-white/30 cursor-pointer"}`}`
                disabled={
                  lifecycleBusy || (agentState as string) === "restarting"
                }
              >
                {restartBusy || (agentState as string) === "restarting" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </button>
            </>
          )}
        </div>

        {/* Cloud Balance */}
        {(cloudEnabled || cloudConnected) &&
          (cloudConnected ? (
            <a
              href={cloudTopUpUrl}
              target="_blank"
              rel="noopener noreferrer"
              `className={`flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] font-medium text-sm tracking-wide transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:-translate-y-0.5 cursor-pointer ${cloudCredits === null ? "text-white/60" : creditColor}`}`
            >
              <Coins className="w-3 h-3" />
              <span className="uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md">
                {cloudCredits === null
                  ? t("header.cloudConnected")
                  : `$${cloudCredits.toFixed(2)}`}
              </span>
            </a>
          ) : (
            <span className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-red-950/40 backdrop-blur-xl border border-red-500/30 text-red-400 font-medium text-sm tracking-wide shadow-[0_8px_32px_rgba(220,38,38,0.15)]">
              <span className="uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md">
                {t("header.cloudDisconnected")}
              </span>
            </span>
          ))}

        {/* Wallet addresses (trading panel in separate PR) */}
        {(evmShort || solShort) && (
          <span className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-white/90 font-medium text-sm tracking-wide transition-all" data-testid="wallet-address-pill">
            <span className="uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md">
              {evmShort || solShort}
            </span>
          </span>
        )}
      </div>

      <div className="absolute right-0 flex items-center gap-2.5">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-1.5 py-1.5 backdrop-blur-xl shadow-xl hover:border-white/20 transition-all">
          <button
            type="button"
            onClick={handleSwitchToNativeShell}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-white/80 hover:text-white hover:bg-white/20 border border-transparent hover:border-white/30 transition-all"
            title={t("companion.switchToNativeUi")}
            data-testid="ui-shell-toggle"
          >
            <Maximize className="w-4 h-4" />
          </button>

          <AgentModeDropdown variant="companion" />

          <LanguageDropdown
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            t={t}
          />
        </div>
      </div>
    </header>
  );
}
