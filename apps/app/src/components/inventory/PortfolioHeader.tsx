/**
 * Portfolio header block: total USD value, selected chain badge,
 * optional native balance, wallet addresses, status dots, and scoped alerts.
 */

import { useApp } from "@milady/app-core/state";
import { Button } from "@milady/ui";
import { CopyableAddress } from "./CopyableAddress";
import { formatBalance } from "./constants";
import { StatusDot } from "./StatusDot";

export interface PortfolioAddressItem {
  label: string;
  address: string;
}

export interface PortfolioStatusItem {
  ready: boolean;
  label: string;
  title?: string;
}

export interface PortfolioInlineError {
  message: string;
  retryTitle?: string;
}

export interface PortfolioWarning {
  title: string;
  body: string;
  actionLabel: string;
}

export interface PortfolioHeaderProps {
  totalUsd: number;
  networkLabel: string;
  nativeBalance: string | null;
  nativeSymbol: string | null;
  receiveAddress: string | null;
  receiveTitle?: string;
  addresses: PortfolioAddressItem[];
  statuses: PortfolioStatusItem[];
  inlineError?: PortfolioInlineError | null;
  warning?: PortfolioWarning | null;
  loadBalances: () => Promise<void> | void;
  goToRpcSettings: () => void;
}

export function PortfolioHeader({
  totalUsd,
  networkLabel,
  nativeBalance,
  nativeSymbol,
  receiveAddress,
  receiveTitle,
  addresses,
  statuses,
  inlineError,
  warning,
  loadBalances,
  goToRpcSettings,
}: PortfolioHeaderProps) {
  const { t, copyToClipboard, setActionNotice } = useApp();

  return (
    <div className="wt__portfolio">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="wt__portfolio-label">{t("wallet.portfolio")}</div>
            <span className="wt__network-badge">{networkLabel}</span>
          </div>
          <div
            className="wt__portfolio-value"
            data-testid="wallet-balance-value"
          >
            {totalUsd > 0
              ? `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "$0.00"}
          </div>
          {nativeBalance !== null && nativeSymbol && (
            <div className="wt__bnb-sub">
              {formatBalance(nativeBalance)} {nativeSymbol}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {receiveAddress && (
            <Button
              variant="outline"
              size="sm"
              className="wt__receive-btn h-8 px-3 shadow-sm"
              onClick={() => {
                void copyToClipboard(receiveAddress);
                setActionNotice(t("wallet.addressCopied"), "success", 2400);
              }}
              title={receiveTitle ?? receiveAddress}
            >
              {t("wallet.receive")}
            </Button>
          )}

          {addresses.length > 0 && (
            <div className="flex flex-col items-end gap-1.5">
              {addresses.map((item) => (
                <div
                  key={`${item.label}-${item.address}`}
                  className="flex items-center gap-2"
                >
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    {item.label}
                  </span>
                  <CopyableAddress
                    address={item.address}
                    onCopy={copyToClipboard}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="wt__status-row mt-2">
        {statuses.map((status) => (
          <StatusDot
            key={status.label}
            ready={status.ready}
            label={status.label}
            title={status.title}
          />
        ))}
      </div>

      {inlineError?.message && (
        <div className="wt__error-inline mt-2">
          <span className="wt__error-inline-text">{inlineError.message}</span>
          <Button
            variant="ghost"
            size="sm"
            className="wt__error-retry h-7 px-2 shadow-sm"
            onClick={() => void loadBalances()}
            title={inlineError.retryTitle ?? t("common.retry")}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {warning && (
        <div className="mt-2 px-3 py-2 border border-[rgba(184,134,11,0.55)] bg-[rgba(184,134,11,0.08)] text-[11px]">
          <div className="font-bold mb-1">{warning.title}</div>
          <div className="text-[var(--muted)] leading-relaxed">
            {warning.body}
          </div>
          <div className="mt-2">
            <Button
              variant="default"
              size="sm"
              className="h-8 px-3 text-[11px] font-mono shadow-sm"
              onClick={goToRpcSettings}
            >
              {warning.actionLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
