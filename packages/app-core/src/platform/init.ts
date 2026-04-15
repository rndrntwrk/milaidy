/** Platform detection and initialization utilities. */

import { isElectrobunRuntime } from "../bridge";
import { getBootConfig, setBootConfig } from "../config/boot-config";

// ── Platform detection ──────────────────────────────────────────────

function detectPlatform(): { platform: string; isNative: boolean } {
  try {
    const cap = (globalThis as Record<string, unknown>).Capacitor as
      | { getPlatform?: () => string; isNativePlatform?: () => boolean }
      | undefined;
    if (cap?.getPlatform) {
      return {
        platform: cap.getPlatform(),
        isNative: cap.isNativePlatform?.() ?? false,
      };
    }
  } catch {
    /* fallback */
  }
  return { platform: "web", isNative: false };
}

const detected = detectPlatform();

export const platform = isElectrobunRuntime()
  ? "electrobun"
  : detected.platform;
export const isNative = detected.isNative;
export const isIOS = platform === "ios";
export const isAndroid = platform === "android";

export function isDesktopPlatform(): boolean {
  return platform === "electrobun";
}

export function isWebPlatform(): boolean {
  return detected.platform === "web" && !isElectrobunRuntime();
}

// ── Share target ────────────────────────────────────────────────────

export interface ShareTargetFile {
  name: string;
  path?: string;
}

export interface ShareTargetPayload {
  source?: string;
  title?: string;
  text?: string;
  url?: string;
  files?: ShareTargetFile[];
}

declare global {
  interface Window {
    __MILADY_SHARE_QUEUE__?: ShareTargetPayload[];
  }
}

export function dispatchShareTarget(
  payload: ShareTargetPayload,
  dispatchEvent: (name: string, detail: unknown) => void,
  eventName: string,
): void {
  if (!window.__MILADY_SHARE_QUEUE__) {
    window.__MILADY_SHARE_QUEUE__ = [];
  }
  window.__MILADY_SHARE_QUEUE__.push(payload);
  dispatchEvent(eventName, payload);
}

// ── Deep link handling ──────────────────────────────────────────────

export interface DeepLinkHandlers {
  onChat?: () => void;
  onSettings?: () => void;
  onConnect?: (gatewayUrl: string) => void;
  onShare?: (payload: ShareTargetPayload) => void;
  onUnknown?: (path: string) => void;
}

export function handleDeepLink(
  url: string,
  protocol: string,
  handlers: DeepLinkHandlers,
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  if (parsed.protocol !== `${protocol}:`) return;

  const path = (parsed.pathname || parsed.host || "").replace(/^\/+/, "");

  switch (path) {
    case "chat":
      handlers.onChat?.();
      break;
    case "settings":
      handlers.onSettings?.();
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
              `[${protocol}] Invalid gateway URL protocol:`,
              validatedUrl.protocol,
            );
            break;
          }
          handlers.onConnect?.(validatedUrl.href);
        } catch {
          console.error(`[${protocol}] Invalid gateway URL format`);
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

      handlers.onShare?.({
        source: "deep-link",
        title,
        text,
        url: sharedUrl,
        files,
      });
      break;
    }
    default:
      handlers.onUnknown?.(path);
  }
}

// ── Platform CSS setup ──────────────────────────────────────────────

export function setupPlatformStyles(): void {
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

// ── Popout helpers ──────────────────────────────────────────────────

export function isPopoutWindow(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  return params.has("popout");
}

// ── Broadcast helpers ───────────────────────────────────────────────
//
// Broadcast mode is a chrome-free render of CompanionSceneHost (VRM stage
// + chat/action overlays) intended for the capture-service's headless
// Chromium to grab as the "camera" frame when Alice goes live. Unlike the
// popout (which renders only the StreamView operator panel), broadcast
// mode renders the same VRM stage you see on the companion tab — so
// model, scene, animations, and overlays stay in lockstep with whatever
// the user has configured in the live app.
//
// Activation: any non-empty `broadcast` URL parameter on `window.location`,
// for example `http://alice-bot:3000/?broadcast=1` or
// `https://alice.rndrntwrk.com/?broadcast=alice-cam`. The value is treated
// as opaque so future capture pipelines can pass a tag without breaking
// the gate. `broadcast=false` is rejected (mirroring the popout convention)
// so the URL flag can be cleanly toggled off.

export function isBroadcastWindow(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  if (!params.has("broadcast")) return false;
  const value = params.get("broadcast");
  return value !== "false" && value !== "0";
}

export function injectBroadcastApiBase(): void {
  // Broadcast windows live inside capture-service's headless Chromium.
  // They reach back through the same hostname they were navigated to
  // (e.g. http://alice-bot:3000) so apiBase defaults are correct
  // already. The optional ?apiBase= query (validated identically to the
  // popout helper) lets external capturers point at a different runtime
  // for testing without recompiling.
  injectPopoutApiBase();
}

export function injectPopoutApiBase(): void {
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  const apiBase = params.get("apiBase");
  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      const host = parsed.hostname;
      const allowPrivateHttp =
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(
          host,
        ) ||
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
        console.warn("[app-core] Rejected non-local apiBase:", host);
      }
    } catch {
      if (apiBase.startsWith("/") && !apiBase.startsWith("//")) {
        setBootConfig({ ...getBootConfig(), apiBase });
      } else {
        console.warn("[app-core] Rejected invalid relative apiBase:", apiBase);
      }
    }
  }
}
