import type { PluginInfo, PluginParamDef } from "@miladyai/app-core/api";

export type Stream555LaunchMode =
  | "camera"
  | "screen-share"
  | "play-games"
  | "reaction"
  | "radio";

export type Stream555DestinationReadinessState =
  | "ready"
  | "missing-stream-key"
  | "missing-url"
  | "disabled";

export interface Stream555DestinationSpec {
  id: string;
  label: string;
  enabledKey: string;
  streamKeyKey: string;
  urlKey: string;
}

export interface Stream555DestinationSummary extends Stream555DestinationSpec {
  enabled: boolean;
  hasUrl: boolean;
  hasStreamKey: boolean;
  readinessState: Stream555DestinationReadinessState;
}

export interface Stream555SetupSummary {
  authConnected: boolean;
  authLabel: string;
  setupRequired: boolean;
  readyDestinations: number;
  enabledDestinations: number;
  configuredDestinations: number;
  destinations: Stream555DestinationSummary[];
  runtimeWarnings: string[];
}

export const STREAM555_DESTINATION_SPECS: readonly Stream555DestinationSpec[] = [
  {
    id: "pumpfun",
    label: "Pump.fun",
    enabledKey: "STREAM555_DEST_PUMPFUN_ENABLED",
    streamKeyKey: "STREAM555_DEST_PUMPFUN_STREAM_KEY",
    urlKey: "STREAM555_DEST_PUMPFUN_RTMP_URL",
  },
  {
    id: "x",
    label: "X",
    enabledKey: "STREAM555_DEST_X_ENABLED",
    streamKeyKey: "STREAM555_DEST_X_STREAM_KEY",
    urlKey: "STREAM555_DEST_X_RTMP_URL",
  },
  {
    id: "twitch",
    label: "Twitch",
    enabledKey: "STREAM555_DEST_TWITCH_ENABLED",
    streamKeyKey: "STREAM555_DEST_TWITCH_STREAM_KEY",
    urlKey: "STREAM555_DEST_TWITCH_RTMP_URL",
  },
  {
    id: "kick",
    label: "Kick",
    enabledKey: "STREAM555_DEST_KICK_ENABLED",
    streamKeyKey: "STREAM555_DEST_KICK_STREAM_KEY",
    urlKey: "STREAM555_DEST_KICK_RTMP_URL",
  },
  {
    id: "youtube",
    label: "YouTube",
    enabledKey: "STREAM555_DEST_YOUTUBE_ENABLED",
    streamKeyKey: "STREAM555_DEST_YOUTUBE_STREAM_KEY",
    urlKey: "STREAM555_DEST_YOUTUBE_RTMP_URL",
  },
  {
    id: "facebook",
    label: "Facebook",
    enabledKey: "STREAM555_DEST_FACEBOOK_ENABLED",
    streamKeyKey: "STREAM555_DEST_FACEBOOK_STREAM_KEY",
    urlKey: "STREAM555_DEST_FACEBOOK_RTMP_URL",
  },
  {
    id: "custom",
    label: "Custom",
    enabledKey: "STREAM555_DEST_CUSTOM_ENABLED",
    streamKeyKey: "STREAM555_DEST_CUSTOM_STREAM_KEY",
    urlKey: "STREAM555_DEST_CUSTOM_RTMP_URL",
  },
] as const;

const STREAM555_SETUP_KEYS = new Set([
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN",
  "STREAM_API_BEARER_TOKEN",
  ...STREAM555_DESTINATION_SPECS.flatMap((spec) => [
    spec.enabledKey,
    spec.streamKeyKey,
    spec.urlKey,
  ]),
]);

function normalizePluginId(rawId: string | null | undefined): string {
  return String(rawId ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "");
}

function readParamValue(
  params: PluginParamDef[],
  key: string,
): string | boolean | null {
  const param = params.find((entry) => entry.key === key);
  if (!param) return null;
  const raw = param.currentValue ?? param.default ?? null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

function readBooleanParam(params: PluginParamDef[], key: string): boolean {
  const value = readParamValue(params, key);
  return value === true;
}

function readStringParam(params: PluginParamDef[], key: string): string | null {
  const value = readParamValue(params, key);
  return typeof value === "string" ? value : null;
}

export function isStream555PrimaryPlugin(plugin?: Pick<PluginInfo, "id" | "npmName"> | null): boolean {
  if (!plugin) return false;
  const id = normalizePluginId(plugin.id);
  const npmName = normalizePluginId(plugin.npmName);
  return (
    id === "555stream" ||
    id === "stream555-canonical" ||
    npmName === "555stream" ||
    npmName === "stream555-canonical"
  );
}

export function findStream555Plugin(
  plugins: PluginInfo[],
): PluginInfo | null {
  return plugins.find((plugin) => isStream555PrimaryPlugin(plugin)) ?? null;
}

export function filterStream555SetupParams(
  plugin: PluginInfo | null,
): PluginParamDef[] {
  if (!plugin) return [];
  return (plugin.parameters ?? []).filter((param) =>
    STREAM555_SETUP_KEYS.has(param.key),
  );
}

export function buildStream555SetupSummary(
  plugin: PluginInfo | null,
): Stream555SetupSummary {
  const params = plugin?.parameters ?? [];
  const authConnected = Boolean(
    readStringParam(params, "STREAM555_AGENT_API_KEY") ||
      readStringParam(params, "STREAM555_AGENT_TOKEN") ||
      readStringParam(params, "STREAM_API_BEARER_TOKEN"),
  );

  const destinations = STREAM555_DESTINATION_SPECS.map((spec) => {
    const enabled = readBooleanParam(params, spec.enabledKey);
    const hasUrl = Boolean(readStringParam(params, spec.urlKey));
    const hasStreamKey = Boolean(readStringParam(params, spec.streamKeyKey));
    const readinessState: Stream555DestinationReadinessState = !enabled
      ? "disabled"
      : !hasUrl
        ? "missing-url"
        : !hasStreamKey
          ? "missing-stream-key"
          : "ready";
    return {
      ...spec,
      enabled,
      hasUrl,
      hasStreamKey,
      readinessState,
    };
  });

  const readyDestinations = destinations.filter(
    (destination) => destination.readinessState === "ready",
  ).length;
  const enabledDestinations = destinations.filter(
    (destination) => destination.enabled,
  ).length;
  const configuredDestinations = destinations.filter(
    (destination) =>
      destination.enabled || destination.hasUrl || destination.hasStreamKey,
  ).length;
  const runtimeWarnings = [
    ...(plugin?.loadError ? [plugin.loadError] : []),
    ...((plugin?.validationWarnings ?? []).map((warning) => warning.message)),
    ...((plugin?.validationErrors ?? []).map((warning) => warning.message)),
  ];

  return {
    authConnected,
    authLabel: authConnected ? "Connected" : "Authentication required",
    setupRequired: !authConnected || readyDestinations === 0,
    readyDestinations,
    enabledDestinations,
    configuredDestinations,
    destinations,
    runtimeWarnings,
  };
}

export function labelForStream555LaunchMode(
  mode: Stream555LaunchMode,
): string {
  switch (mode) {
    case "screen-share":
      return "Screen Share";
    case "play-games":
      return "Play Games";
    case "reaction":
      return "Reaction";
    case "radio":
      return "Lo-fi Radio";
    case "camera":
    default:
      return "Camera";
  }
}

export function serializeStream555ConfigValue(
  value: unknown,
): string | null {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const joined = value.map((entry) => String(entry)).join(", ").trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}
