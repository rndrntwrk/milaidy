/**
 * Config page — agent-level configuration.
 *
 * Sections:
 *   1. Wallet & RPC providers
 *   2. Secrets (modal)
 */

import { useCallback, useState } from "react";
import { useApp } from "../AppContext";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { SecretsView } from "./SecretsView";
import { SelectablePillGrid } from "./SelectablePillGrid";
import { SectionShell } from "./SectionShell";
import { Button } from "./ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import { Dialog } from "./ui/Dialog";
import { ScrollArea } from "./ui/ScrollArea";
import { CloudIcon, CloseIcon, LockIcon, WalletIcon } from "./ui/Icons";

type RpcProviderOption<T extends string> = {
  id: T;
  label: string;
};

type RpcFieldDefinition = {
  configKey: string;
  label: string;
  isSet: boolean;
};

type RpcFieldGroup = ReadonlyArray<RpcFieldDefinition>;

type RpcSectionConfigMap = Record<string, RpcFieldGroup>;

const EVM_RPC_OPTIONS = [
  { id: "eliza-cloud", label: "Eliza Cloud" },
  { id: "alchemy", label: "Alchemy" },
  { id: "infura", label: "Infura" },
  { id: "ankr", label: "Ankr" },
] as const;

const SOLANA_RPC_OPTIONS = [
  { id: "eliza-cloud", label: "Eliza Cloud" },
  { id: "helius-birdeye", label: "Helius + Birdeye" },
] as const;

type CloudRpcStatusProps = {
  connected: boolean;
  credits: number | null;
  creditsLow: boolean;
  creditsCritical: boolean;
  topUpUrl: string | null;
  loginBusy: boolean;
  onLogin: () => void;
};

function CloudRpcStatus({
  connected,
  credits,
  creditsLow,
  creditsCritical,
  topUpUrl,
  loginBusy,
  onLogin,
}: CloudRpcStatusProps) {
  if (connected) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/68">
        <CloudIcon className="h-4 w-4 text-white/68" />
        <span className="font-semibold text-white/86">Connected to Eliza Cloud</span>
        {credits !== null && (
          <span className="ml-auto text-white/46">
            Credits:{" "}
            <span
              className={
                creditsCritical
                  ? "font-bold text-[var(--danger,#e74c3c)]"
                  : creditsLow
                    ? "font-bold text-[#d8ad4f]"
                    : ""
              }
            >
              ${credits.toFixed(2)}
            </span>
            {topUpUrl && (
              <a
                href={topUpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1.5 text-[10px] text-[var(--accent)]"
              >
                Top up
              </a>
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs">
        <CloudIcon className="h-4 w-4 text-white/34" />
        <span className="text-white/46">Requires Eliza Cloud connection</span>
      </div>
      <Button size="sm" variant="outline" onClick={() => void onLogin()} disabled={loginBusy}>
        {loginBusy ? "Connecting..." : "Log in"}
      </Button>
    </div>
  );
}

function buildRpcRendererConfig(
  selectedProvider: string,
  providerConfigs: RpcSectionConfigMap,
  rpcFieldValues: Record<string, string>,
) {
  const fields = providerConfigs[selectedProvider];
  if (!fields?.length) return null;

  const props: {
    schema: JsonSchemaObject;
    hints: Record<string, ConfigUiHint>;
    values: Record<string, unknown>;
    setKeys: Set<string>;
  } = {
    schema: {
      type: "object",
      properties: {},
      required: [],
    },
    hints: {},
    values: {},
    setKeys: new Set<string>(),
  };

  for (const field of fields) {
    props.schema.properties[field.configKey] = {
      type: "string",
      description: field.label,
    };
    props.hints[field.configKey] = {
      label: field.label,
      sensitive: true,
      placeholder: field.isSet
        ? "Already set — leave blank to keep"
        : "Enter API key",
      width: "full",
    };
    if (rpcFieldValues[field.configKey] !== undefined) {
      props.values[field.configKey] = rpcFieldValues[field.configKey];
    }
    if (field.isSet) {
      props.setKeys.add(field.configKey);
    }
  }

  return props;
}

type RpcSectionCloudProps = CloudRpcStatusProps;

type RpcSectionProps<T extends string> = {
  title: string;
  description: string;
  options: readonly RpcProviderOption<T>[];
  selectedProvider: T;
  onSelect: (provider: T) => void;
  providerConfigs: RpcSectionConfigMap;
  rpcFieldValues: Record<string, string>;
  onRpcFieldChange: (key: string, value: unknown) => void;
  cloud: RpcSectionCloudProps;
  containerClassName: string;
};

function RpcConfigSection<T extends string>({
  title,
  description,
  options,
  selectedProvider,
  onSelect,
  providerConfigs,
  rpcFieldValues,
  onRpcFieldChange,
  cloud,
  containerClassName,
}: RpcSectionProps<T>) {
  const rpcConfig = buildRpcRendererConfig(
    selectedProvider,
    providerConfigs,
    rpcFieldValues,
  );

  return (
    <SectionShell title={title} description={description} contentClassName="gap-4">
      {renderRpcProviderButtons(
        options,
        selectedProvider,
        onSelect,
        containerClassName,
      )}

      <div>
        {selectedProvider === "eliza-cloud" ? (
          <CloudRpcStatus
            connected={cloud.connected}
            credits={cloud.credits}
            creditsLow={cloud.creditsLow}
            creditsCritical={cloud.creditsCritical}
            topUpUrl={cloud.topUpUrl}
            loginBusy={cloud.loginBusy}
            onLogin={() => void cloud.onLogin()}
          />
        ) : rpcConfig ? (
          <ConfigRenderer
            schema={rpcConfig.schema}
            hints={rpcConfig.hints}
            values={rpcConfig.values}
            setKeys={rpcConfig.setKeys}
            registry={defaultRegistry}
            onChange={onRpcFieldChange}
          />
        ) : null}
      </div>
    </SectionShell>
  );
}

function renderRpcProviderButtons<T extends string>(
  options: readonly RpcProviderOption<T>[],
  selectedProvider: T,
  onSelect: (provider: T) => void,
  containerClassName: string,
) {
  return (
    <SelectablePillGrid
      className={containerClassName}
      value={selectedProvider}
      onChange={onSelect}
      options={options.map((provider) => ({
        value: provider.id,
        label: provider.label,
      }))}
    />
  );
}

export function ConfigPageView({ embedded = false }: { embedded?: boolean }) {
  const {
    cloudConnected,
    cloudCredits,
    cloudCreditsLow,
    cloudCreditsCritical,
    cloudTopUpUrl,
    cloudLoginBusy,
    walletConfig,
    walletApiKeySaving,
    handleWalletApiKeySave,
    handleCloudLogin,
  } = useApp();

  const [secretsOpen, setSecretsOpen] = useState(false);
  const [rpcFieldValues, setRpcFieldValues] = useState<Record<string, string>>(
    {},
  );

  const handleRpcFieldChange = useCallback((key: string, value: unknown) => {
    setRpcFieldValues((prev) => ({ ...prev, [key]: String(value ?? "") }));
  }, []);

  const handleWalletSaveAll = useCallback(() => {
    const config: Record<string, string> = {};
    for (const [key, value] of Object.entries(rpcFieldValues)) {
      if (value) config[key] = value;
    }
    void handleWalletApiKeySave(config);
  }, [handleWalletApiKeySave, rpcFieldValues]);

  const [selectedEvmRpc, setSelectedEvmRpc] = useState<
    "eliza-cloud" | "alchemy" | "infura" | "ankr"
  >("eliza-cloud");
  const [selectedSolanaRpc, setSelectedSolanaRpc] = useState<
    "eliza-cloud" | "helius-birdeye"
  >("eliza-cloud");

  const evmRpcConfigs: RpcSectionConfigMap = {
    alchemy: [
      {
        configKey: "ALCHEMY_API_KEY",
        label: "Alchemy API Key",
        isSet: walletConfig?.alchemyKeySet ?? false,
      },
    ],
    infura: [
      {
        configKey: "INFURA_API_KEY",
        label: "Infura API Key",
        isSet: walletConfig?.infuraKeySet ?? false,
      },
    ],
    ankr: [
      {
        configKey: "ANKR_API_KEY",
        label: "Ankr API Key",
        isSet: walletConfig?.ankrKeySet ?? false,
      },
    ],
  };

  const solanaRpcConfigs: RpcSectionConfigMap = {
    "helius-birdeye": [
      {
        configKey: "HELIUS_API_KEY",
        label: "Helius API Key",
        isSet: walletConfig?.heliusKeySet ?? false,
      },
      {
        configKey: "BIRDEYE_API_KEY",
        label: "Birdeye API Key",
        isSet: walletConfig?.birdeyeKeySet ?? false,
      },
    ],
  };

  const cloudStatusProps = {
    connected: cloudConnected,
    credits: cloudCredits,
    creditsLow: cloudCreditsLow,
    creditsCritical: cloudCreditsCritical,
    topUpUrl: cloudTopUpUrl,
    loginBusy: cloudLoginBusy,
    onLogin: () => void handleCloudLogin(),
  };

  return (
    <div>
      {!embedded && (
        <>
          <h2 className="mb-1 text-lg font-bold">Config</h2>
          <p className="mb-5 text-[13px] text-[var(--muted)]">
            Wallet providers and secrets.
          </p>
        </>
      )}

      <Card className="border-white/10 bg-white/[0.04]">
        <CardHeader className="gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <WalletIcon className="h-4 w-4 text-white/70" />
              Wallet &amp; RPC
            </CardTitle>
            <CardDescription>
              Configure provider keys and cloud-backed RPC access for EVM and Solana.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSecretsOpen(true)}
            title="Secrets Vault"
          >
            <LockIcon className="h-4 w-4" />
            Secrets
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <RpcConfigSection
              title="EVM"
              description="Ethereum, Base, Arbitrum, Optimism, Polygon"
              options={EVM_RPC_OPTIONS}
              selectedProvider={selectedEvmRpc}
              onSelect={setSelectedEvmRpc}
              providerConfigs={evmRpcConfigs}
              rpcFieldValues={rpcFieldValues}
              onRpcFieldChange={handleRpcFieldChange}
              cloud={cloudStatusProps}
              containerClassName="grid grid-cols-2 gap-1.5 xl:grid-cols-4"
            />

            <RpcConfigSection
              title="Solana"
              description="Solana mainnet tokens and NFTs"
              options={SOLANA_RPC_OPTIONS}
              selectedProvider={selectedSolanaRpc}
              onSelect={setSelectedSolanaRpc}
              providerConfigs={solanaRpcConfigs}
              rpcFieldValues={rpcFieldValues}
              onRpcFieldChange={handleRpcFieldChange}
              cloud={cloudStatusProps}
              containerClassName="grid grid-cols-2 gap-1.5"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleWalletSaveAll} disabled={walletApiKeySaving}>
              {walletApiKeySaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {secretsOpen && (
        <Dialog open={secretsOpen} onClose={() => setSecretsOpen(false)} className="max-w-2xl bg-[#080808]/95">
          <Card className="flex max-h-[80vh] w-full flex-col border-white/10 bg-[#080808]/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
            <div className="mb-4 flex flex-shrink-0 items-center justify-between">
              <div className="flex items-center gap-2">
                <LockIcon className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-sm font-bold uppercase tracking-[0.18em] text-white/86">
                  Secrets Vault
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSecretsOpen(false)}
                aria-label="Close secrets vault"
              >
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <SecretsView />
            </ScrollArea>
          </Card>
        </Dialog>
      )}
    </div>
  );
}
