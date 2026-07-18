// Source the app shell and its provider from the same milaidy app-core module.
// Mixing milaidy's <App /> with upstream @elizaos/app-core's AppProvider creates
// separate React contexts and crashes `/companion` with
// "useApp must be used within AppProvider".
import { App } from "@miladyai/app-core/App";
import {
  AppProvider,
  applyUiTheme,
  createPersistedActiveServer,
  loadUiTheme,
  savePersistedActiveServer,
  useApp,
} from "@miladyai/app-core/state";
// Styles bundled via the @elizaos/ui barrel. The Wave A refactor (eliza
// commit 5a6f5f337) moved CSS out of @elizaos/app-core/styles/ but
// didn't update this consumer; the new shape is a single subpath.
import "@elizaos/ui/styles";
import "@miladyai/app-core/styles/alice-companion.css";

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { Preferences } from "@capacitor/preferences";
import {
  initializeCapacitorBridge,
  subscribeDesktopBridgeEvent,
  initializeStorageBridge,
  isElectrobunRuntime,
} from "@elizaos/ui";
import { ErrorBoundary } from "@miladyai/ui";
import { client } from "@miladyai/app-core/api";
import type { BrandingConfig } from "@miladyai/app-core/config";
import { MILADY_DEFAULT_THEME } from "@elizaos/shared";
import {
  type AppBootConfig,
  getBootConfig,
  setBootConfig,
} from "@miladyai/app-core/config";
import {
  ANDROID_LOCAL_AGENT_API_BASE,
  MOBILE_RUNTIME_MODE_STORAGE_KEY,
  normalizeMobileRuntimeMode,
} from "@elizaos/ui/onboarding/mobile-runtime-mode";
import { preSeedAndroidLocalRuntimeIfFresh } from "@elizaos/ui/onboarding/pre-seed-local-runtime";
import {
  AGENT_READY_EVENT,
  APP_PAUSE_EVENT,
  APP_RESUME_EVENT,
  COMMAND_PALETTE_EVENT,
  CONNECT_EVENT,
  dispatchAppEvent,
  MOBILE_RUNTIME_MODE_CHANGED_EVENT,
  SHARE_TARGET_EVENT,
  TRAY_ACTION_EVENT,
} from "@miladyai/app-core/events";
import {
  applyForceFreshOnboardingReset,
  applyLaunchConnectionFromUrl,
  applyLaunchConnection,
  installDesktopPermissionsClientPatch,
  installForceFreshOnboardingClientPatch,
  installLocalProviderCloudPreferencePatch,
  isAppWindowRoute,
  isDetachedWindowShell,
  getWindowNavigationPath,
  resolveWindowShellRoute,
  shouldInstallMainWindowOnboardingPatches,
  syncDetachedShellLocation,
} from "@miladyai/app-core/platform";
import { AppWindowRenderer } from "@elizaos/app-core";
import { dispatchQueuedLifeOpsGithubCallbackFromUrl } from "@elizaos/app-lifeops/platform";
import type { ShareTargetPayload } from "@miladyai/app-core/platform";
import {
  DESKTOP_TRAY_MENU_ITEMS,
  DesktopOnboardingRuntime,
  DesktopSurfaceNavigationRuntime,
  DesktopTrayRuntime,
  DetachedShellRoot,
} from "@miladyai/app-core/shell";
import { Agent } from "@elizaos/capacitor-agent";
import { Desktop } from "@elizaos/capacitor-desktop";
import {
  startDeviceBridgeClient,
  type DeviceBridgeClient,
} from "@elizaos/capacitor-llama";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CompanionShell,
  createVectorBrowserRenderer,
  GlobalEmoteOverlay,
  InferenceCloudAlertButton,
  resolveCompanionInferenceNotice,
  THREE,
  useCompanionSceneStatus,
} from "@elizaos/app-companion/ui";
import "@elizaos/app-companion/register";
// Side-effect: register LifeOps sidebar widgets + client methods on ElizaClient.
import "@elizaos/app-lifeops/widgets";
// Side-effect: register coding-agent (task-coordinator) slots so app-core
// slot wrappers (CodingAgentControlChip, PtyConsoleBase, etc.) render the
// real components instead of nulls.
import "@elizaos/app-task-coordinator/register-slots";
// Side-effect: register game operator surfaces + detail extensions.
import "@elizaos/app-babylon/ui";
import "@elizaos/app-scape/ui";
import "@elizaos/app-hyperscape/ui";
import "@elizaos/app-2004scape/ui";
import "@elizaos/app-defense-of-the-agents/ui";
import "@elizaos/app-screenshare/ui";
import "@clawville/app-clawville/ui";
import {
  AppBlockerSettingsCard,
  LifeOpsBrowserSetupPanel as BrowserBridgeSetupPanel,
  LifeOpsPageView,
  WebsiteBlockerSettingsCard,
} from "@elizaos/app-lifeops/ui";
import { LifeOpsActivitySignalsEffect } from "./lifeops/LifeOpsActivitySignalsEffect";
import {
  ApprovalQueue,
  StewardLogo,
  TransactionHistory,
} from "@elizaos/app-steward/ui";
import {
  CodingAgentControlChip,
  CodingAgentSettingsSection,
  CodingAgentTasksPanel,
  PtyConsoleDrawer,
} from "@elizaos/app-task-coordinator";
import { FineTuningView } from "@elizaos/app-training/ui";
import "@elizaos/app-shopify/register";
import "@elizaos/app-hyperliquid/client";
import "@elizaos/app-hyperliquid/register";
import "@elizaos/app-polymarket/client";
import "@elizaos/app-polymarket/register";
import "@elizaos/app-vincent/client";
import { useVincentState } from "@elizaos/app-vincent/ui";
import "@elizaos/app-vincent/register";
import "@elizaos/app-wallet/register";
import "@elizaos/app-workflow-builder/register";
import { shouldUseCloudOnlyBranding } from "@elizaos/ui";
import {
  APP_BRANDING_BASE,
  APP_CONFIG,
  APP_LOG_PREFIX,
  APP_NAMESPACE,
  APP_URL_SCHEME,
} from "./app-config";
import { APP_ENV_ALIASES, APP_ENV_PREFIX } from "./brand-env";
import { APP_CHARACTER_CATALOG, buildAppVrmAssets } from "./character-catalog";
import {
  type ConversationMessage,
  createVoiceCapture,
  type VoiceCaptureHandle,
  type VoiceCaptureSegment as VoiceCaptureTranscriptSegment,
  type VoiceCaptureState,
  normalizePillMessage,
  VoicePill,
  type VoicePillMessage,
} from "./pill-stubs";
import { bootAndroidLocalRuntimeIfApplicable } from "./android-local-runtime-boot";
import { bootIosLocalRuntimeIfApplicable } from "./ios-local-runtime-boot";
import {
  apiBaseToDeviceBridgeUrl,
  type IosRuntimeConfig,
  type IosRuntimeMode,
  resolveIosRuntimeConfig,
} from "@elizaos/ui";

// CharacterEditor lives in alice's local @miladyai/app-core (the 2009-line
// version is alice-specific; upstream eliza moved this component to
// @elizaos/ui as part of the Wave A refactor, but alice keeps its own
// customized fork). The @miladyai/app-core package's `./components/*`
// wildcard export resolves this to packages/app-core/src/components/.
// A static import keeps the load path honest — `lazy()` here was eagerly
// merged back into the main chunk by Rollup anyway.
import { CharacterEditor } from "@miladyai/app-core/components/character/CharacterEditor";

declare global {
  interface Window {
    __ELIZA_APP_SHARE_QUEUE__?: ShareTargetPayload[];
    __ELIZA_APP_CHARACTER_EDITOR__?: typeof CharacterEditor;
    __ELIZA_APP_API_BASE__?: string;
    __ELIZA_API_BASE__?: string;
    __ELIZAOS_APP_BOOT_CONFIG__?: AppBootConfig;
    __ELIZA_APP_BOOT_CONFIG__?: AppBootConfig;
    __MILADY_REACT_ROOT__?: Root;
    __MILADY_APP_BOOT_PROMISE__?: Promise<void>;
  }
}

const BRANDED_WINDOW_KEYS = {
  apiBase: `__${APP_ENV_PREFIX}_API_BASE__`,
  characterEditor: `__${APP_ENV_PREFIX}_CHARACTER_EDITOR__`,
  shareQueue: `__${APP_ENV_PREFIX}_SHARE_QUEUE__`,
} as const;

type AppCompatWindow = Window &
  Record<string, unknown> & {
    __ELIZA_APP_SHARE_QUEUE__?: ShareTargetPayload[];
    __ELIZA_APP_CHARACTER_EDITOR__?: typeof CharacterEditor;
    __ELIZA_APP_API_BASE__?: string;
    __ELIZA_API_BASE__?: string;
    __ELIZAOS_APP_BOOT_CONFIG__?: AppBootConfig;
    __ELIZA_APP_BOOT_CONFIG__?: AppBootConfig;
    __MILADY_REACT_ROOT__?: Root;
    __MILADY_APP_BOOT_PROMISE__?: Promise<void>;
  };

function getAppWindow(): AppCompatWindow {
  return window as unknown as AppCompatWindow;
}

// True when the APK is running on the AOSP MiladyOS variant. Detection:
// MainActivity.applyMiladyOSUserAgentSuffix appends `MiladyOS/<tag>` to the
// WebView user-agent when `ro.miladyos.product` is set by the AOSP product
// config. The upstream elizaOS layer reads its own `ElizaOS/<tag>` marker
// from the same place; this helper only cares about the Milady-brand layer.
function isMiladyOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\bMiladyOS\//.test(navigator.userAgent ?? "");
}

function getInjectedAppApiBase(): string | undefined {
  const appWindow = getAppWindow();
  const brandedApiBase = appWindow[BRANDED_WINDOW_KEYS.apiBase];
  const bootConfig =
    appWindow.__ELIZAOS_APP_BOOT_CONFIG__ ??
    appWindow.__ELIZA_APP_BOOT_CONFIG__;
  return (
    appWindow.__ELIZA_APP_API_BASE__ ??
    (typeof brandedApiBase === "string" ? brandedApiBase : undefined) ??
    bootConfig?.apiBase ??
    appWindow.__ELIZA_API_BASE__
  );
}

const APP_BRANDING: Partial<BrandingConfig> = {
  ...APP_BRANDING_BASE,
  theme: MILADY_DEFAULT_THEME,
  // ── alice: milady-ai branding (preserved from MILADY_BRANDING) ──
  // Upstream has been migrating org refs from milady-ai/* → elizaOS/*; alice
  // keeps the milady-ai naming for the consumer-facing brand surface. If/when
  // the brand is officially renamed, drop these overrides and rely entirely
  // on APP_BRANDING_BASE.
  appName: "Milady",
  orgName: "milady-ai",
  repoName: "milady",
  docsUrl: "https://docs.milady.ai",
  appUrl: "https://app.milady.ai",
  bugReportUrl:
    "https://github.com/milady-ai/milady/issues/new?template=bug_report.yml",
  hashtag: "#MiladyAgent",
  fileExtension: ".milady-agent",
  packageScope: "miladyai",
  // The hosted web bundle stays cloud-only in production. Desktop shells and
  // other hosts inject an explicit API base before React boots, and that host
  // backend should control onboarding capabilities instead.
  cloudOnly: shouldUseCloudOnlyBranding({
    isDev: import.meta.env.DEV ?? false,
    injectedApiBase:
      typeof window === "undefined" ? undefined : getInjectedAppApiBase(),
    isNativePlatform: Capacitor.isNativePlatform(),
  }),
};

/**
 * Platform detection utilities
 */
const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();
const isIOS = platform === "ios";
const isAndroid = platform === "android";
const IOS_RUNTIME_ENV_CONFIG = resolveIosRuntimeConfig(import.meta.env);
const DEVICE_BRIDGE_ID_KEY = "milady_device_bridge_id";

let mobileDeviceBridgeClient: DeviceBridgeClient | null = null;
let mobileDeviceBridgeStartPromise: Promise<void> | null = null;
let mobileRuntimeModeListenerInstalled = false;

async function registerMiladyOsSystemApps(): Promise<void> {
  if (!isMiladyOS()) return;
  await Promise.all([
    import("@elizaos/app-contacts/register"),
    import("@elizaos/app-phone/register"),
    import("@elizaos/app-wifi/register"),
  ]);
}

function isDesktopPlatform(): boolean {
  return isElectrobunRuntime();
}

const windowShellRoute = resolveWindowShellRoute();

// `isPillWindowShell` is not yet exported from the published @elizaos/app-core
// alpha. The pill window is launched with `?shell=pill` by the Electrobun
// host, so we detect that locally until the upstream helper ships.
// Ported from upstream milady main.tsx (VoicePill overlay, f3fcabf88).
function isPillWindowShellRoute(route: unknown): boolean {
  if (route && typeof route === "object") {
    const kind = (route as { kind?: unknown }).kind;
    if (typeof kind === "string" && kind === "pill") return true;
  }
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("shell") === "pill";
  } catch {
    return false;
  }
}

/**
 * Adds `eliza-electrobun-frameless` for CSS `-webkit-app-region` (Chromium/CEF).
 * macOS WKWebView move/resize are still driven by native overlays in
 * window-effects.mm; this class mainly marks the shell and helps non-WK engines.
 */
function shouldEnableElectrobunMacWindowDrag(): boolean {
  if (!isElectrobunRuntime() || typeof document === "undefined") return false;
  if (isDetachedWindowShell(windowShellRoute)) return false;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Mac/i.test(ua) && !/(iPhone|iPad|iPod)/i.test(ua);
}

if (shouldEnableElectrobunMacWindowDrag()) {
  document.documentElement.classList.add("eliza-electrobun-frameless");
}

// Dev escape hatch: ?reset forces a truly fresh onboarding session by clearing
// persisted state and temporarily suppressing stale backend resume config.
if (shouldInstallMainWindowOnboardingPatches(windowShellRoute)) {
  applyForceFreshOnboardingReset();
  installForceFreshOnboardingClientPatch(client);
}
installLocalProviderCloudPreferencePatch(client);
installDesktopPermissionsClientPatch(client);

// Register custom character editor for app-core's ViewRouter to pick up
window.__ELIZA_APP_CHARACTER_EDITOR__ = CharacterEditor;
getAppWindow()[BRANDED_WINDOW_KEYS.characterEditor] = CharacterEditor;

import { getStylePresets } from "@elizaos/shared/onboarding-presets";

// Derive VRM roster from STYLE_PRESETS so character names stay in one place.
const APP_STYLE_PRESETS = getStylePresets();

const APP_VRM_ASSETS = buildAppVrmAssets(APP_STYLE_PRESETS);

const appBootConfig: AppBootConfig = {
  ...getBootConfig(),
  branding: APP_BRANDING,
  defaultApps: APP_CONFIG.defaultApps,
  assetBaseUrl:
    (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.trim() ||
    undefined,
  cloudApiBase: IOS_RUNTIME_ENV_CONFIG.cloudApiBase,
  vrmAssets: APP_VRM_ASSETS,
  onboardingStyles: APP_STYLE_PRESETS,
  characterEditor: CharacterEditor,
  companionShell: CompanionShell,
  resolveCompanionInferenceNotice,
  companionInferenceAlertButton: InferenceCloudAlertButton,
  companionGlobalOverlay: GlobalEmoteOverlay,
  useCompanionSceneStatus,
  companionVectorBrowser: {
    THREE,
    createVectorBrowserRenderer,
  },
  codingAgentTasksPanel: CodingAgentTasksPanel,
  codingAgentSettingsSection: CodingAgentSettingsSection,
  codingAgentControlChip: CodingAgentControlChip,
  ptyConsoleDrawer: PtyConsoleDrawer,
  fineTuningView: FineTuningView,
  useVincentState,
  stewardLogo: StewardLogo,
  stewardApprovalQueue: ApprovalQueue,
  stewardTransactionHistory: TransactionHistory,
  characterCatalog: APP_CHARACTER_CATALOG,
  envAliases: APP_ENV_ALIASES,
  lifeOpsPageView: LifeOpsPageView,
  lifeOpsBrowserSetupPanel: BrowserBridgeSetupPanel,
  appBlockerSettingsCard: AppBlockerSettingsCard,
  websiteBlockerSettingsCard: WebsiteBlockerSettingsCard,
  clientMiddleware: {
    forceFreshOnboarding:
      shouldInstallMainWindowOnboardingPatches(windowShellRoute),
    preferLocalProvider: true,
    desktopPermissions: isDesktopPlatform(),
  },
};

// Self-hosted bot bootstrap. The token is read from the URL fragment
// (#token=...), so it never reaches the server, access log, or Referer
// headers. Once read, it persists in localStorage scoped to this origin.
const SELF_HOSTED_TOKEN_KEY = "milady:self-hosted-api-token";
const STALE_BOOTSTRAP_KEYS = [
  "elizaos:agent-profiles",
  "elizaos:active-server",
  MOBILE_RUNTIME_MODE_STORAGE_KEY,
] as const;
try {
  const url = new URL(window.location.href);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const fragmentToken = new URLSearchParams(hash).get("token")?.trim() ?? null;
  const hasQueryToken = url.searchParams.has("token");
  if (hasQueryToken) {
    console.error(
      "[milady] Refusing insecure ?token=... bootstrap. Use #token=... instead.",
    );
  }
  let bootstrapToken: string | null = fragmentToken;
  if (fragmentToken) {
    for (const key of STALE_BOOTSTRAP_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    }
    try {
      window.localStorage.setItem(SELF_HOSTED_TOKEN_KEY, fragmentToken);
    } catch {}
  }
  if (fragmentToken || hasQueryToken) {
    url.hash = "";
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  }
  if (!bootstrapToken) {
    try {
      const saved = window.localStorage.getItem(SELF_HOSTED_TOKEN_KEY)?.trim();
      if (saved) bootstrapToken = saved;
    } catch {}
  }
  if (bootstrapToken) {
    appBootConfig.apiToken = bootstrapToken;
    appBootConfig.apiBase ??= window.location.origin;
    try {
      client.setToken(bootstrapToken);
    } catch {}
    try {
      savePersistedActiveServer(
        createPersistedActiveServer({
          kind: "remote",
          apiBase: window.location.origin,
          accessToken: bootstrapToken,
          label: window.location.host || "Self-hosted Alice",
        }),
      );
    } catch {}
  }
} catch {}
setBootConfig(appBootConfig);

function getShareQueue(): ShareTargetPayload[] {
  const appWindow = getAppWindow();
  const brandedQueue = appWindow[BRANDED_WINDOW_KEYS.shareQueue];
  const existing =
    appWindow.__ELIZA_APP_SHARE_QUEUE__ ??
    (Array.isArray(brandedQueue)
      ? (brandedQueue as ShareTargetPayload[])
      : undefined);
  if (existing) {
    appWindow.__ELIZA_APP_SHARE_QUEUE__ = existing;
    appWindow[BRANDED_WINDOW_KEYS.shareQueue] = existing;
    return existing;
  }
  const queue: ShareTargetPayload[] = [];
  appWindow.__ELIZA_APP_SHARE_QUEUE__ = queue;
  appWindow[BRANDED_WINDOW_KEYS.shareQueue] = queue;
  return queue;
}

function dispatchShareTarget(payload: ShareTargetPayload): void {
  getShareQueue().push(payload);
  dispatchAppEvent(SHARE_TARGET_EVENT, payload);
}

function logNativePluginUnavailable(pluginName: string, error: unknown): void {
  console.warn(
    `${APP_LOG_PREFIX} ${pluginName} plugin not available:`,
    error instanceof Error ? error.message : error,
  );
}

async function initializeAgent(): Promise<void> {
  try {
    const auth = await client.getAuthStatus().catch(() => null);
    if (auth?.required && !auth.localAccess && !auth.authenticated) {
      return;
    }

    const status = await Agent.getStatus();
    dispatchAppEvent(AGENT_READY_EVENT, status);
  } catch (err) {
    console.warn(
      `${APP_LOG_PREFIX} Agent not available:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function initializePlatform(): Promise<void> {
  await initializeStorageBridge();
  initializeCapacitorBridge();

  if (isIOS || isAndroid) {
    await import("@elizaos/app-core/platform/native-plugin-entrypoints");
    await initializeKeyboard();
    initializeAppLifecycle();
    initializeMobileRuntimeModeListener();
    void initializeMobileDeviceBridge();
    // iOS local runtime: when ios-runtime mode resolves to "local", the
    // on-device JS runtime (@elizaos/capacitor-bun-runtime) is started here.
    // At the current eliza pin the plugin resolves to the renderer stub
    // (ElizaBunRuntime = null), so both boots no-op gracefully; they become
    // functional at the WP6 eliza bump. Ported from upstream milady main.tsx.
    void bootIosLocalRuntimeIfApplicable();
    // Android local runtime: when mobile-runtime-mode is "local", calls
    // ElizaBunRuntimePlugin.start().
    void bootAndroidLocalRuntimeIfApplicable();
  }

  if (isDesktopPlatform()) {
    await initializeDesktopShell();
  } else {
    await initializeAgent();
  }
}

async function initializeKeyboard(): Promise<void> {
  if (isIOS) {
    await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    await Keyboard.setScroll({ isDisabled: true });
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
  }

  Keyboard.addListener("keyboardWillShow", (info) => {
    document.body.style.setProperty(
      "--keyboard-height",
      `${info.keyboardHeight}px`,
    );
    document.body.classList.add("keyboard-open");
  });

  Keyboard.addListener("keyboardWillHide", () => {
    document.body.style.setProperty("--keyboard-height", "0px");
    document.body.classList.remove("keyboard-open");
  });
}

function initializeAppLifecycle(): void {
  void Promise.resolve(
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        dispatchAppEvent(APP_RESUME_EVENT);
      } else {
        dispatchAppEvent(APP_PAUSE_EVENT);
      }
    }),
  ).catch((error) => {
    logNativePluginUnavailable("App", error);
  });

  void Promise.resolve(
    CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      }
    }),
  ).catch((error) => {
    logNativePluginUnavailable("App", error);
  });

  void Promise.resolve(
    CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      handleDeepLink(url);
    }),
  ).catch((error) => {
    logNativePluginUnavailable("App", error);
  });

  void CapacitorApp.getLaunchUrl()
    .then((result) => {
      if (result?.url) {
        handleDeepLink(result.url);
      }
    })
    .catch((error) => {
      logNativePluginUnavailable("App", error);
    });
}

function handleDeepLink(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  if (parsed.protocol !== `${APP_URL_SCHEME}:`) return;
  const path = getDeepLinkPath(parsed);

  switch (path) {
    case "chat":
      window.location.hash = "#chat";
      break;
    case "phone":
    case "phone/call":
      setHashRoute("phone", parsed.searchParams);
      break;
    case "messages":
    case "messages/compose":
      setHashRoute("messages", parsed.searchParams);
      break;
    case "contacts":
      setHashRoute("contacts", parsed.searchParams);
      break;
    case "wallet":
    case "inventory":
      setHashRoute("wallet", parsed.searchParams);
      break;
    case "browser":
      setHashRoute("browser", parsed.searchParams);
      break;
    case "lifeops":
      window.location.hash = "#lifeops";
      dispatchQueuedLifeOpsGithubCallbackFromUrl(url);
      break;
    case "settings":
      window.location.hash = "#settings";
      dispatchQueuedLifeOpsGithubCallbackFromUrl(url);
      break;
    case "connect": {
      const gatewayUrl = parsed.searchParams.get("url");
      if (gatewayUrl) {
        try {
          const validatedUrl = new URL(gatewayUrl);
          if (
            validatedUrl.protocol !== "https:" &&
            validatedUrl.protocol !== "http:"
          ) {
            console.error(
              `${APP_LOG_PREFIX} Invalid gateway URL protocol:`,
              validatedUrl.protocol,
            );
            break;
          }
          const token =
            parsed.searchParams.get("token") ??
            parsed.searchParams.get("accessToken") ??
            null;
          const connection = applyLaunchConnection({
            kind: "remote",
            apiBase: validatedUrl.href,
            token,
          });
          dispatchAppEvent(CONNECT_EVENT, {
            gatewayUrl: connection.apiBase,
            token: connection.token ?? undefined,
          });
        } catch {
          console.error(`${APP_LOG_PREFIX} Invalid gateway URL format`);
        }
      }
      break;
    }
    case "share": {
      const title = parsed.searchParams.get("title")?.trim() || undefined;
      const text = parsed.searchParams.get("text")?.trim() || undefined;
      const sharedUrl = parsed.searchParams.get("url")?.trim() || undefined;
      const files = parsed.searchParams
        .getAll("file")
        .map((filePath) => filePath.trim())
        .filter((filePath) => filePath.length > 0)
        .map((filePath) => {
          const slash = Math.max(
            filePath.lastIndexOf("/"),
            filePath.lastIndexOf("\\"),
          );
          const name = slash >= 0 ? filePath.slice(slash + 1) : filePath;
          return { name, path: filePath };
        });

      dispatchShareTarget({
        source: "deep-link",
        title,
        text,
        url: sharedUrl,
        files,
      });
      break;
    }
    default:
      console.warn(`${APP_LOG_PREFIX} Unknown deep link path:`, path);
      break;
  }
}

function getDeepLinkPath(parsed: URL): string {
  const host = parsed.host.replace(/^\/+|\/+$/g, "");
  const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
  return [host, pathname].filter(Boolean).join("/");
}

function setHashRoute(route: string, params: URLSearchParams): void {
  const query = params.toString();
  window.location.hash = query ? `#${route}?${query}` : `#${route}`;
}

async function initializeDesktopShell(): Promise<void> {
  document.body.classList.add("desktop");

  const version = await Desktop.getVersion();
  const desktopNativeReady =
    typeof version.runtime === "string" &&
    version.runtime !== "N/A" &&
    version.runtime !== "unknown";
  if (!desktopNativeReady) return;

  await Desktop.registerShortcut({
    id: "command-palette",
    accelerator: "CommandOrControl+K",
  });

  await Desktop.addListener("shortcutPressed", (event: { id: string }) => {
    if (event.id === "command-palette") {
      dispatchAppEvent(COMMAND_PALETTE_EVENT);
    }
  });

  await Desktop.setTrayMenu({
    menu: [...DESKTOP_TRAY_MENU_ITEMS],
  });

  await Desktop.addListener(
    "trayMenuClick",
    (event: { itemId: string; checked?: boolean }) => {
      dispatchAppEvent(TRAY_ACTION_EVENT, event);
    },
  );

  subscribeDesktopBridgeEvent({
    rpcMessage: "shareTargetReceived",
    ipcChannel: "desktop:shareTargetReceived",
    listener: (payload) => {
      const url = (payload as { url?: string } | null | undefined)?.url;
      if (typeof url !== "string" || url.trim().length === 0) {
        return;
      }
      handleDeepLink(url);
    },
  });
}

function setupPlatformStyles(): void {
  const root = document.documentElement;
  document.body.classList.add(`platform-${platform}`);

  if (isNative) {
    document.body.classList.add("native");
  }

  root.style.setProperty("--safe-area-top", "env(safe-area-inset-top, 0px)");
  root.style.setProperty(
    "--safe-area-bottom",
    "env(safe-area-inset-bottom, 0px)",
  );
  root.style.setProperty("--safe-area-left", "env(safe-area-inset-left, 0px)");
  root.style.setProperty(
    "--safe-area-right",
    "env(safe-area-inset-right, 0px)",
  );
  root.style.setProperty("--keyboard-height", "0px");
}

function isPhoneCompanionMode(): boolean {
  if (typeof window === "undefined") return false;
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/companion") return true;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  return params.get("mode") === "companion";
}

function CompanionRouteTabSync(): null {
  const { setTab } = useApp();

  useEffect(() => {
    setTab("companion");
  }, [setTab]);

  return null;
}

function resolveAppWindowSlug(): string | null {
  if (!isAppWindowRoute()) return null;
  const path = getWindowNavigationPath();
  if (!path.startsWith("/apps/")) return null;
  // Take only the first path segment after /apps/. URLs like
  // `/apps/plugins/extra` would otherwise yield a malformed slug
  // ("plugins/extra") that no descriptor can match.
  const slug = path
    .slice("/apps/".length)
    .replace(/[?#].*$/, "")
    .split("/")[0];
  return slug.length > 0 ? slug : null;
}

const PILL_MESSAGE_TAIL = 20;
// localStorage key for the sticky pill conversation id. The pill window runs
// in its own Electrobun renderer process with no access to the main shell's
// active conversation state, so we keep its own session pinned to localStorage.
const PILL_CONVERSATION_STORAGE_KEY = "milady.pill.activeConversationId";

/**
 * Map a chat-API `ConversationMessage` to the trimmed `VoicePillMessage` shape
 * the pill renders. Skips entries with no display text and collapses message
 * roles to the binary user/agent split the pill UI expects.
 */
function toPillMessage(message: ConversationMessage): VoicePillMessage | null {
  const text = message.text?.trim() ?? "";
  if (!text) return null;
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "agent",
    text,
  };
}

function projectPillMessages(
  messages: ConversationMessage[],
): VoicePillMessage[] {
  const tail = messages.slice(-PILL_MESSAGE_TAIL);
  const projected: VoicePillMessage[] = [];
  for (const message of tail) {
    const pill = toPillMessage(message);
    if (pill) projected.push(pill);
  }
  return projected;
}

function readPillConversationId(): string | null {
  try {
    return window.localStorage.getItem(PILL_CONVERSATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePillConversationId(id: string | null): void {
  try {
    if (id) {
      window.localStorage.setItem(PILL_CONVERSATION_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(PILL_CONVERSATION_STORAGE_KEY);
    }
  } catch {
    /* sticky id is best-effort — pill still works without it */
  }
}

/**
 * Minimal shape of a conversation list entry the pill cares about. Kept local
 * (rather than imported from `@elizaos/ui`) because the app-core dist surface
 * exposes a slightly looser variant of `Conversation`, and the pill only
 * needs id + updatedAt to pick a "newest" conversation to attach to.
 */
type PillConversationSummary = {
  id: string;
  updatedAt?: number | string;
};

/**
 * Pick the most-recently-updated conversation from a server snapshot. Returns
 * null when the list is empty. The pill uses this to re-attach to the
 * conversation the user just left off in when no sticky pill id is set.
 */
function pickNewestConversation(
  conversations: PillConversationSummary[],
): PillConversationSummary | null {
  if (conversations.length === 0) return null;
  let best = conversations[0];
  for (let i = 1; i < conversations.length; i++) {
    const candidate = conversations[i];
    if (conversationUpdatedAtMs(candidate) > conversationUpdatedAtMs(best)) {
      best = candidate;
    }
  }
  return best;
}

function conversationUpdatedAtMs(c: PillConversationSummary): number {
  if (typeof c.updatedAt === "number") return c.updatedAt;
  if (typeof c.updatedAt === "string") {
    const t = Date.parse(c.updatedAt);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

/**
 * Pill renderer for the Electrobun overlay window.
 *
 * The pill window is its own renderer process — no AppProvider, no shared
 * React state with the main shell. We talk to the same local agent the main
 * composer talks to via the shared `client` singleton (already configured
 * against the local API base by the boot-config block at module top), reuse
 * the messaging routes (`createConversation`, `getConversationMessages`,
 * `sendConversationMessageStream`), and subscribe to the same
 * `proactive-message` WebSocket event the main app uses for out-of-band
 * agent turns.
 */

function PillRoot() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const conversationIdRef = useRef<string | null>(readPillConversationId());
  const sendInFlightRef = useRef<boolean>(false);
  const voiceCaptureRef = useRef<VoiceCaptureHandle | null>(null);
  const handleSubmitRef = useRef<((text: string) => void) | null>(null);

  // Append-or-replace by id so streaming token updates collapse onto a single
  // assistant turn without flicker.
  const upsertMessage = useCallback((next: ConversationMessage) => {
    setMessages((prev) => {
      const index = prev.findIndex((entry) => entry.id === next.id);
      if (index < 0) return [...prev, next];
      const copy = prev.slice();
      copy[index] = next;
      return copy;
    });
  }, []);

  // Resolve which conversation the pill should attach to: prefer the sticky
  // pill id if it still exists on the server, otherwise fall back to the
  // most-recently-updated conversation. If the list is empty, return null
  // and let the first send create a fresh conversation.
  const resolveConversationId = useCallback(async (): Promise<
    string | null
  > => {
    const sticky = conversationIdRef.current;
    const { conversations } = await client.listConversations();
    if (
      sticky &&
      conversations.some((c: PillConversationSummary) => c.id === sticky)
    ) {
      return sticky;
    }
    const newest = pickNewestConversation(conversations);
    if (newest) {
      conversationIdRef.current = newest.id;
      writePillConversationId(newest.id);
      return newest.id;
    }
    return null;
  }, []);

  // Hydrate the pill on mount with the existing conversation tail so the
  // overlay opens in-context instead of blank.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const convId = await resolveConversationId();
      if (cancelled || !convId) return;
      const { messages: history } =
        await client.getConversationMessages(convId);
      if (cancelled) return;
      setMessages(history.map(normalizePillMessage));
    })();
    return () => {
      cancelled = true;
    };
  }, [resolveConversationId]);

  // Subscribe to proactive (agent-initiated) messages — autonomy ticks,
  // connector inbox forwards, etc. — so they show up in the pill the same
  // way they show up in the main composer.
  useEffect(() => {
    client.connectWs();
    const unsubscribe = client.onWsEvent(
      "proactive-message",
      (event: unknown) => {
        if (!event || typeof event !== "object") return;
        const payload = event as {
          conversationId?: unknown;
          message?: unknown;
        };
        if (typeof payload.conversationId !== "string") return;
        if (payload.conversationId !== conversationIdRef.current) return;
        const raw = payload.message;
        if (!raw || typeof raw !== "object") return;
        const candidate = raw as { id?: unknown };
        if (typeof candidate.id !== "string") return;
        upsertMessage(normalizePillMessage(raw));
      },
    );
    return () => {
      unsubscribe();
    };
  }, [upsertMessage]);

  const handleSubmit = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed || sendInFlightRef.current) return;
      sendInFlightRef.current = true;
      void (async () => {
        try {
          let convId = conversationIdRef.current;
          if (!convId) {
            const created = await client.createConversation();
            convId = created.conversation.id;
            conversationIdRef.current = convId;
            writePillConversationId(convId);
          }

          const now = Date.now();
          const userMsgId = `pill-user-${now}`;
          const assistantMsgId = `pill-asst-${now}`;
          upsertMessage({
            id: userMsgId,
            role: "user",
            text: trimmed,
            timestamp: now,
          });
          upsertMessage({
            id: assistantMsgId,
            role: "assistant",
            text: "",
            timestamp: now,
          });

          const result = await client.sendConversationMessageStream(
            convId,
            trimmed,
            (_token: string, accumulatedText?: string) => {
              if (typeof accumulatedText !== "string") return;
              upsertMessage({
                id: assistantMsgId,
                role: "assistant",
                text: accumulatedText,
                timestamp: now,
              });
            },
          );

          upsertMessage({
            id: assistantMsgId,
            role: "assistant",
            text: result.text ?? "",
            timestamp: Date.now(),
            ...(typeof result.failureKind === "string"
              ? {
                  failureKind:
                    result.failureKind as ConversationMessage["failureKind"],
                }
              : {}),
          });
        } finally {
          sendInFlightRef.current = false;
        }
      })();
    },
    [upsertMessage],
  );

  // Keep a live ref to handleSubmit so the voice-capture callback (which is
  // installed once when the recorder lazily constructs) always routes finals
  // through the current closure, not the one captured at first use.
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Tear the recorder down on unmount. start/stop themselves are driven by
  // `handleRecordingChange` below.
  useEffect(() => {
    return () => {
      voiceCaptureRef.current?.dispose();
      voiceCaptureRef.current = null;
    };
  }, []);

  // Voice capture via createVoiceCapture from @elizaos/ui — see eliza/packages/ui/src/voice/voice-capture-factory.ts
  const handleRecordingChange = useCallback((recording: boolean): void => {
    if (recording) {
      if (!voiceCaptureRef.current) {
        voiceCaptureRef.current = createVoiceCapture({
          onTranscript: (segment: VoiceCaptureTranscriptSegment) => {
            if (!segment.final) {
              // Interim segments are best-guess partials — useful for a future
              // live caption surface but not safe to submit. Log only.
              console.info(
                `${APP_LOG_PREFIX} [pill] voice interim`,
                segment.text,
              );
              return;
            }
            const submit = handleSubmitRef.current;
            if (!submit) return;
            submit(segment.text);
          },
          onStateChange: (state: VoiceCaptureState, error?: Error) => {
            if (error) {
              console.warn(
                `${APP_LOG_PREFIX} [pill] voice ${state}`,
                error.message,
              );
              return;
            }
            console.info(`${APP_LOG_PREFIX} [pill] voice ${state}`);
          },
        });
      }
      void voiceCaptureRef.current.start();
      return;
    }
    void voiceCaptureRef.current?.stop();
  }, []);

  const pillMessages = projectPillMessages(messages);

  return (
    <VoicePill
      messages={pillMessages}
      onSubmit={handleSubmit}
      onRecordingChange={handleRecordingChange}
    />
  );
}

function injectPillRendererStyles(): void {
  const style = document.createElement("style");
  style.dataset.elizaPillReset = "1";
  style.textContent = `
html, body, #root {
  background: transparent !important;
  margin: 0;
  height: 100%;
  overflow: hidden;
}
html, body {
  /* Allow the user to grab any non-interactive area to drag the window. */
  -webkit-app-region: drag;
}
.elizaos-voice-pill,
.elizaos-voice-pill__hit,
.elizaos-voice-pill__chat,
.elizaos-voice-pill__composer,
.elizaos-voice-pill__input,
.elizaos-voice-pill__ctrl,
.elizaos-voice-pill__send,
button,
input,
textarea {
  -webkit-app-region: no-drag;
}
#root {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}
`;
  document.head.appendChild(style);
}

function mountPillWindow(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element #root not found");
  injectPillRendererStyles();

  createRoot(rootEl).render(
    <ErrorBoundary>
      <StrictMode>
        <PillRoot />
      </StrictMode>
    </ErrorBoundary>,
  );
}

function mountReactApp(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element #root not found");

  const phoneCompanion = isPhoneCompanionMode();
  const detachedShell = isDetachedWindowShell(windowShellRoute);
  const appWindowSlug = detachedShell ? null : resolveAppWindowSlug();

  const reactRoot = window.__MILADY_REACT_ROOT__ ?? createRoot(rootEl);
  window.__MILADY_REACT_ROOT__ = reactRoot;
  reactRoot.render(
    <ErrorBoundary>
      <StrictMode>
        <AppProvider branding={APP_BRANDING}>
          {detachedShell ? (
            <div className="flex h-[100dvh] min-h-0 w-full max-w-full flex-col overflow-hidden">
              <DetachedShellRoot route={windowShellRoute} />
            </div>
          ) : appWindowSlug ? (
            <div className="flex h-[100dvh] min-h-0 w-full max-w-full flex-col overflow-hidden">
              <AppWindowRenderer slug={appWindowSlug} />
            </div>
          ) : (
            <>
              <DesktopOnboardingRuntime />
              <DesktopSurfaceNavigationRuntime />
              <DesktopTrayRuntime />
              <LifeOpsActivitySignalsEffect />
              {phoneCompanion ? <CompanionRouteTabSync /> : null}
              <App />
            </>
          )}
        </AppProvider>
      </StrictMode>
    </ErrorBoundary>,
  );
}

function isPopoutWindow(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  return params.has("popout");
}

/**
 * Validates an apiBase string and applies it to the boot config.
 * Allows localhost, loopback, HTTPS, and private-network HTTP hosts.
 */
function validateAndSetApiBase(apiBase: string): void {
  try {
    const parsed = new URL(apiBase);
    const host = parsed.hostname;
    const allowPrivateHttp =
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".ts.net");
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === window.location.hostname ||
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && allowPrivateHttp)
    ) {
      setBootConfig({ ...getBootConfig(), apiBase });
    } else {
      console.warn(`${APP_LOG_PREFIX} Rejected non-local apiBase:`, host);
    }
  } catch {
    if (apiBase.startsWith("/") && !apiBase.startsWith("//")) {
      setBootConfig({ ...getBootConfig(), apiBase });
    } else {
      console.warn(
        `${APP_LOG_PREFIX} Rejected invalid relative apiBase:`,
        apiBase,
      );
    }
  }
}

function injectPopoutApiBase(): void {
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  const apiBase = params.get("apiBase");
  if (apiBase) validateAndSetApiBase(apiBase);
}

function injectDetachedShellApiBase(): void {
  const apiBase = new URLSearchParams(window.location.search).get("apiBase");
  if (apiBase) validateAndSetApiBase(apiBase);
}

function mobileModeToIosRuntimeMode(
  mode: ReturnType<typeof normalizeMobileRuntimeMode>,
): IosRuntimeMode | null {
  return mode === "remote-mac" ||
    mode === "cloud" ||
    mode === "cloud-hybrid" ||
    mode === "local"
    ? mode
    : null;
}

function getCurrentIosRuntimeConfig(): IosRuntimeConfig {
  if (typeof window === "undefined") return IOS_RUNTIME_ENV_CONFIG;
  try {
    const mode = mobileModeToIosRuntimeMode(
      normalizeMobileRuntimeMode(
        window.localStorage.getItem(MOBILE_RUNTIME_MODE_STORAGE_KEY),
      ),
    );
    if (!mode) return IOS_RUNTIME_ENV_CONFIG;
    return { ...IOS_RUNTIME_ENV_CONFIG, mode };
  } catch {
    return IOS_RUNTIME_ENV_CONFIG;
  }
}

function applyBuildTimeIosConnection(): void {
  if (!isNative) return;
  if (!IOS_RUNTIME_ENV_CONFIG.apiBase && !IOS_RUNTIME_ENV_CONFIG.apiToken)
    return;

  const current = getBootConfig();
  const next: AppBootConfig = {
    ...current,
    ...(IOS_RUNTIME_ENV_CONFIG.apiToken
      ? { apiToken: IOS_RUNTIME_ENV_CONFIG.apiToken }
      : {}),
  };
  setBootConfig(next);

  if (IOS_RUNTIME_ENV_CONFIG.apiBase) {
    validateAndSetApiBase(IOS_RUNTIME_ENV_CONFIG.apiBase);
  }
}

async function getOrCreateDeviceBridgeId(): Promise<string> {
  const existing = await Preferences.get({ key: DEVICE_BRIDGE_ID_KEY });
  if (existing.value?.trim()) return existing.value.trim();

  const prefix = isAndroid ? "android" : isIOS ? "ios" : "mobile";
  const generated =
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await Preferences.set({ key: DEVICE_BRIDGE_ID_KEY, value: generated });
  return generated;
}

function resolveDeviceBridgeUrl(config: IosRuntimeConfig): string | null {
  if (config.deviceBridgeUrl) {
    return config.deviceBridgeUrl;
  }
  // cloud-hybrid: paired phone dials a remote agent via the cloud apiBase.
  // Android local: the foreground agent service owns the loopback API and the
  // WebView dials its device bridge for native llama.cpp calls.
  // iOS local: requests are handled by the in-process ITTP route kernel, so a
  // loopback WebSocket bridge is both unnecessary and unsafe in simulator runs
  // where host-level adb port forwarding can expose another device's agent.
  if (config.mode === "local" && isIOS) return null;
  if (config.mode === "local" && isAndroid) {
    return apiBaseToDeviceBridgeUrl(ANDROID_LOCAL_AGENT_API_BASE);
  }
  if (config.mode !== "cloud-hybrid" && config.mode !== "local") return null;
  const apiBase = getBootConfig().apiBase?.trim();
  if (!apiBase) return null;
  try {
    return apiBaseToDeviceBridgeUrl(apiBase);
  } catch {
    return null;
  }
}

async function initializeMobileDeviceBridge(): Promise<void> {
  const runtimeConfig = getCurrentIosRuntimeConfig();
  if (
    !isNative ||
    (runtimeConfig.mode !== "cloud-hybrid" && runtimeConfig.mode !== "local")
  ) {
    return;
  }
  if (mobileDeviceBridgeClient) return;
  if (mobileDeviceBridgeStartPromise) return;

  const agentUrl = resolveDeviceBridgeUrl(runtimeConfig);
  if (!agentUrl) return;

  mobileDeviceBridgeStartPromise = (async () => {
    try {
      const deviceId = await getOrCreateDeviceBridgeId();
      mobileDeviceBridgeClient = startDeviceBridgeClient({
        agentUrl,
        ...(runtimeConfig.deviceBridgeToken
          ? { pairingToken: runtimeConfig.deviceBridgeToken }
          : {}),
        deviceId,
        onStateChange: (state, detail) => {
          console.info(
            `${APP_LOG_PREFIX} Device bridge ${state}`,
            detail ?? "",
          );
        },
      });
    } catch (error) {
      console.warn(
        `${APP_LOG_PREFIX} Device bridge unavailable:`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      mobileDeviceBridgeStartPromise = null;
    }
  })();

  await mobileDeviceBridgeStartPromise;
}

function stopMobileDeviceBridge(): void {
  mobileDeviceBridgeClient?.stop();
  mobileDeviceBridgeClient = null;
}

function initializeMobileRuntimeModeListener(): void {
  if (!isNative || mobileRuntimeModeListenerInstalled) return;
  mobileRuntimeModeListenerInstalled = true;
  document.addEventListener(MOBILE_RUNTIME_MODE_CHANGED_EVENT, () => {
    const mode = getCurrentIosRuntimeConfig().mode;
    if (mode === "cloud-hybrid" || mode === "local") {
      stopMobileDeviceBridge();
      void initializeMobileDeviceBridge();
      return;
    }
    stopMobileDeviceBridge();
  });
}

function applyStoredDetachedShellTheme(): void {
  applyUiTheme(loadUiTheme());
}

async function initializeStatusBar(): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
  } catch {
    // StatusBar plugin unavailable on this platform — non-fatal.
  }
}

async function main(): Promise<void> {
  setupPlatformStyles();
  await initializeStatusBar();
  applyBuildTimeIosConnection();

  try {
    await applyLaunchConnectionFromUrl();
  } catch (err) {
    console.error(
      `${APP_LOG_PREFIX} Failed to apply managed cloud launch session:`,
      err instanceof Error ? err.message : err,
    );
  }

  // MiladyOS only: pre-seed the on-device agent as the default runtime so
  // the RuntimeGate "Choose your setup" picker is bypassed entirely on first
  // launch. The same APK installed on a stock Android device falls through
  // to the picker — those users actively choose Cloud / Remote / Local.
  // Detection: `isMiladyOS` reads the `MiladyOS/<tag>` user-agent suffix
  // that `MainActivity` appends when `ro.miladyos.product` is set by the
  // AOSP product config. Settings ▸ Runtime exposes a deliberate
  // `?runtime=picker` re-entry on MiladyOS for users who want to switch.
  // No-op when the user already has a persisted runtime mode or active
  // server, so a deliberate cloud/remote choice — including one applied by
  // `applyLaunchConnectionFromUrl` above — is never clobbered.
  if (isMiladyOS()) {
    await registerMiladyOsSystemApps();
    preSeedAndroidLocalRuntimeIfFresh();
  }

  if (isPillWindowShellRoute(windowShellRoute)) {
    // Pill overlay window: minimal renderer that only mounts <VoicePill>.
    // No AppProvider, no chrome, no platform init - the pill is a standalone
    // OS-level overlay launched alongside the main shell from the Electrobun
    // process. The same renderer bundle serves it via `?shell=pill`. It can
    // never match /companion (route kind "pill" or ?shell=pill only), so the
    // companion path through mountReactApp/isPhoneCompanionMode is untouched.
    mountPillWindow();
    return;
  }

  if (isPopoutWindow()) {
    injectPopoutApiBase();
    mountReactApp();
    return;
  }

  if (isDetachedWindowShell(windowShellRoute)) {
    injectDetachedShellApiBase();
    applyStoredDetachedShellTheme();
    syncDetachedShellLocation(windowShellRoute);
    await initializeStorageBridge();
    initializeCapacitorBridge();
    mountReactApp();
    return;
  }

  mountReactApp();
  await initializePlatform();
}

function bootMain(): void {
  if (window.__MILADY_APP_BOOT_PROMISE__) return;
  window.__MILADY_APP_BOOT_PROMISE__ = main().catch((err) => {
    window.__MILADY_APP_BOOT_PROMISE__ = undefined;
    throw err;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootMain, { once: true });
} else {
  bootMain();
}

export { isAndroid, isDesktopPlatform as isDesktop, isIOS, isNative, platform };
