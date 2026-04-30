/**
 * Tests for performance load testing utilities.
 */

import { describe, expect, it } from "vitest";

import { runLoadTest } from "./load-test.js";
import { runStressTest } from "./stress-test.js";

describe("runLoadTest", () => {
  it("runs all requests and tracks success", async () => {
    let count = 0;
    const result = await runLoadTest(
      { totalRequests: 10, concurrency: 2, timeoutMs: 1000 },
      async () => { count++; },
    );

    expect(result.totalCompleted).toBe(10);
    expect(result.successes).toBe(10);
    expect(result.failures).toBe(0);
    expect(count).toBe(10);
  });

  it("tracks failures", async () => {
    let i = 0;
    const result = await runLoadTest(
      { totalRequests: 4, concurrency: 1, timeoutMs: 1000 },
      async () => { if (++i % 2 === 0) throw new Error("fail"); },
    );

    expect(result.successes).toBe(2);
    expect(result.failures).toBe(2);
  });

  it("computes latency percentiles", async () => {
    const result = await runLoadTest(
      { totalRequests: 10, concurrency: 1, timeoutMs: 1000 },
      async () => {},
    );

    expect(result.latency.p50).toBeGreaterThanOrEqual(0);
    expect(result.latency.p95).toBeGreaterThanOrEqual(result.latency.p50);
    expect(result.latency.p99).toBeGreaterThanOrEqual(result.latency.p95);
    expect(result.latency.min).toBeLessThanOrEqual(result.latency.max);
  });

  it("computes throughput", async () => {
    const result = await runLoadTest(
      { totalRequests: 5, concurrency: 5, timeoutMs: 1000 },
      async () => { await new Promise((r) => setTimeout(r, 2)); },
    );

    expect(result.throughput).toBeGreaterThan(0);
  });

  it("handles zero requests", async () => {
    const result = await runLoadTest(
      { totalRequests: 0, concurrency: 1, timeoutMs: 1000 },
      async () => {},
    );

    expect(result.totalCompleted).toBe(0);
    expect(result.throughput).toBe(0);
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let current = 0;

    const result = await runLoadTest(
      { totalRequests: 20, concurrency: 3, timeoutMs: 1000 },
      async () => {
        current++;
        if (current > maxConcurrent) maxConcurrent = current;
        await new Promise((r) => setTimeout(r, 5));
        current--;
      },
    );

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(result.successes).toBe(20);
  });
});

describe("runStressTest", () => {
  it("runs operations for the specified duration", async () => {
    const result = await runStressTest(
      { durationMs: 50, opsPerSecond: 0, maxBufferSize: 100 },
      async () => {},
    );

    expect(result.totalOps).toBeGreaterThan(0);
    expect(result.successOps).toBe(result.totalOps);
    expect(result.stable).toBe(true);
  });

  it("tracks failures and reports instability", async () => {
    let i = 0;
    const result = await runStressTest(
      { durationMs: 50, opsPerSecond: 0, maxBufferSize: 100 },
      async () => { if (++i % 2 === 0) throw new Error("fail"); },
    );

    expect(result.failedOps).toBeGreaterThan(0);
    expect(result.stable).toBe(false);
  });

  it("reports peak memory delta", async () => {
    const result = await runStressTest(
      { durationMs: 30, opsPerSecond: 0, maxBufferSize: 100 },
      async () => {},
    );

    expect(typeof result.peakMemoryDeltaBytes).toBe("number");
  });
});
