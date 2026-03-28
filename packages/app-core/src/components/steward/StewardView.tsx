/**
 * StewardView — unified transaction history + approval queue panel.
 * Renders inside the Wallets tab as a sub-section or alongside inventory.
 */

import type { StewardStatusResponse } from "@miladyai/shared/contracts/wallet";
import { Button } from "@miladyai/ui";
import { ArrowUpRight, FileText, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../state";
import {
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DESKTOP_SURFACE_PANEL_CLASSNAME,
  DesktopPageFrame,
} from "../desktop-surface-primitives";
import {
  APP_PANEL_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_KICKER_CLASSNAME,
  APP_SIDEBAR_META_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
  APP_SIDEBAR_STICKY_HEADER_CLASSNAME,
} from "../sidebar-shell-styles";
import { ApprovalQueue } from "./ApprovalQueue";
import { TransactionHistory } from "./TransactionHistory";

type StewardTab = "history" | "approvals";

export function StewardView() {
  const {
    getStewardStatus,
    getStewardHistory,
    getStewardPending,
    approveStewardTx,
    rejectStewardTx,
    copyToClipboard,
    setActionNotice,
  } = useApp();

  const [activeTab, setActiveTab] = useState<StewardTab>("approvals");
  const [stewardStatus, setStewardStatus] =
    useState<StewardStatusResponse | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (typeof getStewardStatus !== "function") return;
    let cancelled = false;
    getStewardStatus()
      .then((s) => {
        if (!cancelled) setStewardStatus(s);
      })
      .catch(() => {
        /* steward not available */
      });
    return () => {
      cancelled = true;
    };
  }, [getStewardStatus]);

  const handlePendingCountChange = useCallback((count: number) => {
    setPendingCount(count);
  }, []);

  // If steward isn't configured, show a placeholder
  if (stewardStatus && !stewardStatus.connected) {
    return (
      <DesktopPageFrame>
        <div
          className={`${APP_PANEL_SHELL_CLASSNAME} items-center justify-center`}
        >
          <div
            className={`mx-4 w-full max-w-xl ${DESKTOP_SURFACE_PANEL_CLASSNAME} px-6 py-10 text-center`}
          >
            <Shield className="mx-auto h-10 w-10 text-muted/40" />
            <h2 className="mt-4 text-lg font-semibold text-txt-strong">
              Steward Not Connected
            </h2>
            <p className="mt-2 max-w-md mx-auto text-sm text-muted leading-relaxed">
              Configure STEWARD_API_URL and STEWARD_API_KEY in your agent
              settings to enable transaction history and approval management.
            </p>
            {stewardStatus.error && (
              <p className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                {stewardStatus.error}
              </p>
            )}
          </div>
        </div>
      </DesktopPageFrame>
    );
  }

  return (
    <DesktopPageFrame>
      <div className={APP_PANEL_SHELL_CLASSNAME}>
        {/* Sidebar */}
        <aside
          className={`lg:w-[18rem] lg:max-w-[280px] ${APP_SIDEBAR_RAIL_CLASSNAME}`}
        >
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <div className={APP_SIDEBAR_STICKY_HEADER_CLASSNAME}>
              <div className={APP_SIDEBAR_KICKER_CLASSNAME}>Steward Vault</div>
              <div className={APP_SIDEBAR_META_CLASSNAME}>
                {stewardStatus?.connected
                  ? "Transaction management and approvals"
                  : "Connecting…"}
              </div>
            </div>

            <nav className="mt-4 space-y-1.5">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setActiveTab("approvals")}
                className={`${APP_SIDEBAR_CARD_BASE_CLASSNAME} ${
                  activeTab === "approvals"
                    ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                    : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                }`}
              >
                <span
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold relative ${
                    activeTab === "approvals"
                      ? "border-accent/30 bg-accent/18 text-txt-strong"
                      : "border-border/50 bg-bg-accent/80 text-muted"
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold leading-snug">
                    Approvals
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted/85">
                    {pendingCount > 0
                      ? `${pendingCount} pending review`
                      : "No pending items"}
                  </span>
                </span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setActiveTab("history")}
                className={`${APP_SIDEBAR_CARD_BASE_CLASSNAME} ${
                  activeTab === "history"
                    ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                    : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                }`}
              >
                <span
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold ${
                    activeTab === "history"
                      ? "border-accent/30 bg-accent/18 text-txt-strong"
                      : "border-border/50 bg-bg-accent/80 text-muted"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold leading-snug">
                    Transaction History
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted/85">
                    All vault transactions
                  </span>
                </span>
              </Button>
            </nav>

            {/* Steward status badge */}
            {stewardStatus?.connected && (
              <div className="mt-auto pt-4">
                <div className="inline-flex items-center gap-1.5 rounded-2xl border border-accent/25 bg-accent/10 px-3 py-2 text-[11px] text-accent-fg">
                  <span>🔐</span>
                  <span>Vault connected</span>
                </div>
                {stewardStatus.evmAddress && (
                  <p className="mt-1.5 font-mono text-[10px] text-muted/60">
                    {stewardStatus.evmAddress.slice(0, 6)}…
                    {stewardStatus.evmAddress.slice(-4)}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div className={DESKTOP_PAGE_CONTENT_CLASSNAME}>
          <div className="mx-auto max-w-[76rem] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            {/* Header */}
            <section
              className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} px-5 py-5 sm:px-6`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Steward
                  </div>
                  <h1 className="mt-1 text-2xl font-semibold text-txt-strong">
                    {activeTab === "approvals"
                      ? "Approval Queue"
                      : "Transaction History"}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                    {activeTab === "approvals"
                      ? "Review and approve transactions that exceed your agent's auto-approve thresholds."
                      : "Complete history of all signed, broadcast, and pending transactions from the vault."}
                  </p>
                </div>
                {activeTab === "history" && (
                  <div className="flex items-center gap-1 text-muted/50">
                    <ArrowUpRight className="h-5 w-5" />
                  </div>
                )}
              </div>
            </section>

            {/* Content */}
            <div className="mt-4">
              {activeTab === "approvals" ? (
                <ApprovalQueue
                  getStewardPending={getStewardPending}
                  approveStewardTx={approveStewardTx}
                  rejectStewardTx={rejectStewardTx}
                  copyToClipboard={copyToClipboard}
                  setActionNotice={setActionNotice}
                  onPendingCountChange={handlePendingCountChange}
                />
              ) : (
                <TransactionHistory
                  getStewardHistory={getStewardHistory}
                  copyToClipboard={copyToClipboard}
                  setActionNotice={setActionNotice}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </DesktopPageFrame>
  );
}
