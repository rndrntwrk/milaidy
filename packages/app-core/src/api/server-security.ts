/**
 * Security / auth helpers — WebSocket upgrade rejection, terminal run
 * rejection, MCP terminal authorization, and API token binding.
 */
import {
  ensureApiTokenForBindHost as upstreamEnsureApiTokenForBindHost,
  extractAuthToken,
  resolveMcpTerminalAuthorizationRejection as upstreamResolveMcpTerminalAuthorizationRejection,
  resolveTerminalRunClientId as upstreamResolveTerminalRunClientId,
  resolveTerminalRunRejection as upstreamResolveTerminalRunRejection,
  resolveWebSocketUpgradeRejection as upstreamResolveWebSocketUpgradeRejection,
} from "@miladyai/agent/api/server";
import { syncMiladyEnvToEliza, syncElizaEnvToMilady } from "../utils/env.js";

import {
  normalizeCompatRejection,
  runWithCompatAuthContext,
} from "./server-wallet-trade";

function hasConfiguredPostOpenWebSocketToken(): boolean {
  const token = process.env.MILADY_API_TOKEN ?? process.env.ELIZA_API_TOKEN;
  return typeof token === "string" && token.trim().length > 0;
}

function hasWebSocketQueryToken(url: URL): boolean {
  return (
    url.searchParams.has("token") ||
    url.searchParams.has("apiKey") ||
    url.searchParams.has("api_key")
  );
}

function hasWebSocketHandshakeToken(
  req: Parameters<typeof upstreamResolveWebSocketUpgradeRejection>[0],
  url: Parameters<typeof upstreamResolveWebSocketUpgradeRejection>[1],
): boolean {
  return Boolean(extractAuthToken(req) || hasWebSocketQueryToken(url));
}

function shouldAllowPostOpenWebSocketAuth(
  req: Parameters<typeof upstreamResolveWebSocketUpgradeRejection>[0],
  url: Parameters<typeof upstreamResolveWebSocketUpgradeRejection>[1],
  result: ReturnType<typeof upstreamResolveWebSocketUpgradeRejection>,
): boolean {
  return (
    result?.status === 401 &&
    url.pathname === "/ws" &&
    !hasWebSocketHandshakeToken(req, url) &&
    hasConfiguredPostOpenWebSocketToken()
  );
}

export function resolveMcpTerminalAuthorizationRejection(
  ...args: Parameters<typeof upstreamResolveMcpTerminalAuthorizationRejection>
): ReturnType<typeof upstreamResolveMcpTerminalAuthorizationRejection> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    normalizeCompatRejection(
      upstreamResolveMcpTerminalAuthorizationRejection(...args),
    ),
  );
}

export function resolveTerminalRunRejection(
  ...args: Parameters<typeof upstreamResolveTerminalRunRejection>
): ReturnType<typeof upstreamResolveTerminalRunRejection> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    normalizeCompatRejection(upstreamResolveTerminalRunRejection(...args)),
  );
}

export function resolveWebSocketUpgradeRejection(
  ...args: Parameters<typeof upstreamResolveWebSocketUpgradeRejection>
): ReturnType<typeof upstreamResolveWebSocketUpgradeRejection> {
  const [req, url] = args;
  syncMiladyEnvToEliza();
  return runWithCompatAuthContext(req, () => {
    const result = upstreamResolveWebSocketUpgradeRejection(...args);
    if (shouldAllowPostOpenWebSocketAuth(req, url, result)) return null;
    return result;
  });
}

export function resolveTerminalRunClientId(
  ...args: Parameters<typeof upstreamResolveTerminalRunClientId>
): ReturnType<typeof upstreamResolveTerminalRunClientId> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    upstreamResolveTerminalRunClientId(...args),
  );
}

export function ensureApiTokenForBindHost(
  ...args: Parameters<typeof upstreamEnsureApiTokenForBindHost>
): ReturnType<typeof upstreamEnsureApiTokenForBindHost> {
  syncMiladyEnvToEliza();
  const result = upstreamEnsureApiTokenForBindHost(...args);
  syncElizaEnvToMilady();
  return result;
}
