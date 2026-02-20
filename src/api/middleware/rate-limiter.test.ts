/**
 * Tests for api/middleware/rate-limiter.ts
 *
 * Exercises:
 *   - Token bucket algorithm
 *   - Sliding window rate limiter
 *   - IP extraction
 *   - Middleware integration
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimitMiddleware,
  extractIP,
  SlidingWindowRateLimiter,
  TokenBucket,
} from "./rate-limiter.js";

describe("TokenBucket", () => {
  it("allows burst up to capacity", () => {
    const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });

    // Should allow 10 requests immediately
    for (let i = 0; i < 10; i++) {
      expect(bucket.tryConsume()).toBe(true);
    }

    // 11th should fail
    expect(bucket.tryConsume()).toBe(false);
  });

  it("refills tokens over time", async () => {
    const bucket = new TokenBucket({ capacity: 10, refillRate: 100 });

    // Drain all tokens
    for (let i = 0; i < 10; i++) {
      bucket.tryConsume();
    }
    expect(bucket.tryConsume()).toBe(false);

    // Wait for refill (100 tokens/sec = 1 token per 10ms)
    await new Promise((r) => setTimeout(r, 50));

    // Should have some tokens now
    expect(bucket.tryConsume()).toBe(true);
  });

  it("does not exceed capacity", async () => {
    const bucket = new TokenBucket({ capacity: 5, refillRate: 1000 });

    // Wait for potential over-fill
    await new Promise((r) => setTimeout(r, 50));

    // Should only have capacity tokens
    let consumed = 0;
    while (bucket.tryConsume()) {
      consumed++;
      if (consumed > 10) break; // Safety
    }

    expect(consumed).toBe(5);
  });
});

describe("SlidingWindowRateLimiter", () => {
  it("allows requests within limit", () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 5,
    });

    for (let i = 0; i < 5; i++) {
      const result = limiter.isAllowed("test-key");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("blocks requests over limit", () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 3,
    });

    // Use up limit
    for (let i = 0; i < 3; i++) {
      limiter.isAllowed("test-key");
    }

    // Next request should be blocked
    const result = limiter.isAllowed("test-key");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks separate keys independently", () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
    });

    // User A uses their limit
    limiter.isAllowed("user-a");
    limiter.isAllowed("user-a");
    expect(limiter.isAllowed("user-a").allowed).toBe(false);

    // User B should still be allowed
    expect(limiter.isAllowed("user-b").allowed).toBe(true);
  });

  it("resets after window expires", async () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 50, // 50ms window for testing
      maxRequests: 1,
    });

    // Use up limit
    limiter.isAllowed("test-key");
    expect(limiter.isAllowed("test-key").allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));

    // Should be allowed again
    expect(limiter.isAllowed("test-key").allowed).toBe(true);
  });

  it("provides correct resetAt time", () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
    });

    const before = Date.now();
    const result = limiter.isAllowed("test-key");
    const after = Date.now();

    // Reset time should be within the window
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.resetAt).toBeLessThanOrEqual(after + 60_000);
  });
});

describe("extractIP", () => {
  function mockRequest(headers: Record<string, string | string[] | undefined>): IncomingMessage {
    return {
      headers,
      socket: { remoteAddress: "192.168.1.100" },
    } as unknown as IncomingMessage;
  }

  it("extracts IP from X-Forwarded-For header", () => {
    const req = mockRequest({
      "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
    });
    expect(extractIP(req)).toBe("203.0.113.195");
  });

  it("extracts IP from X-Real-IP header", () => {
    const req = mockRequest({
      "x-real-ip": "203.0.113.195",
    });
    expect(extractIP(req)).toBe("203.0.113.195");
  });

  it("falls back to socket remoteAddress", () => {
    const req = mockRequest({});
    expect(extractIP(req)).toBe("192.168.1.100");
  });

  it("prefers X-Forwarded-For over X-Real-IP", () => {
    const req = mockRequest({
      "x-forwarded-for": "10.0.0.1",
      "x-real-ip": "10.0.0.2",
    });
    expect(extractIP(req)).toBe("10.0.0.1");
  });

  it("handles IPv6 addresses", () => {
    const req = mockRequest({
      "x-forwarded-for": "2001:db8::1",
    });
    expect(extractIP(req)).toBe("2001:db8::1");
  });
});

describe("createRateLimitMiddleware", () => {
  function mockRequest(url: string, headers: Record<string, string> = {}): IncomingMessage {
    return {
      url,
      headers,
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
  }

  function mockResponse(): ServerResponse & { _statusCode: number; _headers: Record<string, string>; _body: string } {
    const res = {
      _statusCode: 200,
      _headers: {} as Record<string, string>,
      _body: "",
      writeHead(status: number, headers?: Record<string, string>) {
        this._statusCode = status;
        if (headers) Object.assign(this._headers, headers);
      },
      setHeader(name: string, value: string | number) {
        this._headers[name] = String(value);
      },
      end(body?: string) {
        this._body = body ?? "";
      },
    };
    return res as unknown as ServerResponse & typeof res;
  }

  it("allows requests within limits", () => {
    const middleware = createRateLimitMiddleware({
      endpointLimits: {
        default: { windowMs: 60_000, maxRequests: 100 },
      },
    });

    const req = mockRequest("/api/test");
    const res = mockResponse();

    expect(middleware(req, res)).toBe(true);
    expect(res._headers["X-RateLimit-Remaining"]).toBeDefined();
  });

  it("blocks requests over limit", () => {
    const middleware = createRateLimitMiddleware({
      endpointLimits: {
        "/api/test": { windowMs: 60_000, maxRequests: 2 },
        default: { windowMs: 60_000, maxRequests: 100 },
      },
    });

    const res1 = mockResponse();
    const res2 = mockResponse();
    const res3 = mockResponse();

    middleware(mockRequest("/api/test"), res1);
    middleware(mockRequest("/api/test"), res2);
    const allowed = middleware(mockRequest("/api/test"), res3);

    expect(allowed).toBe(false);
    expect(res3._statusCode).toBe(429);
    expect(JSON.parse(res3._body).error).toBe("Too many requests");
  });

  it("skips configured paths", () => {
    const middleware = createRateLimitMiddleware({
      skipPaths: ["/api/health"],
      globalBucket: { capacity: 1, refillRate: 0 },
    });

    // First request uses the token
    const req1 = mockRequest("/api/other");
    const res1 = mockResponse();
    middleware(req1, res1);

    // Health check should be skipped even with empty bucket
    const req2 = mockRequest("/api/health");
    const res2 = mockResponse();
    expect(middleware(req2, res2)).toBe(true);
  });

  it("sets rate limit headers", () => {
    const middleware = createRateLimitMiddleware({
      endpointLimits: {
        "/api/test": { windowMs: 60_000, maxRequests: 10 },
        default: { windowMs: 60_000, maxRequests: 60 },
      },
    });

    const req = mockRequest("/api/test");
    const res = mockResponse();
    middleware(req, res);

    expect(res._headers["X-RateLimit-Limit"]).toBe("10");
    expect(res._headers["X-RateLimit-Remaining"]).toBeDefined();
    expect(res._headers["X-RateLimit-Reset"]).toBeDefined();
  });

  it("does not share default limiter counters across different paths", () => {
    const middleware = createRateLimitMiddleware({
      endpointLimits: {
        default: { windowMs: 60_000, maxRequests: 2 },
      },
    });

    // Exhaust limit on one unlisted path.
    const resA1 = mockResponse();
    const resA2 = mockResponse();
    const resA3 = mockResponse();
    middleware(mockRequest("/api/path-a"), resA1);
    middleware(mockRequest("/api/path-a"), resA2);
    const blockedA = middleware(mockRequest("/api/path-a"), resA3);

    expect(blockedA).toBe(false);
    expect(resA3._statusCode).toBe(429);

    // Different unlisted path should still be allowed.
    const resB = mockResponse();
    const allowedB = middleware(mockRequest("/api/path-b"), resB);
    expect(allowedB).toBe(true);
  });

  it("returns 503 when global bucket exhausted", () => {
    const middleware = createRateLimitMiddleware({
      globalBucket: { capacity: 1, refillRate: 0 },
    });

    const res1 = mockResponse();
    const res2 = mockResponse();

    middleware(mockRequest("/api/test"), res1);
    const allowed = middleware(mockRequest("/api/test"), res2);

    expect(allowed).toBe(false);
    expect(res2._statusCode).toBe(503);
    expect(JSON.parse(res2._body).error).toBe("Service temporarily overloaded");
  });
});
