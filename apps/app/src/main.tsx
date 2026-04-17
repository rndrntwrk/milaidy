import { ErrorBoundary } from "@miladyai/app-core/components";
import "@miladyai/app-core/styles/styles.css";
import "@miladyai/app-core/styles/brand-gold.css";

import "./native-plugin-entrypoints";

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App } from "@miladyai/app-core/App";
import { client } from "@miladyai/app-core/api";
import {
  initializeCapacitorBridge,
  subscribeDesktopBridgeEvent,
  initializeStorageBridge,
  isElectrobunRuntime,
} from "@miladyai/app-core/bridge";
import { CharacterEditor } from "@miladyai/app-core/components";
import type { BrandingConfig } from "@miladyai/app-core/config";
import {
  type AppBootConfig,
  getBootConfig,
  setBootConfig,
} from "@miladyai/app-core/config";
import {
  AGENT_READY_EVENT,
  APP_PAUSE_EVENT,
  APP_RESUME_EVENT,
  COMMAND_PALETTE_EVENT,
  CONNECT_EVENT,
  dispatchMiladyEvent,
  SHARE_TARGET_EVENT,
  TRAY_ACTION_EVENT,
} from "@miladyai/app-core/events";
import {
  applyForceFreshOnboardingReset,
  applyLaunchConnectionFromUrl,
  dispatchQueuedLifeOpsGithubCallbackFromUrl,
  getBroadcastChannel,
  getBroadcastMode,
  installDesktopPermissionsClientPatch,
  installForceFreshOnboardingClientPatch,
  installLocalProviderCloudPreferencePatch,
  isBroadcastWindow as isBroadcastWindowShared,
  isDetachedWindowShell,
  resolveWindowShellRoute,
  shouldInstallMainWindowOnboardingPatches,
  syncDetachedShellLocation,
} from "@miladyai/app-core/platform";
import {
  DESKTOP_TRAY_MENU_ITEMS,
  DesktopOnboardingRuntime,
  DesktopSurfaceNavigationRuntime,
  DesktopTrayRuntime,
  DetachedShellRoot,
} from "@miladyai/app-core/shell";
import { AppProvider } from "@miladyai/app-core/state";
import { applyUiTheme, loadUiTheme } from "@miladyai/app-core/state";
import { Agent } from "@miladyai/capacitor-agent";
import { Desktop } from "@miladyai/capacitor-desktop";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MILADY_ENV_ALIASES } from "./brand-env";
import { MILADY_CHARACTER_CATALOG } from "./character-catalog";
import { shouldUseCloudOnlyBranding } from "./cloud-only";

const MILADY_BRANDING: Partial<BrandingConfig> = {
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
    isDev: import.meta.env.DEV,
    injectedApiBase:
      typeof window === "undefined" ? undefined : window.__MILADY_API_BASE__,
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

const windowShellRoute = resolveWindowShellRoute();

/**
 * Adds `milady-electrobun-frameless` for CSS `-webkit-app-region` (Chromium/CEF).
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
  document.documentElement.classList.add("milady-electrobun-frameless");
}

// Dev escape hatch: ?reset forces a truly fresh onboarding session by clearing
// persisted state and temporarily suppressing stale backend resume config.
if (shouldInstallMainWindowOnboardingPatches(windowShellRoute)) {
  applyForceFreshOnboardingReset();
  installForceFreshOnboardingClientPatch(client as never);
}
installLocalProviderCloudPreferencePatch(client as never);
installDesktopPermissionsClientPatch(client as never);

// Register custom character editor for app-core's ViewRouter to pick up
window.__MILADY_CHARACTER_EDITOR__ = CharacterEditor;

import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import { resolveDefaultSpeechCapabilitiesForAvatarIndex } from "@miladyai/shared/onboarding-presets";

// Derive VRM roster from STYLE_PRESETS so character names stay in one place.
const MILADY_STYLE_PRESETS = getStylePresets();

const MILADY_VRM_ASSETS = MILADY_STYLE_PRESETS.slice()
  .sort((a, b) => a.avatarIndex - b.avatarIndex)
  .map((p) => ({
    title: p.name,
    slug: `milady-${p.avatarIndex}`,
    speechCapabilities: resolveDefaultSpeechCapabilitiesForAvatarIndex(
      p.avatarIndex,
    ),
    ...(p.avatarIndex === 9 ? { cameraDistanceScale: 1.3 } : {}),
  }));

// When the SPA is served at `/broadcast/:channel` (no trailing slash), the
// document base URL is `<origin>/broadcast/`, and `resolveAppAssetUrl()`'s
// runtime fallback would build asset URLs like
// `<origin>/broadcast/vrm-decoders/draco/...` — which 404 because public
// assets live at `<origin>/<asset>`. Pin the asset base to the document
// root so DRACO / Meshopt decoders, fonts, VRMs, and any other
// `resolveAppAssetUrl()` consumer load from `/<asset>` instead of
// `/broadcast/<asset>`. The companion `<base href="/">` injection in
// static-file-server only fixes HTML-level relative URLs (script src,
// link href); JS code that resolves relative paths against
// `window.location.href` (e.g. via `import.meta.env.BASE_URL`, which is
// `"./"` for this Vite build) bypasses `<base>` and needs this override.
// Same SPA bundle ships across desktop / mobile / web, so this only
// kicks in for the web broadcast surface.
const broadcastAssetBaseOverride =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/broadcast/")
    ? `${window.location.origin}/`
    : undefined;

const miladyBootConfig: AppBootConfig = {
  branding: MILADY_BRANDING,
  assetBaseUrl:
    broadcastAssetBaseOverride ||
    (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.trim() ||
    undefined,
  cloudApiBase:
    (import.meta.env.VITE_CLOUD_BASE as string) ?? "https://www.elizacloud.ai",
  vrmAssets: MILADY_VRM_ASSETS,
  onboardingStyles: MILADY_STYLE_PRESETS,
  characterEditor: CharacterEditor,
  characterCatalog: MILADY_CHARACTER_CATALOG,
  envAliases: MILADY_ENV_ALIASES,
  clientMiddleware: {
    forceFreshOnboarding:
      shouldInstallMainWindowOnboardingPatches(windowShellRoute),
    preferLocalProvider: true,
    desktopPermissions: isDesktopPlatform(),
  },
};

setBootConfig(miladyBootConfig);

function dispatchShareTarget(payload: ShareTargetPayload): void {
  if (!window.__MILADY_SHARE_QUEUE__) {
    window.__MILADY_SHARE_QUEUE__ = [];
  }
  window.__MILADY_SHARE_QUEUE__.push(payload);
  dispatchMiladyEvent(SHARE_TARGET_EVENT, payload);
}

async function initializeAgent(): Promise<void> {
  try {
    const status = await Agent.getStatus();
    dispatchMiladyEvent(AGENT_READY_EVENT, status);
  } catch (err) {
    console.warn(
      "[Milady] Agent not available:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function initializePlatform(): Promise<void> {
  await initializeStorageBridge();
  initializeCapacitorBridge();

  if (isIOS || isAndroid) {
    await initializeStatusBar();
    await initializeKeyboard();
    initializeAppLifecycle();
  }

  if (isDesktopPlatform()) {
    await initializeDesktopShell();
  } else {
    await initializeAgent();
  }
}

async function initializeStatusBar(): Promise<void> {
  await StatusBar.setStyle({ style: Style.Dark });

  if (isAndroid) {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
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
  CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      dispatchMiladyEvent(APP_RESUME_EVENT);
    } else {
      dispatchMiladyEvent(APP_PAUSE_EVENT);
    }
  });

  CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    }
  });

  CapacitorApp.addListener("appUrlOpen", ({ url }) => {
    handleDeepLink(url);
  });

  CapacitorApp.getLaunchUrl().then((result) => {
    if (result?.url) {
      handleDeepLink(result.url);
    }
  });
}

function handleDeepLink(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  if (parsed.protocol !== "milady:") return;
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
              "[Milady] Invalid gateway URL protocol:",
              validatedUrl.protocol,
            );
            break;
          }
          dispatchMiladyEvent(CONNECT_EVENT, {
            gatewayUrl: validatedUrl.href,
          });
        } catch {
          console.error("[Milady] Invalid gateway URL format");
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
      console.warn("[Milady] Unknown deep link path:", path);
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
      dispatchMiladyEvent(COMMAND_PALETTE_EVENT);
    }
  });

  await Desktop.setTrayMenu({
    menu: [...DESKTOP_TRAY_MENU_ITEMS],
  });

  await Desktop.addListener(
    "trayMenuClick",
    (event: { itemId: string; checked?: boolean }) => {
      dispatchMiladyEvent(TRAY_ACTION_EVENT, event);
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
        <AppProvider branding={MILADY_BRANDING}>
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
 * Broadcast window detection is shared across the codebase via
 * `@miladyai/app-core/platform` — `isBroadcastWindowShared` wraps the
 * canonical path-aware + query-fallback detector so this file doesn't
 * maintain its own duplicate. Use `getBroadcastMode()` to distinguish
 * public viewer from internal capture below.
 */
function isBroadcastWindow(): boolean {
  return isBroadcastWindowShared();
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
      console.warn("[Milady] Rejected non-local apiBase:", host);
    }
  } catch {
    if (apiBase.startsWith("/") && !apiBase.startsWith("//")) {
      setBootConfig({ ...getBootConfig(), apiBase });
    } else {
      console.warn("[Milady] Rejected invalid relative apiBase:", apiBase);
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
      "[Milady] Failed to apply managed cloud launch session:",
      err instanceof Error ? err.message : err,
    );
  }

  if (isPopoutWindow()) {
    injectPopoutApiBase();
    mountReactApp();
    return;
  }

  if (isBroadcastWindow()) {
    // Broadcast mode is served by two transports that share the same
    // renderer code (BroadcastShell → CompanionSceneHost) but have
    // opposite trust levels:
    //
    //   PUBLIC  — alice.rndrntwrk.com/broadcast/:channel
    //     Unauthenticated. Cloudflare Access bypass on /broadcast/*.
    //     Must not mount LiveKitBroadcastPublisher, must not call
    //     mutation APIs, must not consume apiToken (there is no
    //     intended auth for this surface), must not mark onboarding
    //     complete via the shared localStorage flag.
    //
    //   CAPTURE — http://alice-bot:3000/broadcast/:channel
    //     Internal-only. Never reaches Cloudflare. Puppeteer injects
    //     `window.__injectedShowConfig` before navigation.
    //     Needs the onboarding-skip marker, the __agentShowControl
    //     handshake global, and the apiToken bridge so LiveKit
    //     publishing and WS-backed scene sync work.
    //
    // `getBroadcastMode()` distinguishes them purely by the presence
    // of `window.__injectedShowConfig` (which the browser runtime
    // sets before any script runs when Puppeteer calls
    // evaluateOnNewDocument). A public viewer cannot spoof it —
    // document content and query params have no way to produce a
    // pre-script global.
    const broadcastMode = getBroadcastMode();
    console.log(
      `[boot] broadcast mode=${broadcastMode} channel=${getBroadcastChannel() ?? "(none)"}`,
    );

    if (broadcastMode === "capture") {
      // Set the 555stream capture-service "React mounted" handshake
      // marker SYNCHRONOUSLY, before React mounts. The capture worker
      // uses `page.waitForFunction(() => typeof window.__agentShowControl
      // !== 'undefined')` as its primary ready gate. Setting the
      // global here eliminates the race between React commit and the
      // worker's 20s timeout.
      //
      // Only the capture transport sets this — a public viewer has no
      // capture-service on the other side waiting for a handshake.
      (
        window as unknown as { __agentShowControl?: Record<string, unknown> }
      ).__agentShowControl = { source: "broadcast-boot" };

      // Teach the startup coordinator that onboarding is already
      // complete. milaidy's SPA treats each browser as a personal
      // install to onboard, but alice-bot is server-side/single-
      // tenant/always-on — a fresh Chromium in the capture-service
      // pod has empty localStorage, so the coordinator would
      // transition to `onboarding-required` and render the character-
      // select screen instead of the companion.
      //
      // Only the capture transport flips this flag — public viewers
      // are non-operator surfaces and we don't want writing to the
      // browser's own localStorage under a user-visible URL.
      try {
        localStorage.setItem("eliza:onboarding-complete", "1");
      } catch {
        /* storage unavailable — coordinator has its own try/catch */
      }

      // Bridge alice-bot auth into the SPA's API client.
      // Only meaningful under the capture transport: WS + privileged
      // REST need credentials so scene-state sync + emote replay
      // work. Public viewers never authenticate — any apiToken
      // query on the public URL is rejected here explicitly.
      //
      // Precedence:
      //   1. `?apiToken=` — explicit override for internal debugging
      //   2. `__injectedShowConfig.apiToken` — the real alice-bot API token
      //      injected by capture-service/control-plane
      //   3. `__injectedShowConfig.wsToken` — legacy renderer JWT fallback
      //      kept only for auth-disabled migrations
      {
        const params = new URLSearchParams(
          window.location.search || window.location.hash.split("?")[1] || "",
        );
        const urlToken = params.get("apiToken");
        if (urlToken) {
          setBootConfig({ ...getBootConfig(), apiToken: urlToken });
        } else {
          try {
            const injectedConfig = (
              window as unknown as {
                __injectedShowConfig?: { apiToken?: string; wsToken?: string };
              }
            ).__injectedShowConfig;
            if (injectedConfig?.apiToken) {
              setBootConfig({
                ...getBootConfig(),
                apiToken: injectedConfig.apiToken,
              });
            } else if (injectedConfig?.wsToken) {
              setBootConfig({
                ...getBootConfig(),
                apiToken: injectedConfig.wsToken,
              });
            }
          } catch {
            /* injectedShowConfig not available */
          }
        }
      }

      injectPopoutApiBase();
    } else {
      // PUBLIC broadcast viewer. Intentionally skip the capture-only
      // side-effects above. No apiToken bridge even if the URL carries
      // one — any `?apiToken=` on the public surface is refused by
      // ignoring it here, which closes one obvious exfiltration shape.
      //
      // Still call the apiBase injector for development flexibility
      // (it only accepts same-origin / private-network / HTTPS bases
      // per its own allowlist, so this is safe for a public URL).
      injectPopoutApiBase();
    }

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
