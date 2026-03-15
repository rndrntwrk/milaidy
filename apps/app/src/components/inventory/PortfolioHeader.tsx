/**
 * Portfolio left-panel: total USD value, chain selector, wallet addresses,
 * optional native balance, status dots, and scoped alerts.
 */

import { useApp } from "@milady/app-core/state";
import { Button } from "@milady/ui";
import { CHAIN_CONFIGS, PRIMARY_CHAIN_KEYS } from "../chainConfig";
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
  nativeBalance: string | null;
  nativeSymbol: string | null;
  addresses: PortfolioAddressItem[];
  statuses: PortfolioStatusItem[];
  chainFocus: string;
  onChainChange: (chain: string) => void;
  inlineError?: PortfolioInlineError | null;
  warning?: PortfolioWarning | null;
  loadBalances: () => Promise<void> | void;
  goToRpcSettings: () => void;
}

export function PortfolioHeader({
  totalUsd,
  nativeBalance,
  nativeSymbol,
  addresses,
  statuses,
  chainFocus,
  onChainChange,
  inlineError,
  warning,
  loadBalances,
  goToRpcSettings,
}: PortfolioHeaderProps) {
  const { t, copyToClipboard } = useApp();
  const focusLabel =
    chainFocus === "all"
      ? "All Chains"
      : `${CHAIN_CONFIGS[chainFocus as keyof typeof CHAIN_CONFIGS]?.name ?? chainFocus} Mainnet`;

  return (
    <div className="two-panel-left">
      {/* Portfolio value */}
      <div className="two-panel-label">{t("wallet.portfolio")}</div>
      <div
        className="text-[22px] font-bold text-txt-strong"
        data-testid="wallet-balance-value"
      >
        {totalUsd > 0
          ? `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "$0.00"}
      </div>
      {nativeBalance !== null && nativeSymbol && (
        <div className="text-xs text-muted">
          {formatBalance(nativeBalance)} {nativeSymbol}
        </div>
      )}
      <div className="mt-1 text-xs text-muted">{focusLabel}</div>

      {/* Chain selector */}
      <div className="two-panel-label mt-4">CHAINS</div>
      <button
        type="button"
        data-testid="wallet-focus-all"
        className={`two-panel-item ${chainFocus === "all" ? "is-selected" : ""}`}
        onClick={() => onChainChange("all")}
      >
        <span className="text-sm">{t("wallet.all")}</span>
      </button>
      {PRIMARY_CHAIN_KEYS.map((key) => {
        const config = CHAIN_CONFIGS[key];
        const status = statuses.find(
          (s) => s.label.toLowerCase() === config.name.toLowerCase(),
        );
        return (
          <button
            type="button"
            key={key}
            data-testid={`wallet-focus-${key}`}
            className={`two-panel-item flex items-center gap-2 ${chainFocus === key ? "is-selected" : ""}`}
            onClick={() => onChainChange(key)}
          >
            <span
              className="inline-block rounded-full shrink-0"
              style={{
                width: 14,
                height: 14,
                backgroundColor: config.color,
              }}
            />
            <span className="text-sm">{config.name}</span>
            {status && (
              <StatusDot ready={status.ready} label="" title={status.title} />
            )}
          </button>
        );
      })}

      {/* Addresses */}
      {addresses.length > 0 && (
        <>
          <div className="two-panel-label mt-4">ADDRESSES</div>
          <div className="flex flex-col gap-1.5">
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
        </>
      )}

      {statuses.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          {statuses.map((status) => (
            <StatusDot
              key={`${status.label}-${status.ready ? "ready" : "off"}`}
              ready={status.ready}
              label={status.label}
              title={status.title}
            />
          ))}
        </div>
      )}

      {/* Inline error */}
      {inlineError?.message && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-danger">
          <span>{inlineError.message}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 shadow-sm"
            onClick={() => void loadBalances()}
            title={inlineError.retryTitle ?? t("common.retry")}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {/* Warning */}
      {warning && (
        <div className="mt-3 px-3 py-2 border border-[rgba(184,134,11,0.55)] bg-[rgba(184,134,11,0.08)] text-[11px]">
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
