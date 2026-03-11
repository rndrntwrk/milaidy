import type { PluginParamDef } from "./api-client";

export type Stream555DestinationSpec = {
  id: string;
  label: string;
  urlKey: string;
  streamKeyKey: string;
  enabledKey: string;
};

export type Stream555DestinationReadinessState =
  | "ready"
  | "disabled"
  | "missing-stream-key"
  | "missing-url";

export type Stream555DestinationStatus = {
  id: string;
  label: string;
  enabled: boolean;
  streamKeySet: boolean;
  streamKeySuffix: string | null;
  urlSet: boolean;
  urlReady: boolean;
  readinessState: Stream555DestinationReadinessState;
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

const STREAM555_PRIMARY_PLUGIN_IDS = new Set([
  "stream555-control",
  "555stream",
]);

const STREAM555_LEGACY_PLUGIN_IDS = new Set([
  "stream555-auth",
  "stream555-ads",
]);

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

function readConfiguredValue(param: PluginParamDef | undefined): string | null {
  const currentValue =
    typeof param?.currentValue === "string" ? param.currentValue.trim() : "";
  if (currentValue.length > 0) {
    return currentValue;
  }
  const defaultValue =
    typeof param?.default === "string" ? param.default.trim() : "";
  return defaultValue.length > 0 ? defaultValue : null;
}

export function normalizeStream555PluginId(rawId: string): string {
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
    const urlReady = readConfiguredValue(urlParam) !== null;
    const readinessState: Stream555DestinationReadinessState = !enabled
      ? "disabled"
      : !streamKeySet
        ? "missing-stream-key"
        : !urlReady
          ? "missing-url"
          : "ready";
    return {
      id: spec.id,
      label: spec.label,
      enabled,
      streamKeySet,
      streamKeySuffix: maskSuffix(streamKeyParam?.currentValue),
      urlSet: Boolean(urlParam?.isSet),
      urlReady,
      readinessState,
    };
  });

  const savedDestinations = destinations.filter(
    (destination) => destination.streamKeySet,
  ).length;
  const enabledDestinations = destinations.filter(
    (destination) => destination.enabled,
  ).length;
  const readyDestinations = destinations.filter(
    (destination) => destination.readinessState === "ready",
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
