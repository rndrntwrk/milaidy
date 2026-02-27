export const LOCAL_APP_DEFAULT_SANDBOX =
  "allow-scripts allow-same-origin allow-popups";

const HYPERSCAPE_PACKAGE = "@elizaos/app-hyperscape";
const HYPERSCAPE_LEGACY_DOWNLOAD_HOST = "hyperscapeai.github.io";
const HYPERSCAPE_LEGACY_DOWNLOAD_PATH = "/hyperscape";

export interface ManagedAppViewerDefaults {
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
  remoteProxyHosts?: string[];
}

export interface ManagedAppEntry {
  packageName: string;
  gitRepo: string;
  launchType: "url" | "connect" | "local";
  defaultUpstreamUrl: string;
  defaultPublicUrl?: string;
  category?: string;
  displayName?: string;
  capabilities?: string[];
  viewer?: ManagedAppViewerDefaults;
}

export const ALICE_APP_CATALOG: Readonly<Record<string, ManagedAppEntry>> = {
  "@elizaos/app-babylon": {
    packageName: "@elizaos/app-babylon",
    gitRepo: "elizaos-plugins/plugin-babylon",
    launchType: "url",
    defaultUpstreamUrl: "http://localhost:3000",
    defaultPublicUrl: "https://babylon.market/",
    viewer: {
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
      remoteProxyHosts: ["babylon.market", "www.babylon.market"],
    },
  },
  "@elizaos/app-hyperscape": {
    packageName: "@elizaos/app-hyperscape",
    gitRepo: "HyperscapeAI/hyperscape",
    launchType: "connect",
    defaultUpstreamUrl: "http://localhost:3333",
    defaultPublicUrl: "https://hyperscape.gg/",
    viewer: {
      embedParams: {
        embedded: "true",
        mode: "spectator",
        quality: "medium",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
      remoteProxyHosts: [
        "hyperscape.gg",
        "www.hyperscape.gg",
        "assets.hyperscape.club",
        "hyperscape-production.up.railway.app",
      ],
    },
  },
  "@elizaos/app-hyperfy": {
    packageName: "@elizaos/app-hyperfy",
    gitRepo: "elizaOS/eliza-3d-hyperfy-starter",
    launchType: "connect",
    defaultUpstreamUrl: "http://localhost:3003",
    defaultPublicUrl: "https://hyperfy.io/",
    viewer: {
      sandbox: LOCAL_APP_DEFAULT_SANDBOX,
    },
  },
  "@elizaos/app-2004scape": {
    packageName: "@elizaos/app-2004scape",
    gitRepo: "elizaOS/eliza-2004scape",
    launchType: "connect",
    defaultUpstreamUrl: "http://localhost:8880",
    defaultPublicUrl: "https://rs-sdk-demo.fly.dev/",
    viewer: {
      embedParams: { bot: "{RS_SDK_BOT_NAME}" },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-agent-town": {
    packageName: "@elizaos/app-agent-town",
    gitRepo: "Agent-Town/agent-town",
    launchType: "url",
    defaultUpstreamUrl: "http://localhost:5173/",
    viewer: {
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-dungeons": {
    packageName: "@elizaos/app-dungeons",
    gitRepo: "lalalune/dungeons-and-daemons",
    launchType: "local",
    defaultUpstreamUrl: "http://localhost:3345",
    viewer: {
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
};

function toAppEnvSuffix(packageName: string): string {
  return packageName
    .replace(/^@[^/]+\//, "")
    .replace(/^app-/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function resolveAppUpstreamEnvKey(packageName: string): string {
  return `MILAIDY_APP_UPSTREAM_URL_${toAppEnvSuffix(packageName)}`;
}

export function resolveAppStreamEnvKey(packageName: string): string {
  return `MILAIDY_APP_STREAM_URL_${toAppEnvSuffix(packageName)}`;
}

export function resolveAppFallbackEnvKey(packageName: string): string {
  return `MILAIDY_APP_FALLBACK_URL_${toAppEnvSuffix(packageName)}`;
}

export function resolveManagedAppEntry(
  packageName: string,
): ManagedAppEntry | null {
  return ALICE_APP_CATALOG[packageName] ?? null;
}

export function resolveManagedAppGitRepo(packageName: string): string | null {
  return resolveManagedAppEntry(packageName)?.gitRepo ?? null;
}

export function isManagedAppRemoteProxyHostAllowed(
  packageName: string,
  hostname: string,
): boolean {
  const entry = resolveManagedAppEntry(packageName);
  if (!entry) return false;
  const allowed = entry.viewer?.remoteProxyHosts;
  if (!Array.isArray(allowed) || allowed.length === 0) return false;

  const normalizedHost = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (normalizedHost.length === 0) return false;
  return allowed.some(
    (candidate) => candidate.trim().toLowerCase() === normalizedHost,
  );
}

export function normalizeManagedAppConfiguredUrl(
  packageName: string,
  value: string,
): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";

  if (packageName === HYPERSCAPE_PACKAGE) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.trim().toLowerCase();
      const path = parsed.pathname.trim().replace(/\/+$/g, "");
      if (
        host === HYPERSCAPE_LEGACY_DOWNLOAD_HOST &&
        path === HYPERSCAPE_LEGACY_DOWNLOAD_PATH
      ) {
        return ALICE_APP_CATALOG[HYPERSCAPE_PACKAGE].defaultPublicUrl ?? trimmed;
      }
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function readConfiguredUrl(packageName: string, envKey: string): string | null {
  const value = process.env[envKey];
  if (!value) return null;
  const normalized = normalizeManagedAppConfiguredUrl(packageName, value);
  return normalized.length > 0 ? normalized : null;
}

export function resolveManagedAppUpstreamUrl(
  packageName: string,
): string | null {
  const entry = resolveManagedAppEntry(packageName);
  if (!entry) return null;
  const fromEnv = readConfiguredUrl(
    packageName,
    resolveAppUpstreamEnvKey(packageName),
  );
  if (fromEnv) return fromEnv;
  return entry.defaultUpstreamUrl;
}

export function resolveManagedAppFallbackUrl(
  packageName: string,
): string | null {
  const fromEnv = readConfiguredUrl(
    packageName,
    resolveAppFallbackEnvKey(packageName),
  );
  if (fromEnv) return fromEnv;
  const entry = resolveManagedAppEntry(packageName);
  if (!entry) return null;
  return entry.defaultPublicUrl ?? null;
}

export function resolveManagedAppStreamUrl(packageName: string): string | null {
  const fromEnv = readConfiguredUrl(
    packageName,
    resolveAppStreamEnvKey(packageName),
  );
  if (fromEnv) return fromEnv;
  const fallback = resolveManagedAppFallbackUrl(packageName);
  if (fallback) return fallback;
  return resolveManagedAppUpstreamUrl(packageName);
}
