import type { AgentState } from "@milady/app-core/api";
import { LanguageDropdown, ThemeToggle } from "@milady/app-core/components";
import type { UiLanguage } from "@milady/app-core/i18n";
import type { UiTheme } from "@milady/app-core/state";
import { memo } from "react";
import { ChatModeToggle } from "../shared/ChatModeToggle";

import type { TranslatorFn } from "./walletUtils";

export interface CompanionHeaderProps {
  // Agent identity & state
  name: string;
  agentState: AgentState | string;
  stateColor: string;
  // Lifecycle
  lifecycleBusy: boolean;
  restartBusy: boolean;

  handleRestart: () => Promise<void>;
  // Cloud
  miladyCloudEnabled: boolean;
  miladyCloudConnected: boolean;
  miladyCloudCredits: number | null;
  creditColor: string;
  miladyCloudTopUpUrl: string;
  // Wallets (display only — full trading panel in separate PR)
  evmShort: string | null;
  solShort: string | null;
  // Character / UI
  handleSwitchToNativeShell: () => void;
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  // Translator
  t: TranslatorFn;
}

export const CompanionHeader = memo(function CompanionHeader(
  props: CompanionHeaderProps,
) {
  const {
    handleSwitchToNativeShell,
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    t,
  } = props;

  return (
    <header className="relative z-10 mb-6 flex w-full items-center justify-center pointer-events-none">
      <div className="pointer-events-auto absolute top-2 right-0 flex items-center gap-2.5">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-1.5 py-1.5 backdrop-blur-xl shadow-xl hover:border-white/20 transition-all">
          <button
            type="button"
            onClick={handleSwitchToNativeShell}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-white/80 hover:text-white hover:bg-white/20 border border-transparent hover:border-white/30 transition-all"
            title={t("companion.switchToNativeUi")}
            data-testid="ui-shell-toggle"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <line x1="8" y1="20" x2="16" y2="20" />
              <line x1="12" y1="18" x2="12" y2="20" />
            </svg>
          </button>

          <ChatModeToggle variant="companion" />

          <ThemeToggle
            uiTheme={uiTheme}
            setUiTheme={setUiTheme}
            t={t}
            variant="companion"
          />

          <LanguageDropdown
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            t={t}
            variant="companion"
          />
        </div>
      </div>
    </header>
  );
});
