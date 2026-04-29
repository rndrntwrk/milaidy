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
// + chat/action overlays). Two transports share the same renderer:
//
//   1. PUBLIC  — `https://alice.rndrntwrk.com/broadcast/:channel`
//      Read-only. Unauthenticated (Cloudflare Access bypass for
//      /broadcast/*). No operator controls, no WS write, no publish.
//      Public viewers see the same scene the capture browser sees,
//      minus mutation rights.
//
//   2. CAPTURE — `http://alice-bot:3000/broadcast/:channel`
//      Internal cluster URL only. Never reaches Cloudflare. Navigated
//      by the capture-service's headless Chromium, which injects
//      `window.__injectedShowConfig` via `evaluateOnNewDocument`
//      before navigation. This is the sole signal that distinguishes
//      a capture session from a public viewer — we do NOT rely on
//      hostname sniffing or query params a public viewer could spoof.
//
// Activation is path-based: `/broadcast/alice-cam` (path takes
// precedence). An allowlist of known channels rejects unknown paths
// — `/broadcast/attacker-controlled` will NOT activate broadcast mode.
//
// Legacy `?broadcast=...` query activation is retained for rollback
// during migration. It will be removed after path-based broadcast has
// proven stable per the burn-in criteria.

/**
 * Channels allowed to activate broadcast mode. Adding a channel here is
 * the only way to enable a new broadcast route. The ingress and Access
 * bypass also need corresponding updates.
 */
const BROADCAST_CHANNEL_ALLOWLIST = new Set<string>(["alice-cam"]);

/**
 * Broadcast transport mode. `null` = not a broadcast window.
 *
 *   public  — unauthenticated viewer on alice.rndrntwrk.com/broadcast/*.
 *             Must not mount publisher, must not call mutation APIs.
 *   capture — headless Chromium under capture-service. Has
 *             `window.__injectedShowConfig` pre-seeded by Puppeteer.
 *             Mounts LiveKitBroadcastPublisher, publishes canvas to
 *             the LiveKit room pointed to by the injected config.
 */
export type BroadcastMode = "public" | "capture" | null;

function readBroadcastChannelFromPath(pathname: string): string | null {
  // Exact match on /broadcast/:channel (trailing slash tolerated). The
  // regex refuses extra segments so /broadcast/foo/bar does not leak
  // through — cleaner than consumers having to validate.
  const match = pathname.match(/^\/broadcast\/([a-zA-Z0-9-]+)\/?$/);
  if (!match) return null;
  const channel = match[1];
  return BROADCAST_CHANNEL_ALLOWLIST.has(channel) ? channel : null;
}

function readBroadcastChannelFromQuery(): string | null {
  // Legacy fallback. Accepts any non-empty, non-`false`, non-`0` value
  // and maps it to 'alice-cam' (the only legal channel today). This
  // preserves the old `?broadcast=1` behavior during rollback without
  // expanding the allowlist.
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  if (!params.has("broadcast")) return null;
  const value = params.get("broadcast");
  if (!value || value === "false" || value === "0") return null;
  return "alice-cam";
}

/**
 * Resolve the active broadcast channel. Path-based detection takes
 * precedence; query fallback is a rollback hatch only.
 *
 * @returns channel string (e.g. 'alice-cam') or null if not broadcasting
 */
export function getBroadcastChannel(): string | null {
  if (typeof window === "undefined") return null;
  const fromPath = readBroadcastChannelFromPath(window.location.pathname);
  if (fromPath) return fromPath;
  return readBroadcastChannelFromQuery();
}

/**
 * Resolve the broadcast transport mode. The split is what makes a
 * single renderer safe for both public viewers and internal capture
 * under the same URL shape.
 *
 * Capture detection keys SOLELY off `window.__injectedShowConfig`
 * existence. Puppeteer's evaluateOnNewDocument runs before any page
 * script, so the capture context always has this set before our code
 * runs. A public viewer cannot spoof it because the field is set by
 * the browser runtime injecting the script, not by document content
 * or query params.
 */
export function getBroadcastMode(): BroadcastMode {
  if (!getBroadcastChannel()) return null;
  const w = window as unknown as { __injectedShowConfig?: unknown };
  return w.__injectedShowConfig ? "capture" : "public";
}

/**
 * Back-compat: `isBroadcastWindow()` used to be a single bool for
 * "render BroadcastShell." Keep it as a thin wrapper over the new
 * helpers so existing call sites don't need to change today. New
 * code should prefer `getBroadcastChannel()` + `getBroadcastMode()`.
 */
export function isBroadcastWindow(): boolean {
  return getBroadcastChannel() !== null;
}

/**
 * True if the request URL matches the broadcast path namespace
 * (`/broadcast/*`) but the channel is NOT in the allowlist. Used by
 * the boot path to render an explicit 404 instead of falling through
 * to the normal app (which would load operator bundles under a
 * URL that's Access-bypassed — a real leak risk).
 */
export function isUnknownBroadcastRoute(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (!/^\/broadcast\/?/.test(path)) return false;
  return readBroadcastChannelFromPath(path) === null;
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
