import type http from "node:http";

// Re-export the full upstream server API.
export * from "@elizaos/autonomous/api/server";

// Override the wallet export rejection function with the hardened version
// that adds rate limiting, audit logging, and a forced confirmation delay.
import { resolveWalletExportRejection as upstreamResolveWalletExportRejection } from "@elizaos/autonomous/api/server";
import { createHardenedExportGuard } from "./wallet-export-guard";

const _hardenedGuard = createHardenedExportGuard(
  upstreamResolveWalletExportRejection,
);

/**
 * Hardened wallet export rejection function.
 *
 * Wraps the upstream token validation with per-IP rate limiting (1 per 10 min),
 * audit logging (IP + UA), and a 10s confirmation delay via single-use nonces.
 */
export function resolveWalletExportRejection(
  ...args: Parameters<typeof upstreamResolveWalletExportRejection>
): { status: number; reason: string } | null {
  return _hardenedGuard(...args);
}

/**
 * Build the Authorization header value to use when forwarding requests to
 * Hyperscape. Returns `null` when no token is configured.
 *
 * - When `HYPERSCAPE_AUTH_TOKEN` is set, its value is used (prefixed with
 *   "Bearer " if not already present) regardless of any incoming header.
 * - When the env var is unset, returns `null` so callers know not to forward
 *   any credentials.
 */
export function resolveHyperscapeAuthorizationHeader(
  _req: Pick<http.IncomingMessage, "headers">,
): string | null {
  const token = process.env.HYPERSCAPE_AUTH_TOKEN;
  if (!token) return null;
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}
