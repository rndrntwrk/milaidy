/**
 * Auth Guard Middleware — token-based authentication for autonomy API.
 *
 * Validates Bearer tokens on autonomy-specific endpoints. Supports:
 * - Static API key validation (AUTONOMY_API_KEY env var)
 * - Configurable bypass paths (e.g. /metrics, /health)
 * - Request-level role extraction for audit logging
 *
 * @module api/middleware/auth-guard
 */

import type { IncomingMessage, ServerResponse } from "node:http";

// ---------- Types ----------

export interface AuthGuardConfig {
  /** Static API key for validation. If empty, guard is disabled (passthrough). */
  apiKey?: string;
  /** Paths that bypass auth (e.g. /metrics, /health). */
  bypassPaths?: string[];
  /** Custom token extractor. Default: Bearer token from Authorization header. */
  extractToken?: (req: IncomingMessage) => string | null;
}

export interface AuthResult {
  /** Whether the request is authenticated. */
  authenticated: boolean;
  /** The identity of the caller (if authenticated). */
  identity?: string;
  /** Reason for rejection (if not authenticated). */
  reason?: string;
}

// ---------- Default Token Extractor ----------

function defaultExtractToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

// ---------- Implementation ----------

/**
 * Create an auth guard middleware function.
 *
 * When `apiKey` is set, requests to autonomy endpoints must include
 * a matching Bearer token. Returns `true` if the request is allowed.
 */
export function createAuthGuard(config?: AuthGuardConfig) {
  const apiKey = config?.apiKey || process.env.AUTONOMY_API_KEY || "";
  const bypassPaths = new Set(config?.bypassPaths ?? [
    "/metrics",
    "/health",
    "/health/live",
    "/health/ready",
    "/api/docs",
    "/api/docs/openapi.json",
  ]);
  const extractToken = config?.extractToken ?? defaultExtractToken;

  /**
   * Middleware: returns true if the request is allowed, false if rejected.
   * When rejected, the response is already sent (401).
   */
  return function authGuard(
    req: IncomingMessage,
    res: ServerResponse,
  ): AuthResult {
    const pathname = (req.url ?? "").split("?")[0];

    // Bypass configured paths
    if (bypassPaths.has(pathname)) {
      return { authenticated: true, identity: "bypass" };
    }

    // If no API key is configured, guard is disabled (passthrough)
    if (!apiKey) {
      return { authenticated: true, identity: "anonymous" };
    }

    // Only guard autonomy endpoints
    if (!pathname.startsWith("/api/agent/")) {
      return { authenticated: true, identity: "non-autonomy" };
    }

    // Extract and validate token
    const token = extractToken(req);
    if (!token) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing Authorization header" }));
      return { authenticated: false, reason: "missing_token" };
    }

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(token, apiKey)) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid API key" }));
      return { authenticated: false, reason: "invalid_token" };
    }

    return { authenticated: true, identity: "api-key" };
  };
}

/**
 * Constant-time string comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
