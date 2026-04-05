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
import { logger } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";
import {
  hasAppInterface,
  packageNameToAppDisplayName,
  packageNameToAppRouteSlug,
  AppLaunchDiagnostic,
  AppLaunchResult,
  AppSessionState,
  AppStopResult,
  AppViewerAuthMessage,
  InstalledAppInfo,
} from "../contracts/apps";
import type {
  InstalledPluginInfo,
  InstallProgressLike,
  PluginManagerLike,
  RegistryPluginInfo,
  RegistrySearchResult,
} from "./plugin-manager-types";
import {
  importAppPlugin,
  importAppRouteModule,
} from "./app-package-modules";
import { generateWalletKeys, getWalletAddressesWithSteward } from "../api/wallet";
import { getPluginInfo, getRegistryPlugins } from "./registry-client";
import { scoreEntries, toSearchResults } from "./registry-client-queries.js";

const LOCAL_PLUGINS_DIR = "plugins";

export type {
  AppLaunchResult,
  AppStopResult,
  AppViewerAuthMessage,
  InstalledAppInfo,
} from "../contracts/apps";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const HYPERSCAPE_APP_ROUTE_SLUG = "hyperscape";
const HYPERSCAPE_AUTH_MESSAGE_TYPE = "HYPERSCAPE_AUTH";
const LOCAL_DEV_HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
const PRODUCTION_HYPERSCAPE_CLIENT_URL = "https://hyperscape.gg";
const LOCAL_DEV_HYPERSCAPE_API_BASE_URL = "http://localhost:5555";
const PRODUCTION_HYPERSCAPE_API_BASE_URL = "https://hyperscape.gg";
const RS_2004SCAPE_APP_ROUTE_SLUG = "2004scape";
const RS_2004SCAPE_AUTH_MESSAGE_TYPE = "RS_2004SCAPE_AUTH";
const SAFE_APP_URL_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_APP_URL_TEMPLATE_KEYS = new Set([
  // Public display identity only.
  "BOT_NAME",
  "HYPERSCAPE_CHARACTER_ID",
  "HYPERSCAPE_CLIENT_URL",
  "RS_SDK_BOT_NAME",
]);

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

type AppViewerConfig = NonNullable<AppLaunchResult["viewer"]>;

interface RegistryAppPlugin extends RegistryPluginInfo {
  viewer?: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
  };
  launchType?: "connect" | "local";
  launchUrl?: string;
  displayName?: string;
  runtimePlugin?: string;
  session?: {
    mode: AppSessionState["mode"];
    features?: Array<
      "commands" | "telemetry" | "pause" | "resume" | "suggestions"
    >;
  };
}

interface ActiveAppSession {
  appName: string;
  pluginName: string;
  launchType: string;
  launchUrl: string | null;
  viewerUrl: string | null;
  startedAt: string;
}

interface HyperscapeWalletCandidate {
  address: string;
  walletType: "evm" | "solana";
  source: string;
}

interface HyperscapeWalletAuthResponse {
  success?: boolean;
  authToken?: string;
  characterId?: string;
  accountId?: string;
  error?: string;
}

function isAppRegistryPlugin(plugin: RegistryPluginInfo): plugin is RegistryAppPlugin {
  return hasAppInterface(plugin);
}

function isHyperscapeAppName(appName: string): boolean {
  return packageNameToAppRouteSlug(appName) === HYPERSCAPE_APP_ROUTE_SLUG;
}

function is2004scapeAppName(appName: string): boolean {
  return packageNameToAppRouteSlug(appName) === RS_2004SCAPE_APP_ROUTE_SLUG;
}

function resolveDisplayViewerInfo(
  viewer: RegistryPluginInfo["viewer"],
): RegistryPluginInfo["viewer"] {
  if (!viewer) return viewer;

  const embedParams = viewer.embedParams
    ? Object.fromEntries(
        Object.entries(viewer.embedParams)
          .map(([key, value]) => [key, substituteTemplateVars(value).trim()])
          .filter(([, value]) => value.length > 0),
      )
    : undefined;

  return {
    ...viewer,
    url: substituteTemplateVars(viewer.url),
    embedParams,
  };
}

function flattenAppInfo<T extends RegistryPluginInfo>(appInfo: T): T {
  const meta = appInfo.appMeta;
  if (!meta) return appInfo;
  return {
    ...appInfo,
    displayName: meta.displayName ?? appInfo.displayName,
    launchType: meta.launchType ?? appInfo.launchType,
    launchUrl: substituteTemplateVars(
      meta.launchUrl ?? appInfo.launchUrl ?? "",
    ) || null,
    icon: meta.icon ?? appInfo.icon,
    category: meta.category ?? appInfo.category,
    capabilities: meta.capabilities ?? appInfo.capabilities,
    uiExtension: meta.uiExtension ?? appInfo.uiExtension,
    viewer: resolveDisplayViewerInfo(meta.viewer ?? appInfo.viewer),
    session: meta.session ?? appInfo.session,
  };
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
  appInfo.runtimePlugin = meta.runtimePlugin ?? appInfo.runtimePlugin;
  appInfo.session = meta.session ?? appInfo.session;
}

function mergeLocalRegistryInfo<T extends RegistryPluginInfo>(
  appInfo: T,
  localInfo: RegistryPluginInfo,
): T {
  appInfo.localPath = localInfo.localPath ?? appInfo.localPath;
  appInfo.kind = localInfo.kind ?? appInfo.kind;
  appInfo.appMeta = localInfo.appMeta ?? appInfo.appMeta;
  if (!appInfo.description && localInfo.description) {
    appInfo.description = localInfo.description;
  }
  if (!appInfo.homepage && localInfo.homepage) {
    appInfo.homepage = localInfo.homepage;
  }
  mergeAppMeta(appInfo, localInfo.appMeta);
  return appInfo;
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
  // E.g., @elizaos/app-babylon -> app-babylon
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
  if (key === "HYPERSCAPE_CLIENT_URL") {
    const runtimeClientUrl = process.env.HYPERSCAPE_CLIENT_URL?.trim();
    if (runtimeClientUrl && runtimeClientUrl.length > 0) {
      return runtimeClientUrl;
    }
    return isProductionRuntime()
      ? PRODUCTION_HYPERSCAPE_CLIENT_URL
      : LOCAL_DEV_HYPERSCAPE_CLIENT_URL;
  }
  if (key === "RS_SDK_BOT_NAME") {
    const runtimeBotName = process.env.BOT_NAME?.trim();
    if (runtimeBotName && runtimeBotName.length > 0) {
      return runtimeBotName;
    }
    return "testbot";
  }
  return undefined;
}

function resolveSettingLike(
  runtime: IAgentRuntime | null | undefined,
  key: string,
): string | undefined {
  const fromRuntime = runtime?.getSetting?.(key);
  if (typeof fromRuntime === "string" && fromRuntime.trim().length > 0) {
    return fromRuntime.trim();
  }
  const fromEnv = process.env[key];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return undefined;
}

function isEvmAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function isLikelySolanaAddress(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
  );
}

function readObject(
  value: unknown,
): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function resolveHyperscapeApiBaseUrl(runtime?: IAgentRuntime | null): string {
  const runtimeUrl = resolveSettingLike(runtime, "HYPERSCAPE_API_URL");
  if (runtimeUrl) {
    return runtimeUrl.replace(/\/+$/, "");
  }
  return isProductionRuntime()
    ? PRODUCTION_HYPERSCAPE_API_BASE_URL
    : LOCAL_DEV_HYPERSCAPE_API_BASE_URL;
}

function extractWalletCandidateFromRecord(
  record: unknown,
): HyperscapeWalletCandidate | null {
  const objectRecord = readObject(record);
  if (!objectRecord) return null;

  const directWalletAddresses = readObject(objectRecord.walletAddresses);
  const characterRecord = readObject(objectRecord.character);
  const characterSettings = readObject(characterRecord?.settings);
  const characterWalletAddresses = readObject(characterRecord?.walletAddresses);
  const characterSecrets = readObject(characterSettings?.secrets);

  const evmAddressCandidates = [
    directWalletAddresses?.evm,
    objectRecord.walletAddress,
    characterWalletAddresses?.evm,
    characterRecord?.walletAddress,
    characterSettings?.evmAddress,
    characterSecrets?.EVM_PUBLIC_KEY,
  ];
  for (const candidate of evmAddressCandidates) {
    if (typeof candidate === "string" && isEvmAddress(candidate)) {
      return {
        address: candidate.trim(),
        walletType: "evm",
        source: "runtime-agent-record",
      };
    }
  }

  const solanaAddressCandidates = [
    directWalletAddresses?.solana,
    characterWalletAddresses?.solana,
    characterSettings?.solanaAddress,
    characterSecrets?.SOLANA_PUBLIC_KEY,
  ];
  for (const candidate of solanaAddressCandidates) {
    if (typeof candidate === "string" && isLikelySolanaAddress(candidate)) {
      return {
        address: candidate.trim(),
        walletType: "solana",
        source: "runtime-agent-record",
      };
    }
  }

  return null;
}

async function resolveRuntimeWalletCandidate(
  runtime: IAgentRuntime | null,
): Promise<HyperscapeWalletCandidate | null> {
  if (!runtime) return null;

  const runtimeLike = runtime as IAgentRuntime & {
    getAgent?: (agentId: IAgentRuntime["agentId"]) => Promise<unknown>;
  };
  if (typeof runtimeLike.getAgent === "function") {
    const agentRecord = await runtimeLike.getAgent(runtime.agentId);
    const candidate = extractWalletCandidateFromRecord(agentRecord);
    if (candidate) {
      return candidate;
    }
  }

  const characterRecord = runtime.character as unknown;
  const characterCandidate = extractWalletCandidateFromRecord({
    character: characterRecord,
  });
  if (characterCandidate) {
    return {
      ...characterCandidate,
      source: "runtime-character",
    };
  }

  const managedEvmAddress = resolveSettingLike(runtime, "ELIZA_MANAGED_EVM_ADDRESS");
  if (isEvmAddress(managedEvmAddress)) {
    return {
      address: managedEvmAddress.trim(),
      walletType: "evm",
      source: "runtime-setting",
    };
  }

  const managedSolanaAddress = resolveSettingLike(
    runtime,
    "ELIZA_MANAGED_SOLANA_ADDRESS",
  );
  if (isLikelySolanaAddress(managedSolanaAddress)) {
    return {
      address: managedSolanaAddress.trim(),
      walletType: "solana",
      source: "runtime-setting",
    };
  }

  return null;
}

async function resolveHyperscapeWalletCandidate(
  runtime: IAgentRuntime | null,
): Promise<HyperscapeWalletCandidate | null> {
  const runtimeWallet = await resolveRuntimeWalletCandidate(runtime);
  if (runtimeWallet) {
    return runtimeWallet;
  }

  const walletAddresses = await getWalletAddressesWithSteward();
  if (isEvmAddress(walletAddresses.evmAddress)) {
    return {
      address: walletAddresses.evmAddress.trim(),
      walletType: "evm",
      source: "wallet-env",
    };
  }
  if (isLikelySolanaAddress(walletAddresses.solanaAddress)) {
    return {
      address: walletAddresses.solanaAddress.trim(),
      walletType: "solana",
      source: "wallet-env",
    };
  }

  return null;
}

function persistRuntimeSecret(
  runtime: IAgentRuntime | null,
  key: string,
  value: string,
): void {
  process.env[key] = value;
  if (!runtime) return;

  runtime.setSetting(key, value, true);

  const character = runtime.character as {
    settings?: { secrets?: Record<string, string> };
    secrets?: Record<string, string>;
  };
  if (!character.settings) {
    character.settings = {};
  }
  if (!character.settings.secrets) {
    character.settings.secrets = {};
  }
  character.settings.secrets[key] = value;
  if (!character.secrets) {
    character.secrets = {};
  }
  character.secrets[key] = value;
}

function provisionRuntimeWalletCandidate(
  runtime: IAgentRuntime | null,
): HyperscapeWalletCandidate | null {
  if (!runtime) {
    return null;
  }

  const keys = generateWalletKeys();
  persistRuntimeSecret(runtime, "EVM_PRIVATE_KEY", keys.evmPrivateKey);
  persistRuntimeSecret(runtime, "SOLANA_PRIVATE_KEY", keys.solanaPrivateKey);

  return {
    address: keys.evmAddress,
    walletType: "evm",
    source: "runtime-generated",
  };
}

function persistHyperscapeCredential(
  runtime: IAgentRuntime | null,
  key: "HYPERSCAPE_AUTH_TOKEN" | "HYPERSCAPE_CHARACTER_ID" | "HYPERSCAPE_ACCOUNT_ID",
  value: string,
  secret = false,
): void {
  process.env[key] = value;
  if (!runtime) return;

  runtime.setSetting(key, value, secret);

  const character = runtime.character as {
    settings?: { secrets?: Record<string, string> };
    secrets?: Record<string, string>;
  };
  if (!character.settings) {
    character.settings = {};
  }
  if (!character.settings.secrets) {
    character.settings.secrets = {};
  }
  character.settings.secrets[key] = value;
  if (!character.secrets) {
    character.secrets = {};
  }
  character.secrets[key] = value;
}

async function authenticateHyperscapeWallet(
  runtime: IAgentRuntime,
  wallet: HyperscapeWalletCandidate,
): Promise<{
  authToken: string;
  characterId: string;
  accountId?: string;
}> {
  const url = new URL("/api/agents/wallet-auth", resolveHyperscapeApiBaseUrl(runtime));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      walletAddress: wallet.address,
      walletType: wallet.walletType,
      agentName: runtime.character?.name || "Agent",
      agentId: runtime.agentId,
    }),
    signal: AbortSignal.timeout(1_500),
  });

  const text = await response.text();
  const data =
    text.trim().length > 0
      ? (JSON.parse(text) as HyperscapeWalletAuthResponse)
      : null;

  if (!response.ok) {
    const detail =
      data && typeof data.error === "string" && data.error.trim().length > 0
        ? data.error.trim()
        : text.trim();
    throw new Error(
      detail.length > 0
        ? `Hyperscape wallet auth failed (${response.status}): ${detail}`
        : `Hyperscape wallet auth failed with status ${response.status}`,
    );
  }

  if (!data?.success || !data.authToken || !data.characterId) {
    throw new Error("Hyperscape wallet auth returned an invalid response.");
  }

  return {
    authToken: data.authToken,
    characterId: data.characterId,
    ...(data.accountId ? { accountId: data.accountId } : {}),
  };
}

async function prepareHyperscapeLaunch(
  runtime: IAgentRuntime | null,
): Promise<AppLaunchDiagnostic[]> {
  if (!runtime) return [];

  const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
  const characterId = resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
  if (authToken && characterId) {
    return [];
  }

  const wallet =
    (await resolveHyperscapeWalletCandidate(runtime)) ??
    provisionRuntimeWalletCandidate(runtime);
  if (!wallet) {
    return [];
  }

  try {
    const result = await authenticateHyperscapeWallet(runtime, wallet);
    persistHyperscapeCredential(
      runtime,
      "HYPERSCAPE_AUTH_TOKEN",
      result.authToken,
      true,
    );
    persistHyperscapeCredential(
      runtime,
      "HYPERSCAPE_CHARACTER_ID",
      result.characterId,
    );
    if (result.accountId) {
      persistHyperscapeCredential(
        runtime,
        "HYPERSCAPE_ACCOUNT_ID",
        result.accountId,
      );
    }
    return [];
  } catch (error) {
    return [
      {
        code: "hyperscape-auth-provisioning-failed",
        severity: "warning",
        message:
          error instanceof Error
            ? error.message
            : "Hyperscape wallet auth failed.",
      },
    ];
  }
}

function substituteTemplateVars(raw: string): string {
  return raw.replace(/\{([A-Z0-9_]+)\}/g, (_full, key: string) => {
    if (!ALLOWED_APP_URL_TEMPLATE_KEYS.has(key)) {
      return getTemplateFallbackValue(key) ?? "";
    }

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
    const nextValue = substituteTemplateVars(rawValue).trim();
    if (!nextValue) {
      queryParams.delete(key);
      continue;
    }
    queryParams.set(key, nextValue);
  }
  const query = queryParams.toString();
  const hash = hashPartRaw ? `#${hashPartRaw}` : "";
  return `${pathPart}${query.length > 0 ? `?${query}` : ""}${hash}`;
}

function resolveViewerEmbedParams(
  embedParams?: Record<string, string>,
): Record<string, string> | undefined {
  if (!embedParams) return undefined;
  const resolved = Object.fromEntries(
    Object.entries(embedParams)
      .map(([key, value]) => [key, substituteTemplateVars(value).trim()])
      .filter(([, value]) => value.length > 0),
  );
  return Object.keys(resolved).length > 0 ? resolved : undefined;
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
  runtime?: IAgentRuntime | null,
): AppViewerAuthMessage | undefined {
  if (!postMessageAuth) return undefined;

  if (isHyperscapeAppName(appName)) {
    const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
    if (!authToken) {
      return undefined;
    }
    const characterId = resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
    const agentId =
      typeof runtime?.agentId === "string" && runtime.agentId.trim().length > 0
        ? runtime.agentId
        : undefined;

    return {
      type: HYPERSCAPE_AUTH_MESSAGE_TYPE,
      authToken,
      agentId,
      characterId,
      followEntity: characterId,
    };
  }

  // 2004scape auth - uses bot name and password from environment
  if (is2004scapeAppName(appName)) {
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
  runtime?: IAgentRuntime | null,
): AppViewerConfig | null {
  const viewerInfo = appInfo.viewer;
  if (viewerInfo) {
    const requestedPostMessageAuth = Boolean(viewerInfo.postMessageAuth);
    const authMessage = buildViewerAuthMessage(
      appInfo.name,
      requestedPostMessageAuth,
      runtime,
    );
    const postMessageAuth = requestedPostMessageAuth && Boolean(authMessage);
    if (requestedPostMessageAuth && !authMessage) {
      logger.warn(
        `[app-manager] ${appInfo.name} requires postMessage auth but no auth payload was generated.`,
      );
    }
    const resolvedEmbedParams = {
      ...(resolveViewerEmbedParams(viewerInfo.embedParams) ?? {}),
    };
    if (
      isHyperscapeAppName(appInfo.name) &&
      authMessage?.followEntity &&
      !resolvedEmbedParams.followEntity
    ) {
      resolvedEmbedParams.followEntity = authMessage.followEntity;
    }
    const finalEmbedParams =
      Object.keys(resolvedEmbedParams).length > 0
        ? resolvedEmbedParams
        : undefined;
    const viewerUrl = normalizeSafeAppUrl(
      buildViewerUrl(viewerInfo.url, finalEmbedParams),
    );
    if (!viewerUrl) {
      throw new Error(
        `Refusing to launch app "${appInfo.name}": unsafe viewer URL`,
      );
    }

    return {
      url: viewerUrl,
      embedParams: finalEmbedParams,
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
      url: viewerUrl,
      sandbox: DEFAULT_VIEWER_SANDBOX,
    };
  }
  return null;
}

function buildAppSession(
  appInfo: RegistryAppPlugin,
  authMessage: AppViewerAuthMessage | undefined,
  runtime?: IAgentRuntime | null,
): AppSessionState | null {
  if (!appInfo.session) return null;

  const runtimeAgentId =
    typeof runtime?.agentId === "string" && runtime.agentId.trim().length > 0
      ? runtime.agentId
      : undefined;
  const sessionId =
    authMessage?.agentId ||
    runtimeAgentId ||
    authMessage?.characterId ||
    resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
  if (!sessionId) return null;

  return {
    sessionId,
    appName: appInfo.name,
    mode: appInfo.session.mode,
    status: "connecting",
    displayName: appInfo.displayName ?? appInfo.name,
    agentId: authMessage?.agentId ?? runtimeAgentId,
    characterId:
      authMessage?.characterId ?? resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID"),
    followEntity:
      authMessage?.followEntity ?? authMessage?.characterId ?? undefined,
    canSendCommands: false,
    controls: [],
    summary: "Connecting session...",
  };
}

async function resolveLaunchSession(
  appInfo: RegistryAppPlugin,
  viewer: AppLaunchResult["viewer"] | null,
  launchUrl: string | null,
  runtime: IAgentRuntime | null,
): Promise<AppSessionState | null> {
  const routeModule = await importAppRouteModule(appInfo.name);
  if (typeof routeModule?.resolveLaunchSession === "function") {
    return routeModule.resolveLaunchSession({
      appName: appInfo.name,
      launchUrl,
      runtime,
      viewer,
    });
  }

  return buildAppSession(appInfo, viewer?.authMessage, runtime);
}

function isRuntimePluginActive(
  appInfo: RegistryAppPlugin,
  runtime: IAgentRuntime | null,
): boolean {
  if (!runtime || !Array.isArray(runtime.plugins)) {
    return false;
  }

  const pluginNames = new Set<string>([
    appInfo.name,
    appInfo.runtimePlugin ?? resolvePluginPackageName(appInfo),
  ]);
  return runtime.plugins.some(
    (plugin) =>
      typeof plugin?.name === "string" && pluginNames.has(plugin.name),
  );
}

function hasRuntimeService(
  runtime: IAgentRuntime | null,
  serviceType: string,
): boolean {
  const runtimeLike = runtime as IAgentRuntime & {
    hasService?: (candidate: string) => boolean;
  };
  return (
    typeof runtimeLike?.hasService === "function" &&
    runtimeLike.hasService(serviceType)
  );
}

function isRuntimePluginReady(
  appInfo: RegistryAppPlugin,
  runtime: IAgentRuntime | null,
): boolean {
  if (isHyperscapeAppName(appInfo.name)) {
    return hasRuntimeService(runtime, "hyperscapeService");
  }
  return isRuntimePluginActive(appInfo, runtime);
}

function getRuntimePluginCandidates(appInfo: RegistryAppPlugin): string[] {
  const candidates = [
    appInfo.runtimePlugin,
    appInfo.name,
    resolvePluginPackageName(appInfo),
  ];
  return Array.from(
    new Set(
      candidates.filter(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
      ),
    ),
  );
}

function collectHyperscapeLaunchDiagnostics(
  appInfo: RegistryAppPlugin,
  viewer: AppViewerConfig | null,
  session: AppSessionState | null,
  runtime: IAgentRuntime | null,
): AppLaunchDiagnostic[] {
  if (!isHyperscapeAppName(appInfo.name)) {
    return [];
  }

  const diagnostics: AppLaunchDiagnostic[] = [];
  const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
  const characterId = resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
  const requestedIframeAuth = Boolean(appInfo.viewer?.postMessageAuth);

  if (requestedIframeAuth && !viewer?.authMessage) {
    const missing: string[] = [];
    if (!authToken) missing.push("HYPERSCAPE_AUTH_TOKEN");
    if (!characterId) missing.push("HYPERSCAPE_CHARACTER_ID");
    diagnostics.push({
      code: "hyperscape-auth-unavailable",
      severity: "error",
      message:
        missing.length > 0
          ? `Hyperscape auto-sign-in is unavailable because ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not configured for this agent.`
          : "Hyperscape auto-sign-in is unavailable for this agent.",
    });
  }

  if (runtime && !session && !isRuntimePluginReady(appInfo, runtime)) {
    diagnostics.push({
      code: "hyperscape-runtime-bridge-inactive",
      severity: "warning",
      message:
        "The Hyperscape runtime bridge is not active in this agent, so Milady cannot attach to a live in-world session yet.",
    });
  }

  if (runtime && !session && characterId) {
    diagnostics.push({
      code: "hyperscape-session-not-found",
      severity: "warning",
      message:
        "No live Hyperscape session matched this agent. Start or reconnect the Hyperscape agent in-world, then launch again.",
    });
  }

  return diagnostics;
}

function collectLaunchDiagnostics(
  appInfo: RegistryAppPlugin,
  viewer: AppViewerConfig | null,
  session: AppSessionState | null,
  runtime: IAgentRuntime | null,
): AppLaunchDiagnostic[] {
  if (isHyperscapeAppName(appInfo.name)) {
    return collectHyperscapeLaunchDiagnostics(appInfo, viewer, session, runtime);
  }
  return [];
}

async function ensureRuntimePluginRegistered(
  appInfo: RegistryAppPlugin,
  runtime: IAgentRuntime | null,
  isLocal: boolean,
): Promise<boolean> {
  if (!runtime) {
    return false;
  }

  if (isRuntimePluginReady(appInfo, runtime)) {
    return true;
  }

  const pluginNames = getRuntimePluginCandidates(appInfo);
  for (const pluginPackageName of pluginNames) {
    const plugin = await importAppPlugin(pluginPackageName);
    if (!plugin) {
      continue;
    }

    await runtime.registerPlugin(plugin);
    if (isRuntimePluginReady(appInfo, runtime)) {
      return true;
    }
  }

  if (!isLocal) {
    return false;
  }

  throw new Error(
    `Local runtime plugin for "${appInfo.name}" could not be loaded.`,
  );
}

async function ensureHyperscapeServiceLoaded(
  appInfo: RegistryAppPlugin,
  runtime: IAgentRuntime | null,
): Promise<void> {
  if (!runtime || !isHyperscapeAppName(appInfo.name)) {
    return;
  }

  const runtimeLike = runtime as IAgentRuntime & {
    hasService?: (serviceType: string) => boolean;
    getServiceLoadPromise?: (serviceType: string) => Promise<unknown>;
  };

  if (
    typeof runtimeLike.hasService !== "function" ||
    !runtimeLike.hasService("hyperscapeService")
  ) {
    throw new Error(
      "Hyperscape service was not registered on the agent runtime.",
    );
  }

  if (typeof runtimeLike.getServiceLoadPromise === "function") {
    await runtimeLike.getServiceLoadPromise("hyperscapeService");
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
      const localRegistry = await getRegistryPlugins();
      for (const [name, info] of localRegistry) {
        if (info.kind !== "app" && !info.appMeta) {
          continue;
        }

        const existing = registry.get(name) as RegistryAppPlugin | undefined;
        if (!existing) {
          registry.set(name, info);
          continue;
        }

        mergeLocalRegistryInfo(existing, info);
        registry.set(name, existing);
      }
    } catch {
      // local discovery is best-effort
    }
    const apps = Array.from(registry.values()).filter(isAppRegistryPlugin);
    return apps.map(flattenAppInfo);
  }

  async search(
    pluginManager: PluginManagerLike,
    query: string,
    limit = 15,
  ): Promise<RegistrySearchResult[]> {
    const registry = await pluginManager.refreshRegistry();
    const appEntries = Array.from(registry.values())
      .filter(isAppRegistryPlugin)
      .map(flattenAppInfo);
    const results = scoreEntries(
      appEntries,
      query,
      limit,
      (p) => [p.appMeta?.displayName?.toLowerCase() ?? p.displayName?.toLowerCase() ?? ""],
      (p) => p.appMeta?.capabilities ?? p.capabilities ?? [],
    );
    return toSearchResults(results);
  }

  async getInfo(
    pluginManager: PluginManagerLike,
    name: string,
  ): Promise<RegistryPluginInfo | null> {
    let appInfo = await pluginManager.getRegistryPlugin(name);
    const localPluginInfo = await getPluginInfo(name);

    if (localPluginInfo) {
      if (!appInfo) {
        appInfo = mergeLocalRegistryInfo(
          { ...localPluginInfo },
          localPluginInfo,
        );
      } else {
        mergeLocalRegistryInfo(appInfo, localPluginInfo);
      }
    }

    return appInfo ? flattenAppInfo(appInfo) : null;
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
    _runtime?: IAgentRuntime | null,
  ): Promise<AppLaunchResult> {
    let appInfo = (await pluginManager.getRegistryPlugin(
      name,
    )) as RegistryAppPlugin | null;
    let localPluginInfo: Awaited<ReturnType<typeof getPluginInfo>> | null = null;
    // Supplement with local registry metadata since the elizaos plugin-manager
    // service doesn't include our local workspace app discovery.
    try {
      localPluginInfo = await getPluginInfo(name);
      if (localPluginInfo) {
        if (!appInfo) {
          appInfo = mergeLocalRegistryInfo(
            { ...localPluginInfo } as RegistryAppPlugin,
            localPluginInfo,
          );
        } else {
          mergeLocalRegistryInfo(appInfo, localPluginInfo);
        }
      }
    } catch {
      // local lookup is best-effort
    }
    if (!appInfo) {
      throw new Error(`App "${name}" not found in the registry.`);
    }

    // The app's plugin is what the agent needs to play the game.
    // It's the same npm package name as the app, or a separate plugin ref.
    const pluginName = appInfo.runtimePlugin ?? resolvePluginPackageName(appInfo);

    // Check if this is a local plugin (already present in plugins/ directory)
    const isLocal = Boolean(localPluginInfo?.localPath) || isLocalPlugin(appInfo);

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
        if (!_runtime) {
          throw new Error(
            `Launching "${name}" requires a running agent runtime because plugin "${pluginName}" is not installed.`,
          );
        }
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

    const launchPreparationDiagnostics =
      isHyperscapeAppName(appInfo.name)
        ? await prepareHyperscapeLaunch(_runtime ?? null)
        : [];

    const runtimePluginRegistered = await ensureRuntimePluginRegistered(
      appInfo,
      _runtime ?? null,
      isLocal,
    );
    if (runtimePluginRegistered) {
      pluginInstalled = true;
    }
    await ensureHyperscapeServiceLoaded(appInfo, _runtime ?? null);

    // Build viewer config from registry app metadata
    const resolvedLaunchUrl = appInfo.launchUrl
      ? substituteTemplateVars(appInfo.launchUrl)
      : null;
    const launchUrl = resolvedLaunchUrl
      ? normalizeSafeAppUrl(resolvedLaunchUrl)
      : null;
    if (resolvedLaunchUrl && !launchUrl) {
      throw new Error(
        `Refusing to launch app "${appInfo.name}": unsafe launch URL`,
      );
    }
    const viewer = buildViewerConfig(appInfo, launchUrl, _runtime);
    const session = _runtime
      ? await resolveLaunchSession(appInfo, viewer, launchUrl, _runtime)
      : buildAppSession(appInfo, viewer?.authMessage, _runtime);
    const diagnostics = [
      ...launchPreparationDiagnostics,
      ...collectLaunchDiagnostics(appInfo, viewer, session, _runtime ?? null),
    ];
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
      session,
      diagnostics,
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

    const hadSession = this.activeSessions.delete(name);
    const pluginName = appInfo.runtimePlugin ?? resolvePluginPackageName(appInfo);
    const installed = await pluginManager.listInstalledPlugins();
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
    const registry = await pluginManager.refreshRegistry();
    const installedByName = new Map(
      installed.map((plugin) => [plugin.name, plugin] as const),
    );

    const appEntries = Array.from(registry.values())
      .filter(isAppRegistryPlugin)
      .map(flattenAppInfo);

    return appEntries
      .map((appInfo): InstalledAppInfo | null => {
        const pluginName = appInfo.runtimePlugin ?? resolvePluginPackageName(appInfo);
        const installedPlugin =
          installedByName.get(pluginName) ?? installedByName.get(appInfo.name);
        if (!installedPlugin) return null;

        return {
          name: appInfo.name,
          displayName:
            appInfo.displayName ??
            packageNameToAppDisplayName(appInfo.name),
          pluginName,
          version: installedPlugin.version ?? "unknown",
          installedAt: installedPlugin.installedAt ?? "",
        };
      })
      .filter((app): app is InstalledAppInfo => app !== null);
  }
}
