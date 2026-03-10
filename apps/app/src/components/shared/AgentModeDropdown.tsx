import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../AppContext";
import {
  type AgentAutomationMode,
  client,
  type TradePermissionMode,
} from "../../api-client";
import { dispatchWindowEvent, SELF_STATUS_SYNC_EVENT } from "../../events";

export interface AgentModeDropdownProps {
  variant?: "native" | "companion";
}

export function AgentModeDropdown({
  variant = "native",
}: AgentModeDropdownProps) {
  const { chatMode, setActionNotice, setState, t } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const [automationMode, setAutomationMode] =
    useState<AgentAutomationMode | null>(null);
  const [tradeMode, setTradeMode] = useState<TradePermissionMode | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [tradeSaving, setTradeSaving] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const notifySelfStatusRefresh = useCallback(() => {
    dispatchWindowEvent(SELF_STATUS_SYNC_EVENT);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    if (
      typeof document === "undefined" ||
      typeof document.addEventListener !== "function"
    ) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!moreMenuRef.current) return;
      const target = event.target as Node | null;
      if (target && !moreMenuRef.current.contains(target)) {
        setMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    let cancelled = false;
    setModeLoading(true);
    void Promise.all([
      client.getAgentAutomationMode(),
      client.getTradePermissionMode(),
    ])
      .then(([automationResult, tradeResult]) => {
        if (cancelled) return;
        setAutomationMode(automationResult.mode);
        setTradeMode(tradeResult.mode);
      })
      .catch(() => {
        if (cancelled) return;
        setAutomationMode(null);
        setTradeMode(null);
      })
      .finally(() => {
        if (!cancelled) setModeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moreOpen]);

  const automationModeLabel =
    automationMode === "full"
      ? t("permissions.mode.full")
      : automationMode === "connectors-only"
        ? t("permissions.mode.semi")
        : t("chat.modal.modeUnknown");

  const tradeModeLabel =
    tradeMode === "agent-auto"
      ? t("permissions.trade.agent")
      : tradeMode === "manual-local-key"
        ? t("permissions.trade.manual")
        : tradeMode === "user-sign-only"
          ? t("permissions.trade.userSign")
          : t("chat.modal.modeUnknown");

  const chatModeLabel =
    chatMode === "power"
      ? t("chat.modal.responseModePower")
      : t("chat.modal.responseModeSimple");

  const handleAutomationModeChange = useCallback(
    async (mode: AgentAutomationMode) => {
      if (modeLoading || automationSaving || mode === automationMode) return;
      setAutomationSaving(true);
      try {
        const result = await client.setAgentAutomationMode(mode);
        setAutomationMode(result.mode);
        if (result.mode === "full" && chatMode !== "power") {
          setState("chatMode", "power");
          setActionNotice?.(
            t("chat.modal.responseModeAutoPower"),
            "info",
            2400,
          );
        }
        setActionNotice?.(
          result.mode === "full"
            ? t("permissions.automationModeSetFull")
            : t("permissions.automationModeSetConnectors"),
          "success",
          2200,
        );
        notifySelfStatusRefresh();
      } catch (err) {
        setActionNotice?.(
          err instanceof Error
            ? err.message
            : t("permissions.updateAutomationFailed"),
          "error",
          3600,
        );
      } finally {
        setAutomationSaving(false);
      }
    },
    [
      automationMode,
      automationSaving,
      chatMode,
      modeLoading,
      notifySelfStatusRefresh,
      setActionNotice,
      setState,
      t,
    ],
  );

  const handleTradeModeChange = useCallback(
    async (mode: TradePermissionMode) => {
      if (modeLoading || tradeSaving || mode === tradeMode) return;
      setTradeSaving(true);
      try {
        const result = await client.setTradePermissionMode(mode);
        setTradeMode(result.mode);
        if (result.mode === "agent-auto" && chatMode !== "power") {
          setState("chatMode", "power");
          setActionNotice?.(
            t("chat.modal.responseModeAutoPower"),
            "info",
            2400,
          );
        }
        const notice =
          result.mode === "agent-auto"
            ? t("permissions.tradeModeSetAgent")
            : result.mode === "manual-local-key"
              ? t("permissions.tradeModeSetManual")
              : t("permissions.tradeModeSetUser");
        setActionNotice?.(notice, "success", 2200);
        notifySelfStatusRefresh();
      } catch (err) {
        setActionNotice?.(
          err instanceof Error
            ? err.message
            : t("permissions.updateTradeFailed"),
          "error",
          3600,
        );
      } finally {
        setTradeSaving(false);
      }
    },
    [
      chatMode,
      modeLoading,
      notifySelfStatusRefresh,
      setActionNotice,
      setState,
      t,
      tradeMode,
      tradeSaving,
    ],
  );

  const triggerClass =
    variant === "native"
      ? "inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border bg-bg cursor-pointer text-sm leading-none hover:border-accent hover:text-accent transition-all duration-200 hover:shadow-sm hover:scale-105 active:scale-95 rounded-md"
      : "anime-roster-config-btn";

  return (
    <div
      className="relative inline-flex shrink-0 z-50 text-left"
      ref={moreMenuRef}
    >
      <button
        type="button"
        className={triggerClass}
        onClick={() => setMoreOpen(!moreOpen)}
        title={t("chat.modal.agentMode")}
      >
        {variant === "native" ? (
          <Settings2 className="w-5 h-5" />
        ) : (
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        )}
      </button>

      {moreOpen && (
        <div className="chat-game-more-menu" role="menu">
          <div
            className="chat-game-mode-group"
            data-testid="chat-game-agent-mode-controls"
          >
            <span className="chat-game-more-item-title">
              {t("chat.modal.agentMode")}
            </span>
            <span className="chat-game-more-item-sub">
              {modeLoading
                ? t("chat.modal.providerDetecting")
                : `${automationModeLabel} • ${tradeModeLabel} • ${chatModeLabel}`}
            </span>
            <div className="chat-game-mode-row">
              <span className="chat-game-mode-label">
                {t("chat.modal.responseMode")}
              </span>
              <div className="chat-game-mode-switch">
                <button
                  type="button"
                  className={`chat-game-mode-chip ${chatMode === "simple" ? "is-active" : ""}`}
                  onClick={() => setState("chatMode", "simple")}
                  data-testid="chat-game-response-simple"
                >
                  {t("chat.modal.responseModeSimple")}
                </button>
                <button
                  type="button"
                  className={`chat-game-mode-chip ${chatMode === "power" ? "is-active" : ""}`}
                  onClick={() => setState("chatMode", "power")}
                  data-testid="chat-game-response-power"
                >
                  {t("chat.modal.responseModePower")}
                </button>
              </div>
            </div>
            <span className="chat-game-more-item-sub">
              {chatMode === "power"
                ? t("chat.modal.responseModeHintPower")
                : t("chat.modal.responseModeHintSimple")}
            </span>
            <div className="chat-game-mode-row">
              <span className="chat-game-mode-label">
                {t("permissions.automationMode")}
              </span>
              <div className="chat-game-mode-switch">
                <button
                  type="button"
                  className={`chat-game-mode-chip ${automationMode === "connectors-only" ? "is-active" : ""}`}
                  disabled={modeLoading || automationSaving}
                  onClick={() => {
                    void handleAutomationModeChange("connectors-only");
                  }}
                  data-testid="chat-game-automation-connectors"
                >
                  {t("permissions.mode.semi")}
                </button>
                <button
                  type="button"
                  className={`chat-game-mode-chip ${automationMode === "full" ? "is-active" : ""}`}
                  disabled={modeLoading || automationSaving}
                  onClick={() => {
                    void handleAutomationModeChange("full");
                  }}
                  data-testid="chat-game-automation-full"
                >
                  {t("permissions.mode.full")}
                </button>
              </div>
            </div>
            <div className="chat-game-mode-row">
              <span className="chat-game-mode-label">
                {t("permissions.tradeMode")}
              </span>
              <div className="chat-game-mode-switch">
                <button
                  type="button"
                  className={`chat-game-mode-chip ${tradeMode === "user-sign-only" ? "is-active" : ""}`}
                  disabled={modeLoading || tradeSaving}
                  onClick={() => {
                    void handleTradeModeChange("user-sign-only");
                  }}
                  data-testid="chat-game-trade-user-sign"
                >
                  {t("permissions.trade.userSign")}
                </button>
                <button
                  type="button"
                  className={`chat-game-mode-chip ${tradeMode === "manual-local-key" ? "is-active" : ""}`}
                  disabled={modeLoading || tradeSaving}
                  onClick={() => {
                    void handleTradeModeChange("manual-local-key");
                  }}
                  data-testid="chat-game-trade-manual"
                >
                  {t("permissions.trade.manual")}
                </button>
                <button
                  type="button"
                  className={`chat-game-mode-chip ${tradeMode === "agent-auto" ? "is-active" : ""}`}
                  disabled={modeLoading || tradeSaving}
                  onClick={() => {
                    void handleTradeModeChange("agent-auto");
                  }}
                  data-testid="chat-game-trade-agent"
                >
                  {t("permissions.trade.agent")}
                </button>
              </div>
            </div>
            <span className="chat-game-more-item-sub">
              {t("chat.modal.tradeModeHint")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
