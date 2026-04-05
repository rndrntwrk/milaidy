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
import type {
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
  packageNameToAppSlug,
} from "./app-package-modules";
import { getPluginInfo, getRegistryPlugins } from "./registry-client";

const LOCAL_PLUGINS_DIR = "plugins";

export type {
  AppLaunchResult,
  AppStopResult,
  AppViewerAuthMessage,
  InstalledAppInfo,
} from "../contracts/apps";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";
const HYPERSCAPE_AUTH_MESSAGE_TYPE = "HYPERSCAPE_AUTH";
const RS_2004SCAPE_APP_NAME = "@elizaos/app-2004scape";
const RS_2004SCAPE_AUTH_MESSAGE_TYPE = "RS_2004SCAPE_AUTH";
const SAFE_APP_URL_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_APP_URL_TEMPLATE_KEYS = new Set([
  // Public display identity only.
  "BOT_NAME",
  "HYPERSCAPE_CHARACTER_ID",
  "HYPERSCAPE_CLIENT_URL",
  "RS_SDK_BOT_NAME",
]);

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
    return "http://localhost:3333";
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

  if (appName === HYPERSCAPE_APP_NAME) {
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
      appInfo.name === HYPERSCAPE_APP_NAME &&
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
  const slug = packageNameToAppSlug(appInfo.name);
  if (!slug) {
    return buildAppSession(appInfo, viewer?.authMessage, runtime);
  }

  const routeModule = await importAppRouteModule(slug);
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

function collectHyperscapeLaunchDiagnostics(
  appInfo: RegistryAppPlugin,
  viewer: AppViewerConfig | null,
  session: AppSessionState | null,
  runtime: IAgentRuntime | null,
): AppLaunchDiagnostic[] {
  if (appInfo.name !== HYPERSCAPE_APP_NAME) {
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

  if (runtime && !session && !isRuntimePluginActive(appInfo, runtime)) {
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
  if (appInfo.name === HYPERSCAPE_APP_NAME) {
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

  const pluginNames = new Set<string>([
    appInfo.name,
    appInfo.runtimePlugin ?? resolvePluginPackageName(appInfo),
  ]);

  if (
    Array.isArray(runtime.plugins) &&
    runtime.plugins.some(
      (plugin) =>
        typeof plugin?.name === "string" && pluginNames.has(plugin.name),
    )
  ) {
    return true;
  }

  if (!isLocal) {
    return false;
  }

  const plugin = await importAppPlugin(appInfo.name);
  if (!plugin) {
    throw new Error(`Local app plugin "${appInfo.name}" could not be loaded.`);
  }

  await runtime.registerPlugin(plugin);
  return true;
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
    return apps.map(flattenAppInfo);
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
    let appInfo = await pluginManager.getRegistryPlugin(name);
    const localPluginInfo = await getPluginInfo(name);

    if (localPluginInfo) {
      const meta = localPluginInfo.appMeta;
      if (!appInfo) {
        appInfo = { ...localPluginInfo };
        appInfo.appMeta = meta;
        mergeAppMeta(appInfo, meta);
      } else {
        appInfo.appMeta = meta ?? appInfo.appMeta;
        mergeAppMeta(appInfo, meta);
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
        const meta = localPluginInfo.appMeta;
        if (!appInfo) {
          appInfo = { ...localPluginInfo } as RegistryAppPlugin;
          appInfo.appMeta = meta;
          mergeAppMeta(appInfo, meta);
        } else if (meta && !appInfo.viewer) {
          // Merge local metadata into existing registry entry
          appInfo.appMeta = meta;
          mergeAppMeta(appInfo, meta);
          appInfo.kind = localPluginInfo.kind ?? appInfo.kind;
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

    const runtimePluginRegistered = await ensureRuntimePluginRegistered(
      appInfo,
      _runtime ?? null,
      isLocal,
    );
    if (runtimePluginRegistered) {
      pluginInstalled = true;
    }

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
    const diagnostics = collectLaunchDiagnostics(
      appInfo,
      viewer,
      session,
      _runtime ?? null,
    );
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
      installedAt: p.installedAt ?? "",
    }));
  }
}
