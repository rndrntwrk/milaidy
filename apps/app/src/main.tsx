import { ErrorBoundary } from "@elizaos/app-core";
import "@elizaos/app-core/styles/styles.css";
import "@elizaos/app-core/styles/brand-gold.css";
import "@elizaos/app-core/platform/native-plugin-entrypoints";

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { App } from "@elizaos/app-core";
import { client } from "@elizaos/app-core";
import {
  initializeCapacitorBridge,
  subscribeDesktopBridgeEvent,
  initializeStorageBridge,
  isElectrobunRuntime,
} from "@elizaos/app-core";
import { CharacterEditor } from "@elizaos/app-core";
import type { BrandingConfig } from "@elizaos/app-core";
import {
  type AppBootConfig,
  getBootConfig,
  setBootConfig,
} from "@elizaos/app-core";
import {
  AGENT_READY_EVENT,
  APP_PAUSE_EVENT,
  APP_RESUME_EVENT,
  COMMAND_PALETTE_EVENT,
  CONNECT_EVENT,
  dispatchAppEvent,
  SHARE_TARGET_EVENT,
  TRAY_ACTION_EVENT,
} from "@elizaos/app-core";
import {
  applyForceFreshOnboardingReset,
  applyLaunchConnectionFromUrl,
  dispatchQueuedLifeOpsGithubCallbackFromUrl,
  installDesktopPermissionsClientPatch,
  installForceFreshOnboardingClientPatch,
  installLocalProviderCloudPreferencePatch,
  isDetachedWindowShell,
  resolveWindowShellRoute,
  shouldInstallMainWindowOnboardingPatches,
  syncDetachedShellLocation,
} from "@elizaos/app-core";
import type { ShareTargetPayload } from "@elizaos/app-core/platform";
import {
  DESKTOP_TRAY_MENU_ITEMS,
  DesktopOnboardingRuntime,
  DesktopSurfaceNavigationRuntime,
  DesktopTrayRuntime,
  DetachedShellRoot,
} from "@elizaos/app-core";
import { AppProvider } from "@elizaos/app-core";
import { applyUiTheme, loadUiTheme } from "@elizaos/app-core";
import { Agent } from "@elizaos/capacitor-agent";
import { Desktop } from "@elizaos/capacitor-desktop";
import { StrictMode } from "react";
<<<<<<< HEAD
import { createRoot, type Root } from "react-dom/client";
import { MILADY_ENV_ALIASES } from "./brand-env";
import { MILADY_CHARACTER_CATALOG } from "./character-catalog";
import { shouldUseCloudOnlyBranding } from "./cloud-only";
=======
import { createRoot } from "react-dom/client";
import { CompanionShell } from "@elizaos/app-companion/ui";
import {
  createVectorBrowserRenderer,
  GlobalEmoteOverlay,
  InferenceCloudAlertButton,
  prefetchVrmToCache,
  resolveCompanionInferenceNotice,
  THREE,
  useCompanionSceneStatus,
} from "@elizaos/app-companion";
import "@elizaos/app-companion/register";
import {
  AppBlockerSettingsCard,
  LifeOpsBrowserSetupPanel,
  LifeOpsPageView,
  WebsiteBlockerSettingsCard,
} from "@elizaos/app-lifeops/ui";
import {
  ApprovalQueue,
  StewardLogo,
  TransactionHistory,
} from "@elizaos/app-steward";
import {
  CodingAgentControlChip,
  CodingAgentSettingsSection,
  CodingAgentTasksPanel,
  PtyConsoleDrawer,
} from "@elizaos/app-task-coordinator";
import { FineTuningView } from "@elizaos/app-training/ui";
import "@elizaos/app-shopify/register";
import "@elizaos/app-vincent/client";
import { useVincentState } from "@elizaos/app-vincent/ui";
import "@elizaos/app-vincent/register";
import { shouldUseCloudOnlyBranding } from "@elizaos/app-core";
import {
  APP_BRANDING_BASE,
  APP_LOG_PREFIX,
  APP_NAMESPACE,
  APP_URL_SCHEME,
} from "./app-config";
import { APP_ENV_ALIASES, APP_ENV_PREFIX } from "./brand-env";
import { APP_CHARACTER_CATALOG } from "./character-catalog";
>>>>>>> upstream/develop

declare global {
  interface Window {
    __ELIZA_APP_SHARE_QUEUE__?: ShareTargetPayload[];
    __ELIZA_APP_CHARACTER_EDITOR__?: typeof CharacterEditor;
    __ELIZA_APP_API_BASE__?: string;
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
  };

function getAppWindow(): AppCompatWindow {
  return window as unknown as AppCompatWindow;
}

function getInjectedAppApiBase(): string | undefined {
  const appWindow = getAppWindow();
  const brandedApiBase = appWindow[BRANDED_WINDOW_KEYS.apiBase];
  return (
    appWindow.__ELIZA_APP_API_BASE__ ??
    (typeof brandedApiBase === "string" ? brandedApiBase : undefined)
  );
}

const APP_BRANDING: Partial<BrandingConfig> = {
  ...APP_BRANDING_BASE,
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

function isDesktopPlatform(): boolean {
  return isElectrobunRuntime();
}

function isWebPlatform(): boolean {
  return platform === "web" && !isElectrobunRuntime();
}

<<<<<<< HEAD
interface ShareTargetFile {
  name: string;
  path?: string;
}

interface ShareTargetPayload {
  source?: string;
  title?: string;
  text?: string;
  url?: string;
  files?: ShareTargetFile[];
}

declare global {
  interface Window {
    __MILADY_SHARE_QUEUE__?: ShareTargetPayload[];
    __MILADY_CHARACTER_EDITOR__?: typeof CharacterEditor;
    __MILADY_API_BASE__?: string;
    __MILADY_REACT_ROOT__?: Root;
    __MILADY_APP_BOOT_PROMISE__?: Promise<void>;
  }
}

=======
>>>>>>> upstream/develop
const windowShellRoute = resolveWindowShellRoute();

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

<<<<<<< HEAD
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import { resolveDefaultSpeechCapabilitiesForAvatarIndex } from "@miladyai/shared/onboarding-presets";
=======
import { getStylePresets } from "@elizaos/shared/onboarding-presets";
>>>>>>> upstream/develop

// Derive VRM roster from STYLE_PRESETS so character names stay in one place.
const APP_STYLE_PRESETS = getStylePresets();

const APP_VRM_ASSETS = APP_STYLE_PRESETS.slice()
  .sort((a, b) => a.avatarIndex - b.avatarIndex)
<<<<<<< HEAD
  .map((p) => ({
    title: p.name,
    slug: `milady-${p.avatarIndex}`,
    speechCapabilities: resolveDefaultSpeechCapabilitiesForAvatarIndex(
      p.avatarIndex,
    ),
    ...(p.avatarIndex === 9 ? { cameraDistanceScale: 1.3 } : {}),
  }));
=======
  .map((p) => ({ title: p.name, slug: `${APP_NAMESPACE}-${p.avatarIndex}` }));
>>>>>>> upstream/develop

const appBootConfig: AppBootConfig = {
  branding: APP_BRANDING,
  assetBaseUrl:
    (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.trim() ||
    undefined,
  cloudApiBase:
    (import.meta.env.VITE_CLOUD_BASE as string) ?? "https://www.elizacloud.ai",
  vrmAssets: APP_VRM_ASSETS,
  onboardingStyles: APP_STYLE_PRESETS,
  characterEditor: CharacterEditor,
  companionShell: CompanionShell,
  resolveCompanionInferenceNotice,
  companionInferenceAlertButton: InferenceCloudAlertButton,
  companionGlobalOverlay: GlobalEmoteOverlay,
  useCompanionSceneStatus,
  prefetchVrmToCache,
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
  lifeOpsBrowserSetupPanel: LifeOpsBrowserSetupPanel,
  appBlockerSettingsCard: AppBlockerSettingsCard,
  websiteBlockerSettingsCard: WebsiteBlockerSettingsCard,
  clientMiddleware: {
    forceFreshOnboarding:
      shouldInstallMainWindowOnboardingPatches(windowShellRoute),
    preferLocalProvider: true,
    desktopPermissions: isDesktopPlatform(),
  },
};

setBootConfig(appBootConfig);

function getShareQueue(): ShareTargetPayload[] {
  const appWindow = getAppWindow();
  const brandedQueue = appWindow[BRANDED_WINDOW_KEYS.shareQueue];
  const existing =
    appWindow.__ELIZA_APP_SHARE_QUEUE__ ??
    (Array.isArray(brandedQueue) ? (brandedQueue as ShareTargetPayload[]) : undefined);
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
    await initializeKeyboard();
    initializeAppLifecycle();
  }

  if (isDesktopPlatform()) {
    await initializeDesktopShell();
  } else {
    await initializeAgent();
  }
}

async function initializeKeyboard(): Promise<void> {
  if (isIOS) {
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
  const path = (parsed.pathname || parsed.host || "").replace(/^\/+/, "");

  switch (path) {
    case "chat":
      window.location.hash = "#chat";
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
          dispatchAppEvent(CONNECT_EVENT, {
            gatewayUrl: validatedUrl.href,
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

function mountReactApp(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element #root not found");

  const root = window.__MILADY_REACT_ROOT__ ?? createRoot(rootEl);
  window.__MILADY_REACT_ROOT__ = root;

  root.render(
    <ErrorBoundary>
      <StrictMode>
        <AppProvider branding={APP_BRANDING}>
          {isDetachedWindowShell(windowShellRoute) ? (
            <div className="flex h-screen min-h-0 w-screen flex-col overflow-hidden">
              <DetachedShellRoot route={windowShellRoute} />
            </div>
          ) : (
            <>
              <DesktopOnboardingRuntime />
              <DesktopSurfaceNavigationRuntime />
              <DesktopTrayRuntime />
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
 * Broadcast window detection — see app-core/platform/init.ts for the
 * full justification. Mirrors `isPopoutWindow()` but matches `?broadcast`
 * (any value other than `false`/`0`). Used by the boot path to skip the
 * heavy native platform init while still mounting the React app, so the
 * capture-service's headless Chromium gets a clean CompanionSceneHost
 * render instead of the full app shell.
 */
function isBroadcastWindow(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  if (!params.has("broadcast")) return false;
  const value = params.get("broadcast");
  return value !== "false" && value !== "0";
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

function applyStoredDetachedShellTheme(): void {
  applyUiTheme(loadUiTheme());
}

async function runMain(): Promise<void> {
  setupPlatformStyles();

  try {
    await applyLaunchConnectionFromUrl();
  } catch (err) {
    console.error(
      `${APP_LOG_PREFIX} Failed to apply managed cloud launch session:`,
      err instanceof Error ? err.message : err,
    );
  }

  if (isPopoutWindow()) {
    injectPopoutApiBase();
    mountReactApp();
    return;
  }

  if (isBroadcastWindow()) {
    // Broadcast mode reuses the popout apiBase injection (same query
    // semantics) and skips the heavy native platform init: the broadcast
    // shell only needs the React app, AppContext, and CompanionSceneHost
    // to come up. App.tsx's `useIsBroadcast()` gate routes the render to
    // BroadcastShell once the startup coordinator reaches "ready".
    //
    // Set the 555stream capture-service "React mounted" handshake marker
    // SYNCHRONOUSLY here, before the React app even mounts. The capture
    // worker uses
    //   page.waitForFunction(
    //     () => typeof window.__agentShowControl !== 'undefined',
    //     { timeout: 20000 }
    //   )
    // as its primary "is the page ready" gate (see
    // services/capture-service/src/worker.js:2161). Setting the global at
    // the boot path means the worker's first poll catches it within
    // ~100ms of the page loading — eliminating any race window between
    // the React commit phase and the worker's 20s timeout, which is the
    // failure mode that was making the worker fall back to its legacy
    // DOM-injected agent-show standalone page.
    //
    // BroadcastShell's <CaptureHandshake/> child still runs the same
    // assignment from a useEffect for the in-React lifecycle (and adds
    // the .avatar-ready class once useCompanionSceneStatus().avatarReady
    // flips true), but the boot-path assignment is the primary path
    // because it can't race with React commit timing.
    if (typeof window !== "undefined") {
      (
        window as unknown as { __agentShowControl?: Record<string, unknown> }
      ).__agentShowControl = { source: "broadcast-boot" };
    }

    // Teach the startup coordinator that onboarding is already complete.
    //
    // milaidy's StartupCoordinator seeds its `onboardingComplete` flag
    // from `localStorage["eliza:onboarding-complete"]` (see
    // packages/app-core/src/state/persistence.ts:417 +
    // useLifecycleState.ts:48). A fresh headless Chromium has empty
    // localStorage, so the coordinator transitions to
    // `onboarding-required` and App.tsx renders StartupShell →
    // OnboardingWizard — the character-select screen with the EN
    // language chip that was appearing on stream instead of the
    // companion view.
    //
    // For alice-bot specifically this is an architectural mismatch:
    // milaidy's SPA treats each browser as a personal install to
    // onboard, but alice-bot is a server-side, always-on, single-
    // tenant agent whose state lives in /home/node/.milaidy/milaidy.json
    // on the PVC. Every browser that connects should behave like an
    // already-onboarded viewer.
    //
    // For broadcast captures specifically we force the marker so the
    // coordinator skips onboarding and goes straight through
    // `starting-runtime` → `hydrating` → `ready`, at which point
    // BroadcastShell mounts CompanionSceneHost with whatever character
    // AppContext resolves. The proper long-term fix is to have the
    // coordinator consult a server-side `/api/agent/v1/onboarding-state`
    // endpoint before falling back to localStorage — tracked as a
    // follow-up.
    try {
      localStorage.setItem("eliza:onboarding-complete", "1");
    } catch {
      /* storage unavailable — the coordinator's own try/catch handles this */
    }

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

function main(): Promise<void> {
  if (window.__MILADY_APP_BOOT_PROMISE__) {
    return window.__MILADY_APP_BOOT_PROMISE__;
  }

  const bootPromise = runMain().catch((err) => {
    delete window.__MILADY_APP_BOOT_PROMISE__;
    throw err;
  });
  window.__MILADY_APP_BOOT_PROMISE__ = bootPromise;
  return bootPromise;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

export {
  isAndroid,
  isDesktopPlatform as isDesktop,
  isIOS,
  isNative,
  isWebPlatform as isWeb,
  platform,
};
