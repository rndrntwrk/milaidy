/**
 * App Manager — manages app lifecycle: discover, install plugin, show viewer.
 *
 * Apps are hosted services. The manager's job is:
 * 1. List/search apps from the registry
 * 2. Install the game's plugin onto the agent (triggers restart)
 * 3. Return the viewer URL so the UI can embed the game client in an iframe
 *
 * @module services/app-manager
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { createConnection } from "node:net";
import { logger } from "@elizaos/core";
import { deriveEvmAddress, deriveSolanaAddress } from "../api/wallet.js";
import type {
  AppLaunchResult,
  AppStopResult,
  AppViewerAuthMessage,
  InstalledAppInfo,
} from "../contracts/apps.js";
import type {
  InstalledPluginInfo,
  InstallProgressLike,
  PluginManagerLike,
  RegistryPluginInfo,
  RegistrySearchResult,
} from "./plugin-manager-types.js";
import { listInstalledPlugins } from "./plugin-installer.js";
import {
  ALICE_APP_CATALOG,
  resolveManagedAppFallbackUrl,
} from "./app-catalog.js";
import {
  type RegistryAppInfo,
  getAppInfo as registryGetAppInfo,
  getRegistryPlugins as registryGetPlugins,
  getPluginInfo as registryGetPluginInfo,
} from "./registry-client.js";

const LOCAL_PLUGINS_DIR = "plugins";
const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";
const HYPERSCAPE_AUTH_MESSAGE_TYPE = "HYPERSCAPE_AUTH";
const RS_2004SCAPE_APP_NAME = "@elizaos/app-2004scape";
const RS_2004SCAPE_AUTH_MESSAGE_TYPE = "RS_2004SCAPE_AUTH";
const HYPERSCAPE_WALLET_AUTH_MAX_ATTEMPTS = 3;
const HYPERSCAPE_WALLET_AUTH_TIMEOUT_MS = 10_000;
const HYPERSCAPE_WALLET_AUTH_BACKOFF_MS = 1_500;
const HYPERSCAPE_EMBEDDED_FALLBACK_MAX_ATTEMPTS = 3;
const SAFE_APP_URL_PROTOCOLS = new Set(["http:", "https:"]);
type AppViewerConfig = NonNullable<AppLaunchResult["viewer"]>;
const LOCAL_APP_DEFAULT_FALLBACK_URLS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(ALICE_APP_CATALOG)
      .map(([packageName]) => [packageName, resolveManagedAppFallbackUrl(packageName)])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

export type {
  AppLaunchResult,
  AppStopResult,
  AppViewerAuthMessage,
  InstalledAppInfo,
} from "../contracts/apps.js";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface RegistryAppPlugin extends RegistryPluginInfo {
  viewer?: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
  };
  launchType?: string;
  launchUrl?: string | null;
  displayName?: string;
}

interface ActiveAppSession {
  appName: string;
  pluginName: string;
  launchType: string;
  launchUrl: string | null;
  viewerUrl: string | null;
  startedAt: string;
}

function resolvePluginPackageName(appInfo: RegistryPluginInfo): string {
  const npmPackage = appInfo.npm.package.trim();
  return npmPackage && npmPackage.length > 0 ? npmPackage : appInfo.name;
}

function mergeAppMeta(
  appInfo: RegistryPluginInfo,
  meta: RegistryPluginInfo["appMeta"],
): void {
  if (!meta) return;
  appInfo.viewer = meta.viewer ?? appInfo.viewer;
  appInfo.launchUrl = meta.launchUrl ?? appInfo.launchUrl;
  appInfo.launchType = meta.launchType ?? appInfo.launchType;
  appInfo.displayName = meta.displayName ?? appInfo.displayName;
  appInfo.category = meta.category ?? appInfo.category;
  appInfo.capabilities = meta.capabilities ?? appInfo.capabilities;
  appInfo.icon = meta.icon ?? appInfo.icon;
}

function mergeRegistryAppFallback(
  appInfo: RegistryAppPlugin,
  fallback: RegistryAppInfo,
): RegistryAppPlugin {
  appInfo.displayName = appInfo.displayName ?? fallback.displayName;
  appInfo.launchType = appInfo.launchType ?? fallback.launchType;
  appInfo.launchUrl = appInfo.launchUrl ?? fallback.launchUrl;
  appInfo.icon = appInfo.icon ?? fallback.icon;
  appInfo.category = appInfo.category ?? fallback.category;
  appInfo.capabilities =
    appInfo.capabilities && appInfo.capabilities.length > 0
      ? appInfo.capabilities
      : fallback.capabilities;
  appInfo.viewer = appInfo.viewer ?? fallback.viewer;
  if (!appInfo.description || appInfo.description.trim().length === 0) {
    appInfo.description = fallback.description;
  }
  if ((!appInfo.gitRepo || appInfo.gitRepo.trim().length === 0) && fallback.repository) {
    appInfo.gitRepo = fallback.repository;
  }
  if ((!appInfo.gitUrl || appInfo.gitUrl.trim().length === 0) && fallback.repository) {
    appInfo.gitUrl = fallback.repository;
  }
  if (!Array.isArray(appInfo.topics)) {
    appInfo.topics = [];
  }
  return appInfo;
}

function toPluginInfoFromAppInfo(appInfo: RegistryAppInfo): RegistryAppPlugin {
  return {
    name: appInfo.name,
    gitRepo: appInfo.repository,
    gitUrl: appInfo.repository,
    displayName: appInfo.displayName,
    description: appInfo.description,
    homepage: appInfo.repository,
    topics: [],
    stars: appInfo.stars,
    language: "TypeScript",
    kind: "app",
    launchType: appInfo.launchType,
    launchUrl: appInfo.launchUrl,
    icon: appInfo.icon,
    category: appInfo.category,
    capabilities: [...appInfo.capabilities],
    viewer: appInfo.viewer,
    npm: appInfo.npm,
    supports: appInfo.supports,
  };
}

function isAutoInstallable(appInfo: RegistryPluginInfo): boolean {
  const supportsRuntime =
    appInfo.supports.v0 || appInfo.supports.v1 || appInfo.supports.v2;
  const hasVersion = Boolean(
    appInfo.npm.v0Version || appInfo.npm.v1Version || appInfo.npm.v2Version,
  );
  return supportsRuntime && hasVersion;
}

/**
 * Check if a plugin exists locally in the plugins/ directory.
 * Local plugins don't need to be installed - they're already available.
 */
function isLocalPlugin(appInfo: RegistryPluginInfo): boolean {
  const pluginsDir = path.resolve(process.cwd(), LOCAL_PLUGINS_DIR);
  if (!fs.existsSync(pluginsDir)) {
    return false;
  }

  // Check for directory names that match the app
  // E.g., @elizaos/app-hyperscape -> app-hyperscape
  const bareName = appInfo.name.replace(/^@[^/]+\//, "");
  const possibleDirs = [bareName, appInfo.name.replace("/", "-")];

  for (const dirName of possibleDirs) {
    const pluginPath = path.join(pluginsDir, dirName);
    const pluginJsonPath = path.join(pluginPath, "elizaos.plugin.json");
    if (fs.existsSync(pluginJsonPath)) {
      return true;
    }
  }

  return false;
}

function getTemplateFallbackValue(key: string): string | undefined {
  if (key === "RS_SDK_BOT_NAME") {
    const runtimeBotName = process.env.BOT_NAME?.trim();
    if (runtimeBotName && runtimeBotName.length > 0) {
      return runtimeBotName;
    }
    return "testbot";
  }
  // Hyperscape client URL defaults to localhost:3333
  if (key === "HYPERSCAPE_CLIENT_URL") {
    return "http://localhost:3333";
  }
  // Hyperscape server URL defaults to localhost:5555
  if (key === "HYPERSCAPE_SERVER_URL") {
    return "ws://localhost:5555/ws";
  }
  return undefined;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!normalized) return false;
  if (normalized === "localhost" || normalized === "::1") return true;
  if (normalized === "0.0.0.0") return true;
  if (normalized === "::ffff:127.0.0.1") return true;
  return normalized.startsWith("127.");
}

function isRuntimeTestEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.VITEST_WORKER_ID) ||
    Boolean(process.env.JEST_WORKER_ID)
  );
}

function shouldValidateLocalAppUpstream(): boolean {
  const explicit =
    process.env.MILAIDY_VALIDATE_LOCAL_APP_UPSTREAM?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  if (isRuntimeTestEnvironment()) return false;
  return true;
}

function resolveLocalUpstreamCandidate(
  appInfo: {
    viewer?: { url: string };
    launchUrl?: string | null;
  },
): string | null {
  const candidates = [appInfo.viewer?.url, appInfo.launchUrl]
    .map((value) =>
      typeof value === "string" && value.trim().length > 0
        ? substituteTemplateVars(value)
        : "",
    )
    .filter((value) => value.length > 0);

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (!/^https?:$/i.test(parsed.protocol)) continue;
      if (!isLoopbackHostname(parsed.hostname)) continue;
      return parsed.toString();
    } catch {
      continue;
    }
  }
  return null;
}

async function isLoopbackUpstreamReachable(
  candidateUrl: string,
  timeoutMs = 1000,
): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(candidateUrl);
  } catch {
    return false;
  }
  if (!/^https?:$/i.test(parsed.protocol)) return false;
  if (!isLoopbackHostname(parsed.hostname)) return true;

  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === "https:"
      ? 443
      : 80;
  if (!Number.isFinite(port) || port <= 0) return false;

  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({
      host: parsed.hostname,
      port,
    });
    let settled = false;
    const settle = (reachable: boolean): void => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

function resolveAppLaunchFallbackUrl(appInfo: {
  name: string;
  repository?: string | null;
}): string | null {
  const slug = appInfo.name
    .replace(/^@[^/]+\//, "")
    .replace(/^app-/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  const fallbackEnvKey = slug ? `MILAIDY_APP_FALLBACK_URL_${slug}` : undefined;
  const fallbackFromEnv =
    fallbackEnvKey &&
    process.env[fallbackEnvKey] &&
    process.env[fallbackEnvKey]?.trim().length
      ? (process.env[fallbackEnvKey]?.trim() ?? null)
      : null;
  if (fallbackFromEnv) return fallbackFromEnv;

  const defaultFallback = LOCAL_APP_DEFAULT_FALLBACK_URLS[appInfo.name];
  if (defaultFallback) return defaultFallback;

  const repository =
    typeof appInfo.repository === "string" ? appInfo.repository.trim() : "";
  return repository.length > 0 ? repository : null;
}

function substituteTemplateVars(raw: string): string {
  return raw.replace(/\{([A-Z0-9_]+)\}/g, (_full, key: string) => {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
    return getTemplateFallbackValue(key) ?? "";
  });
}

function buildViewerUrl(
  baseUrl: string,
  embedParams?: Record<string, string>,
): string {
  if (!embedParams || Object.keys(embedParams).length === 0) {
    return substituteTemplateVars(baseUrl);
  }
  const resolvedBaseUrl = substituteTemplateVars(baseUrl);
  const [beforeHash, hashPartRaw] = resolvedBaseUrl.split("#", 2);
  const [pathPart, queryPartRaw] = beforeHash.split("?", 2);
  const queryParams = new URLSearchParams(queryPartRaw ?? "");
  for (const [key, rawValue] of Object.entries(embedParams)) {
    const value = substituteTemplateVars(rawValue).trim();
    if (value.length === 0) {
      queryParams.delete(key);
      continue;
    }
    queryParams.set(key, value);
  }
  const query = queryParams.toString();
  const hash = hashPartRaw ? `#${hashPartRaw}` : "";
  const urlWithParams = `${pathPart}${query.length > 0 ? `?${query}` : ""}${hash}`;
  return urlWithParams;
}

function normalizeSafeAppUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    // Disallow protocol-relative form (`//evil.test`) which escapes same-origin.
    return trimmed.startsWith("//") ? null : trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (!SAFE_APP_URL_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function buildViewerAuthMessage(
  appName: string,
  postMessageAuth: boolean | undefined,
): AppViewerAuthMessage | undefined {
  if (!postMessageAuth) return undefined;

  // Hyperscape auth
  if (appName === HYPERSCAPE_APP_NAME) {
    const authToken = process.env.HYPERSCAPE_AUTH_TOKEN?.trim();
    const characterId = process.env.HYPERSCAPE_CHARACTER_ID?.trim();

    // Need at least authToken OR characterId for spectator mode
    if (!authToken && !characterId) return undefined;

    const sessionToken = process.env.HYPERSCAPE_SESSION_TOKEN?.trim();
    const agentId = process.env.HYPERSCAPE_EMBED_AGENT_ID?.trim();
    return {
      type: HYPERSCAPE_AUTH_MESSAGE_TYPE,
      authToken: authToken || undefined,
      characterId: characterId || undefined,
      sessionToken:
        sessionToken && sessionToken.length > 0 ? sessionToken : undefined,
      agentId: agentId && agentId.length > 0 ? agentId : undefined,
    };
  }

  // 2004scape auth - uses bot name and password from environment
  if (appName === RS_2004SCAPE_APP_NAME) {
    // Get username from RS_SDK_BOT_NAME or BOT_NAME, fallback to testbot
    const username =
      process.env.RS_SDK_BOT_NAME?.trim() ||
      process.env.BOT_NAME?.trim() ||
      "testbot";
    // Get password from RS_SDK_BOT_PASSWORD or BOT_PASSWORD
    const password =
      process.env.RS_SDK_BOT_PASSWORD?.trim() ||
      process.env.BOT_PASSWORD?.trim() ||
      "";

    return {
      type: RS_2004SCAPE_AUTH_MESSAGE_TYPE,
      authToken: username, // Using authToken field for username
      sessionToken: password, // Using sessionToken field for password
    };
  }

  return undefined;
}

function buildViewerConfig(
  appInfo: RegistryAppPlugin,
  launchUrl: string | null,
): AppViewerConfig | null {
  const viewerInfo = appInfo.viewer;
  if (viewerInfo) {
    const requestedPostMessageAuth = Boolean(viewerInfo.postMessageAuth);
    const authMessage = buildViewerAuthMessage(
      appInfo.name,
      requestedPostMessageAuth,
    );
    const postMessageAuth = requestedPostMessageAuth && Boolean(authMessage);
    if (requestedPostMessageAuth && !authMessage) {
      if (appInfo.name === HYPERSCAPE_APP_NAME) {
        logger.info(
          `[app-manager] ${appInfo.name} auth token not configured; launching embedded viewer without postMessage auth.`,
        );
      } else {
        logger.warn(
          `[app-manager] ${appInfo.name} requires postMessage auth but no auth payload was generated.`,
        );
      }
    }
    const viewerUrl = normalizeSafeAppUrl(
      buildViewerUrl(viewerInfo.url, viewerInfo.embedParams),
    );
    if (!viewerUrl) {
      throw new Error(
        `Refusing to launch app "${appInfo.name}": unsafe viewer URL`,
      );
    }

    return {
      url: buildViewerUrl(
        appInfo.viewer.url,
        appInfo.viewer.embedParams,
      ),
      embedParams: appInfo.viewer.embedParams,
      postMessageAuth,
      sandbox: viewerInfo.sandbox ?? DEFAULT_VIEWER_SANDBOX,
      authMessage,
    };
  }
  if (
    (appInfo.launchType === "connect" || appInfo.launchType === "local") &&
    launchUrl
  ) {
    const viewerUrl = normalizeSafeAppUrl(launchUrl);
    if (!viewerUrl) {
      throw new Error(
        `Refusing to launch app "${appInfo.name}": unsafe launch URL`,
      );
    }
    return {
      url: launchUrl,
      sandbox: DEFAULT_VIEWER_SANDBOX,
    };
  }
  return null;
}

function getWalletAddressesFromRuntime(
  runtime: IAgentRuntime | null | undefined,
): { evmAddress: string | null; solanaAddress: string | null } {
  let evmAddress: string | null = null;
  let solanaAddress: string | null = null;
  const evmKey =
    (runtime?.getSetting?.("EVM_PRIVATE_KEY") as string | undefined)?.trim() ||
    process.env.EVM_PRIVATE_KEY?.trim();
  if (evmKey) {
    try {
      evmAddress = deriveEvmAddress(evmKey);
    } catch (error) {
      logger.warn(
        `[app-manager] Invalid EVM key for hyperscape auth: ${describeError(error)}`,
      );
    }
  }

  const solanaKey =
    (runtime?.getSetting?.("SOLANA_PRIVATE_KEY") as string | undefined)?.trim() ||
    process.env.SOLANA_PRIVATE_KEY?.trim();
  if (solanaKey) {
    try {
      solanaAddress = deriveSolanaAddress(solanaKey);
    } catch (error) {
      logger.warn(
        `[app-manager] Invalid Solana key for hyperscape auth: ${describeError(error)}`,
      );
    }
  }

  return { evmAddress, solanaAddress };
}

async function autoProvisionHyperscapeAgent(
  runtime: IAgentRuntime | null | undefined,
): Promise<{
  characterId?: string;
  authToken?: string;
} | null> {
  const existingCharacterId =
    (
      runtime?.getSetting?.("HYPERSCAPE_CHARACTER_ID") as string | undefined
    )?.trim() || process.env.HYPERSCAPE_CHARACTER_ID?.trim();
  const existingToken =
    (
      runtime?.getSetting?.("HYPERSCAPE_AUTH_TOKEN") as string | undefined
    )?.trim() || process.env.HYPERSCAPE_AUTH_TOKEN?.trim();
  if (existingCharacterId) {
    process.env.HYPERSCAPE_CHARACTER_ID = existingCharacterId;
  }
  if (existingToken) {
    process.env.HYPERSCAPE_AUTH_TOKEN = existingToken;
  }
  if (existingCharacterId || existingToken) {
    return {
      characterId: existingCharacterId || undefined,
      authToken: existingToken || undefined,
    };
  }

  const walletAddresses = getWalletAddressesFromRuntime(runtime);
  const walletAddress = walletAddresses.evmAddress || walletAddresses.solanaAddress;
  if (!walletAddress) {
    logger.warn(
      "[app-manager] Hyperscape auto-provision skipped: no EVM or Solana private key available.",
    );
    return null;
  }

  const walletType = walletAddresses.evmAddress ? "evm" : "solana";
  const serverUrl =
    (
      runtime?.getSetting?.("HYPERSCAPE_SERVER_URL") as string | undefined
    )?.trim() ||
    process.env.HYPERSCAPE_SERVER_URL?.trim() ||
    "ws://localhost:5555/ws";
  const apiBaseUrl = serverUrl
    .replace(/^ws:/, "http:")
    .replace(/^wss:/, "https:")
    .replace(/\/ws$/, "");
  const agentName =
    runtime?.character?.name ||
    (runtime?.getSetting?.("BOT_NAME") as string | undefined)?.trim() ||
    process.env.BOT_NAME ||
    "Agent";

  const withTimeout = async (
    input: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const walletAuthBody = JSON.stringify({ walletAddress, walletType, agentName });

  for (
    let attempt = 1;
    attempt <= HYPERSCAPE_WALLET_AUTH_MAX_ATTEMPTS;
    attempt += 1
  ) {
    let response: Response;
    try {
      response = await withTimeout(
        `${apiBaseUrl}/api/agents/wallet-auth`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: walletAuthBody,
        },
        HYPERSCAPE_WALLET_AUTH_TIMEOUT_MS,
      );
    } catch (error) {
      logger.warn(
        `[app-manager] Hyperscape wallet-auth request failed on attempt ${attempt}/${HYPERSCAPE_WALLET_AUTH_MAX_ATTEMPTS}: ${describeError(error)}`,
      );
      if (attempt < HYPERSCAPE_WALLET_AUTH_MAX_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, HYPERSCAPE_WALLET_AUTH_BACKOFF_MS * attempt),
        );
      }
      continue;
    }

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      logger.warn(
        `[app-manager] Hyperscape wallet-auth failed (${response.status}) on attempt ${attempt}/${HYPERSCAPE_WALLET_AUTH_MAX_ATTEMPTS}: ${details}`,
      );

      const shouldRetry =
        attempt < HYPERSCAPE_WALLET_AUTH_MAX_ATTEMPTS &&
        [408, 429, 500, 502, 503, 504].includes(response.status);
      if (shouldRetry) {
        await new Promise((resolve) =>
          setTimeout(resolve, HYPERSCAPE_WALLET_AUTH_BACKOFF_MS * attempt),
        );
        continue;
      }
      break;
    }

    const payload = (await response.json()) as {
      success?: boolean;
      authToken?: string;
      characterId?: string;
      data?: { authToken?: string; characterId?: string; agentId?: string };
      token?: string;
      agentId?: string;
    };
    const authToken =
      payload.authToken?.trim() ||
      payload.data?.authToken?.trim() ||
      payload.token?.trim();
    const characterId =
      payload.characterId?.trim() ||
      payload.data?.characterId?.trim() ||
      payload.data?.agentId?.trim() ||
      payload.agentId?.trim();

    if (!payload.success || !characterId || !authToken) {
      logger.warn(
        `[app-manager] Hyperscape wallet-auth returned incomplete payload on attempt ${attempt}/${HYPERSCAPE_WALLET_AUTH_MAX_ATTEMPTS}.`,
      );
      break;
    }

    process.env.HYPERSCAPE_CHARACTER_ID = characterId;
    process.env.HYPERSCAPE_AUTH_TOKEN = authToken;
    logger.info(`[app-manager] Auto-provisioned hyperscape agent: ${characterId}`);
    return {
      characterId,
      authToken,
    };
  }

  for (
    let fallbackAttempt = 1;
    fallbackAttempt <= HYPERSCAPE_EMBEDDED_FALLBACK_MAX_ATTEMPTS;
    fallbackAttempt += 1
  ) {
    let fallbackResponse: Response;
    try {
      fallbackResponse = await withTimeout(
        `${apiBaseUrl}/api/embedded-agents`,
        { method: "GET" },
        HYPERSCAPE_WALLET_AUTH_TIMEOUT_MS,
      );
    } catch (error) {
      logger.warn(
        `[app-manager] Hyperscape embedded-agent fallback request failed on attempt ${fallbackAttempt}/${HYPERSCAPE_EMBEDDED_FALLBACK_MAX_ATTEMPTS}: ${describeError(error)}`,
      );
      if (fallbackAttempt < HYPERSCAPE_EMBEDDED_FALLBACK_MAX_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, HYPERSCAPE_WALLET_AUTH_BACKOFF_MS * fallbackAttempt),
        );
      }
      continue;
    }

    if (!fallbackResponse.ok) {
      const fallbackDetails = await fallbackResponse.text().catch(() => "");
      logger.warn(
        `[app-manager] Hyperscape embedded-agent fallback failed (${fallbackResponse.status}) on attempt ${fallbackAttempt}/${HYPERSCAPE_EMBEDDED_FALLBACK_MAX_ATTEMPTS}: ${fallbackDetails}`,
      );
      const shouldRetry =
        fallbackAttempt < HYPERSCAPE_EMBEDDED_FALLBACK_MAX_ATTEMPTS &&
        [408, 429, 500, 502, 503, 504].includes(fallbackResponse.status);
      if (shouldRetry) {
        await new Promise((resolve) =>
          setTimeout(resolve, HYPERSCAPE_WALLET_AUTH_BACKOFF_MS * fallbackAttempt),
        );
        continue;
      }
      return null;
    }

    const fallbackPayload = (await fallbackResponse.json()) as {
      success?: boolean;
      agents?: Array<{
        characterId?: string;
        agentId?: string;
        state?: string;
      }>;
    };
    const fallbackCharacterId =
      fallbackPayload.agents
        ?.find((agent) => agent.state === "running")
        ?.characterId?.trim() ||
      fallbackPayload.agents
        ?.find((agent) => agent.state === "running")
        ?.agentId?.trim() ||
      fallbackPayload.agents?.[0]?.characterId?.trim() ||
      fallbackPayload.agents?.[0]?.agentId?.trim();
    if (!fallbackCharacterId) {
      logger.warn(
        `[app-manager] Hyperscape embedded-agent fallback returned no usable character id on attempt ${fallbackAttempt}/${HYPERSCAPE_EMBEDDED_FALLBACK_MAX_ATTEMPTS}.`,
      );
      if (fallbackAttempt < HYPERSCAPE_EMBEDDED_FALLBACK_MAX_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, HYPERSCAPE_WALLET_AUTH_BACKOFF_MS * fallbackAttempt),
        );
        continue;
      }
      return null;
    }

    process.env.HYPERSCAPE_CHARACTER_ID = fallbackCharacterId;
    logger.warn(
      `[app-manager] Using existing hyperscape character fallback without auth token: ${fallbackCharacterId}`,
    );
    return { characterId: fallbackCharacterId };
  }

  logger.warn("[app-manager] Hyperscape auto-provision exhausted all fallback attempts.");
  return null;
}

function getPluginPackageName(
  appInfo: {
    name: string;
    npm: {
      package: string;
      v0Version?: string | null;
      v1Version?: string | null;
      v2Version?: string | null;
    };
  },
  pluginInfo?: {
    npm: {
      package: string;
      v0Version: string | null;
      v1Version: string | null;
      v2Version: string | null;
    };
  },
): string {
  const pluginPackage = pluginInfo?.npm.package;
  if (pluginPackage && pluginPackage.trim().length > 0) {
    return pluginPackage;
  }
  if (appInfo.npm.package && appInfo.npm.package.trim().length > 0) {
    return appInfo.npm.package;
  }
  return appInfo.name;
}

function isPluginInstallable(
  appInfo: {
    npm: {
      v0Version?: string | null;
      v1Version?: string | null;
      v2Version?: string | null;
    };
  },
  pluginInfo?: {
    localPath?: string;
    npm: {
      v0Version: string | null;
      v1Version: string | null;
      v2Version: string | null;
    };
  },
): boolean {
  if (pluginInfo?.localPath) {
    return true;
  }
  return (
    [appInfo.npm.v2Version, appInfo.npm.v1Version, appInfo.npm.v0Version].some(
      (version) => typeof version === "string" && version.trim().length > 0,
    ) ||
    (typeof pluginInfo?.npm.v2Version === "string" &&
      pluginInfo.npm.v2Version.trim().length > 0) ||
    (typeof pluginInfo?.npm.v1Version === "string" &&
      pluginInfo.npm.v1Version.trim().length > 0) ||
    (typeof pluginInfo?.npm.v0Version === "string" &&
      pluginInfo.npm.v0Version.trim().length > 0)
  );
}

async function getPluginMetadata(appName: string): Promise<{
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
  localPath?: string;
} | null> {
  try {
    return await registryGetPluginInfo(appName);
  } catch (error) {
    logger.warn(
      `[app-manager] Failed to load plugin metadata for "${appName}": ${describeError(error)}`,
    );
    return null;
  }
}

export class AppManager {
  private readonly activeSessions = new Map<string, ActiveAppSession>();

  async listAvailable(
    pluginManager: PluginManagerLike,
  ): Promise<RegistryPluginInfo[]> {
    const registry = await pluginManager.refreshRegistry();
    // Merge in local workspace app entries that are discovered by our
    // registry-client but not by the elizaos
    // plugin-manager service.
    try {
      const localRegistry = await registryGetPlugins();
      for (const [name, info] of localRegistry) {
        if (!registry.has(name) && info.kind === "app") {
          registry.set(name, info);
        }
      }
    } catch {
      // local discovery is best-effort
    }
    // Include app packages: those with "/app-" in the name OR kind === "app"
    const apps = Array.from(registry.values()).filter((plugin) => {
      if (plugin.kind === "app") return true;
      const name = plugin.name.toLowerCase();
      const npmPackage = plugin.npm.package.toLowerCase();
      return name.includes("/app-") || npmPackage.includes("/app-");
    });
    // Flatten appMeta into top-level fields for the frontend
    return apps.map((p) => {
      const meta = p.appMeta;
      if (!meta) return p;
      return {
        ...p,
        displayName: meta.displayName,
        launchType: meta.launchType,
        launchUrl: meta.launchUrl,
        icon: meta.icon,
        category: meta.category,
        capabilities: meta.capabilities,
        viewer: meta.viewer,
      };
    });
  }

  async search(
    pluginManager: PluginManagerLike,
    query: string,
    limit = 15,
  ): Promise<RegistrySearchResult[]> {
    const results = await pluginManager.searchRegistry(query, limit);
    // Filter to only include app packages
    return results.filter((result) => {
      const name = result.name.toLowerCase();
      const npmPackage = result.npmPackage.toLowerCase();
      return name.includes("/app-") || npmPackage.includes("/app-");
    });
  }

  async getInfo(
    pluginManager: PluginManagerLike,
    name: string,
  ): Promise<RegistryPluginInfo | null> {
    const pluginInfo = (await pluginManager.getRegistryPlugin(
      name,
    )) as RegistryAppPlugin | null;
    let fallbackInfo: RegistryAppInfo | null = null;
    try {
      fallbackInfo = await registryGetAppInfo(name);
    } catch (error) {
      logger.warn(
        `[app-manager] Failed to load app metadata for "${name}": ${describeError(error)}`,
      );
    }

    if (!pluginInfo && !fallbackInfo) return null;
    if (!pluginInfo && fallbackInfo) {
      return toPluginInfoFromAppInfo(fallbackInfo);
    }

    const merged = { ...(pluginInfo as RegistryAppPlugin) };
    mergeAppMeta(merged, merged.appMeta);
    if (fallbackInfo) {
      mergeRegistryAppFallback(merged, fallbackInfo);
    }
    return merged;
  }

  /**
   * Launch an app: install its plugin (if needed) and return the viewer URL.
   *
   * The plugin connects the agent to the game server. The viewer URL is what
   * the UI shows in an iframe so the user can watch the agent play.
   *
   * After installing a new plugin, the agent needs to restart. The UI should
   * handle this by showing "connecting..." while the runtime restarts.
   */
  async launch(
    pluginManager: PluginManagerLike,
    name: string,
    onProgress?: (progress: InstallProgressLike) => void,
    runtime?: IAgentRuntime | null,
  ): Promise<AppLaunchResult> {
    const appInfo = (await this.getInfo(pluginManager, name)) as RegistryAppPlugin | null;
    if (!appInfo) {
      throw new Error(`App "${name}" not found in the registry.`);
    }
    const pluginMeta = await getPluginMetadata(name);
    const launchUrlRaw = appInfo.launchUrl
      ? substituteTemplateVars(appInfo.launchUrl)
      : null;
    let launchUrl = launchUrlRaw;
    let viewer = buildViewerConfig(appInfo, launchUrl);

    const isTestRun = isRuntimeTestEnvironment();
    if (!isTestRun && shouldValidateLocalAppUpstream()) {
      const localUpstream = resolveLocalUpstreamCandidate(appInfo);
      if (localUpstream) {
        const upstreamReachable =
          await isLoopbackUpstreamReachable(localUpstream);
        if (!upstreamReachable) {
          const fallbackUrl = resolveAppLaunchFallbackUrl(appInfo);
          if (!fallbackUrl) {
            throw new Error(
              `Local app upstream is unreachable (${localUpstream}) and no fallback URL is configured.`,
            );
          }
          logger.warn(
            `[app-manager] Local app upstream unreachable for "${name}" (${localUpstream}); falling back to ${fallbackUrl}.`,
          );
          launchUrl = fallbackUrl;
          viewer = null;
        }
      }
    }

    // Hyperscape auth resolution must run before non-installable early returns
    // so spectator viewer launches always include postMessage credentials.
    if (!isTestRun && name === HYPERSCAPE_APP_NAME) {
      const provisionResult = await autoProvisionHyperscapeAgent(runtime);
      const hasHyperscapeCredentials = Boolean(
        provisionResult?.characterId?.trim() ||
          provisionResult?.authToken?.trim() ||
          process.env.HYPERSCAPE_CHARACTER_ID?.trim() ||
          process.env.HYPERSCAPE_AUTH_TOKEN?.trim(),
      );
      if (!hasHyperscapeCredentials) {
        logger.warn(
          "[app-manager] Hyperscape credentials unavailable after auto-provision attempt; launching embedded viewer without postMessage auth.",
        );
      } else {
        // Viewer metadata is env-derived; re-resolve now that hyperscape
        // credentials may have been hydrated from runtime settings.
        viewer = buildViewerConfig(appInfo, launchUrl);
      }
    }

    // The app's plugin is what the agent needs to play the game.
    // It's the same npm package name as the app, or a separate plugin ref.
    const pluginName = getPluginPackageName(appInfo, pluginMeta ?? undefined);

    // In test runs we exercise the API surface and viewer metadata without
    // performing real plugin installs (which would require network access and
    // slow down CI). Plugin installer behavior is covered by unit tests.
    if (isTestRun) {
      this.activeSessions.set(name, {
        appName: name,
        pluginName,
        launchType: appInfo.launchType,
        launchUrl,
        viewerUrl: viewer?.url ?? null,
        startedAt: new Date().toISOString(),
      });

      return {
        pluginInstalled: false,
        needsRestart: false,
        displayName: appInfo.displayName,
        launchType: appInfo.launchType,
        launchUrl,
        viewer,
      };
    }

    const installable = isPluginInstallable(appInfo, pluginMeta ?? undefined);
    if (!installable) {
      logger.info(
        `[app-manager] Skipping plugin install for "${name}" because no install source is configured.`,
      );
      this.activeSessions.set(name, {
        appName: name,
        pluginName,
        launchType: appInfo.launchType,
        launchUrl,
        viewerUrl: viewer?.url ?? null,
        startedAt: new Date().toISOString(),
      });
      return {
        pluginInstalled: false,
        needsRestart: false,
        displayName: appInfo.displayName,
        launchType: appInfo.launchType,
        launchUrl,
        viewer,
      };
    }

    const isLocal = isLocalPlugin(appInfo);

    // Check if the plugin is already installed
    const installed = await pluginManager.listInstalledPlugins();
    const alreadyInstalled = installed.some((p) => p.name === pluginName);
    let pluginInstalled = alreadyInstalled || isLocal;

    let needsRestart = false;

    if (isLocal) {
      // Local plugins are already available, no installation needed
      logger.info(
        `[app-manager] Using local plugin for ${name}: ${pluginName}`,
      );
    } else if (!alreadyInstalled) {
      if (isAutoInstallable(appInfo)) {
        logger.info(`[app-manager] Installing plugin for app: ${pluginName}`);
        const result = await pluginManager.installPlugin(
          pluginName,
          onProgress,
        );
        if (!result.success) {
          throw new Error(
            `Failed to install plugin "${pluginName}": ${result.error}`,
          );
        }
        pluginInstalled = true;
        needsRestart = result.requiresRestart;
        logger.info(
          `[app-manager] Plugin installed: ${pluginName} v${result.version}`,
        );
      } else {
        logger.info(
          `[app-manager] Skipping plugin install for ${name}: no installable runtime package/version in registry metadata.`,
        );
      }
    } else {
      logger.info(`[app-manager] Plugin already installed: ${pluginName}`);
    }

    // Build viewer config from registry app metadata
    this.activeSessions.set(name, {
      appName: name,
      pluginName,
      launchType: appInfo.launchType ?? "connect",
      launchUrl,
      viewerUrl: viewer?.url ?? null,
      startedAt: new Date().toISOString(),
    });

    return {
      pluginInstalled,
      needsRestart,
      displayName: appInfo.displayName ?? appInfo.name,
      launchType: appInfo.launchType ?? "connect",
      launchUrl,
      viewer,
    };
  }

  async stop(
    pluginManager: PluginManagerLike,
    name: string,
  ): Promise<AppStopResult> {
    const appInfo = (await pluginManager.getRegistryPlugin(
      name,
    )) as RegistryAppPlugin | null;
    if (!appInfo) {
      throw new Error(`App "${name}" not found in the registry.`);
    }
    const pluginMeta = await getPluginMetadata(name);

    const hadSession = this.activeSessions.delete(name);
    const pluginName = getPluginPackageName(appInfo, pluginMeta ?? undefined);
    const installed = listInstalledPlugins();
    const isPluginInstalled = installed.some(
      (plugin) => plugin.name === pluginName,
    );
    if (!hadSession && !isPluginInstalled) {
      return {
        success: false,
        appName: name,
        stoppedAt: new Date().toISOString(),
        pluginUninstalled: false,
        needsRestart: false,
        stopScope: "no-op",
        message: `No active session or installed plugin found for "${name}".`,
      };
    }

    if (isPluginInstalled) {
      const uninstallResult = await pluginManager.uninstallPlugin(pluginName);
      if (!uninstallResult.success) {
        throw new Error(
          `Failed to stop "${name}": ${uninstallResult.error ?? "plugin uninstall failed"}`,
        );
      }
      return {
        success: true,
        appName: name,
        stoppedAt: new Date().toISOString(),
        pluginUninstalled: true,
        needsRestart: uninstallResult.requiresRestart,
        stopScope: "plugin-uninstalled",
        message: uninstallResult.requiresRestart
          ? `${name} disconnected and plugin uninstalled. Agent restart required.`
          : `${name} disconnected and plugin uninstalled.`,
      };
    }

    return {
      success: true,
      appName: name,
      stoppedAt: new Date().toISOString(),
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message: `${name} viewer session stopped.`,
    };
  }

  /** List apps whose plugins are currently installed on the agent. */
  async listInstalled(
    pluginManager: PluginManagerLike,
  ): Promise<InstalledAppInfo[]> {
    const installed = await pluginManager.listInstalledPlugins();
    // Filter to only include app plugins (by name convention or known game plugins)
    const appPlugins = installed.filter((p: InstalledPluginInfo) => {
      const name = p.name.toLowerCase();
      return name.includes("/app-");
    });
    return appPlugins.map((p: InstalledPluginInfo) => ({
      name: p.name,
      displayName: p.name
        .replace(/^@elizaos\/(app-|plugin-)/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase()),
      pluginName: p.name,
      version: p.version ?? "unknown",
      installedAt: new Date().toISOString(), // Ejected plugins don't track install time yet
    }));
  }
}
