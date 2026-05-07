import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  type RateLimitConfig,
  resetRateLimits,
} from "./rate-limiter.js";

const CONFIG: RateLimitConfig = {
  maxRequests: 3,
  windowMs: 10_000,
};

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    expect(checkRateLimit("a", CONFIG).allowed).toBe(true);
    expect(checkRateLimit("a", CONFIG).allowed).toBe(true);
    expect(checkRateLimit("a", CONFIG).allowed).toBe(true);
  });

  it("rejects requests beyond the limit", () => {
    checkRateLimit("a", CONFIG);
    checkRateLimit("a", CONFIG);
    checkRateLimit("a", CONFIG);

    const fourth = checkRateLimit("a", CONFIG);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    checkRateLimit("a", CONFIG);
    checkRateLimit("a", CONFIG);
    checkRateLimit("a", CONFIG);

    // "b" should still be allowed
    expect(checkRateLimit("b", CONFIG).allowed).toBe(true);
  });

  it("allows requests again after the window expires", () => {
    checkRateLimit("a", CONFIG);
    checkRateLimit("a", CONFIG);
    checkRateLimit("a", CONFIG);

    // Blocked now
    expect(checkRateLimit("a", CONFIG).allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(CONFIG.windowMs + 1);

    // Allowed again
    expect(checkRateLimit("a", CONFIG).allowed).toBe(true);
  });

  it("returns correct retryAfterMs value", () => {
    vi.setSystemTime(1000);
    checkRateLimit("a", CONFIG);

    vi.setSystemTime(2000);
    checkRateLimit("a", CONFIG);

    vi.setSystemTime(3000);
    checkRateLimit("a", CONFIG);

    vi.setSystemTime(4000);
    const result = checkRateLimit("a", CONFIG);
    expect(result.allowed).toBe(false);
    // Oldest timestamp is at 1000, window is 10000, current time is 4000.
    // retryAfterMs = 1000 + 10000 - 4000 = 7000
    expect(result.retryAfterMs).toBe(7000);
  });

  it("returns retryAfterMs of 0 for allowed requests", () => {
    const result = checkRateLimit("a", CONFIG);
    expect(result.retryAfterMs).toBe(0);
  });

  it("evicts timestamps that fall outside the sliding window", () => {
    vi.setSystemTime(0);
    checkRateLimit("a", CONFIG);

    vi.setSystemTime(1000);
    checkRateLimit("a", CONFIG);

    vi.setSystemTime(2000);
    checkRateLimit("a", CONFIG);

    // Now at capacity. Advance past the first timestamp's window.
    vi.setSystemTime(10_001);

    // The timestamp at 0 has expired; slot freed.
    const result = checkRateLimit("a", CONFIG);
    expect(result.allowed).toBe(true);
  });
});

describe("resetRateLimits", () => {
  it("clears all state so previously exhausted keys become available", () => {
    const config: RateLimitConfig = { maxRequests: 1, windowMs: 60_000 };
    checkRateLimit("x", config);
    expect(checkRateLimit("x", config).allowed).toBe(false);

    resetRateLimits();

    expect(checkRateLimit("x", config).allowed).toBe(true);
  });
});
