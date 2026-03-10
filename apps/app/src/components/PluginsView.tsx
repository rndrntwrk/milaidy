/**
 * Plugins view — tag-filtered plugin management.
 *
 * Renders a unified plugin list with searchable/filterable cards and per-plugin settings.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import type { PluginInfo, PluginParamDef } from "../api-client";
import { client } from "../api-client";
import { resolveProStreamerBrandComponent, resolveProStreamerBrandIcon } from "../proStreamerBrandIcons";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import * as OperatorPanels from "./PluginOperatorPanels.js";
import { configRenderModeForTheme } from "./shared/configRenderMode";
import { autoLabel } from "./shared/labels";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Dialog } from "./ui/Dialog.js";
import { Input } from "./ui/Input.js";
import { ScrollArea } from "./ui/ScrollArea.js";
import {
  ActivityIcon,
  AgentIcon,
  AudioIcon,
  BrainIcon,
  BroadcastIcon,
  BrowserIcon,
  CloudIcon,
  CodeIcon,
  ConnectionIcon,
  CreditIcon,
  DatabaseIcon,
  DocumentIcon,
  EyeIcon,
  FacebookIcon,
  GripVerticalIcon,
  KickIcon,
  MemoryIcon,
  MicIcon,
  MissionIcon,
  MonitorIcon,
  PlayIcon,
  PumpFunIcon,
  SettingsIcon,
  SparkIcon,
  StackIcon,
  TerminalIcon,
  TwitchIcon,
  VaultIcon,
  WalletIcon,
  LightningIcon,
  LockIcon,
  XBrandIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
} from "./ui/Icons";
import { WhatsAppQrOverlay } from "./WhatsAppQrOverlay";

type Stream555DestinationSpec =
  (typeof OperatorPanels.STREAM555_DESTINATION_SPECS)[number];

const STREAM555_DESTINATION_KEY_MAP = new Map<
  string,
  Stream555DestinationSpec
>(
  OperatorPanels.STREAM555_DESTINATION_SPECS.flatMap((spec) => [
    [spec.enabledKey, spec] as const,
    [spec.urlKey, spec] as const,
    [spec.streamKeyKey, spec] as const,
  ]),
);

const STREAM555_DESTINATION_ORDER_MAP = new Map<string, number>(
  OperatorPanels.STREAM555_DESTINATION_SPECS.map((spec, index) => [spec.id, index]),
);

type PluginUiActionSchema = {
  label?: string;
  variant?: "primary" | "secondary" | "danger";
  invokes?: string;
  successLabel?: string;
};

type PluginUiSchema = {
  version?: string;
  nouns?: {
    collectionLabel?: string;
  };
  actions?: Record<string, PluginUiActionSchema>;
};

type LifecycleStatusToken = {
  label: string;
  tone: "ok" | "warn" | "error";
};

export function parseBoolish(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on" ||
    normalized === "enabled"
  );
}

export function stream555DestinationIcon(specId: string) {
  const brandComponent = resolveProStreamerBrandComponent([specId]);
  if (brandComponent) {
    return brandComponent;
  }
  switch (specId) {
    case "pumpfun":
      return PumpFunIcon;
    case "x":
      return XBrandIcon;
    case "twitch":
      return TwitchIcon;
    case "kick":
      return KickIcon;
    case "youtube":
      return PlayIcon;
    case "facebook":
      return FacebookIcon;
    default:
      return StackIcon;
  }
}

function asPluginUiSchema(plugin: PluginInfo): PluginUiSchema | null {
  const schema = plugin.pluginUiSchema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return null;
  }
  return schema as PluginUiSchema;
}

export function getPluginUiAction(
  plugin: PluginInfo,
  actionId: string,
): PluginUiActionSchema | null {
  return asPluginUiSchema(plugin)?.actions?.[actionId] ?? null;
}

function buildLifecycleStatusTokens(plugin: PluginInfo): LifecycleStatusToken[] {
  const tokens: LifecycleStatusToken[] = [
    {
      label: plugin.installed === false ? "Not installed" : "Installed",
      tone: plugin.installed === false ? "error" : "ok",
    },
    {
      label: plugin.enabled ? "Enabled" : "Disabled",
      tone: plugin.enabled ? "ok" : "warn",
    },
    {
      label: plugin.isActive ? "Loaded" : "Not loaded",
      tone: plugin.isActive ? "ok" : plugin.enabled ? "warn" : "error",
    },
  ];

  if (plugin.authenticated !== null && plugin.authenticated !== undefined) {
    tokens.push({
      label: plugin.authenticated ? "Authenticated" : "Authentication required",
      tone: plugin.authenticated ? "ok" : "warn",
    });
  }

  if (plugin.ready !== null && plugin.ready !== undefined) {
    tokens.push({
      label: plugin.ready ? "Ready" : "Setup incomplete",
      tone: plugin.ready ? "ok" : "warn",
    });
  }

  return tokens;
}

export function maskSuffix(maskedValue: unknown): string | null {
  if (typeof maskedValue !== "string" || maskedValue.trim().length === 0) {
    return null;
  }
  const value = maskedValue.trim();
  const separatorIdx = value.lastIndexOf("...");
  if (separatorIdx >= 0) {
    const suffix = value.slice(separatorIdx + 3).trim();
    return suffix.length > 0 ? suffix : null;
  }
  if (value.length >= 4) {
    return value.slice(-4);
  }
  return null;
}

export function buildStream555StatusSummary(
  params: PluginParamDef[],
): OperatorPanels.Stream555StatusSummary {
  const paramByKey = new Map(params.map((param) => [param.key, param]));
  const hasConfiguredParam = (
    keys: string[],
  ): { configured: boolean; present: boolean } => {
    let present = false;
    for (const key of keys) {
      const param = paramByKey.get(key);
      if (!param) continue;
      present = true;
      if (param.isSet) return { configured: true, present: true };
    }
    return { configured: false, present };
  };
  const authSourceKey = [
    "STREAM555_AGENT_API_KEY",
    "STREAM555_AGENT_TOKEN",
    "STREAM_API_BEARER_TOKEN",
  ].find((key) => paramByKey.get(key)?.isSet ?? false);
  const credentialAuthReady = Boolean(authSourceKey);
  const preferredChainRaw =
    paramByKey.get("STREAM555_WALLET_AUTH_PREFERRED_CHAIN")?.currentValue ??
    paramByKey.get("STREAM555_WALLET_AUTH_PREFERRED_CHAIN")?.default ??
    "solana";
  const preferredChain = (
    String(preferredChainRaw ?? "solana")
      .trim()
      .toLowerCase() === "evm"
      ? "evm"
      : "solana"
  ) as "solana" | "evm";
  const walletProvisionAllowed = parseBoolish(
    paramByKey.get("STREAM555_WALLET_AUTH_ALLOW_PROVISION")?.currentValue ??
      paramByKey.get("STREAM555_WALLET_AUTH_ALLOW_PROVISION")?.default ??
      "true",
  );
  const solanaWalletState = hasConfiguredParam([
    "SOLANA_PRIVATE_KEY",
    "SOLANA_WALLET_PRIVATE_KEY",
    "STREAM555_SOLANA_PRIVATE_KEY",
  ]);
  const evmWalletState = hasConfiguredParam([
    "EVM_PRIVATE_KEY",
    "ETH_PRIVATE_KEY",
    "STREAM555_EVM_PRIVATE_KEY",
  ]);
  const walletDetectionAvailable =
    solanaWalletState.present || evmWalletState.present;
  const walletAuthEnabled =
    preferredChain === "solana" ||
    preferredChain === "evm" ||
    walletProvisionAllowed;
  const authState = credentialAuthReady
    ? "connected"
    : walletAuthEnabled
      ? "wallet_enabled"
      : "not_configured";
  const authMode = credentialAuthReady
    ? "API key/token"
    : walletAuthEnabled
      ? `Wallet auth (${preferredChain === "evm" ? "Ethereum fallback" : "Solana preferred"})`
      : "Not configured";

  const destinations = OperatorPanels.STREAM555_DESTINATION_SPECS.map((spec) => {
    const enabledParam = paramByKey.get(spec.enabledKey);
    const streamKeyParam = paramByKey.get(spec.streamKeyKey);
    const urlParam = paramByKey.get(spec.urlKey);
    const enabled = parseBoolish(
      enabledParam?.currentValue ?? enabledParam?.default,
    );
    const streamKeySet = Boolean(streamKeyParam?.isSet);
    return {
      id: spec.id,
      label: spec.label,
      enabled,
      streamKeySet,
      streamKeySuffix: maskSuffix(streamKeyParam?.currentValue),
      urlSet: Boolean(urlParam?.isSet),
    };
  });

  const savedDestinations = destinations.filter(
    (destination) => destination.streamKeySet,
  ).length;
  const enabledDestinations = destinations.filter(
    (destination) => destination.enabled,
  ).length;
  const readyDestinations = destinations.filter(
    (destination) => destination.enabled && destination.streamKeySet,
  ).length;

  return {
    authState,
    authMode,
    authSource: authSourceKey ?? null,
    preferredChain,
    walletProvisionAllowed,
    hasSolanaWallet: solanaWalletState.configured,
    hasEvmWallet: evmWalletState.configured,
    walletDetectionAvailable,
    destinations,
    savedDestinations,
    enabledDestinations,
    readyDestinations,
  };
}

export function buildPluginOperationalDisplay(
  plugin: PluginInfo,
  streamSummary?: OperatorPanels.Stream555StatusSummary | null,
): OperatorPanels.PluginOperationalDisplay {
  const warnings = plugin.operationalWarnings ?? [];
  const errors = plugin.operationalErrors ?? [];
  const tone: "ok" | "warn" | "error" =
    errors.length > 0
      ? "error"
      : plugin.ready
        ? "ok"
        : warnings.length > 0 || plugin.enabled
          ? "warn"
          : "error";

  if (streamSummary) {
    const channelsSaved =
      plugin.operationalCounts?.channelsSaved ?? streamSummary.savedDestinations;
    const channelsEnabled =
      plugin.operationalCounts?.channelsEnabled ?? streamSummary.enabledDestinations;
    const channelsReady =
      plugin.operationalCounts?.channelsReady ?? streamSummary.readyDestinations;
    const primary = `${
      plugin.authenticated === true ? "Authenticated" : "Authentication required"
    } · ${channelsSaved}/${streamSummary.destinations.length} channel keys saved · ${
      channelsEnabled > 0
        ? `${channelsReady}/${channelsEnabled} enabled channels ready`
        : "No channels enabled"
    }`;
    const secondary =
      plugin.statusSummary?.join(" · ") ??
      `${plugin.enabled ? "Enabled" : "Disabled"} · ${
        plugin.isActive ? "Loaded" : "Not loaded"
      }`;
    return { tone, primary, secondary };
  }

  if (OperatorPanels.isArcade555PrimaryPlugin(plugin.id)) {
    const counts = plugin.operationalCounts ?? {};
    const sessionReady =
      Number(counts.sessionBootstrapped ?? 0) > 0
        ? "Session bootstrapped"
        : "Session not bootstrapped";
    const catalogReady =
      Number(counts.catalogReachable ?? 0) > 0
        ? "Catalog reachable"
        : "Catalog not verified";
    const progressReadyCount = [
      counts.leaderboardReachable,
      counts.questsReachable,
      counts.scorePipelineReachable,
    ].filter((value) => Number(value ?? 0) > 0).length;
    const primary = `${
      plugin.authenticated === true ? "Authenticated" : "Authentication required"
    } · ${sessionReady} · ${catalogReady} · Progress ${progressReadyCount}/3`;
    const secondary =
      plugin.statusSummary?.join(" · ") ??
      `${plugin.enabled ? "Enabled" : "Disabled"} · ${
        plugin.isActive ? "Loaded" : "Not loaded"
      }`;
    return { tone, primary, secondary };
  }

  return {
    tone,
    primary:
      plugin.statusSummary?.[0] ??
      `${plugin.enabled ? "Enabled" : "Disabled"} · ${
        plugin.isActive ? "Loaded" : "Not loaded"
      }`,
    secondary: plugin.statusSummary?.slice(1).join(" · ") ?? "",
  };
}

export function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readAutonomyStepMessage(
  step: Record<string, unknown> | null,
  fallback: string,
): string {
  if (!step) return fallback;
  if (typeof step.error === "string" && step.error.trim()) {
    return step.error.trim();
  }
  const result = toRecord(step.result);
  if (!result) return fallback;
  if (typeof result.message === "string" && result.message.trim()) {
    return result.message.trim();
  }
  if (typeof result.error === "string" && result.error.trim()) {
    return result.error.trim();
  }
  if (typeof result.text === "string" && result.text.trim()) {
    try {
      const parsed = JSON.parse(result.text) as Record<string, unknown>;
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // no-op: text may not be JSON
    }
    return result.text.trim();
  }
  const data = toRecord(result.data);
  if (data) {
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
    if (Array.isArray(data.keys)) {
      return `Found ${data.keys.length} API key record${data.keys.length === 1 ? "" : "s"}.`;
    }
    if (typeof data.count === "number" && Number.isFinite(data.count)) {
      return `Found ${data.count} API key record${data.count === 1 ? "" : "s"}.`;
    }
  }
  return fallback;
}

export function Stream555ControlActionsPanel({
  plugin,
  summary,
  onRefresh,
  setActionNotice,
}: {
  plugin: PluginInfo;
  summary: OperatorPanels.Stream555StatusSummary;
  onRefresh: () => Promise<void>;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
}) {
  const { currentTheme } = useApp();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastNotice, setLastNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const paramByKey = useMemo(
    () => new Map((plugin.parameters ?? []).map((param) => [param.key, param])),
    [plugin.parameters],
  );
  const provisionTargetChain =
    String(
      paramByKey.get("STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN")
        ?.currentValue ??
        paramByKey.get("STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN")
          ?.default ??
        "eth",
    )
      .trim()
      .toLowerCase() || "eth";
  const uiSchema = asPluginUiSchema(plugin);
  const collectionLabel = uiSchema?.nouns?.collectionLabel?.trim() || "Channels";
  const authenticateAction = getPluginUiAction(plugin, "authenticate");
  const verifyAction = getPluginUiAction(plugin, "verify");
  const disconnectAction = getPluginUiAction(plugin, "disconnect");
  const provisionWalletAction = getPluginUiAction(plugin, "provisionWallet");

  const executeStreamAction = useCallback(
    async (
      key: string,
      toolName: string,
      params: Record<string, unknown> = {},
      successFallback: string,
      errorFallback: string,
    ): Promise<{ success: boolean; message: string }> => {
      if (busyAction) {
        return {
          success: false,
          message: "Another action is currently in progress.",
        };
      }
      setBusyAction(key);
      setLastNotice(null);
      try {
        const response = await client.executeAutonomyPlan({
          plan: {
            id: `stream555-control-${toolName.toLowerCase()}`,
            steps: [{ id: "1", toolName, params }],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: true },
        });
        const step = toRecord(response.results?.[0] ?? null);
        const success = step?.success === true;
        const message = readAutonomyStepMessage(
          step,
          success ? successFallback : errorFallback,
        );
        if (success) {
          setLastNotice({ tone: "success", message });
          setActionNotice(message, "success", 3200);
          await onRefresh();
        } else {
          setLastNotice({ tone: "error", message });
          setActionNotice(message, "error", 4200);
        }
        return { success, message };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "action execution failed";
        setLastNotice({ tone: "error", message });
        setActionNotice(message, "error", 4200);
        return { success: false, message };
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, onRefresh, setActionNotice],
  );

  const isAuthenticated = summary.authState === "connected";
  const shouldPromptForSolanaProvision =
    summary.preferredChain === "solana" &&
    summary.walletDetectionAvailable &&
    !summary.hasSolanaWallet;

  const runWalletAuthentication = useCallback(async () => {
    const result = await executeStreamAction(
      "wallet-login",
      "STREAM555_AUTH_WALLET_LOGIN",
      {},
      "Wallet authentication completed.",
      "Wallet authentication failed.",
    );
    const noWalletDetected =
      !result.success &&
      /no wallet available|no wallet found|configure solana_private_key/i.test(
        result.message.toLowerCase(),
      );
    if (noWalletDetected && summary.preferredChain === "solana") {
      setWalletModalOpen(true);
    }
    return result;
  }, [executeStreamAction, summary.preferredChain]);

  const handleAuthenticateClick = useCallback(async () => {
    if (busyAction || isAuthenticated) return;
    if (shouldPromptForSolanaProvision) {
      setWalletModalOpen(true);
      return;
    }
    await runWalletAuthentication();
  }, [
    busyAction,
    isAuthenticated,
    shouldPromptForSolanaProvision,
    runWalletAuthentication,
  ]);

  const handleProvisionAndAuthenticate = useCallback(async () => {
    if (busyAction) return;
    const provisionResult = await executeStreamAction(
      "wallet-provision",
      provisionWalletAction?.invokes ?? "STREAM555_AUTH_WALLET_PROVISION_LINKED",
      { targetChain: provisionTargetChain },
      `Linked wallet provisioned via sw4p (${provisionTargetChain}).`,
      "Linked wallet provisioning failed.",
    );
    if (!provisionResult.success) return;
    const authResult = await runWalletAuthentication();
    if (authResult.success) {
      setWalletModalOpen(false);
    }
  }, [
    busyAction,
    executeStreamAction,
    provisionTargetChain,
    runWalletAuthentication,
  ]);

  const handleFallbackAuthenticate = useCallback(async () => {
    if (busyAction) return;
    const result = await runWalletAuthentication();
    if (result.success) {
      setWalletModalOpen(false);
    }
  }, [busyAction, runWalletAuthentication]);

  const authIndicatorClass = isAuthenticated
    ? "bg-ok"
    : summary.authState === "wallet_enabled"
      ? "bg-warn"
      : "bg-destructive";
  const authLabel = isAuthenticated
    ? "Connected"
    : summary.authState === "wallet_enabled"
      ? "Wallet auth enabled (not verified)"
      : "Authentication required";
  const authSource =
    summary.authSource === "STREAM555_AGENT_API_KEY"
      ? "API key"
      : summary.authSource === "STREAM555_AGENT_TOKEN" ||
          summary.authSource === "STREAM_API_BEARER_TOKEN"
        ? "Bearer token"
        : "None";
  const authButtonLabel =
    busyAction === "wallet-login"
      ? "Authenticating..."
      : isAuthenticated
        ? "Authenticated"
        : (authenticateAction?.label ?? "Authenticate Wallet");
  const showBrandedDestinationStatus = currentTheme === "milady-os";
  const surfacedDestinations = summary.destinations.filter(
    (destination) => destination.enabled || destination.streamKeySet,
  );

  return (
    <Card className="pro-streamer-provider-card mb-3 space-y-3 p-4">
      <div className="pro-streamer-provider-header">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/48">
        Operator Controls
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/64">
            <span
              className={`inline-block h-[7px] w-[7px] rounded-full ${authIndicatorClass}`}
            />
            <span>{authLabel}</span>
            <span className="opacity-40">•</span>
            <span>Source: {authSource}</span>
            <span className="opacity-40">•</span>
            <span>
              {collectionLabel} ready: {summary.readyDestinations}/
              {summary.enabledDestinations}
            </span>
          </div>
        </div>
        <Badge
          variant={isAuthenticated ? "success" : "outline"}
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]"
        >
          {isAuthenticated ? "Connected" : "Awaiting auth"}
        </Badge>
      </div>
      {showBrandedDestinationStatus && surfacedDestinations.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {surfacedDestinations.map((destination) => {
            const DestinationIcon = stream555DestinationIcon(destination.id);
            const toneClass = destination.enabled
              ? destination.streamKeySet
                ? "border-ok/30 bg-[rgba(22,101,52,0.08)] text-ok"
                : "border-warn/30 bg-[rgba(234,179,8,0.08)] text-warn"
              : "border-white/10 bg-white/[0.04] text-white/60";
            const stateLabel = destination.enabled
              ? destination.streamKeySet
                ? "ready"
                : "enabled"
              : "saved";
            return (
              <span
                key={`${plugin.id}-${destination.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${toneClass}`}
              >
                <DestinationIcon className="h-3.5 w-3.5" />
                <span>{destination.label}</span>
                <span className="opacity-70">{stateLabel}</span>
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="pro-streamer-provider-actions">
        <Button
          type="button"
          variant={isAuthenticated ? "secondary" : "default"}
          size="sm"
          className="rounded-xl"
          disabled={Boolean(busyAction) || isAuthenticated}
          onClick={() => void handleAuthenticateClick()}
        >
          {authButtonLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={Boolean(busyAction)}
          onClick={() =>
            void executeStreamAction(
              "verify-auth",
              verifyAction?.invokes ?? "STREAM555_AUTH_APIKEY_LIST",
              { status: "active" },
              "Authentication verified against control plane.",
              "Authentication verification failed.",
            )
          }
        >
          {busyAction === "verify-auth"
            ? "Verifying..."
            : (verifyAction?.label ?? "Verify Auth")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl border-danger/30 text-danger hover:border-danger/60 hover:bg-danger/12"
          disabled={Boolean(busyAction) || !isAuthenticated}
          onClick={() =>
            void executeStreamAction(
              "disconnect-auth",
              disconnectAction?.invokes ?? "STREAM555_AUTH_DISCONNECT",
              {},
              "Disconnected active stream auth from runtime.",
              "Disconnect failed.",
            )
          }
        >
          {busyAction === "disconnect-auth"
            ? "Disconnecting..."
            : (disconnectAction?.label ?? "Disconnect Auth")}
        </Button>
      </div>
      <div className="text-[10px] text-white/50">
        Agent action:{" "}
        <span className="font-mono text-white/70">
          STREAM555_AUTH_WALLET_LOGIN
        </span>
        . Use the operator action when a live wallet re-auth is required.
      </div>
      {lastNotice && (
        <div
          className={`mt-2 text-[10px] ${
            lastNotice.tone === "success" ? "text-ok" : "text-destructive"
          }`}
        >
          {lastNotice.message}
        </div>
      )}
      {walletModalOpen && (
        <Dialog
          open={walletModalOpen}
          onClose={() => setWalletModalOpen(false)}
          className="max-w-lg bg-[#07090e]/96"
          ariaLabelledBy={`stream555-wallet-dialog-${plugin.id}`}
        >
          <Card className="pro-streamer-provider-modal w-full max-w-lg space-y-4 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  id={`stream555-wallet-dialog-${plugin.id}`}
                  className="text-sm font-semibold text-white"
                >
                  Solana wallet required
                </div>
                <div className="mt-1 text-xs leading-relaxed text-white/62">
                  No Solana runtime wallet was detected for this agent. Provision
                  a linked wallet via sw4p or authenticate using fallback if
                  available.
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setWalletModalOpen(false)}
                aria-label="Close wallet provisioning dialog"
              >
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.walletProvisionAllowed && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="rounded-xl"
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleProvisionAndAuthenticate()}
                >
                  {busyAction === "wallet-provision"
                    ? "Provisioning..."
                    : (provisionWalletAction?.label ?? "Provision via sw4p")}
                </Button>
              )}
              {summary.hasEvmWallet && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleFallbackAuthenticate()}
                >
                  Authenticate fallback wallet
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl"
                disabled={Boolean(busyAction)}
                onClick={() => setWalletModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </Card>
        </Dialog>
      )}
    </Card>
  );
}

export function Arcade555ControlActionsPanel({
  plugin,
  onRefresh,
  setActionNotice,
}: {
  plugin: PluginInfo;
  onRefresh: () => Promise<void>;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastNotice, setLastNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [gameId, setGameId] = useState("");

  const paramByKey = useMemo(
    () => new Map((plugin.parameters ?? []).map((param) => [param.key, param])),
    [plugin.parameters],
  );
  const defaultSessionId = String(
    paramByKey.get("ARCADE555_DEFAULT_SESSION_ID")?.currentValue ??
      paramByKey.get("ARCADE555_DEFAULT_SESSION_ID")?.default ??
      "",
  ).trim();
  const counts = plugin.operationalCounts ?? {};
  const sessionBootstrapped = Number(counts.sessionBootstrapped ?? 0) > 0;
  const catalogReachable = Number(counts.catalogReachable ?? 0) > 0;
  const leaderboardReachable = Number(counts.leaderboardReachable ?? 0) > 0;
  const questsReachable = Number(counts.questsReachable ?? 0) > 0;
  const scorePipelineReachable = Number(counts.scorePipelineReachable ?? 0) > 0;

  const executeArcadeAction = useCallback(
    async (
      key: string,
      toolName: string,
      params: Record<string, unknown>,
      successFallback: string,
      errorFallback: string,
    ) => {
      if (busyAction) return;
      setBusyAction(key);
      setLastNotice(null);
      try {
        const response = await client.executeAutonomyPlan({
          plan: {
            id: `arcade555-control-${toolName.toLowerCase()}`,
            steps: [{ id: "1", toolName, params }],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: true },
        });
        const step = toRecord(response.results?.[0] ?? null);
        const success = step?.success === true;
        const message = readAutonomyStepMessage(
          step,
          success ? successFallback : errorFallback,
        );
        if (success) {
          setLastNotice({ tone: "success", message });
          setActionNotice(message, "success", 3200);
          await onRefresh();
        } else {
          setLastNotice({ tone: "error", message });
          setActionNotice(message, "error", 4200);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "action execution failed";
        setLastNotice({ tone: "error", message });
        setActionNotice(message, "error", 4200);
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, onRefresh, setActionNotice],
  );

  const statusDotClass =
    plugin.ready === true
      ? "bg-ok"
      : plugin.authenticated
        ? "bg-warn"
        : "bg-destructive";
  const summary = buildPluginOperationalDisplay(plugin);
  const verifyAction = getPluginUiAction(plugin, "verify");
  const bootstrapAction = getPluginUiAction(plugin, "bootstrap");
  const catalogAction = getPluginUiAction(plugin, "catalog");
  const playAction = getPluginUiAction(plugin, "play");
  const switchAction = getPluginUiAction(plugin, "switch");
  const stopAction = getPluginUiAction(plugin, "stop");
  const leaderboardAction = getPluginUiAction(plugin, "leaderboard");
  const questsAction = getPluginUiAction(plugin, "quests");

  const requireGameId = useCallback((): string | null => {
    const value = gameId.trim();
    if (value.length > 0) return value;
    const message = "Enter a game ID before using play or switch.";
    setLastNotice({ tone: "error", message });
    setActionNotice(message, "error", 3200);
    return null;
  }, [gameId, setActionNotice]);

  const progressIndicators = [
    {
      label: "Session",
      ready: sessionBootstrapped,
      successText: "Bootstrapped",
      pendingText: "Not bootstrapped",
    },
    {
      label: "Catalog",
      ready: catalogReachable,
      successText: "Reachable",
      pendingText: "Pending",
    },
    {
      label: "Leaderboard",
      ready: leaderboardReachable,
      successText: "Connected",
      pendingText: "Pending",
    },
    {
      label: "Quests",
      ready: questsReachable,
      successText: "Connected",
      pendingText: "Pending",
    },
    {
      label: "Scores",
      ready: scorePipelineReachable,
      successText: "Connected",
      pendingText: "Pending",
    },
  ] as const;

  return (
    <Card className="pro-streamer-provider-card mb-3 space-y-3 p-4">
      <div className="text-[11px] uppercase tracking-wide text-white/48">
        Operator Controls
      </div>
      <div className="flex items-center gap-2 text-[11px] text-white/64 flex-wrap">
        <span
          className={`inline-block w-[7px] h-[7px] rounded-full ${statusDotClass}`}
        />
        <span>{summary.primary}</span>
      </div>
      {summary.secondary ? (
        <div className="text-[10px] text-white/52">{summary.secondary}</div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {progressIndicators.map((indicator) => (
          <Badge
            key={`${plugin.id}-${indicator.label}`}
            variant={indicator.ready ? "success" : "outline"}
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
              indicator.ready ? "" : "border-warn/30 text-warn"
            }`}
          >
            {indicator.label}: {indicator.ready ? indicator.successText : indicator.pendingText}
          </Badge>
        ))}
      </div>
      <Card className="space-y-3 border-white/8 bg-white/[0.03] p-4">
        <div className="text-[10px] uppercase tracking-wide text-white/48">
          Session
        </div>
        <div className="text-[10px] text-white/52">
          {defaultSessionId
            ? `Default session ID: ${defaultSessionId}`
            : "No default session configured; bootstrap will create or resume automatically."}
        </div>
        <div className="pro-streamer-provider-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={Boolean(busyAction) || !plugin.isActive}
            onClick={() =>
              void executeArcadeAction(
                "verify-auth",
                verifyAction?.invokes ?? "ARCADE555_AUTH_VERIFY",
                {},
                "Arcade authentication verified.",
                "Arcade authentication verification failed.",
              )
            }
        >
          {busyAction === "verify-auth"
            ? "Verifying..."
            : (verifyAction?.label ?? "Verify Auth")}
        </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="rounded-xl"
            disabled={Boolean(busyAction) || !plugin.isActive}
            onClick={() =>
              void executeArcadeAction(
                "bootstrap-session",
                bootstrapAction?.invokes ?? "ARCADE555_SESSION_BOOTSTRAP",
                defaultSessionId ? { sessionId: defaultSessionId } : {},
                "Arcade session bootstrapped.",
                "Arcade session bootstrap failed.",
              )
            }
        >
          {busyAction === "bootstrap-session"
            ? "Bootstrapping..."
            : (bootstrapAction?.label ?? "Bootstrap Session")}
        </Button>
        </div>
      </Card>
      <Card className="space-y-3 border-white/8 bg-white/[0.03] p-4">
        <div className="text-[10px] uppercase tracking-wide text-white/48">
          Games
        </div>
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-wide text-white/48">
            Game ID
          </label>
          <Input
            type="text"
            className="rounded-2xl"
            placeholder="e.g. knighthood"
            value={gameId}
            onChange={(event) => setGameId(event.target.value)}
          />
        </div>
        <div className="pro-streamer-provider-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={Boolean(busyAction) || !plugin.isActive}
            onClick={() =>
              void executeArcadeAction(
                "catalog",
                catalogAction?.invokes ?? "ARCADE555_GAMES_CATALOG",
                {},
                "Arcade catalog fetched.",
                "Arcade catalog fetch failed.",
              )
            }
        >
          {busyAction === "catalog"
            ? "Fetching..."
            : (catalogAction?.label ?? "Fetch Catalog")}
        </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="rounded-xl"
            disabled={Boolean(busyAction) || !plugin.isActive}
            onClick={() => {
              const requestedGameId = requireGameId();
              if (!requestedGameId) return;
              void executeArcadeAction(
                "play",
                playAction?.invokes ?? "ARCADE555_GAMES_PLAY",
                { gameId: requestedGameId },
                `Arcade gameplay started for ${requestedGameId}.`,
                "Arcade game launch failed.",
              );
            }}
          >
          {busyAction === "play" ? "Starting..." : (playAction?.label ?? "Play")}
        </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={Boolean(busyAction) || !plugin.isActive}
            onClick={() => {
              const requestedGameId = requireGameId();
              if (!requestedGameId) return;
              void executeArcadeAction(
                "switch",
                switchAction?.invokes ?? "ARCADE555_GAMES_SWITCH",
                { gameId: requestedGameId },
                `Arcade switched to ${requestedGameId}.`,
                "Arcade game switch failed.",
              );
            }}
          >
          {busyAction === "switch"
            ? "Switching..."
            : (switchAction?.label ?? "Switch")}
        </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-danger/30 text-danger hover:border-danger/60 hover:bg-danger/12"
            disabled={Boolean(busyAction) || !plugin.isActive}
            onClick={() =>
              void executeArcadeAction(
                "stop",
                stopAction?.invokes ?? "ARCADE555_GAMES_STOP",
                {},
                "Arcade gameplay stopped.",
                "Arcade game stop failed.",
              )
            }
          >
          {busyAction === "stop" ? "Stopping..." : (stopAction?.label ?? "Stop")}
        </Button>
        </div>
      </Card>
      <Card className="space-y-3 border-white/8 bg-white/[0.03] p-4">
        <div className="text-[10px] uppercase tracking-wide text-white/48">
          Progress
        </div>
        <div className="text-[10px] text-white/52">
          Read progression surfaces without leaving the operator panel.
        </div>
        <div className="pro-streamer-provider-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={Boolean(busyAction) || !plugin.isActive}
            onClick={() =>
              void executeArcadeAction(
                "leaderboard",
                leaderboardAction?.invokes ?? "ARCADE555_LEADERBOARD_READ",
                gameId.trim().length > 0
                  ? { board: "game", gameId: gameId.trim() }
                  : { board: "global" },
                "Arcade leaderboard loaded.",
                "Arcade leaderboard read failed.",
              )
            }
          >
          {busyAction === "leaderboard"
            ? "Loading..."
            : (leaderboardAction?.label ?? "Read Leaderboard")}
        </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={Boolean(busyAction) || !plugin.isActive}
            onClick={() =>
              void executeArcadeAction(
                "quests",
                questsAction?.invokes ?? "ARCADE555_QUESTS_READ",
                { status: "active" },
                "Arcade quests loaded.",
                "Arcade quest read failed.",
              )
            }
          >
          {busyAction === "quests"
            ? "Loading..."
            : (questsAction?.label ?? "Read Quests")}
        </Button>
        </div>
      </Card>
      {lastNotice && (
        <div
          className={`mt-2 text-[10px] ${
            lastNotice.tone === "success" ? "text-ok" : "text-destructive"
          }`}
        >
          {lastNotice.message}
        </div>
      )}
    </Card>
  );
}

/* ── UI Showcase Plugin ────────────────────────────────────────────── */

/**
 * Synthetic plugin that demonstrates all 23 field renderers.
 * Appears in the plugin list as a reference/documentation plugin.
 */
const SHOWCASE_PLUGIN: PluginInfo = {
  id: "__ui-showcase__",
  name: "UI Field Showcase",
  description:
    "Interactive reference of all 23 field renderers. Not a real plugin — expand to see every UI component in action.",
  enabled: false,
  configured: true,
  envKey: null,
  category: "feature",
  source: "bundled",
  validationErrors: [],
  validationWarnings: [],
  version: "1.0.0",
  icon: "",
  parameters: [
    // 1. text
    {
      key: "DISPLAY_NAME",
      type: "string",
      description: "A simple single-line text input for names or short values.",
      required: true,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 2. password
    {
      key: "SECRET_TOKEN",
      type: "string",
      description:
        "Masked password input with show/hide toggle and server-backed reveal.",
      required: true,
      sensitive: true,
      currentValue: null,
      isSet: false,
    },
    // 3. number
    {
      key: "SERVER_PORT",
      type: "number",
      description: "Numeric input with min/max range and step control.",
      required: false,
      sensitive: false,
      default: "3000",
      currentValue: null,
      isSet: false,
    },
    // 4. boolean
    {
      key: "ENABLE_LOGGING",
      type: "boolean",
      description: "Toggle switch — on/off. Auto-detected from ENABLE_ prefix.",
      required: false,
      sensitive: false,
      default: "true",
      currentValue: null,
      isSet: false,
    },
    // 5. url
    {
      key: "WEBHOOK_URL",
      type: "string",
      description:
        "URL input with format validation. Auto-detected from _URL suffix.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 6. select
    {
      key: "DEPLOY_REGION",
      type: "string",
      description:
        "Dropdown selector populated from hint.options. Auto-detected for region/zone keys.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 7. textarea
    {
      key: "SYSTEM_PROMPT",
      type: "string",
      description:
        "Multi-line text input for long values like prompts or templates. Auto-detected from _PROMPT suffix.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 8. email
    {
      key: "CONTACT_EMAIL",
      type: "string",
      description: "Email input with format validation. Renders type=email.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 9. color
    {
      key: "THEME_COLOR",
      type: "string",
      description: "Color picker with hex value text input side-by-side.",
      required: false,
      sensitive: false,
      default: "#4a90d9",
      currentValue: null,
      isSet: false,
    },
    // 10. radio
    {
      key: "AUTH_MODE",
      type: "string",
      description:
        "Radio button group — best for 2-3 mutually exclusive options. Uses 'basic' or 'oauth'.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 11. multiselect
    {
      key: "ENABLED_FEATURES",
      type: "string",
      description:
        "Checkbox group for selecting multiple values from a fixed set.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 12. date
    {
      key: "START_DATE",
      type: "string",
      description: "Date picker input. Auto-detected from _DATE suffix.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 13. datetime
    {
      key: "SCHEDULED_AT",
      type: "string",
      description: "Combined date and time picker for scheduling.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 14. json
    {
      key: "METADATA_CONFIG",
      type: "string",
      description:
        "JSON editor with syntax validation. Shows parse errors inline.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 15. code
    {
      key: "RESPONSE_TEMPLATE",
      type: "string",
      description:
        "Code editor with monospaced font for templates and snippets.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 16. array
    {
      key: "ALLOWED_ORIGINS",
      type: "string",
      description:
        "Comma-separated list of origins with add/remove UI for each item.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 17. keyvalue
    {
      key: "CUSTOM_HEADERS",
      type: "string",
      description: "Key-value pair editor with add/remove rows.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 18. file
    {
      key: "CERT_FILE",
      type: "string",
      description: "File path input for certificates, configs, or data files.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 19. custom
    {
      key: "CUSTOM_COMPONENT",
      type: "string",
      description: "Placeholder for plugin-provided custom React components.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 20. markdown
    {
      key: "RELEASE_NOTES",
      type: "string",
      description:
        "Markdown editor with Edit/Preview toggle for rich text content.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 21. checkbox-group
    {
      key: "NOTIFICATION_CHANNELS",
      type: "string",
      description:
        "Checkbox group with per-option descriptions — similar to multiselect but with checkbox UX.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 22. group
    {
      key: "CONNECTION_GROUP",
      type: "string",
      description:
        "Fieldset container for visually grouping related configuration fields.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 23. table
    {
      key: "ROUTE_TABLE",
      type: "string",
      description:
        "Tabular data editor with add/remove rows and column headers.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
  ],
  configUiHints: {
    DISPLAY_NAME: {
      label: "Display Name",
      group: "Basic Fields",
      width: "half",
      help: "Renderer: text — single-line text input",
    },
    SECRET_TOKEN: {
      label: "Secret Token",
      group: "Basic Fields",
      width: "half",
      help: "Renderer: password — masked with show/hide toggle",
    },
    SERVER_PORT: {
      label: "Server Port",
      group: "Basic Fields",
      width: "third",
      min: 1,
      max: 65535,
      unit: "port",
      help: "Renderer: number — with min/max range and unit label",
    },
    ENABLE_LOGGING: {
      label: "Enable Logging",
      group: "Basic Fields",
      width: "third",
      help: "Renderer: boolean — pill-shaped toggle switch",
    },
    WEBHOOK_URL: {
      label: "Webhook URL",
      group: "Basic Fields",
      width: "full",
      placeholder: "https://example.com/webhook",
      help: "Renderer: url — URL input with format validation",
    },
    DEPLOY_REGION: {
      label: "Deploy Region",
      group: "Selection Fields",
      width: "half",
      type: "select",
      options: [
        { value: "us-east-1", label: "US East (Virginia)" },
        { value: "us-west-2", label: "US West (Oregon)" },
        { value: "eu-west-1", label: "EU (Ireland)" },
        { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
      ],
      help: "Renderer: select — dropdown with enhanced option labels",
    },
    SYSTEM_PROMPT: {
      label: "System Prompt",
      group: "Text Fields",
      width: "full",
      help: "Renderer: textarea — multi-line text input for long content",
    },
    CONTACT_EMAIL: {
      label: "Contact Email",
      group: "Text Fields",
      width: "half",
      type: "email",
      placeholder: "admin@example.com",
      help: "Renderer: email — email input with format validation",
    },
    THEME_COLOR: {
      label: "Theme Color",
      group: "Selection Fields",
      width: "third",
      type: "color",
      help: "Renderer: color — color picker swatch + hex input",
    },
    AUTH_MODE: {
      label: "Auth Mode",
      group: "Selection Fields",
      width: "half",
      type: "radio",
      options: [
        {
          value: "basic",
          label: "Basic Auth",
          description: "Username and password",
        },
        {
          value: "oauth",
          label: "OAuth 2.0",
          description: "Token-based authentication",
        },
        {
          value: "apikey",
          label: "API Key",
          description: "Header-based API key",
        },
      ],
      help: "Renderer: radio — radio button group with descriptions",
    },
    ENABLED_FEATURES: {
      label: "Enabled Features",
      group: "Selection Fields",
      width: "full",
      type: "multiselect",
      options: [
        { value: "auth", label: "Authentication" },
        { value: "logging", label: "Logging" },
        { value: "caching", label: "Caching" },
        { value: "webhooks", label: "Webhooks" },
        { value: "ratelimit", label: "Rate Limiting" },
      ],
      help: "Renderer: multiselect — checkbox group for multiple selections",
    },
    START_DATE: {
      label: "Start Date",
      group: "Date & Time",
      width: "half",
      type: "date",
      help: "Renderer: date — native date picker",
    },
    SCHEDULED_AT: {
      label: "Scheduled At",
      group: "Date & Time",
      width: "half",
      type: "datetime",
      help: "Renderer: datetime — date + time picker",
    },
    METADATA_CONFIG: {
      label: "Metadata Config",
      group: "Structured Data",
      width: "full",
      type: "json",
      help: "Renderer: json — JSON editor with inline validation",
    },
    RESPONSE_TEMPLATE: {
      label: "Response Template",
      group: "Structured Data",
      width: "full",
      type: "code",
      help: "Renderer: code — monospaced code editor",
    },
    ALLOWED_ORIGINS: {
      label: "Allowed Origins",
      group: "Structured Data",
      width: "full",
      type: "array",
      help: "Renderer: array — add/remove items list",
    },
    CUSTOM_HEADERS: {
      label: "Custom Headers",
      group: "Structured Data",
      width: "full",
      type: "keyvalue",
      help: "Renderer: keyvalue — key-value pair editor",
    },
    CERT_FILE: {
      label: "Certificate File",
      group: "File Paths",
      width: "full",
      type: "file",
      help: "Renderer: file — file path input",
    },
    CUSTOM_COMPONENT: {
      label: "Custom Component",
      group: "File Paths",
      width: "full",
      type: "custom",
      help: "Renderer: custom — plugin-provided React component surface",
      advanced: true,
    },
    RELEASE_NOTES: {
      label: "Release Notes",
      group: "Text Fields",
      width: "full",
      type: "markdown",
      help: "Renderer: markdown — textarea with Edit/Preview toggle",
    },
    NOTIFICATION_CHANNELS: {
      label: "Notification Channels",
      group: "Selection Fields",
      width: "full",
      type: "checkbox-group",
      options: [
        {
          value: "email",
          label: "Email",
          description: "Send notifications via email",
        },
        {
          value: "slack",
          label: "Slack",
          description: "Post to Slack channels",
        },
        {
          value: "webhook",
          label: "Webhook",
          description: "HTTP POST to configured URL",
        },
        { value: "sms", label: "SMS", description: "Text message alerts" },
      ],
      help: "Renderer: checkbox-group — vertical checkbox list with descriptions",
    },
    CONNECTION_GROUP: {
      label: "Connection Settings",
      group: "Structured Data",
      width: "full",
      type: "group",
      help: "Renderer: group — fieldset container with legend",
    },
    ROUTE_TABLE: {
      label: "Route Table",
      group: "Structured Data",
      width: "full",
      type: "table",
      help: "Renderer: table — tabular data editor with add/remove rows",
    },
  },
};

/* ── Always-on plugins (hidden from all views) ────────────────────────── */

/**
 * Plugin IDs hidden from Features/Connectors views.
 * Core plugins are visible in Admin > Plugins instead.
 */
const ALWAYS_ON_PLUGIN_IDS = new Set([
  // Core (always loaded)
  "sql",
  "local-embedding",
  "knowledge",
  "agent-skills",
  "directives",
  "commands",
  "personality",
  "experience",
  // Optional core (shown in admin)
  "agent-orchestrator",
  "shell",
  "plugin-manager",
  "cli",
  "code",
  "edge-tts",
  "pdf",
  "scratchpad",
  "secrets-manager",
  "todo",
  "trust",
  "form",
  "goals",
  "scheduling",
  // Internal / infrastructure
  "elizacloud",
  "evm",
  "memory",
  "rolodex",
  "tts",
  "elevenlabs",
  "cron",
  "webhooks",
  "browser",
  "vision",
  "computeruse",
]);

/* ── Helpers ────────────────────────────────────────────────────────── */

/** Detect advanced / debug parameters that should be collapsed by default. */
export function isAdvancedParam(param: PluginParamDef): boolean {
  const k = param.key.toUpperCase();
  const d = (param.description ?? "").toLowerCase();
  return (
    k.includes("EXPERIMENTAL") ||
    k.includes("DEBUG") ||
    k.includes("VERBOSE") ||
    k.includes("TELEMETRY") ||
    k.includes("BROWSER_BASE") ||
    d.includes("experimental") ||
    d.includes("advanced") ||
    d.includes("debug")
  );
}

/** Convert PluginParamDef[] to a JSON Schema + ConfigUiHints for ConfigRenderer. */
export function paramsToSchema(
  params: PluginParamDef[],
  pluginId: string,
): {
  schema: JsonSchemaObject;
  hints: Record<string, ConfigUiHint>;
} {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  const hints: Record<string, ConfigUiHint> = {};
  const isStream555Plugin = OperatorPanels.isStream555PrimaryPlugin(pluginId);

  for (const p of params) {
    // Build JSON Schema property
    const prop: Record<string, unknown> = {};
    if (p.type === "boolean") {
      prop.type = "boolean";
    } else if (p.type === "number") {
      prop.type = "number";
    } else {
      prop.type = "string";
    }
    if (p.description) prop.description = p.description;
    if (p.default != null) prop.default = p.default;
    if (p.options?.length) {
      prop.enum = p.options;
    }

    // Auto-detect format from key name
    const keyUpper = p.key.toUpperCase();
    if (
      keyUpper.includes("URL") ||
      keyUpper.includes("ENDPOINT") ||
      keyUpper.includes("BASE_URL")
    ) {
      prop.format = "uri";
    } else if (keyUpper.includes("EMAIL")) {
      prop.format = "email";
    } else if (
      keyUpper.includes("_DATE") ||
      keyUpper.includes("_SINCE") ||
      keyUpper.includes("_UNTIL")
    ) {
      prop.format = "date";
    }

    // Auto-detect number types from key patterns
    if (keyUpper.includes("PORT") && prop.type === "string") {
      prop.type = "number";
    } else if (
      (keyUpper.includes("TIMEOUT") ||
        keyUpper.includes("INTERVAL") ||
        keyUpper.includes("_MS")) &&
      prop.type === "string"
    ) {
      prop.type = "number";
    } else if (
      (keyUpper.includes("COUNT") ||
        keyUpper.includes("LIMIT") ||
        keyUpper.startsWith("MAX_")) &&
      prop.type === "string"
    ) {
      prop.type = "number";
    } else if (
      (keyUpper.includes("RETRY") || keyUpper.includes("RETRIES")) &&
      prop.type === "string"
    ) {
      prop.type = "number";
    }

    // Auto-detect boolean from key patterns
    if (
      prop.type === "string" &&
      (keyUpper.includes("SHOULD_") ||
        keyUpper.endsWith("_ENABLED") ||
        keyUpper.endsWith("_DISABLED") ||
        keyUpper.startsWith("USE_") ||
        keyUpper.startsWith("ALLOW_") ||
        keyUpper.startsWith("IS_") ||
        keyUpper.startsWith("ENABLE_") ||
        keyUpper.startsWith("DISABLE_") ||
        keyUpper.startsWith("FORCE_") ||
        keyUpper.endsWith("_AUTONOMOUS_MODE"))
    ) {
      prop.type = "boolean";
    }

    // Auto-detect number from key patterns (RATE, DELAY, THRESHOLD, SIZE, TEMPERATURE)
    if (
      prop.type === "string" &&
      (keyUpper.includes("_RATE") ||
        keyUpper.includes("DELAY") ||
        keyUpper.includes("THRESHOLD") ||
        keyUpper.includes("_SIZE") ||
        keyUpper.includes("TEMPERATURE") ||
        keyUpper.includes("_DEPTH") ||
        keyUpper.includes("_PERCENT") ||
        keyUpper.includes("_RATIO"))
    ) {
      prop.type = "number";
    }

    // Auto-detect comma-separated lists → array renderer
    if (prop.type === "string" && !prop.enum) {
      const descLower = (p.description || "").toLowerCase();
      const isCommaSep =
        descLower.includes("comma-separated") ||
        descLower.includes("comma separated");
      const isListSuffix =
        keyUpper.endsWith("_IDS") ||
        keyUpper.endsWith("_CHANNELS") ||
        keyUpper.endsWith("_ROOMS") ||
        keyUpper.endsWith("_RELAYS") ||
        keyUpper.endsWith("_FEEDS") ||
        keyUpper.endsWith("_DEXES") ||
        keyUpper.endsWith("_WHITELIST") ||
        keyUpper.endsWith("_BLACKLIST") ||
        keyUpper.endsWith("_ALLOWLIST") ||
        keyUpper.endsWith("_SPACES") ||
        keyUpper.endsWith("_THREADS") ||
        keyUpper.endsWith("_ROLES") ||
        keyUpper.endsWith("_TENANTS") ||
        keyUpper.endsWith("_DIRS");
      if (isCommaSep || isListSuffix) {
        prop.type = "array";
        prop.items = { type: "string" };
      }
    }

    // Auto-detect textarea (prompts, instructions, templates, greetings)
    if (prop.type === "string" && !prop.enum && !keyUpper.includes("MODEL")) {
      if (
        keyUpper.includes("INSTRUCTIONS") ||
        keyUpper.includes("_GREETING") ||
        keyUpper.endsWith("_PROMPT") ||
        keyUpper.endsWith("_TEMPLATE") ||
        keyUpper.includes("SYSTEM_MESSAGE")
      ) {
        prop.maxLength = 999;
      }
    }

    // Auto-detect JSON fields (json-encoded or serialized values)
    if (prop.type === "string" && !p.sensitive) {
      const descLower = (p.description || "").toLowerCase();
      if (
        descLower.includes("json-encoded") ||
        descLower.includes("json array") ||
        descLower.includes("serialized") ||
        descLower.includes("json format")
      ) {
        (prop as Record<string, unknown>).__jsonHint = true;
      }
    }

    // Auto-detect file/directory paths → file renderer
    if (prop.type === "string") {
      if (
        (keyUpper.endsWith("_PATH") && !keyUpper.includes("WEBHOOK")) ||
        keyUpper.endsWith("_DIR") ||
        keyUpper.endsWith("_DIRECTORY") ||
        keyUpper.endsWith("_FOLDER") ||
        keyUpper.endsWith("_FILE")
      ) {
        (prop as Record<string, unknown>).__fileHint = true;
      }
    }

    // Auto-detect textarea from long descriptions
    if (p.description && p.description.length > 200) {
      prop.maxLength = 999;
    }

    properties[p.key] = prop;

    if (p.required) required.push(p.key);

    // Build UI hint
    const hint: ConfigUiHint = {
      label: autoLabel(p.key, pluginId),
      sensitive: p.sensitive ?? false,
      advanced: isAdvancedParam(p),
    };
    const streamChannelSpec = isStream555Plugin
      ? STREAM555_DESTINATION_KEY_MAP.get(p.key)
      : undefined;

    // Port numbers — constrain range
    if (keyUpper.includes("PORT")) {
      hint.min = 1;
      hint.max = 65535;
      prop.minimum = 1;
      prop.maximum = 65535;
    }

    // Timeout/interval — show unit
    if (
      keyUpper.includes("TIMEOUT") ||
      keyUpper.includes("INTERVAL") ||
      keyUpper.includes("_MS")
    ) {
      hint.unit = "ms";
      prop.minimum = 0;
      hint.min = 0;
    }

    // Count/limit — non-negative
    if (
      keyUpper.includes("COUNT") ||
      keyUpper.includes("LIMIT") ||
      keyUpper.startsWith("MAX_")
    ) {
      hint.min = 0;
      prop.minimum = 0;
    }

    // Retry — bounded range
    if (keyUpper.includes("RETRY") || keyUpper.includes("RETRIES")) {
      hint.min = 0;
      hint.max = 100;
      prop.minimum = 0;
      prop.maximum = 100;
    }

    // Debug/verbose/enabled — mark as advanced
    if (
      keyUpper.includes("DEBUG") ||
      keyUpper.includes("VERBOSE") ||
      keyUpper.includes("ENABLED")
    ) {
      hint.advanced = true;
    }

    // Model selection — NOT advanced (important user-facing choice)
    if (keyUpper.includes("MODEL") && p.options?.length) {
      hint.advanced = false;
    }

    // Region/zone — suggest common cloud regions when no options provided
    if (
      (keyUpper.includes("REGION") || keyUpper.includes("ZONE")) &&
      !p.options?.length
    ) {
      hint.type = "select";
      hint.options = [
        { value: "us-east-1", label: "US East (N. Virginia)" },
        { value: "us-west-2", label: "US West (Oregon)" },
        { value: "eu-west-1", label: "EU (Ireland)" },
        { value: "eu-central-1", label: "EU (Frankfurt)" },
        { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
        { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
      ];
    }

    // File/directory path → file renderer
    if ((prop as Record<string, unknown>).__fileHint) {
      hint.type = "file";
      delete (prop as Record<string, unknown>).__fileHint;
    }

    // JSON-encoded value → json renderer
    if ((prop as Record<string, unknown>).__jsonHint) {
      hint.type = "json";
      delete (prop as Record<string, unknown>).__jsonHint;
    }

    // Model name fields — helpful placeholder (overridden by server-provided model options via configUiHints)
    if (
      keyUpper.includes("MODEL") &&
      prop.type === "string" &&
      !p.options?.length
    ) {
      if (!hint.placeholder) {
        if (keyUpper.includes("EMBEDDING")) {
          hint.placeholder = "e.g., text-embedding-3-small";
        } else if (keyUpper.includes("TTS")) {
          hint.placeholder = "e.g., tts-1, eleven_multilingual_v2";
        } else if (keyUpper.includes("STT")) {
          hint.placeholder = "e.g., whisper-1";
        } else if (keyUpper.includes("IMAGE")) {
          hint.placeholder = "e.g., dall-e-3, gpt-4o";
        } else {
          hint.placeholder = "e.g., gpt-4o, claude-sonnet-4-20250514";
        }
      }
    }

    // Mode/strategy fields — extract options from description if available
    if (
      prop.type === "string" &&
      !prop.enum &&
      !p.sensitive &&
      (keyUpper.endsWith("_MODE") || keyUpper.endsWith("_STRATEGY"))
    ) {
      const desc = p.description ?? "";
      // Match "auto | local | mcp" or "filesystem|in-context|sqlite"
      const pipeMatch =
        desc.match(/:\s*([a-z0-9_-]+(?:\s*[|/]\s*[a-z0-9_-]+)+)/i) ??
        desc.match(/\(([a-z0-9_-]+(?:\s*[|/,]\s*[a-z0-9_-]+)+)\)/i);
      if (pipeMatch) {
        const opts = pipeMatch[1]
          .split(/[|/,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const safeOpts = opts.filter((v) => /^[a-z0-9_-]+$/i.test(v));
        if (safeOpts.length >= 2 && safeOpts.length <= 10) {
          hint.type = "select";
          hint.options = safeOpts.map((v) => ({ value: v, label: v }));
        }
      } else {
        // Match 'polling' or 'webhook' -or- 'env', 'oauth', or 'bearer' style
        const quotedOpts = [...desc.matchAll(/'([a-z0-9_-]+)'/gi)].map(
          (m) => m[1],
        );
        const safeQuoted = quotedOpts.filter((v) => /^[a-z0-9_-]+$/i.test(v));
        if (safeQuoted.length >= 2 && safeQuoted.length <= 10) {
          // Radio for 2 options, select for 3+
          hint.type = safeQuoted.length === 2 ? "radio" : "select";
          hint.options = safeQuoted.map((v) => ({ value: v, label: v }));
        }
      }
    }

    if (streamChannelSpec) {
      const channelIndex =
        STREAM555_DESTINATION_ORDER_MAP.get(streamChannelSpec.id) ?? 0;
      const baseOrder = 300 + channelIndex * 30;
      hint.group = "Channels";
      hint.advanced = false;

      if (p.key === streamChannelSpec.enabledKey) {
        hint.type = "boolean";
        hint.label = `Destination · ${streamChannelSpec.label}`;
        hint.order = baseOrder;
        hint.help = `Enable simulcast to ${streamChannelSpec.label}.`;
      } else if (p.key === streamChannelSpec.urlKey) {
        hint.label =
          streamChannelSpec.urlKey === "STREAM555_DEST_CUSTOM_RTMP_URL"
            ? "Custom RTMP URL"
            : `${streamChannelSpec.label} RTMPS URL`;
        hint.order = baseOrder + 10;
        hint.showIf = {
          field: streamChannelSpec.enabledKey,
          op: "eq",
          value: "true",
        };
      } else if (p.key === streamChannelSpec.streamKeyKey) {
        hint.label = `${streamChannelSpec.label} Stream Key`;
        hint.order = baseOrder + 20;
        hint.showIf = {
          field: streamChannelSpec.enabledKey,
          op: "eq",
          value: "true",
        };
      }
    }

    if (p.description) {
      hint.help = p.description;
      if (!isStream555Plugin && p.default != null) {
        hint.help += ` (default: ${String(p.default)})`;
      }
    }
    if (p.sensitive)
      hint.placeholder = p.isSet ? "********  (already set)" : "Enter value...";
    else if (!isStream555Plugin && p.default) {
      hint.placeholder = `Default: ${String(p.default)}`;
    }
    hints[p.key] = hint;
  }

  return {
    schema: { type: "object", properties, required } as JsonSchemaObject,
    hints,
  };
}

/* ── PluginConfigForm bridge ─────────────────────────────────────────── */

function PluginConfigForm({
  plugin,
  pluginConfigs,
  onParamChange,
}: {
  plugin: PluginInfo;
  pluginConfigs: Record<string, Record<string, string>>;
  onParamChange: (pluginId: string, paramKey: string, value: string) => void;
}) {
  const { currentTheme } = useApp();
  const configRenderMode = configRenderModeForTheme(currentTheme);
  const params = plugin.parameters ?? [];
  const { schema, hints: autoHints } = useMemo(
    () => paramsToSchema(params, plugin.id),
    [params, plugin.id],
  );

  // Merge server-provided configUiHints over auto-generated hints.
  // Server hints take priority (override auto-generated ones).
  const hints = useMemo(() => {
    const serverHints = plugin.configUiHints;
    if (!serverHints || Object.keys(serverHints).length === 0) return autoHints;
    const merged: Record<string, ConfigUiHint> = { ...autoHints };
    for (const [key, serverHint] of Object.entries(serverHints)) {
      merged[key] = { ...merged[key], ...serverHint };
    }
    return merged;
  }, [autoHints, plugin.configUiHints]);

  // Build values from current config state + existing server values.
  // Array-typed fields need comma-separated strings parsed into arrays.
  const values = useMemo(() => {
    const v: Record<string, unknown> = {};
    const draftValues = pluginConfigs[plugin.id] ?? {};
    const paramByKey = new Map(params.map((param) => [param.key, param]));
    const props = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    for (const p of params) {
      const isArrayField = props[p.key]?.type === "array";
      const configValue = draftValues[p.key];
      if (configValue !== undefined) {
        if (isArrayField && typeof configValue === "string") {
          v[p.key] = configValue
            ? configValue
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [];
        } else {
          v[p.key] = configValue;
        }
      } else if (p.isSet && !p.sensitive && p.currentValue != null) {
        if (isArrayField && typeof p.currentValue === "string") {
          v[p.key] = String(p.currentValue)
            ? String(p.currentValue)
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [];
        } else {
          v[p.key] = p.currentValue;
        }
      }
    }

    if (OperatorPanels.isStream555PrimaryPlugin(plugin.id)) {
      for (const spec of OperatorPanels.STREAM555_DESTINATION_SPECS) {
        const enabledValue = v[spec.enabledKey];
        const hasExplicitEnabledValue =
          enabledValue !== undefined &&
          enabledValue !== null &&
          String(enabledValue).trim().length > 0;
        const hasDraftEnabledValue =
          draftValues[spec.enabledKey] !== undefined &&
          String(draftValues[spec.enabledKey] ?? "").trim().length > 0;
        const hasSavedChannelConfig = Boolean(
          draftValues[spec.streamKeyKey]?.trim() ||
            draftValues[spec.urlKey]?.trim() ||
            paramByKey.get(spec.streamKeyKey)?.isSet ||
            paramByKey.get(spec.urlKey)?.isSet,
        );

        if (
          !hasExplicitEnabledValue &&
          !hasDraftEnabledValue &&
          hasSavedChannelConfig
        ) {
          v[spec.enabledKey] = "true";
        } else if (typeof enabledValue === "boolean") {
          v[spec.enabledKey] = String(enabledValue);
        }
      }
    }

    return v;
  }, [params, plugin.id, pluginConfigs, schema]);

  const setKeys = useMemo(
    () =>
      new Set(
        params
          .filter((p: PluginParamDef) => p.isSet)
          .map((p: PluginParamDef) => p.key),
      ),
    [params],
  );

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      // Join array values back to comma-separated strings for env var storage
      const stringValue = Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");
      onParamChange(plugin.id, key, stringValue);
    },
    [plugin.id, onParamChange],
  );

  return (
    <ConfigRenderer
      schema={schema}
      hints={hints}
      values={values}
      setKeys={setKeys}
      registry={defaultRegistry}
      pluginId={plugin.id}
      onChange={handleChange}
      renderMode={configRenderMode}
    />
  );
}

/* ── Default Icons ─────────────────────────────────────────────────── */

type PluginIconComponent = typeof AgentIcon;

const DEFAULT_ICONS: Partial<Record<string, PluginIconComponent>> = {
  // AI Providers
  anthropic: BrainIcon,
  "google-genai": SparkIcon,
  groq: LightningIcon,
  "local-ai": MonitorIcon,
  ollama: AgentIcon,
  openai: AgentIcon,
  openrouter: ConnectionIcon,
  "vercel-ai-gateway": ConnectionIcon,
  xai: SparkIcon,
  // Connectors — chat & social
  discord: BroadcastIcon,
  telegram: BroadcastIcon,
  slack: ConnectionIcon,
  twitter: BroadcastIcon,
  whatsapp: ConnectionIcon,
  signal: LockIcon,
  imessage: ConnectionIcon,
  bluebubbles: ConnectionIcon,
  bluesky: BroadcastIcon,
  farcaster: BroadcastIcon,
  instagram: EyeIcon,
  nostr: LockIcon,
  twitch: BroadcastIcon,
  matrix: ConnectionIcon,
  mattermost: ConnectionIcon,
  msteams: ConnectionIcon,
  "google-chat": ConnectionIcon,
  feishu: ConnectionIcon,
  line: ConnectionIcon,
  "nextcloud-talk": CloudIcon,
  tlon: BroadcastIcon,
  zalo: ConnectionIcon,
  zalouser: ConnectionIcon,
  // Features — voice & audio
  "edge-tts": AudioIcon,
  elevenlabs: MicIcon,
  tts: AudioIcon,
  "simple-voice": MicIcon,
  "robot-voice": AudioIcon,
  // Features — blockchain & finance
  evm: WalletIcon,
  solana: WalletIcon,
  "auto-trader": CreditIcon,
  "lp-manager": CreditIcon,
  "social-alpha": ActivityIcon,
  polymarket: CreditIcon,
  x402: CreditIcon,
  trust: LockIcon,
  iq: StackIcon,
  // Features — dev tools & infra
  cli: TerminalIcon,
  code: CodeIcon,
  shell: TerminalIcon,
  github: CodeIcon,
  linear: StackIcon,
  mcp: ConnectionIcon,
  browser: BrowserIcon,
  computeruse: MonitorIcon,
  n8n: SettingsIcon,
  webhooks: ConnectionIcon,
  // Features — knowledge & memory
  knowledge: MemoryIcon,
  memory: MemoryIcon,
  "local-embedding": MemoryIcon,
  pdf: DocumentIcon,
  "secrets-manager": VaultIcon,
  scratchpad: DocumentIcon,
  rlm: ActivityIcon,
  // Features — agents & orchestration
  "agent-orchestrator": MissionIcon,
  "agent-skills": AgentIcon,
  "plugin-manager": StackIcon,
  "copilot-proxy": ConnectionIcon,
  directives: DocumentIcon,
  goals: MissionIcon,
  "eliza-classic": AgentIcon,
  // Features — media & content
  vision: EyeIcon,
  rss: BroadcastIcon,
  "gmail-watch": ConnectionIcon,
  prose: DocumentIcon,
  form: DocumentIcon,
  // Features — scheduling & automation
  cron: ActivityIcon,
  scheduling: ActivityIcon,
  todo: MissionIcon,
  commands: TerminalIcon,
  // Features — storage & logging
  "s3-storage": DatabaseIcon,
  "trajectory-logger": ActivityIcon,
  experience: SparkIcon,
  // Features — gaming & misc
  minecraft: BroadcastIcon,
  roblox: BroadcastIcon,
  babylon: BroadcastIcon,
  mysticism: SparkIcon,
  personality: AgentIcon,
  moltbook: DocumentIcon,
  tee: LockIcon,
  blooio: ConnectionIcon,
  acp: StackIcon,
  elizacloud: CloudIcon,
  twilio: ConnectionIcon,
};

type ResolvedPluginIcon =
  | { kind: "image"; src: string }
  | { kind: "component"; Component: PluginIconComponent };

function isImageIcon(value: string): boolean {
  return /^(https?:|data:image|\/)/.test(value);
}

/** Resolve display icon: explicit remote/local image, semantic SVG fallback, or null. */
function resolveIcon(
  p: PluginInfo,
  preferProStreamerBrandIcons: boolean = false,
): ResolvedPluginIcon | null {
  if (p.icon && isImageIcon(p.icon)) {
    return { kind: "image", src: p.icon };
  }

  if (preferProStreamerBrandIcons) {
    const brandIcon = resolveProStreamerBrandIcon([p.icon, p.id, p.name]);
    if (brandIcon) {
      return brandIcon;
    }
  }

  const Component = (p.icon && DEFAULT_ICONS[p.icon]) || DEFAULT_ICONS[p.id];
  return Component ? { kind: "component", Component } : null;
}

function renderPluginIcon(
  p: PluginInfo,
  className = "h-4 w-4 text-white/72",
  preferProStreamerBrandIcons: boolean = false,
) {
  const icon = resolveIcon(p, preferProStreamerBrandIcons);
  if (!icon) return null;
  if (icon.kind === "image") {
    return (
      <img
        src={icon.src}
        alt=""
        className="h-4 w-4 rounded-sm object-cover"
        loading="lazy"
      />
    );
  }
  const Component = icon.Component;
  return <Component className={className} />;
}

/* ── Sub-group Classification ──────────────────────────────────────── */

/** Map plugin IDs to fine-grained sub-groups for the "Feature" category. */
const FEATURE_SUBGROUP: Record<string, string> = {
  // Voice & Audio
  "edge-tts": "voice",
  elevenlabs: "voice",
  tts: "voice",
  "simple-voice": "voice",
  "robot-voice": "voice",
  // Blockchain & Finance
  evm: "blockchain",
  solana: "blockchain",
  "auto-trader": "blockchain",
  "lp-manager": "blockchain",
  "social-alpha": "blockchain",
  polymarket: "blockchain",
  x402: "blockchain",
  trust: "blockchain",
  iq: "blockchain",
  // Dev Tools & Infrastructure
  cli: "devtools",
  code: "devtools",
  shell: "devtools",
  github: "devtools",
  linear: "devtools",
  mcp: "devtools",
  browser: "devtools",
  computeruse: "devtools",
  n8n: "devtools",
  webhooks: "devtools",
  // Knowledge & Memory
  knowledge: "knowledge",
  memory: "knowledge",
  "local-embedding": "knowledge",
  pdf: "knowledge",
  "secrets-manager": "knowledge",
  scratchpad: "knowledge",
  rlm: "knowledge",
  // Agents & Orchestration
  "agent-orchestrator": "agents",
  "agent-skills": "agents",
  "plugin-manager": "agents",
  "copilot-proxy": "agents",
  directives: "agents",
  goals: "agents",
  "eliza-classic": "agents",
  // Media & Content
  vision: "media",
  rss: "media",
  "gmail-watch": "media",
  prose: "media",
  form: "media",
  // Scheduling & Automation
  cron: "automation",
  scheduling: "automation",
  todo: "automation",
  commands: "automation",
  // Storage & Logging
  "s3-storage": "storage",
  "trajectory-logger": "storage",
  experience: "storage",
  // Gaming & Creative
  minecraft: "gaming",
  roblox: "gaming",
  babylon: "gaming",
  mysticism: "gaming",
  "555arcade": "gaming",
  "arcade555": "gaming",
  "arcade555-canonical": "gaming",
  personality: "gaming",
  moltbook: "gaming",
};

const SUBGROUP_DISPLAY_ORDER = [
  "ai-provider",
  "connector",
  "voice",
  "blockchain",
  "devtools",
  "knowledge",
  "agents",
  "media",
  "automation",
  "storage",
  "gaming",
  "feature-other",
  "showcase",
] as const;

const SUBGROUP_LABELS: Record<string, string> = {
  "ai-provider": "AI Providers",
  connector: "Connectors",
  voice: "Voice & Audio",
  blockchain: "Blockchain & Finance",
  devtools: "Dev Tools & Infrastructure",
  knowledge: "Knowledge & Memory",
  agents: "Agents & Orchestration",
  media: "Media & Content",
  automation: "Scheduling & Automation",
  storage: "Storage & Logging",
  gaming: "Gaming & Creative",
  "feature-other": "Other Features",
  showcase: "Showcase",
};

function subgroupForPlugin(plugin: PluginInfo): string {
  if (plugin.id === "__ui-showcase__") return "showcase";
  if (plugin.category === "ai-provider") return "ai-provider";
  if (plugin.category === "connector") return "connector";
  return FEATURE_SUBGROUP[plugin.id] ?? "feature-other";
}

type StatusFilter = "all" | "enabled";
type PluginsViewMode = "all" | "connectors";

/* ── Shared PluginListView ─────────────────────────────────────────── */

interface PluginListViewProps {
  /** Label used in search placeholder and empty state messages. */
  label: string;
  /** Optional list mode for pre-filtered views like Connectors. */
  mode?: PluginsViewMode;
}

function PluginListView({ label, mode = "all" }: PluginListViewProps) {
  const {
    plugins,
    pluginStatusFilter,
    pluginSearch,
    pluginSettingsOpen,
    pluginSaving,
    pluginSaveSuccess,
    loadPlugins,
    handlePluginToggle,
    handlePluginConfigSave,
    setActionNotice,
    setState,
    currentTheme,
  } = useApp();

  const [pluginConfigs, setPluginConfigs] = useState<
    Record<string, Record<string, string>>
  >({});
  const [testResults, setTestResults] = useState<
    Map<
      string,
      {
        success: boolean;
        message?: string;
        error?: string;
        durationMs: number;
        loading: boolean;
      }
    >
  >(new Map());
  const [addDirOpen, setAddDirOpen] = useState(false);
  const [addDirPath, setAddDirPath] = useState("");
  const [addDirLoading, setAddDirLoading] = useState(false);
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(
    new Set(),
  );
  const useProStreamerBrandIcons = currentTheme === "milady-os";
  const [installProgress, setInstallProgress] = useState<
    Map<string, { phase: string; message: string }>
  >(new Map());
  const [togglingPlugins, setTogglingPlugins] = useState<Set<string>>(
    new Set(),
  );
  const hasPluginToggleInFlight = togglingPlugins.size > 0;

  // ── Drag-to-reorder state ────────────────────────────────────────
  const [pluginOrder, setPluginOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("pluginOrder");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  // Load plugins on mount
  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  // Listen for install progress events via WebSocket
  useEffect(() => {
    const unbind = client.onWsEvent(
      "install-progress",
      (data: Record<string, unknown>) => {
        const pluginName = data.pluginName as string;
        const phase = data.phase as string;
        const message = data.message as string;
        if (!pluginName) return;
        if (phase === "complete" || phase === "error") {
          setInstallProgress((prev) => {
            const next = new Map(prev);
            next.delete(pluginName);
            return next;
          });
        } else {
          setInstallProgress((prev) =>
            new Map(prev).set(pluginName, { phase, message }),
          );
        }
      },
    );
    return unbind;
  }, []);

  // Persist custom order
  useEffect(() => {
    if (pluginOrder.length > 0) {
      localStorage.setItem("pluginOrder", JSON.stringify(pluginOrder));
    }
  }, [pluginOrder]);

  // ── Derived data ───────────────────────────────────────────────────

  const hasArcadePrimaryPlugin = useMemo(
    () => plugins.some((p: PluginInfo) => OperatorPanels.isArcade555PrimaryPlugin(p.id)),
    [plugins],
  );

  /** Plugins shown in the unified view (hide always-on internals + database-only entries). */
  const categoryPlugins = useMemo(
    () =>
      plugins.filter(
        (p: PluginInfo) =>
          p.category !== "database" &&
          !ALWAYS_ON_PLUGIN_IDS.has(p.id) &&
          !OperatorPanels.isStream555LegacyPlugin(p.id) &&
          !(hasArcadePrimaryPlugin && OperatorPanels.isArcade555LegacyPlugin(p.id)) &&
          (mode !== "connectors" || p.category === "connector"),
      ),
    [plugins, mode, hasArcadePrimaryPlugin],
  );

  const nonDbPlugins = useMemo(() => {
    const real = categoryPlugins;
    return [SHOWCASE_PLUGIN, ...real];
  }, [categoryPlugins]);

  const filtered = useMemo(() => {
    const searchLower = pluginSearch.toLowerCase();
    return categoryPlugins.filter((p: PluginInfo) => {
      const matchesStatus =
        pluginStatusFilter === "all" ||
        (pluginStatusFilter === "enabled" && p.enabled);
      const matchesSearch =
        !searchLower ||
        p.name.toLowerCase().includes(searchLower) ||
        (p.description ?? "").toLowerCase().includes(searchLower) ||
        p.id.toLowerCase().includes(searchLower);
      return matchesStatus && matchesSearch;
    });
  }, [categoryPlugins, pluginStatusFilter, pluginSearch]);

  const sorted = useMemo(() => {
    const defaultSort = (a: PluginInfo, b: PluginInfo) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      if (a.enabled && b.enabled) {
        const aNeedsConfig =
          a.parameters?.some((p: PluginParamDef) => p.required && !p.isSet) ??
          false;
        const bNeedsConfig =
          b.parameters?.some((p: PluginParamDef) => p.required && !p.isSet) ??
          false;
        if (aNeedsConfig !== bNeedsConfig) return aNeedsConfig ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    };
    if (pluginOrder.length === 0) return [...filtered].sort(defaultSort);
    // Custom order: sort by position, unknowns at end in default order
    const orderMap = new Map(pluginOrder.map((id, i) => [id, i]));
    return [...filtered].sort((a, b) => {
      const ai = orderMap.get(a.id);
      const bi = orderMap.get(b.id);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return defaultSort(a, b);
    });
  }, [filtered, pluginOrder]);

  const enabledCount = useMemo(
    () => categoryPlugins.filter((p: PluginInfo) => p.enabled).length,
    [categoryPlugins],
  );

  const pluginsWithSubgroup = useMemo(
    () =>
      sorted.map((plugin) => ({
        plugin,
        subgroup: subgroupForPlugin(plugin),
      })),
    [sorted],
  );

  const [subgroupFilter, setSubgroupFilter] = useState<string>("all");
  const showSubgroupFilters = mode !== "connectors";

  const subgroupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { subgroup } of pluginsWithSubgroup) {
      counts[subgroup] = (counts[subgroup] ?? 0) + 1;
    }
    return counts;
  }, [pluginsWithSubgroup]);

  const subgroupTags = useMemo(() => {
    const dynamicTags = SUBGROUP_DISPLAY_ORDER.filter(
      (sg) => (subgroupCounts[sg] ?? 0) > 0,
    ).map((sg) => ({
      id: sg,
      label: SUBGROUP_LABELS[sg],
      count: subgroupCounts[sg] ?? 0,
    }));
    return [{ id: "all", label: "All", count: sorted.length }, ...dynamicTags];
  }, [sorted.length, subgroupCounts]);

  useEffect(() => {
    if (!showSubgroupFilters) return;
    if (subgroupFilter === "all") return;
    if (!subgroupTags.some((tag) => tag.id === subgroupFilter)) {
      setSubgroupFilter("all");
    }
  }, [showSubgroupFilters, subgroupFilter, subgroupTags]);

  const visiblePlugins = useMemo(() => {
    if (!showSubgroupFilters) return sorted;
    if (subgroupFilter === "all") return sorted;
    return pluginsWithSubgroup
      .filter(({ subgroup }) => subgroup === subgroupFilter)
      .map(({ plugin }) => plugin);
  }, [showSubgroupFilters, pluginsWithSubgroup, sorted, subgroupFilter]);

  // ── Handlers ───────────────────────────────────────────────────────

  const toggleSettings = (pluginId: string) => {
    const next = new Set<string>();
    if (!pluginSettingsOpen.has(pluginId)) next.add(pluginId);
    setState("pluginSettingsOpen", next);
  };

  const handleParamChange = (
    pluginId: string,
    paramKey: string,
    value: string,
  ) => {
    setPluginConfigs((prev) => ({
      ...prev,
      [pluginId]: { ...prev[pluginId], [paramKey]: value },
    }));
  };

  const handleConfigSave = async (pluginId: string) => {
    // Showcase plugin: no-op save (it's not a real plugin)
    if (pluginId === "__ui-showcase__") return;
    const config = pluginConfigs[pluginId] ?? {};
    await handlePluginConfigSave(pluginId, config);
    const shouldSyncChannels =
      OperatorPanels.isStream555PrimaryPlugin(pluginId) &&
      Object.keys(config).some((key) =>
        STREAM555_DESTINATION_KEY_MAP.has(key),
      );
    if (shouldSyncChannels) {
      try {
        await client.executeAutonomyPlan({
          plan: {
            id: "stream555-control-apply-destinations",
            steps: [
              {
                id: "1",
                toolName: "STREAM555_DESTINATIONS_APPLY",
                params: {},
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: true },
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to sync channels after saving settings.";
        setActionNotice(
          `Settings saved, but channel sync failed: ${message}`,
          "error",
          4200,
        );
      }
    }
    setPluginConfigs((prev) => {
      const next = { ...prev };
      delete next[pluginId];
      return next;
    });
  };

  const handleConfigReset = (pluginId: string) => {
    setPluginConfigs((prev) => {
      const next = { ...prev };
      delete next[pluginId];
      return next;
    });
  };

  const handleTestConnection = async (pluginId: string) => {
    setTestResults((prev) => {
      const next = new Map(prev);
      next.set(pluginId, { success: false, loading: true, durationMs: 0 });
      return next;
    });
    try {
      const result = await client.testPluginConnection(pluginId);
      setTestResults((prev) => {
        const next = new Map(prev);
        next.set(pluginId, { ...result, loading: false });
        return next;
      });
    } catch (err) {
      setTestResults((prev) => {
        const next = new Map(prev);
        next.set(pluginId, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          loading: false,
          durationMs: 0,
        });
        return next;
      });
    }
  };

  const handleInstallPlugin = async (pluginId: string, npmName: string) => {
    setInstallingPlugins((prev) => new Set(prev).add(pluginId));
    try {
      await client.installRegistryPlugin(npmName);
      await loadPlugins();
      setActionNotice(
        `${npmName} installed. Restart required to activate.`,
        "success",
      );
    } catch (err) {
      setActionNotice(
        `Failed to install ${npmName}: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        3800,
      );
      // Still try to refresh in case install succeeded but restart failed
      try {
        await loadPlugins();
      } catch {
        /* ignore */
      }
    } finally {
      setInstallingPlugins((prev) => {
        const next = new Set(prev);
        next.delete(pluginId);
        return next;
      });
    }
  };

  const handleTogglePlugin = useCallback(
    async (pluginId: string, enabled: boolean) => {
      let shouldStart = false;
      setTogglingPlugins((prev) => {
        if (prev.has(pluginId) || prev.size > 0) return prev;
        shouldStart = true;
        return new Set(prev).add(pluginId);
      });
      if (!shouldStart) return;

      try {
        await handlePluginToggle(pluginId, enabled);
      } finally {
        setTogglingPlugins((prev) => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });
      }
    },
    [handlePluginToggle],
  );

  // ── Add from directory ──────────────────────────────────────────────

  const handleAddFromDirectory = async () => {
    const trimmed = addDirPath.trim();
    if (!trimmed) return;
    setAddDirLoading(true);
    try {
      await client.installRegistryPlugin(trimmed);
      await loadPlugins();
      setAddDirPath("");
      setAddDirOpen(false);
      setActionNotice(`Plugin installed from ${trimmed}`, "success");
    } catch (err) {
      setActionNotice(
        `Failed to add plugin: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        3800,
      );
    }
    setAddDirLoading(false);
  };

  // ── Drag-to-reorder handlers ─────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent, pluginId: string) => {
      dragRef.current = pluginId;
      setDraggingId(pluginId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", pluginId);
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent, pluginId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragRef.current && dragRef.current !== pluginId) {
      setDragOverId(pluginId);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const srcId = dragRef.current;
      if (!srcId || srcId === targetId) {
        dragRef.current = null;
        setDraggingId(null);
        setDragOverId(null);
        return;
      }
      // Materialize current sorted order, then splice
      setPluginOrder(() => {
        // Build full order: items in custom order first, then any new ones
        const allIds = nonDbPlugins.map((p: PluginInfo) => p.id);
        let ids: string[];
        if (pluginOrder.length > 0) {
          const known = new Set(pluginOrder);
          ids = [...pluginOrder, ...allIds.filter((id) => !known.has(id))];
        } else {
          ids = sorted.map((p: PluginInfo) => p.id);
          // Pad with any nonDbPlugins not currently in sorted (due to filters)
          const inSorted = new Set(ids);
          for (const id of allIds) {
            if (!inSorted.has(id)) ids.push(id);
          }
        }
        const fromIdx = ids.indexOf(srcId);
        const toIdx = ids.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return ids;
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, srcId);
        return ids;
      });
      dragRef.current = null;
      setDraggingId(null);
      setDragOverId(null);
    },
    [nonDbPlugins, pluginOrder, sorted],
  );

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleResetOrder = useCallback(() => {
    setPluginOrder([]);
    localStorage.removeItem("pluginOrder");
  }, []);

  // ── Card renderers ────────────────────────────────────────────────

  const renderPluginCard = (p: PluginInfo) => {
    const hasParams = p.parameters && p.parameters.length > 0;
    const isStream555 = OperatorPanels.isStream555PrimaryPlugin(p.id);
    const isArcade555 = OperatorPanels.isArcade555PrimaryPlugin(p.id);
    const streamSummary = isStream555
      ? OperatorPanels.buildStream555StatusSummary(p.parameters ?? [])
      : null;
    const operationalDisplay =
      isStream555 || isArcade555
        ? OperatorPanels.buildPluginOperationalDisplay(p, streamSummary)
        : null;
    const isOpen = pluginSettingsOpen.has(p.id);
    const setCount = hasParams
      ? p.parameters.filter((param: PluginParamDef) => param.isSet).length
      : 0;
    const totalCount = hasParams ? p.parameters.length : 0;
    const allParamsSet = !hasParams || setCount === totalCount;
    const isShowcase = p.id === "__ui-showcase__";
    const categoryLabel = isShowcase
      ? "showcase"
      : p.category === "ai-provider"
        ? "ai provider"
        : p.category;

    const enabledBorder = isShowcase
      ? "border-l-[3px] border-l-accent"
      : p.enabled
        ? !allParamsSet && hasParams
          ? "border-l-[3px] border-l-warn"
          : "border-l-[3px] border-l-accent"
        : "";
    const isToggleBusy = togglingPlugins.has(p.id);
    const toggleDisabled =
      isToggleBusy || (hasPluginToggleInFlight && !isToggleBusy);

    const isDragging = draggingId === p.id;
    const isDragOver = dragOverId === p.id && draggingId !== p.id;

    return (
      <li
        key={p.id}
        draggable
        onDragStart={(e) => handleDragStart(e, p.id)}
        onDragOver={(e) => handleDragOver(e, p.id)}
        onDrop={(e) => handleDrop(e, p.id)}
        onDragEnd={handleDragEnd}
        className={`flex flex-col border border-white/10 bg-white/[0.03] transition-colors duration-150 ${enabledBorder} ${
          isOpen ? "ring-1 ring-accent" : "hover:border-accent/40"
        } ${isDragging ? "opacity-30" : ""} ${isDragOver ? "ring-2 ring-accent/60" : ""}`}
        data-plugin-id={p.id}
      >
        {/* Top: drag handle + icon + name + toggle */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <span
            className="inline-flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-white/56"
            title="Drag to reorder"
            aria-hidden="true"
          >
            <GripVerticalIcon className="h-3 w-3" />
          </span>
          <span className="font-bold text-sm flex items-center gap-1.5 min-w-0 truncate flex-1">
            {renderPluginIcon(p, "h-4 w-4 text-white/72", useProStreamerBrandIcons)}
            {p.name}
          </span>
          {isShowcase ? (
            <span className="text-[10px] font-bold tracking-wider px-2.5 py-[2px] border border-accent text-accent bg-accent-subtle shrink-0">
              DEMO
            </span>
          ) : (
            <Button
              type="button"
              data-plugin-toggle={p.id}
              variant={p.enabled ? "default" : "outline"}
              size="sm"
              className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${toggleDisabled ? "opacity-60" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                void handleTogglePlugin(p.id, !p.enabled);
              }}
              disabled={toggleDisabled}
            >
              {isToggleBusy ? "APPLYING" : p.enabled ? "ON" : "OFF"}
            </Button>
          )}
        </div>

        {/* Badges: category + version + loaded status */}
        <div className="flex items-center gap-1.5 px-3 pb-1.5">
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] lowercase tracking-wide text-white/56 whitespace-nowrap">
            {categoryLabel}
          </span>
          {p.version && (
            <span className="text-[10px] font-mono text-white/42">
              v{p.version}
            </span>
          )}
          {p.enabled && !p.isActive && !isShowcase && (
            <span
              className={`text-[10px] px-1.5 py-px border lowercase tracking-wide whitespace-nowrap ${
                p.loadError
                  ? "border-destructive bg-[rgba(153,27,27,0.04)] text-destructive"
                  : "border-warn bg-[rgba(234,179,8,0.06)] text-warn"
              }`}
              title={
                p.loadError || "Plugin is enabled but not loaded in the runtime"
              }
            >
              {p.loadError ? "load failed" : "not loaded"}
            </span>
          )}
          {isToggleBusy && (
            <span className="text-[10px] px-1.5 py-px border border-accent bg-accent-subtle text-accent lowercase tracking-wide whitespace-nowrap">
              restarting...
            </span>
          )}
        </div>

        {/* Description — clamped to 3 lines */}
        <p
          className="px-3 pb-2 flex-1 text-xs text-white/58"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {p.description || "No description available"}
        </p>

        {/* Bottom bar: config status + settings button */}
        <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-white/10 px-3 py-2">
          {hasParams && !isShowcase && !isStream555 && !isArcade555 ? (
            <>
              <span
                className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${
                  allParamsSet ? "bg-ok" : "bg-destructive"
                }`}
              />
              <span className="text-[10px] text-white/52">
                {setCount}/{totalCount} configured
              </span>
            </>
          ) : operationalDisplay ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${
                  operationalDisplay.tone === "ok"
                    ? "bg-ok"
                    : operationalDisplay.tone === "warn"
                      ? "bg-warn"
                      : "bg-destructive"
                }`}
              />
              <div
                className="min-w-0 flex-1"
                title={`${operationalDisplay.primary}${operationalDisplay.secondary ? ` • ${operationalDisplay.secondary}` : ""}`}
              >
                <div className="text-[10px] truncate text-white/56">
                  {operationalDisplay.primary}
                </div>
                {operationalDisplay.secondary ? (
                  <div className="text-[10px] truncate text-white/42">
                    {operationalDisplay.secondary}
                  </div>
                ) : null}
              </div>
            </div>
          ) : !hasParams && !isShowcase ? (
            <span className="text-[10px] text-white/38">
              No config needed
            </span>
          ) : (
            <span className="text-[10px] text-white/38">
              23 field demos
            </span>
          )}
          {(!operationalDisplay || (!isStream555 && !isArcade555)) && (
            <div className="flex-1" />
          )}
          {p.enabled &&
            !p.isActive &&
            p.npmName &&
            !isShowcase &&
            !p.loadError && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-w-[180px] rounded-xl border-white/12 px-2.5 py-1 text-[10px] text-white/72"
                disabled={installingPlugins.has(p.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleInstallPlugin(p.id, p.npmName ?? "");
                }}
              >
                {installingPlugins.has(p.id)
                  ? installProgress.get(p.npmName ?? "")?.message ||
                    "Installing..."
                  : "Install"}
              </Button>
            )}
          {hasParams && (
            <Button
              type="button"
              variant={isOpen ? "secondary" : "ghost"}
              size="sm"
              className="rounded-xl px-2"
              onClick={() => toggleSettings(p.id)}
              title="Settings"
              aria-label={`Open settings for ${p.name}`}
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              <ChevronRightIcon
                className={`h-3 w-3 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
              />
            </Button>
          )}
        </div>

        {/* Validation errors */}
        {p.enabled && p.validationErrors && p.validationErrors.length > 0 && (
          <div className="px-3 py-1.5 border-t border-destructive bg-[rgba(153,27,27,0.04)] text-xs">
            {p.validationErrors.map(
              (err: { field: string; message: string }) => (
                <div
                  key={`${err.field}:${err.message}`}
                  className="text-destructive mb-0.5 text-[10px]"
                >
                  {err.field}: {err.message}
                </div>
              ),
            )}
          </div>
        )}

        {/* Validation warnings */}
        {p.enabled &&
          p.validationWarnings &&
          p.validationWarnings.length > 0 && (
            <div className="px-3 py-1">
              {p.validationWarnings.map(
                (w: { field: string; message: string }) => (
                  <div
                    key={`${w.field}:${w.message}`}
                    className="text-warn text-[10px]"
                  >
                    {w.message}
                  </div>
                ),
              )}
            </div>
          )}
      </li>
    );
  };

  /** Render a grid of plugin cards. */
  const renderPluginGrid = (plugins: PluginInfo[]) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 m-0 p-0 list-none">
      {plugins.map((p: PluginInfo) => renderPluginCard(p))}
    </ul>
  );

  // Resolve the plugin whose settings dialog is currently open.
  // Exclude ai-provider plugins — those are configured in Settings.
  const settingsDialogPlugin = useMemo(() => {
    for (const id of pluginSettingsOpen) {
      const p = nonDbPlugins.find((pl: PluginInfo) => pl.id === id);
      if (p?.parameters && p.parameters.length > 0) return p;
    }
    return null;
  }, [pluginSettingsOpen, nonDbPlugins]);

  // ── Main render ────────────────────────────────────────────────────

  return (
    <div className="pro-streamer-plugin-surface space-y-4">
      {/* Toolbar: search + status toggle */}
      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Input
            type="text"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={pluginSearch}
            onChange={(e) => setState("pluginSearch", e.target.value)}
            className="pr-10"
          />
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" />
          {pluginSearch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
              onClick={() => setState("pluginSearch", "")}
              title="Clear search"
              aria-label="Clear plugin search"
            >
              <CloseIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Status toggle: All / Enabled */}
        <div className="flex gap-1 shrink-0">
          {(["all", "enabled"] as const).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={
                pluginStatusFilter === s
                  ? "secondary"
                  : "outline"
              }
              onClick={() => setState("pluginStatusFilter", s as StatusFilter)}
              className="rounded-xl"
            >
              {s === "all"
                ? `All (${categoryPlugins.length})`
                : `Enabled (${enabledCount})`}
            </Button>
          ))}
        </div>

        {/* Reset order (only visible when custom order is set) */}
        {pluginOrder.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetOrder}
            title="Reset to default sort order"
            aria-label="Reset plugin order to default"
            className="rounded-xl"
          >
            Reset Order
          </Button>
        )}

        {/* Add plugin button */}
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => setAddDirOpen(true)}
          className="rounded-xl"
        >
          <PlusIcon className="h-4 w-4" />
          Add Plugin
        </Button>
      </div>

      {hasPluginToggleInFlight && (
        <Card className="mb-3 rounded-2xl border-accent/25 bg-accent/10 px-3 py-2 text-[11px] text-accent">
          Applying plugin change and waiting for agent restart...
        </Card>
      )}

      {/* Tag filters */}
      {showSubgroupFilters && (
        <div className="flex items-center gap-1.5 mb-3.5 flex-wrap">
          {subgroupTags.map((tag) => (
            <Button
              key={tag.id}
              type="button"
              size="sm"
              variant={subgroupFilter === tag.id ? "secondary" : "outline"}
              onClick={() => setSubgroupFilter(tag.id)}
              className="rounded-xl"
            >
              {tag.label} ({tag.count})
            </Button>
          ))}
        </div>
      )}

      {/* Plugin grid */}
      <div className="overflow-y-auto">
        {sorted.length === 0 ? (
          <Card className="rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/48">
            {pluginSearch
              ? `No ${label.toLowerCase()} match your search.`
              : `No ${label.toLowerCase()} available.`}
          </Card>
        ) : visiblePlugins.length === 0 ? (
          <Card className="rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/48">
            {showSubgroupFilters
              ? "No plugins match this tag filter."
              : `No ${label.toLowerCase()} match your filters.`}
          </Card>
        ) : (
          renderPluginGrid(visiblePlugins)
        )}
      </div>

      {/* Settings dialog */}
      {settingsDialogPlugin &&
        (() => {
          const p = settingsDialogPlugin;
          const isShowcase = p.id === "__ui-showcase__";
          const isSaving = pluginSaving.has(p.id);
          const saveSuccess = pluginSaveSuccess.has(p.id);
          const categoryLabel = isShowcase
            ? "showcase"
            : p.category === "ai-provider"
              ? "ai provider"
              : p.category;
          return (
            <Dialog
              open={true}
              onClose={() => toggleSettings(p.id)}
              className="max-w-4xl bg-[#07090e]/96"
              ariaLabelledBy={`plugin-settings-${p.id}`}
            >
              <Card className="flex max-h-[min(88vh,58rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border-white/12 bg-[#07090e]/96 shadow-[0_24px_72px_rgba(0,0,0,0.36)]">
                {/* Dialog header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-3">
                  <span id={`plugin-settings-${p.id}`} className="font-bold text-sm flex items-center gap-1.5 flex-1 min-w-0">
                    {renderPluginIcon(
                      p,
                      "h-4 w-4 text-white/72",
                      useProStreamerBrandIcons,
                    )}
                    {p.name}
                  </span>
                  <Badge variant="outline" className="rounded-full lowercase tracking-wide">
                    {categoryLabel}
                  </Badge>
                  {p.version && (
                    <span className="text-[10px] font-mono text-white/42">
                      v{p.version}
                    </span>
                  )}
                  {isShowcase && (
                    <Badge variant="accent" className="rounded-full">
                      DEMO
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    onClick={() => toggleSettings(p.id)}
                    aria-label={`Close settings for ${p.name}`}
                  >
                    <CloseIcon className="h-4 w-4" />
                  </Button>
                </div>

                {/* Dialog body — scrollable */}
                <ScrollArea className="flex-1 overscroll-contain">
                  {/* Plugin details */}
                  <div className="pro-streamer-plugin-meta px-5 pt-4 pb-1">
                    {p.description && (
                      <span className="text-[12px] leading-relaxed text-white/66">
                        {p.description}
                      </span>
                    )}
                  </div>
                  {(p.npmName || (p.pluginDeps && p.pluginDeps.length > 0)) && (
                    <div className="pro-streamer-plugin-meta px-5 pb-2">
                      {p.npmName && (
                        <span className="font-mono text-[10px] text-white/42">
                          {p.npmName}
                        </span>
                      )}
                      {p.pluginDeps && p.pluginDeps.length > 0 && (
                        <span className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-white/42">
                            depends on:
                          </span>
                          {p.pluginDeps.map((dep: string) => (
                            <span
                              key={dep}
                              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/64"
                            >
                              {dep}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="px-5 py-3">
                    {(OperatorPanels.isStream555PrimaryPlugin(p.id) ||
                      OperatorPanels.isArcade555PrimaryPlugin(p.id)) &&
                      (() => {
                        const streamSummary = OperatorPanels.isStream555PrimaryPlugin(p.id)
                          ? OperatorPanels.buildStream555StatusSummary(p.parameters ?? [])
                          : null;
                        const uiSchema = asPluginUiSchema(p);
                        const lifecycleTokens = buildLifecycleStatusTokens(p);
                        const collectionLabel =
                          uiSchema?.nouns?.collectionLabel?.trim() ||
                          (streamSummary ? "Channels" : "Games");
                        const operationalDisplay = OperatorPanels.buildPluginOperationalDisplay(
                          p,
                          streamSummary,
                        );
                        const configuredChannels =
                          streamSummary?.destinations.filter(
                            (destination) => destination.streamKeySet,
                          ) ?? [];
                        const configuredSummary = streamSummary
                          ? configuredChannels.length > 0
                            ? configuredChannels
                                .map((destination) => {
                                  const suffix =
                                    destination.streamKeySuffix != null
                                      ? `••••${destination.streamKeySuffix}`
                                      : "saved";
                                  return `${destination.label} ${suffix}`;
                                })
                                .join("  ·  ")
                            : "No channel stream keys saved yet"
                            : (p.statusSummary ?? []).join(" · ");
                        return (
                          <>
                            <Card className="mb-3 space-y-3 border-white/10 bg-white/[0.03] p-4">
                              <div className="flex flex-wrap gap-1.5">
                                {lifecycleTokens.map((token) => (
                                  <Badge
                                    key={`${p.id}-${token.label}`}
                                    variant="outline"
                                    className={`rounded-full px-2 py-0.5 text-[10px] lowercase tracking-wide whitespace-nowrap ${
                                      token.tone === "ok"
                                        ? "border-ok/30 bg-[rgba(22,101,52,0.06)] text-ok"
                                        : token.tone === "warn"
                                          ? "border-warn/30 bg-[rgba(234,179,8,0.06)] text-warn"
                                          : "border-destructive/30 bg-[rgba(153,27,27,0.04)] text-destructive"
                                    }`}
                                  >
                                    {token.label}
                                  </Badge>
                                ))}
                              </div>
                              <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
                                  Provider summary
                                </div>
                                <div className="text-[12px] text-white/74">
                                  {operationalDisplay.primary}
                                </div>
                              </div>
                              <div className="text-[11px] leading-relaxed text-white/54">
                                {streamSummary
                                  ? configuredSummary
                                  : operationalDisplay.secondary || configuredSummary}
                              </div>
                              {streamSummary && configuredChannels.length === 0 ? (
                                <div className="text-[10px] text-white/42">
                                  No{" "}
                                  {collectionLabel.toLowerCase() === "channels"
                                    ? "channel"
                                    : collectionLabel.toLowerCase()}{" "}
                                  stream keys saved yet
                                </div>
                              ) : null}
                              {(p.operationalWarnings?.length ||
                                p.operationalErrors?.length) ? (
                                <div className="space-y-1 rounded-2xl border border-white/8 bg-black/20 p-3">
                                  {(p.operationalWarnings ?? []).map((warning) => (
                                    <div
                                      key={`warning-${warning}`}
                                      className="text-[10px] text-warn"
                                    >
                                      {warning}
                                    </div>
                                  ))}
                                  {(p.operationalErrors ?? []).map((pluginError) => (
                                    <div
                                      key={`error-${pluginError}`}
                                      className="text-[10px] text-destructive"
                                    >
                                      {pluginError}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </Card>
                            {streamSummary ? (
                              <OperatorPanels.Stream555ControlActionsPanel
                                plugin={p}
                                summary={streamSummary}
                                onRefresh={loadPlugins}
                                setActionNotice={setActionNotice}
                              />
                            ) : (
                              <OperatorPanels.Arcade555ControlActionsPanel
                                plugin={p}
                                onRefresh={loadPlugins}
                                setActionNotice={setActionNotice}
                              />
                            )}
                          </>
                        );
                      })()}
                    <PluginConfigForm
                      plugin={p}
                      pluginConfigs={pluginConfigs}
                      onParamChange={handleParamChange}
                    />
                    {p.id === "whatsapp" && (
                      <WhatsAppQrOverlay accountId="default" />
                    )}
                  </div>
                </ScrollArea>

                {/* Dialog footer — actions (hidden for showcase) */}
                {!isShowcase && (
                  <div className="flex shrink-0 justify-end gap-2.5 border-t border-white/10 px-5 py-3">
                    {p.enabled && !p.isActive && p.npmName && !p.loadError && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="max-w-[260px] truncate rounded-xl"
                        disabled={installingPlugins.has(p.id)}
                        onClick={() =>
                          handleInstallPlugin(p.id, p.npmName ?? "")
                        }
                      >
                        {installingPlugins.has(p.id)
                          ? installProgress.get(p.npmName ?? "")?.message ||
                            "Installing..."
                          : "Install Plugin"}
                      </Button>
                    )}
                    {p.loadError && (
                      <span
                        className="px-3 py-1.5 text-[11px] text-destructive"
                        title={p.loadError}
                      >
                        Package broken — missing compiled files
                      </span>
                    )}
                    {(p.enabled || p.isActive) && (
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          testResults.get(p.id)?.loading
                            ? "ghost"
                            : testResults.get(p.id)?.success
                              ? "secondary"
                              : testResults.get(p.id)?.error
                                ? "ghost"
                                : "outline"
                        }
                        disabled={testResults.get(p.id)?.loading}
                        onClick={() => handleTestConnection(p.id)}
                        className="rounded-xl"
                      >
                        {testResults.get(p.id)?.loading
                          ? "Testing..."
                          : testResults.get(p.id)?.success
                            ? `\u2713 OK (${testResults.get(p.id)?.durationMs}ms)`
                          : testResults.get(p.id)?.error
                              ? `\u2715 ${testResults.get(p.id)?.error}`
                              : "Test Connection"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => handleConfigReset(p.id)}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        saveSuccess
                          ? "secondary"
                          : "default"
                      }
                      onClick={() => handleConfigSave(p.id)}
                      disabled={isSaving}
                      className="rounded-xl"
                    >
                      {isSaving
                        ? "Saving..."
                        : saveSuccess
                          ? "\u2713 Saved"
                          : "Save Settings"}
                    </Button>
                  </div>
                )}
              </Card>
            </Dialog>
          );
        })()}

      {/* Add from directory modal */}
      {addDirOpen && (
        <Dialog
          open={true}
          onClose={() => {
            setAddDirOpen(false);
            setAddDirPath("");
          }}
          className="max-w-md bg-[#07090e]/96"
          ariaLabelledBy="add-plugin-dialog-title"
        >
          <Card className="w-full max-w-md rounded-[28px] border-white/12 bg-[#07090e]/96 p-5 shadow-[0_24px_72px_rgba(0,0,0,0.36)]">
            <div className="flex items-center justify-between mb-4">
              <div id="add-plugin-dialog-title" className="flex items-center gap-2 text-sm font-bold text-white/88">
                <PlusIcon className="h-4 w-4" />
                Add Plugin
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
                aria-label="Close add plugin dialog"
              >
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>

            <p className="mb-3 text-xs text-white/52">
              Enter the path to a local plugin directory or package name.
            </p>

            <Input
              type="text"
              placeholder="/path/to/plugin or package-name"
              value={addDirPath}
              onChange={(e) => setAddDirPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddFromDirectory();
              }}
              className="rounded-2xl font-mono"
            />

            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="rounded-xl"
                onClick={handleAddFromDirectory}
                disabled={addDirLoading || !addDirPath.trim()}
              >
                {addDirLoading ? "Adding..." : "Add"}
              </Button>
            </div>
          </Card>
        </Dialog>
      )}
    </div>
  );
}

/* ── Exported views ────────────────────────────────────────────────── */

/** Unified plugins view — tag-filtered plugin list. */
export function PluginsView({ mode = "all" }: { mode?: PluginsViewMode }) {
  return (
    <PluginListView
      label={mode === "connectors" ? "Connectors" : "Plugins"}
      mode={mode}
    />
  );
}
