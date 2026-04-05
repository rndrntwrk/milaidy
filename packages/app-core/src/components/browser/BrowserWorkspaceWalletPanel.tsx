import type {
  BscTransferExecuteResponse,
  StewardStatusResponse,
  WalletAddresses,
  WalletConfigStatus,
} from "@miladyai/shared/contracts/wallet";
import { Button, Input, MetaPill, PagePanel, Spinner } from "@miladyai/ui";
import { Copy, RefreshCw, Send } from "lucide-react";
import { type JSX, useCallback, useEffect, useState } from "react";
import { client } from "../../api";
import { useApp } from "../../state";
import { ApprovalQueue } from "../steward/ApprovalQueue";
import { getChainName, truncateAddress } from "../steward/chain-utils";
import { StewardLogo } from "../steward/StewardLogo";

interface BrowserWorkspaceWalletPanelProps {
  selectedTabLabel: string | null;
  selectedTabUrl: string | null;
}

const PANEL_INPUT_CLASSNAME =
  "h-10 rounded-2xl border-border/35 bg-card/70 px-3 text-sm text-txt shadow-sm transition-colors focus-visible:border-accent/40";

type BrowserWalletMode = "steward" | "local" | "blocked" | "none";

function getStewardStatusDescription(
  status: StewardStatusResponse | null,
): string {
  if (!status?.configured) {
    return "Set the Steward API settings to enable agent-controlled signing beside the browser workspace.";
  }
  if (!status.connected) {
    return (
      status.error?.trim() || "Steward is configured but currently unavailable."
    );
  }
  return "Send a Steward signing request without leaving the browser workspace.";
}

function getLocalWalletAddress(
  walletAddresses: WalletAddresses | null,
  walletConfig: WalletConfigStatus | null,
): string | null {
  return walletAddresses?.evmAddress ?? walletConfig?.evmAddress ?? null;
}

function resolveWalletMode(
  stewardStatus: StewardStatusResponse | null,
  localWalletAddress: string | null,
  walletConfig: WalletConfigStatus | null,
): BrowserWalletMode {
  if (stewardStatus?.connected) {
    return "steward";
  }
  if (localWalletAddress && walletConfig?.executionReady) {
    return "local";
  }
  if (localWalletAddress) {
    return "blocked";
  }
  return "none";
}

function getWalletHeading(
  loading: boolean,
  walletMode: BrowserWalletMode,
): string {
  if (loading) {
    return "Loading wallet…";
  }
  switch (walletMode) {
    case "steward":
      return "Steward connected";
    case "local":
      return "Local wallet ready";
    case "blocked":
      return "Local wallet connected";
    default:
      return "No wallet configured";
  }
}

function getWalletDescription(
  walletMode: BrowserWalletMode,
  stewardStatus: StewardStatusResponse | null,
  walletConfig: WalletConfigStatus | null,
): string {
  if (walletMode === "steward") {
    return getStewardStatusDescription(stewardStatus);
  }
  if (walletMode === "local") {
    const stewardFallbackReason =
      stewardStatus?.configured && !stewardStatus.connected
        ? stewardStatus.error?.trim()
        : null;
    const localWalletCopy =
      "Use the active wallet from the Wallets tab for direct BSC transfers beside the browser workspace.";
    return stewardFallbackReason
      ? `${stewardFallbackReason} Falling back to the Wallets tab transfer flow.`
      : localWalletCopy;
  }
  if (walletMode === "blocked") {
    return (
      walletConfig?.executionBlockedReason?.trim() ||
      "Local wallet execution is blocked. Finish setup in the Wallets tab."
    );
  }
  return "Set up an EVM wallet in the Wallets tab or connect Steward to enable browser-side transactions.";
}

function getWalletRailNote(walletMode: BrowserWalletMode): string | null {
  if (walletMode === "steward") {
    return "Use this rail to sign and review approvals while the browser workspace stays open.";
  }
  if (walletMode === "local") {
    return "This rail uses the same BSC transfer flow as the Wallets tab.";
  }
  return null;
}

function getLocalTransferMessage(result: BscTransferExecuteResponse): {
  message: string;
  tone: "info" | "success" | "error";
} {
  if (result.executed && result.execution?.hash) {
    const suffix = result.mode === "steward" ? " via Steward." : ".";
    return {
      message: `Submitted ${result.assetSymbol} transfer on BSC: ${result.execution.hash}${suffix}`,
      tone: "success",
    };
  }

  if (result.mode === "steward" && !result.requiresUserSignature) {
    if (result.execution?.status === "pending_approval") {
      return {
        message: "Transfer is waiting for Steward policy approval.",
        tone: "info",
      };
    }
    const reason =
      result.execution?.policyResults?.find((entry) => entry.reason)?.reason ??
      result.error ??
      "Steward policy rejected the transfer.";
    return {
      message: `Steward policy rejected the transfer: ${reason}`,
      tone: "error",
    };
  }

  if (result.requiresUserSignature) {
    return {
      message:
        "This wallet requires manual signing in the Wallets tab to finish the transfer.",
      tone: "info",
    };
  }

  return {
    message: "Transfer request could not be completed.",
    tone: "error",
  };
}

export function BrowserWorkspaceWalletPanel({
  selectedTabLabel,
  selectedTabUrl,
}: BrowserWorkspaceWalletPanelProps): JSX.Element {
  const {
    approveStewardTx,
    copyToClipboard,
    executeBscTransfer,
    getStewardPending,
    getStewardStatus,
    rejectStewardTx,
    setActionNotice,
    t,
    walletAddresses,
    walletConfig,
  } = useApp();
  const [walletConfigSnapshot, setWalletConfigSnapshot] =
    useState<WalletConfigStatus | null>(walletConfig);
  const [stewardStatus, setStewardStatus] =
    useState<StewardStatusResponse | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastRequestMessage, setLastRequestMessage] = useState<string | null>(
    null,
  );
  const [requestInFlight, setRequestInFlight] = useState(false);
  const [to, setTo] = useState("");
  const [value, setValue] = useState("0");
  const [chainId, setChainId] = useState("8453");
  const [description, setDescription] = useState("");
  const [data, setData] = useState("");
  const [amount, setAmount] = useState("");
  const [assetSymbol, setAssetSymbol] = useState("BNB");
  const [tokenAddress, setTokenAddress] = useState("");

  const loadWalletState = useCallback(async () => {
    setLoading(true);
    try {
      const [status, pending, config] = await Promise.all([
        getStewardStatus(),
        getStewardPending().catch(() => []),
        client.getWalletConfig().catch(() => null),
      ]);
      setStewardStatus(status);
      setPendingCount(Array.isArray(pending) ? pending.length : 0);
      if (config) {
        setWalletConfigSnapshot(config);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStewardStatus({
        configured: false,
        available: false,
        connected: false,
        error: message,
      });
    } finally {
      setLoading(false);
    }
  }, [getStewardPending, getStewardStatus]);

  useEffect(() => {
    void loadWalletState();
  }, [loadWalletState]);

  useEffect(() => {
    if (walletConfig) {
      setWalletConfigSnapshot(walletConfig);
    }
  }, [walletConfig]);

  const effectiveWalletConfig = walletConfig ?? walletConfigSnapshot;
  const localWalletAddress = getLocalWalletAddress(
    walletAddresses,
    effectiveWalletConfig,
  );
  const walletMode = resolveWalletMode(
    stewardStatus,
    localWalletAddress,
    effectiveWalletConfig,
  );
  const canSubmit = walletMode === "steward" || walletMode === "local";
  const walletHeading = getWalletHeading(loading, walletMode);
  const walletDescription = getWalletDescription(
    walletMode,
    stewardStatus,
    effectiveWalletConfig,
  );
  const walletRailNote = getWalletRailNote(walletMode);

  const handleCopyAddress = useCallback(async () => {
    const address =
      walletMode === "steward"
        ? (stewardStatus?.walletAddresses?.evm ??
          stewardStatus?.evmAddress ??
          null)
        : localWalletAddress;
    if (!address) {
      return;
    }
    await copyToClipboard(address);
    setActionNotice("Wallet address copied.", "success", 2000);
  }, [
    copyToClipboard,
    localWalletAddress,
    setActionNotice,
    stewardStatus,
    walletMode,
  ]);

  const handleWalletAction = useCallback(async () => {
    if (walletMode !== "steward") {
      const trimmedTo = to.trim();
      const trimmedAmount = amount.trim();
      const trimmedAssetSymbol = assetSymbol.trim().toUpperCase();

      if (!trimmedTo || !trimmedAmount || !trimmedAssetSymbol) {
        setActionNotice(
          "To, amount, and asset symbol are required.",
          "error",
          4000,
        );
        return;
      }

      if (!effectiveWalletConfig?.executionReady) {
        setActionNotice(
          effectiveWalletConfig?.executionBlockedReason?.trim() ||
            "Local wallet execution is blocked.",
          "error",
          4000,
        );
        return;
      }

      setRequestInFlight(true);
      try {
        const result = await executeBscTransfer({
          toAddress: trimmedTo,
          amount: trimmedAmount,
          assetSymbol: trimmedAssetSymbol,
          tokenAddress: tokenAddress.trim() || undefined,
          confirm: true,
        });
        const outcome = getLocalTransferMessage(result);
        setLastRequestMessage(outcome.message);
        setActionNotice(outcome.message, outcome.tone, 4000);
        if (result.mode === "steward") {
          await loadWalletState();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastRequestMessage(message);
        setActionNotice(message, "error", 5000);
      } finally {
        setRequestInFlight(false);
      }
      return;
    }

    const trimmedTo = to.trim();
    const trimmedValue = value.trim();
    const parsedChainId = Number(chainId);

    if (!trimmedTo || !trimmedValue || !Number.isFinite(parsedChainId)) {
      setActionNotice(
        "To, value, and a valid chain ID are required.",
        "error",
        4000,
      );
      return;
    }

    setRequestInFlight(true);
    try {
      const result = await client.signViaSteward({
        to: trimmedTo,
        value: trimmedValue,
        chainId: parsedChainId,
        data: data.trim() || undefined,
        description: description.trim() || undefined,
        broadcast: true,
      });

      if (result.approved) {
        const message = `Signed and broadcast on ${getChainName(parsedChainId)}${result.txHash ? `: ${result.txHash}` : "."}`;
        setLastRequestMessage(message);
        setActionNotice("Signature request broadcast.", "success", 4000);
      } else if (result.pending) {
        const message = `Queued for approval on ${getChainName(parsedChainId)}. Request ID: ${result.txId ?? "unknown"}`;
        setLastRequestMessage(message);
        setActionNotice("Signature request queued for approval.", "info", 4000);
      } else {
        const message =
          result.violations && result.violations.length > 0
            ? `Steward denied the request: ${result.violations
                .map((entry) => `${entry.policy} (${entry.reason})`)
                .join("; ")}`
            : "Steward denied the request.";
        setLastRequestMessage(message);
        setActionNotice(message, "error", 5000);
      }

      await loadWalletState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastRequestMessage(message);
      setActionNotice(message, "error", 5000);
    } finally {
      setRequestInFlight(false);
    }
  }, [
    amount,
    assetSymbol,
    chainId,
    data,
    description,
    executeBscTransfer,
    loadWalletState,
    setActionNotice,
    to,
    tokenAddress,
    value,
    effectiveWalletConfig?.executionBlockedReason,
    effectiveWalletConfig?.executionReady,
    walletMode,
  ]);

  const evmAddress =
    walletMode === "steward"
      ? (stewardStatus?.walletAddresses?.evm ??
        stewardStatus?.evmAddress ??
        null)
      : localWalletAddress;

  return (
    <div
      data-testid="browser-workspace-wallet-panel"
      className="flex min-h-0 flex-col gap-3"
    >
      <PagePanel variant="surface" className="space-y-4 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StewardLogo size={16} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                {t("browserworkspace.AgentWallet", {
                  defaultValue: "Agent wallet",
                })}
              </span>
            </div>
            <div className="text-lg font-semibold text-txt">
              {walletHeading}
            </div>
            <p className="text-sm leading-5 text-muted">{walletDescription}</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full px-3"
            onClick={() => void loadWalletState()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>

        {selectedTabLabel || selectedTabUrl ? (
          <div className="rounded-2xl border border-border/30 bg-card/50 px-3 py-3 text-xs text-muted">
            <div className="font-medium text-txt">
              {selectedTabLabel ?? "Active browser tab"}
            </div>
            {selectedTabUrl ? (
              <div className="mt-1 truncate">{selectedTabUrl}</div>
            ) : null}
          </div>
        ) : null}

        {walletRailNote ? (
          <div className="rounded-2xl border border-border/30 bg-card/50 px-3 py-3 text-xs leading-5 text-muted">
            {walletRailNote}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <MetaPill compact>
            {walletMode === "steward"
              ? `${pendingCount} pending`
              : walletMode === "local"
                ? "Local BSC"
                : walletMode === "blocked"
                  ? "Wallet blocked"
                  : "Wallet required"}
          </MetaPill>
          {evmAddress ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-border/30 bg-card/60 px-3 py-1.5 font-mono text-[11px] text-muted transition-colors hover:text-txt"
              onClick={() => void handleCopyAddress()}
            >
              {truncateAddress(evmAddress, 5)}
              <Copy className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </PagePanel>

      <PagePanel variant="surface" className="space-y-3 px-5 py-4">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
            {t("browserworkspace.Signing", {
              defaultValue: "Signing",
            })}
          </div>
          <div className="text-base font-semibold text-txt">
            {walletMode === "steward"
              ? t("browserworkspace.RequestTransaction", {
                  defaultValue: "Request a transaction",
                })
              : "Send a BSC transfer"}
          </div>
          <p className="text-sm text-muted">
            {walletMode === "steward"
              ? "Send a Steward signing request without leaving the browser workspace."
              : walletMode === "local"
                ? "Use the active wallet from the Wallets tab without leaving the browser workspace."
                : walletDescription}
          </p>
        </div>

        {canSubmit ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <label
                htmlFor="browser-workspace-wallet-to"
                className="space-y-1 text-xs text-muted"
              >
                <span>To</span>
                <Input
                  id="browser-workspace-wallet-to"
                  aria-label="To"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="0x..."
                  className={PANEL_INPUT_CLASSNAME}
                />
              </label>

              {walletMode === "steward" ? (
                <label
                  htmlFor="browser-workspace-wallet-value"
                  className="space-y-1 text-xs text-muted"
                >
                  <span>Value (wei)</span>
                  <Input
                    id="browser-workspace-wallet-value"
                    aria-label="Value (wei)"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className={PANEL_INPUT_CLASSNAME}
                  />
                </label>
              ) : (
                <label
                  htmlFor="browser-workspace-wallet-amount"
                  className="space-y-1 text-xs text-muted"
                >
                  <span>Amount</span>
                  <Input
                    id="browser-workspace-wallet-amount"
                    aria-label="Amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.01"
                    className={PANEL_INPUT_CLASSNAME}
                  />
                </label>
              )}

              {walletMode === "steward" ? (
                <label
                  htmlFor="browser-workspace-wallet-chain-id"
                  className="space-y-1 text-xs text-muted"
                >
                  <span>Chain ID</span>
                  <Input
                    id="browser-workspace-wallet-chain-id"
                    aria-label="Chain ID"
                    value={chainId}
                    onChange={(event) => setChainId(event.target.value)}
                    className={PANEL_INPUT_CLASSNAME}
                  />
                </label>
              ) : (
                <label
                  htmlFor="browser-workspace-wallet-asset"
                  className="space-y-1 text-xs text-muted"
                >
                  <span>Asset</span>
                  <Input
                    id="browser-workspace-wallet-asset"
                    aria-label="Asset"
                    value={assetSymbol}
                    onChange={(event) => setAssetSymbol(event.target.value)}
                    placeholder="BNB"
                    className={PANEL_INPUT_CLASSNAME}
                  />
                </label>
              )}

              {walletMode === "steward" ? (
                <label
                  htmlFor="browser-workspace-wallet-description"
                  className="space-y-1 text-xs text-muted"
                >
                  <span>Description</span>
                  <Input
                    id="browser-workspace-wallet-description"
                    aria-label="Description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={
                      selectedTabLabel
                        ? `Browser workspace request for ${selectedTabLabel}`
                        : "Browser workspace request"
                    }
                    className={PANEL_INPUT_CLASSNAME}
                  />
                </label>
              ) : (
                <label
                  htmlFor="browser-workspace-wallet-token-address"
                  className="space-y-1 text-xs text-muted"
                >
                  <span>Token address (optional)</span>
                  <Input
                    id="browser-workspace-wallet-token-address"
                    aria-label="Token address (optional)"
                    value={tokenAddress}
                    onChange={(event) => setTokenAddress(event.target.value)}
                    placeholder="0x..."
                    className={PANEL_INPUT_CLASSNAME}
                  />
                </label>
              )}
            </div>

            {walletMode === "steward" ? (
              <label
                htmlFor="browser-workspace-wallet-calldata"
                className="space-y-1 text-xs text-muted"
              >
                <span>Calldata (optional)</span>
                <textarea
                  id="browser-workspace-wallet-calldata"
                  aria-label="Calldata (optional)"
                  value={data}
                  onChange={(event) => setData(event.target.value)}
                  placeholder="0x"
                  className="min-h-[6rem] w-full rounded-[1.25rem] border border-border/35 bg-card/70 px-3 py-2 text-sm text-txt shadow-sm transition-colors focus-visible:border-accent/40"
                />
              </label>
            ) : null}

            {lastRequestMessage ? (
              <PagePanel.Notice tone="accent">
                {lastRequestMessage}
              </PagePanel.Notice>
            ) : null}

            <Button
              variant="default"
              size="sm"
              data-testid="browser-workspace-sign-submit"
              className="h-10 rounded-full px-5"
              onClick={() => void handleWalletAction()}
              disabled={requestInFlight}
            >
              {requestInFlight ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {requestInFlight
                ? "Submitting…"
                : walletMode === "steward"
                  ? "Request signature"
                  : "Send transfer"}
            </Button>
          </>
        ) : (
          <PagePanel.Notice tone="accent">{walletDescription}</PagePanel.Notice>
        )}
      </PagePanel>

      {walletMode === "steward" ? (
        <PagePanel
          variant="surface"
          className="flex min-h-[20rem] flex-1 flex-col px-5 py-4"
        >
          <div className="mb-3 space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
              Pending approvals
            </div>
            <div className="text-base font-semibold text-txt">
              Approval queue
            </div>
          </div>
          <ApprovalQueue
            embedded
            getStewardPending={getStewardPending}
            approveStewardTx={approveStewardTx}
            rejectStewardTx={rejectStewardTx}
            copyToClipboard={copyToClipboard}
            setActionNotice={setActionNotice}
            onPendingCountChange={setPendingCount}
            refreshKey={pendingCount}
          />
        </PagePanel>
      ) : null}
    </div>
  );
}
