import { useCallback, useMemo, useState } from "react";
import { client, type PluginInfo, type PluginParamDef } from "../api-client.js";
import { resolveProStreamerBrandComponent } from "../proStreamerBrandIcons.js";
import { useApp } from "../AppContext.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Dialog } from "./ui/Dialog.js";
import { Input } from "./ui/Input.js";
import {
  CloseIcon,
  FacebookIcon,
  KickIcon,
  PlayIcon,
  PumpFunIcon,
  StackIcon,
  TwitchIcon,
  XBrandIcon,
} from "./ui/Icons.js";

const STREAM555_PRIMARY_PLUGIN_IDS = new Set([
  "stream555-control",
  "555stream",
]);
const STREAM555_LEGACY_PLUGIN_IDS = new Set([
  "stream555-auth",
  "stream555-ads",
]);
const ARCADE555_PRIMARY_PLUGIN_IDS = new Set([
  "555arcade",
  "arcade555",
  "arcade555-canonical",
]);
const ARCADE555_LEGACY_PLUGIN_IDS = new Set([
  "five55-games",
  "five55-score-capture",
  "five55-leaderboard",
  "five55-quests",
  "five55-battles",
  "five55-admin",
  "five55-social",
  "five55-rewards",
  "five55-github",
]);

type Stream555DestinationSpec = {
  id: string;
  label: string;
  urlKey: string;
  streamKeyKey: string;
  enabledKey: string;
};

type Stream555DestinationStatus = {
  id: string;
  label: string;
  enabled: boolean;
  streamKeySet: boolean;
  streamKeySuffix: string | null;
  urlSet: boolean;
};

export type Stream555StatusSummary = {
  authState: "connected" | "wallet_enabled" | "not_configured";
  authMode: string;
  authSource: string | null;
  preferredChain: "solana" | "evm";
  walletProvisionAllowed: boolean;
  hasSolanaWallet: boolean;
  hasEvmWallet: boolean;
  walletDetectionAvailable: boolean;
  destinations: Stream555DestinationStatus[];
  savedDestinations: number;
  enabledDestinations: number;
  readyDestinations: number;
};

export type PluginOperationalDisplay = {
  tone: "ok" | "warn" | "error";
  primary: string;
  secondary: string;
};

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

export const STREAM555_DESTINATION_SPECS: Stream555DestinationSpec[] = [
  {
    id: "pumpfun",
    label: "Pump.fun",
    urlKey: "STREAM555_DEST_PUMPFUN_RTMP_URL",
    streamKeyKey: "STREAM555_DEST_PUMPFUN_STREAM_KEY",
    enabledKey: "STREAM555_DEST_PUMPFUN_ENABLED",
  },
  {
    id: "x",
    label: "X",
    urlKey: "STREAM555_DEST_X_RTMP_URL",
    streamKeyKey: "STREAM555_DEST_X_STREAM_KEY",
    enabledKey: "STREAM555_DEST_X_ENABLED",
  },
  {
    id: "twitch",
    label: "Twitch",
    urlKey: "STREAM555_DEST_TWITCH_RTMP_URL",
    streamKeyKey: "STREAM555_DEST_TWITCH_STREAM_KEY",
    enabledKey: "STREAM555_DEST_TWITCH_ENABLED",
  },
  {
    id: "kick",
    label: "Kick",
    urlKey: "STREAM555_DEST_KICK_RTMP_URL",
    streamKeyKey: "STREAM555_DEST_KICK_STREAM_KEY",
    enabledKey: "STREAM555_DEST_KICK_ENABLED",
  },
  {
    id: "youtube",
    label: "YouTube",
    urlKey: "STREAM555_DEST_YOUTUBE_RTMP_URL",
    streamKeyKey: "STREAM555_DEST_YOUTUBE_STREAM_KEY",
    enabledKey: "STREAM555_DEST_YOUTUBE_ENABLED",
  },
  {
    id: "facebook",
    label: "Facebook",
    urlKey: "STREAM555_DEST_FACEBOOK_RTMP_URL",
    streamKeyKey: "STREAM555_DEST_FACEBOOK_STREAM_KEY",
    enabledKey: "STREAM555_DEST_FACEBOOK_ENABLED",
  },
  {
    id: "custom",
    label: "Custom",
    urlKey: "STREAM555_DEST_CUSTOM_RTMP_URL",
    streamKeyKey: "STREAM555_DEST_CUSTOM_STREAM_KEY",
    enabledKey: "STREAM555_DEST_CUSTOM_ENABLED",
  },
];

function normalizeStream555PluginId(rawId: string): string {
  return rawId
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "");
}

export function isStream555PrimaryPlugin(pluginId: string): boolean {
  return STREAM555_PRIMARY_PLUGIN_IDS.has(normalizeStream555PluginId(pluginId));
}

export function isStream555LegacyPlugin(pluginId: string): boolean {
  return STREAM555_LEGACY_PLUGIN_IDS.has(normalizeStream555PluginId(pluginId));
}

function normalizeArcade555PluginId(rawId: string): string {
  return rawId
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "");
}

export function isArcade555PrimaryPlugin(pluginId: string): boolean {
  return ARCADE555_PRIMARY_PLUGIN_IDS.has(normalizeArcade555PluginId(pluginId));
}

export function isArcade555LegacyPlugin(pluginId: string): boolean {
  return ARCADE555_LEGACY_PLUGIN_IDS.has(normalizeArcade555PluginId(pluginId));
}

function parseBoolish(value: unknown): boolean {
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

function maskSuffix(maskedValue: unknown): string | null {
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

function stream555DestinationIcon(specId: string) {
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

function getPluginUiAction(
  plugin: PluginInfo,
  actionId: string,
): PluginUiActionSchema | null {
  return asPluginUiSchema(plugin)?.actions?.[actionId] ?? null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readAutonomyStepMessage(
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
      // text may not be JSON
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

export function buildStream555StatusSummary(
  params: PluginParamDef[],
): Stream555StatusSummary {
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

  const destinations = STREAM555_DESTINATION_SPECS.map((spec) => {
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
  streamSummary?: Stream555StatusSummary | null,
): PluginOperationalDisplay {
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

  if (isArcade555PrimaryPlugin(plugin.id)) {
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

export function Stream555ControlActionsPanel({
  plugin,
  summary,
  onRefresh,
  setActionNotice,
}: {
  plugin: PluginInfo;
  summary: Stream555StatusSummary;
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
    provisionWalletAction?.invokes,
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
