import { useEffect, useMemo, useState } from "react";
import { DrawerShell } from "./DrawerShell.js";
import { useApp } from "../AppContext.js";
import { AvatarSelector } from "./AvatarSelector.js";
import { resolveAgentDisplayName } from "./shared/agentDisplayName.js";
import { SectionShell } from "./SectionShell.js";
import { Button } from "./ui/Button.js";
import { SummaryStatRow } from "./SummaryStatRow.js";
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
    setState,
    setTab,
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

  const hasIdentityProfile = Boolean(characterData && Object.keys(characterData).length > 0);
  const hasAvatar = selectedVrmIndex !== null && selectedVrmIndex !== undefined;
  const hasWallets = Boolean(walletAddresses?.evmAddress || walletAddresses?.solanaAddress);

  const summaryRows = useMemo(
    () => [
      { label: "Agent", value: agentName },
      {
        label: "Portfolio",
        value: walletAddresses?.evmAddress || walletAddresses?.solanaAddress
          ? walletTotalUsd > 0
            ? `$${walletTotalUsd.toFixed(2)}`
            : "Linked"
          : "Not linked",
      },
      { label: "Networks", value: linkedChains },
    ],
    [agentName, linkedChains, walletAddresses?.evmAddress, walletAddresses?.solanaAddress, walletTotalUsd],
  );

  const sectionLabels: Record<AssetVaultSection, string> = {
    identity: "Identity",
    character: "Avatar",
    wallets: "Wallets",
  };

  if (!open) return null;

  return (
    <Sheet open={open} onClose={onClose} side="right" className="w-[min(46rem,100vw)]">
      <DrawerShell
        icon={<VaultIcon width="18" height="18" />}
        title="Asset Vault"
        description="Identity, avatar, and wallets."
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
          <SummaryStatRow items={summaryRows} className="pro-streamer-drawer-summary-row" />
        }
      >
        {activeSection === "identity" ? (
          <SectionShell
            title="Identity"
            description="Public-facing profile and persona."
            contentClassName="gap-3"
          >
            <div className="pro-streamer-status-grid">
              <div className="pro-streamer-status-card">
                <div className="pro-streamer-status-card__label">Agent</div>
                <div className="pro-streamer-status-card__value">{agentName}</div>
                <div className="pro-streamer-status-card__meta">Active display name</div>
              </div>
              <div className="pro-streamer-status-card">
                <div className="pro-streamer-status-card__label">Profile</div>
                <div className="pro-streamer-status-card__value">
                  {hasIdentityProfile ? "Configured" : "Not configured"}
                </div>
                <div className="pro-streamer-status-card__meta">
                  {hasIdentityProfile ? "Ready for stream" : "Import or create a profile"}
                </div>
              </div>
              <div className="pro-streamer-status-card">
                <div className="pro-streamer-status-card__label">Networks</div>
                <div className="pro-streamer-status-card__value">{linkedChains}</div>
                <div className="pro-streamer-status-card__meta">Linked identities</div>
              </div>
            </div>
            {!hasIdentityProfile ? (
              <div className="pro-streamer-inline-state">
                <div>
                  <div className="pro-streamer-inline-state__title">No identity profile yet</div>
                  <div className="pro-streamer-inline-state__copy">
                    Open identity controls to configure persona, profile, and public metadata.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => {
                    setTab("identity");
                    onClose();
                  }}
                >
                  Open identity controls
                </Button>
              </div>
            ) : null}
          </SectionShell>
        ) : null}

        {activeSection === "character" ? (
          <SectionShell
            title="Avatar"
            description="Choose the model used on stage."
            contentClassName="gap-3"
          >
            <div className="pro-streamer-status-grid">
              <div className="pro-streamer-status-card">
                <div className="pro-streamer-status-card__label">Active avatar</div>
                <div className="pro-streamer-status-card__value">
                  {typeof selectedVrmIndex === "number" ? `Model ${selectedVrmIndex}` : "Not linked"}
                </div>
                <div className="pro-streamer-status-card__meta">
                  {hasAvatar ? "Ready for stage" : "Choose a model below"}
                </div>
              </div>
            </div>
            <AvatarSelector
              fullWidth
              showUpload={false}
              selected={typeof selectedVrmIndex === "number" ? selectedVrmIndex : 1}
              onSelect={(index) => setState("selectedVrmIndex", index)}
            />
          </SectionShell>
        ) : null}

        {activeSection === "wallets" ? (
          <SectionShell
            title="Wallets"
            description="Addresses, balances, and linked chains."
            contentClassName="gap-3"
          >
            <div className="pro-streamer-status-grid">
              <div className="pro-streamer-status-card">
                <div className="pro-streamer-status-card__label">Portfolio</div>
                <div className="pro-streamer-status-card__value">
                  {walletTotalUsd > 0 ? `$${walletTotalUsd.toFixed(2)}` : hasWallets ? "Linked" : "Not linked"}
                </div>
                <div className="pro-streamer-status-card__meta">Estimated total</div>
              </div>
              <div className="pro-streamer-status-card">
                <div className="pro-streamer-status-card__label">EVM</div>
                <div className="pro-streamer-status-card__value break-all">
                  {walletAddresses?.evmAddress ?? "Not linked"}
                </div>
                <div className="pro-streamer-status-card__meta">Primary address</div>
              </div>
              <div className="pro-streamer-status-card">
                <div className="pro-streamer-status-card__label">Solana</div>
                <div className="pro-streamer-status-card__value break-all">
                  {walletAddresses?.solanaAddress ?? "Not linked"}
                </div>
                <div className="pro-streamer-status-card__meta">Primary address</div>
              </div>
            </div>
            {!hasWallets ? (
              <div className="pro-streamer-inline-state">
                <div>
                  <div className="pro-streamer-inline-state__title">No wallets linked</div>
                  <div className="pro-streamer-inline-state__copy">
                    Connect a wallet to surface balances, addresses, and network state.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => {
                    setTab("wallets");
                    onClose();
                  }}
                >
                  Open wallet tools
                </Button>
              </div>
            ) : null}
          </SectionShell>
        ) : null}
      </DrawerShell>
    </Sheet>
  );
}
