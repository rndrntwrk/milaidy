import { useEffect, useMemo, useState } from "react";
import { CharacterView } from "./CharacterView.js";
import { DrawerShell } from "./DrawerShell.js";
import { InventoryView } from "./InventoryView.js";
import { IdentityPanel } from "./IdentityPanel.js";
import { useApp } from "../AppContext.js";
import { resolveAgentDisplayName } from "./shared/agentDisplayName.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { VaultIcon } from "./ui/Icons.js";
import { Sheet } from "./ui/Sheet.js";

export type AssetVaultSection = "character" | "wallets" | "identity";

export function miladyAssetSectionForTab(
  tab: string,
): AssetVaultSection | null {
  switch (tab) {
    case "character":
      return "character";
    case "wallets":
      return "wallets";
    case "identity":
      return "identity";
    default:
      return null;
  }
}

export function AssetVaultDrawer({
  open,
  onClose,
  section = "identity",
}: {
  open: boolean;
  onClose: () => void;
  section?: AssetVaultSection;
}) {
  const {
    characterData,
    selectedVrmIndex,
    walletAddresses,
    walletBalances,
    agentStatus,
  } = useApp();
  const [activeSection, setActiveSection] = useState<AssetVaultSection>(section);
  const agentName = resolveAgentDisplayName(characterData?.name, agentStatus?.agentName);

  useEffect(() => {
    setActiveSection(section);
  }, [section]);

  const walletTotalUsd = useMemo(() => {
    if (!walletBalances) return 0;
    let total = 0;
    if (walletBalances.evm) {
      for (const chain of walletBalances.evm.chains) {
        if (chain.error) continue;
        total += Number.parseFloat(chain.nativeValueUsd) || 0;
        for (const token of chain.tokens) {
          total += Number.parseFloat(token.valueUsd) || 0;
        }
      }
    }
    if (walletBalances.solana) {
      total += Number.parseFloat(walletBalances.solana.solValueUsd) || 0;
      for (const token of walletBalances.solana.tokens) {
        total += Number.parseFloat(token.valueUsd) || 0;
      }
    }
    return total;
  }, [walletBalances]);

  const linkedChains = useMemo(() => {
    const chains: string[] = [];
    if (walletAddresses?.evmAddress) chains.push("EVM");
    if (walletAddresses?.solanaAddress) chains.push("Solana");
    return chains.length > 0 ? chains.join(" + ") : "Not linked";
  }, [walletAddresses?.evmAddress, walletAddresses?.solanaAddress]);

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 6)}...${walletAddresses.evmAddress.slice(-4)}`
    : "Not linked";
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : "Not linked";

  const summaryRows = useMemo(
    () => [
      {
        label: "Avatar",
        value: selectedVrmIndex === 0 ? "custom vrm" : `vrm ${selectedVrmIndex}`,
      },
      {
        label: "Identity",
        value: agentName,
      },
      {
        label: "EVM",
        value: evmShort,
      },
      {
        label: "Solana",
        value: solShort,
      },
      {
        label: "Chains",
        value: linkedChains,
      },
      {
        label: "Balance",
        value: walletTotalUsd > 0 ? `$${walletTotalUsd.toFixed(2)}` : "Unavailable",
      },
    ],
    [agentName, evmShort, linkedChains, selectedVrmIndex, solShort, walletTotalUsd],
  );

  const sectionLabels: Record<AssetVaultSection, string> = {
    identity: "Identity",
    character: "Avatar",
    wallets: "Wallets",
  };

  const sectionCopy: Record<AssetVaultSection, string> = {
    identity: "Public-facing profile, persona, and identity controls.",
    character: "Avatar selection and stage presence for stream.",
    wallets: "Balances, addresses, and linked wallet surfaces.",
  };

  if (!open) return null;

  return (
    <Sheet open={open} onClose={onClose} side="right" className="w-[min(46rem,100vw)]">
      <DrawerShell
        icon={<VaultIcon width="18" height="18" />}
        title="Asset Vault"
        description="Identity, avatar, and linked wallets."
        badge={
          <Badge variant="outline" className="rounded-full px-3 py-1">
            Stream-facing
          </Badge>
        }
        onClose={onClose}
        toolbar={
          <div className="grid grid-cols-3 gap-2">
            {(["identity", "character", "wallets"] as AssetVaultSection[]).map(
              (entry) => (
                <Button
                  key={entry}
                  variant={activeSection === entry ? "secondary" : "ghost"}
                  className={`rounded-2xl border ${
                    activeSection === entry
                      ? "border-white/18 bg-white/[0.14] text-white"
                      : "border-white/8 text-white/55 hover:border-white/16 hover:bg-white/[0.06] hover:text-white"
                  }`}
                  onClick={() => setActiveSection(entry)}
                >
                  {sectionLabels[entry]}
                </Button>
              ),
            )}
          </div>
        }
        summary={
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/48">
              {sectionCopy[activeSection]}
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {summaryRows.map((row) => (
                <Card key={row.label} className="rounded-2xl px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                    {row.label}
                  </div>
                  <div className="mt-1 truncate text-sm text-white/88" title={row.value}>
                    {row.value}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        }
      >
          {activeSection === "character" ? <CharacterView /> : null}
          {activeSection === "wallets" ? <InventoryView /> : null}
          {activeSection === "identity" ? <IdentityPanel /> : null}
      </DrawerShell>
    </Sheet>
  );
}
