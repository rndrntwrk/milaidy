/**
 * Inventory view — wallet balances and NFTs.
 */

import { type ComponentType, type SVGProps, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { EvmChainBalance } from "../api-client";
import { SectionEmptyState, SectionErrorState, SectionSkeleton } from "./SectionStates.js";
import { SectionShell } from "./SectionShell.js";
import { SectionToolbar } from "./SectionToolbar.js";
import { SummaryStatRow } from "./SummaryStatRow.js";
import { Button } from "./ui/Button.js";
import {
  ArbitrumIcon,
  BaseChainIcon,
  EthereumIcon,
  OptimismIcon,
  PolygonIcon,
  SolanaIcon,
  StackIcon,
} from "./ui/Icons";

function chainIcon(chain: string): { Icon: ComponentType<SVGProps<SVGSVGElement>>; cls: string } {
  const c = chain.toLowerCase();
  if (c === "ethereum" || c === "mainnet") return { Icon: EthereumIcon, cls: "bg-chain-eth" };
  if (c === "base") return { Icon: BaseChainIcon, cls: "bg-chain-base" };
  if (c === "arbitrum") return { Icon: ArbitrumIcon, cls: "bg-chain-arb" };
  if (c === "optimism") return { Icon: OptimismIcon, cls: "bg-chain-op" };
  if (c === "polygon") return { Icon: PolygonIcon, cls: "bg-chain-pol" };
  if (c === "solana") return { Icon: SolanaIcon, cls: "bg-chain-sol" };
  return { Icon: StackIcon, cls: "bg-bg-muted" };
}

function formatBalance(balance: string): string {
  const num = Number.parseFloat(balance);
  if (Number.isNaN(num)) return balance;
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  if (num < 1) return num.toFixed(6);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

interface TokenRow {
  chain: string;
  symbol: string;
  name: string;
  balance: string;
  valueUsd: number;
  balanceRaw: number;
}

interface NftItem {
  chain: string;
  name: string;
  imageUrl: string;
  collectionName: string;
}

function CopyableAddress({ address, onCopy }: { address: string; onCopy: (text: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const handleCopy = async () => {
    await onCopy(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="rounded-full px-3">
      {copied ? "Copied" : short}
    </Button>
  );
}

export function InventoryView() {
  const {
    walletConfig,
    walletAddresses,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    inventoryView,
    inventorySort,
    walletError,
    loadBalances,
    loadNfts,
    cloudConnected,
    setTab,
    setState,
    copyToClipboard,
  } = useApp();

  const cfg = walletConfig;
  const needsSetup = !cloudConnected && (!cfg || (!cfg.alchemyKeySet && !cfg.heliusKeySet));

  const tokenRows = useMemo((): TokenRow[] => {
    if (!walletBalances) return [];
    const rows: TokenRow[] = [];
    if (walletBalances.evm) {
      for (const chain of walletBalances.evm.chains) {
        if (chain.error) continue;
        rows.push({ chain: chain.chain, symbol: chain.nativeSymbol, name: `${chain.chain} native`, balance: chain.nativeBalance, valueUsd: Number.parseFloat(chain.nativeValueUsd) || 0, balanceRaw: Number.parseFloat(chain.nativeBalance) || 0 });
        for (const t of chain.tokens) {
          rows.push({ chain: chain.chain, symbol: t.symbol, name: t.name, balance: t.balance, valueUsd: Number.parseFloat(t.valueUsd) || 0, balanceRaw: Number.parseFloat(t.balance) || 0 });
        }
      }
    }
    if (walletBalances.solana) {
      rows.push({ chain: "Solana", symbol: "SOL", name: "Solana native", balance: walletBalances.solana.solBalance, valueUsd: Number.parseFloat(walletBalances.solana.solValueUsd) || 0, balanceRaw: Number.parseFloat(walletBalances.solana.solBalance) || 0 });
      for (const t of walletBalances.solana.tokens) {
        rows.push({ chain: "Solana", symbol: t.symbol, name: t.name, balance: t.balance, valueUsd: Number.parseFloat(t.valueUsd) || 0, balanceRaw: Number.parseFloat(t.balance) || 0 });
      }
    }
    return rows;
  }, [walletBalances]);

  const sortedRows = useMemo(() => {
    const sorted = [...tokenRows];
    if (inventorySort === "value") sorted.sort((a, b) => b.valueUsd - a.valueUsd || b.balanceRaw - a.balanceRaw);
    else if (inventorySort === "chain") sorted.sort((a, b) => a.chain.localeCompare(b.chain) || a.symbol.localeCompare(b.symbol));
    else if (inventorySort === "symbol") sorted.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.chain.localeCompare(b.chain));
    return sorted;
  }, [tokenRows, inventorySort]);

  const chainErrors = useMemo(() => (walletBalances?.evm?.chains ?? []).filter((c: EvmChainBalance) => c.error), [walletBalances]);

  const allNfts = useMemo((): NftItem[] => {
    if (!walletNfts) return [];
    const items: NftItem[] = [];
    for (const chainData of walletNfts.evm) {
      for (const nft of chainData.nfts) {
        items.push({ chain: chainData.chain, name: nft.name, imageUrl: nft.imageUrl, collectionName: nft.collectionName || nft.tokenType });
      }
    }
    if (walletNfts.solana) {
      for (const nft of walletNfts.solana.nfts) {
        items.push({ chain: "Solana", name: nft.name, imageUrl: nft.imageUrl, collectionName: nft.collectionName });
      }
    }
    return items;
  }, [walletNfts]);

  const totalUsd = useMemo(() => sortedRows.reduce((sum, row) => sum + row.valueUsd, 0), [sortedRows]);
  const walletCount = [walletAddresses?.evmAddress, walletAddresses?.solanaAddress].filter(Boolean).length;

  if (needsSetup) {
    return (
      <SectionEmptyState
        title="Wallets need setup"
        description="Connect RPC providers or enable Eliza Cloud before browsing balances and NFTs."
        actionLabel="Open settings"
        onAction={() => setTab("settings")}
      />
    );
  }

  const summaryItems = [
    { label: "Wallets", value: `${walletCount}`, hint: walletCount === 1 ? "linked wallet" : "linked wallets" },
    { label: "Portfolio", value: totalUsd > 0 ? `$${totalUsd.toFixed(2)}` : "Unavailable" },
    { label: "Assets", value: `${sortedRows.length}`, hint: "tracked tokens" },
    { label: "Collectibles", value: `${allNfts.length}`, hint: "NFTs" },
  ];

  return (
    <div className="space-y-4">
      {walletError ? (
        <SectionErrorState
          title="Wallet data unavailable"
          description="Balances or addresses could not be loaded right now."
          actionLabel="Retry"
          onAction={() => { void loadBalances(); void loadNfts(); }}
          details={walletError}
        />
      ) : null}

      <SectionShell
        title="Wallets"
        description="Balances, addresses, and collectibles across connected chains."
        toolbar={
          <SectionToolbar>
            <Button
              type="button"
              variant={inventoryView === "tokens" ? "secondary" : "outline"}
              onClick={() => { setState("inventoryView", "tokens"); if (!walletBalances) void loadBalances(); }}
            >
              Tokens
            </Button>
            <Button
              type="button"
              variant={inventoryView === "nfts" ? "secondary" : "outline"}
              onClick={() => { setState("inventoryView", "nfts"); if (!walletNfts) void loadNfts(); }}
            >
              NFTs
            </Button>
            <Button type="button" variant="outline" onClick={() => inventoryView === "tokens" ? loadBalances() : loadNfts()}>
              Refresh
            </Button>
          </SectionToolbar>
        }
      >
        <SummaryStatRow items={summaryItems} />
      </SectionShell>

      {inventoryView === "tokens" ? renderTokensView() : renderNftsView()}

      {chainErrors.length > 0 ? (
        <SectionErrorState
          title="Some networks are unavailable"
          description="One or more chain providers returned errors while loading balances."
          details={chainErrors.map((c: EvmChainBalance) => `${c.chain}: ${c.error}`).join("\n")}
        />
      ) : null}
    </div>
  );

  function renderTokensView() {
    if (walletLoading) return <SectionSkeleton lines={4} />;

    const evmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;
    const solAddr = walletAddresses?.solanaAddress ?? walletConfig?.solanaAddress;

    if (!evmAddr && !solAddr) {
      return (
        <SectionEmptyState
          title="No wallets linked"
          description="Link an EVM or Solana wallet in settings to browse balances here."
          actionLabel="Open settings"
          onAction={() => setTab("settings")}
        />
      );
    }

    const evmRows = sortedRows.filter((r) => r.chain.toLowerCase() !== "solana");
    const solanaRows = sortedRows.filter((r) => r.chain.toLowerCase() === "solana");

    return (
      <div className="space-y-4">
        <SectionToolbar className="justify-between">
          <div className="flex items-center gap-2 text-sm text-white/58">
            <span>Sort</span>
            <Button type="button" variant={inventorySort === "value" ? "secondary" : "outline"} size="sm" onClick={() => setState("inventorySort", "value")}>Value</Button>
            <Button type="button" variant={inventorySort === "chain" ? "secondary" : "outline"} size="sm" onClick={() => setState("inventorySort", "chain")}>Chain</Button>
            <Button type="button" variant={inventorySort === "symbol" ? "secondary" : "outline"} size="sm" onClick={() => setState("inventorySort", "symbol")}>Name</Button>
          </div>
        </SectionToolbar>
        {evmAddr ? renderChainSection("Ethereum", "ethereum", evmAddr, evmRows, true) : null}
        {solAddr ? renderChainSection("Solana", "solana", solAddr, solanaRows, false) : null}
      </div>
    );
  }

  function renderChainSection(chainName: string, chainKey: string, address: string, rows: TokenRow[], showSubChain: boolean) {
    const icon = chainIcon(chainKey);
    return (
      <SectionShell
        title={chainName}
        description="Address and token balances."
        toolbar={<CopyableAddress address={address} onCopy={copyToClipboard} />}
      >
        {rows.length === 0 ? (
          <SectionEmptyState title="No assets found" description="This wallet has no detected token balances on the selected network." />
        ) : (
          <div className="pro-streamer-data-table-wrap">
            <table className="pro-streamer-data-table">
              <thead>
                <tr>
                  {showSubChain ? <th>Chain</th> : null}
                  <th>Asset</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const subIcon = showSubChain ? chainIcon(row.chain) : null;
                  return (
                    <tr key={`${row.chain}-${row.symbol}-${idx}`}>
                      {showSubChain ? (
                        <td>
                          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-white ${subIcon?.cls ?? "bg-bg-muted"}`}>
                            {subIcon ? <subIcon.Icon className="h-2.5 w-2.5" /> : null}
                          </span>
                        </td>
                      ) : null}
                      <td>
                        <div className="flex flex-col">
                          <span className="font-medium text-white/88">{row.symbol}</span>
                          <span className="text-xs text-white/48">{row.name}</span>
                        </div>
                      </td>
                      <td className="text-right font-mono">{formatBalance(row.balance)}</td>
                      <td className="text-right font-mono">{row.valueUsd > 0 ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>
    );
  }

  function renderNftsView() {
    if (walletNftsLoading) return <SectionSkeleton lines={4} />;
    if (!walletNfts) {
      return (
        <SectionEmptyState
          title="NFTs unavailable"
          description="Refresh collectibles to load the latest NFT inventory."
          actionLabel="Refresh"
          onAction={() => void loadNfts()}
        />
      );
    }
    if (allNfts.length === 0) {
      return <SectionEmptyState title="No NFTs found" description="No collectibles were detected across linked wallets." />;
    }
    return (
      <SectionShell title="Collectibles" description="NFTs grouped across linked wallets.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {allNfts.map((nft, idx) => {
            const icon = chainIcon(nft.chain);
            return (
              <div key={`${nft.chain}-${nft.name}-${idx}`} className="pro-streamer-media-card">
                {nft.imageUrl ? (
                  <img src={nft.imageUrl} alt={nft.name} loading="lazy" className="pro-streamer-media-card__image" />
                ) : (
                  <div className="pro-streamer-media-card__placeholder">No image</div>
                )}
                <div className="pro-streamer-media-card__body">
                  <div className="pro-streamer-media-card__title">{nft.name}</div>
                  <div className="pro-streamer-media-card__meta">{nft.collectionName}</div>
                  <div className="inline-flex items-center gap-1 text-[10px] text-white/48">
                    <span className={`inline-flex h-3 w-3 items-center justify-center rounded-full text-white ${icon.cls}`}>
                      <icon.Icon className="h-2 w-2" />
                    </span>
                    {nft.chain}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionShell>
    );
  }
}
