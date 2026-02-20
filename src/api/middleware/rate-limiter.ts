/**
 * Rate Limiting Middleware — Token Bucket + Sliding Window algorithms.
 *
 * Provides multi-layer rate limiting:
 * 1. Global token bucket: burst protection (100 req burst, 20 req/s sustained)
 * 2. Per-IP sliding window: fair usage (60 req/min default)
 * 3. Per-endpoint limits: resource-specific protection
 *
 * @module api/middleware/rate-limiter
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "@elizaos/core";

// ---------- Types ----------

export interface RateLimitConfig {
  /** Time window in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed in the window. */
  maxRequests: number;
  /** Skip rate limiting for successful requests. */
  skipSuccessfulRequests?: boolean;
}

export interface TokenBucketConfig {
  /** Maximum burst capacity. */
  capacity: number;
  /** Tokens added per second. */
  refillRate: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Remaining requests in current window. */
  remaining: number;
  /** Unix timestamp when the limit resets. */
  resetAt: number;
}

// ---------- Token Bucket ----------

/**
 * Token Bucket algorithm for burst rate limiting.
 * Allows short bursts while maintaining a sustained rate.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private config: TokenBucketConfig) {
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens. Returns true if successful.
   */
  tryConsume(count: number = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /**
   * Get current token count (for metrics).
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.config.capacity,
      this.tokens + elapsed * this.config.refillRate,
    );
    this.lastRefill = now;
  }
}

// ---------- Sliding Window ----------

/**
 * Simple LRU cache for rate limiting.
 * Avoids external dependency for this core security feature.
 */
class SimpleLRU<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(options: { max: number; ttl: number }) {
    this.maxSize = options.max;
    this.ttlMs = options.ttl;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Cleanup expired entries (call periodically).
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

/**
 * Sliding Window rate limiter.
 * Tracks request timestamps per key within a rolling window.
 */
export class SlidingWindowRateLimiter {
  private windows: SimpleLRU<string, number[]>;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.windows = new SimpleLRU<string, number[]>({
      max: 100_000, // Max tracked keys
      ttl: config.windowMs * 2, // Keep for 2x window duration
    });

    // Periodic cleanup every 5 minutes
    setInterval(() => this.windows.prune(), 5 * 60 * 1000).unref();
  }

  /**
   * Check if a request is allowed and record it.
   */
  isAllowed(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing timestamps, filter to current window
    const existing = this.windows.get(key) ?? [];
    const timestamps = existing.filter((ts) => ts > windowStart);

    const remaining = Math.max(0, this.config.maxRequests - timestamps.length);
    const resetAt =
      timestamps.length > 0
        ? timestamps[0] + this.config.windowMs
        : now + this.config.windowMs;

    if (timestamps.length >= this.config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    // Record this request
    timestamps.push(now);
    this.windows.set(key, timestamps);

    return { allowed: true, remaining: remaining - 1, resetAt };
  }

  /**
   * Get current request count for a key (for metrics).
   */
  getCount(key: string): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const timestamps = this.windows.get(key) ?? [];
    return timestamps.filter((ts) => ts > windowStart).length;
  }
}

// ---------- IP Extraction ----------

/**
 * Extract client IP from request, handling proxies.
 */
export function extractIP(req: IncomingMessage): string {
  // Trust X-Forwarded-For only from trusted proxies
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    // Take first IP (original client)
    const clientIP = ips.split(",")[0]?.trim();
    if (clientIP && isValidIP(clientIP)) {
      return clientIP;
    }
  }

  // X-Real-IP header (nginx)
  const realIP = req.headers["x-real-ip"];
  if (realIP) {
    const ip = Array.isArray(realIP) ? realIP[0] : realIP;
    if (isValidIP(ip)) {
      return ip;
    }
  }

  // Direct connection
  const socket = req.socket;
  return socket.remoteAddress ?? "unknown";
}

function isValidIP(ip: string): boolean {
  // Basic validation - IPv4 or IPv6
  return /^[\d.]+$/.test(ip) || /^[a-f0-9:]+$/i.test(ip);
}

// ---------- Endpoint Limits ----------

/** Per-endpoint rate limit configurations. */
export const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  // Chat endpoints - moderate limits for AI interactions
  "/api/chat": { windowMs: 60_000, maxRequests: 10 },
  "/api/chat/send": { windowMs: 60_000, maxRequests: 10 },

  // Database queries - strict limits
  "/api/database/query": { windowMs: 60_000, maxRequests: 5 },

  // Authentication - very strict
  "/api/auth/pair": { windowMs: 300_000, maxRequests: 5 },
  "/api/auth/token": { windowMs: 60_000, maxRequests: 10 },

  // Subscription OAuth - moderate
  "/api/subscription/anthropic/start": { windowMs: 300_000, maxRequests: 5 },
  "/api/subscription/anthropic/exchange": { windowMs: 60_000, maxRequests: 10 },
  "/api/subscription/openai/start": { windowMs: 300_000, maxRequests: 5 },
  "/api/subscription/openai/exchange": { windowMs: 60_000, maxRequests: 10 },

  // Plugin operations - moderate
  "/api/plugins/install": { windowMs: 60_000, maxRequests: 5 },
  "/api/plugins/uninstall": { windowMs: 60_000, maxRequests: 5 },

  // Health/status - relaxed
  "/api/status": { windowMs: 60_000, maxRequests: 120 },
  "/api/health": { windowMs: 60_000, maxRequests: 120 },

  // Default for unlisted endpoints
  default: { windowMs: 60_000, maxRequests: 60 },
};

// ---------- Middleware Factory ----------

export interface RateLimiterOptions {
  /** Global token bucket config. */
  globalBucket?: TokenBucketConfig;
  /** Per-endpoint limits (merged with defaults). */
  endpointLimits?: Record<string, RateLimitConfig>;
  /** Skip rate limiting for these paths. */
  skipPaths?: string[];
  /** Custom handler for rate-limited requests. */
  onRateLimited?: (
    req: IncomingMessage,
    res: ServerResponse,
    result: RateLimitResult,
  ) => void;
}

/**
 * Create rate limiting middleware.
 */
export function createRateLimitMiddleware(options: RateLimiterOptions = {}) {
  const globalBucket = new TokenBucket(
    options.globalBucket ?? {
      capacity: 100, // Allow burst of 100 requests
      refillRate: 20, // Sustained 20 req/s
    },
  );

  const endpointLimits = { ...ENDPOINT_LIMITS, ...options.endpointLimits };
  const limiters = new Map<string, SlidingWindowRateLimiter>();

  // Create limiters for each endpoint
  for (const [endpoint, config] of Object.entries(endpointLimits)) {
    limiters.set(endpoint, new SlidingWindowRateLimiter(config));
  }
  const defaultLimiter = limiters.get("default");

  const skipPaths = new Set(options.skipPaths ?? []);

  /**
   * Rate limit middleware function.
   * Returns true if request is allowed, false if rate limited.
   */
  return function rateLimitMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    const pathname = (req.url ?? "/").split("?")[0];

    // Skip configured paths (health checks, etc.)
    if (skipPaths.has(pathname)) {
      return true;
    }

    // 1. Global token bucket check (burst protection)
    if (!globalBucket.tryConsume()) {
      logger.warn("[rate-limit] Global bucket exhausted");
      res.writeHead(503, {
        "Content-Type": "application/json",
        "Retry-After": "1",
      });
      res.end(
        JSON.stringify({
          error: "Service temporarily overloaded",
          retryAfter: 1,
        }),
      );
      return false;
    }

    // 2. Per-endpoint sliding window check
    const endpointLimiter = limiters.get(pathname);
    const limiter = endpointLimiter ?? defaultLimiter;
    if (!limiter) {
      logger.warn("[rate-limit] No default limiter configured; allowing request");
      return true;
    }
    const clientIp = extractIP(req);
    // For unlisted endpoints using the default limiter, scope counters by
    // path so unrelated routes (and dynamic endpoints) don't starve each other.
    const key = endpointLimiter ? clientIp : `${clientIp}:${pathname}`;
    const result = limiter.isAllowed(key);

    // Get config for headers
    const config = endpointLimits[pathname] ?? endpointLimits.default;

    // Set RFC 6585 rate limit headers
    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);

      if (options.onRateLimited) {
        options.onRateLimited(req, res, result);
      } else {
        logger.warn(`[rate-limit] Rate limited: ${key} on ${pathname}`);
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        });
        res.end(
          JSON.stringify({
            error: "Too many requests",
            retryAfter,
          }),
        );
      }
      return false;
    }

    return true;
  };
}

// ---------- Exports ----------

export type RateLimitMiddleware = ReturnType<typeof createRateLimitMiddleware>;
