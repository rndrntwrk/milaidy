/**
 * Tests for BaselineScheduler.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { BaselineScheduler } from "./baseline-scheduler.js";
import type { BaselineHarness } from "./baseline-harness.js";
import type { BaselineMetrics } from "./types.js";

// ---------- Mock ----------

function makeMetrics(): BaselineMetrics {
  return {
    trustAccuracy: 0.9,
    memoryGateAccuracy: 0.85,
    driftScore: 0.05,
    goalCompletionRate: 0.8,
    toolContractAdherence: 0.95,
    pipelineSuccessRate: 0.92,
    approvalAccuracy: 0.88,
    safeModeFalsePositiveRate: 0.02,
    identityPreservationScore: 0.97,
    scenarioPassRate: 0.9,
    measuredAt: Date.now(),
    agentId: "test-agent",
    scenarioCount: 5,
  };
}

function makeMockHarness() {
  const harness = {
    measureCalls: 0,
    snapshotLabels: [] as string[],
    async measure() {
      harness.measureCalls++;
      return makeMetrics();
    },
    async snapshot(_metrics: BaselineMetrics, label: string) {
      harness.snapshotLabels.push(label);
    },
    async compare() {
      return null;
    },
    listSnapshots() {
      return harness.snapshotLabels;
    },
  };
  return harness;
}

// ---------- Tests ----------

describe("BaselineScheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts and runs first cycle immediately", async () => {
    const harness = makeMockHarness();
    const scheduler = new BaselineScheduler(harness, {
      intervalMs: 60_000,
      agentId: "test-agent",
    });

    scheduler.start();
    expect(scheduler.isRunning).toBe(true);

    // Wait for async first cycle
    await vi.waitFor(() => {
      expect(harness.measureCalls).toBe(1);
    });
    expect(harness.snapshotLabels).toHaveLength(1);
    expect(harness.snapshotLabels[0]).toMatch(/^auto-/);

    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
  });

  it("does not double-start", () => {
    const harness = makeMockHarness();
    const scheduler = new BaselineScheduler(harness, {
      intervalMs: 60_000,
      agentId: "test-agent",
    });

    scheduler.start();
    scheduler.start(); // Second call is no-op
    expect(scheduler.isRunning).toBe(true);

    scheduler.stop();
  });

  it("stop is idempotent", () => {
    const harness = makeMockHarness();
    const scheduler = new BaselineScheduler(harness, {
      intervalMs: 60_000,
      agentId: "test-agent",
    });

    scheduler.stop(); // No-op when not started
    expect(scheduler.isRunning).toBe(false);
  });

  it("handles measure failure gracefully", async () => {
    const harness = makeMockHarness();
    const origMeasure = harness.measure;
    let callCount = 0;
    harness.measure = async (...args) => {
      callCount++;
      if (callCount === 1) throw new Error("measurement failed");
      return origMeasure(...args);
    };

    const scheduler = new BaselineScheduler(harness, {
      intervalMs: 60_000,
      agentId: "test-agent",
    });

    scheduler.start();

    // First cycle fails but doesn't crash
    await new Promise((r) => setTimeout(r, 50));
    expect(callCount).toBe(1);
    expect(harness.snapshotLabels).toHaveLength(0);

    scheduler.stop();
  });

  it("prevents overlapping runs", async () => {
    const harness = makeMockHarness();
    let resolveBlock: () => void;
    const blockPromise = new Promise<void>((r) => { resolveBlock = r; });
    let callCount = 0;

    harness.measure = async () => {
      callCount++;
      if (callCount === 1) await blockPromise; // Block first call
      return makeMetrics();
    };

    const scheduler = new BaselineScheduler(harness, {
      intervalMs: 60_000,
      agentId: "test-agent",
    });

    // Manually run two cycles
    const first = scheduler.runCycle();
    await new Promise((r) => setTimeout(r, 10));
    const second = scheduler.runCycle(); // Should skip (running = true)
    resolveBlock!();
    await first;
    await second;

    // Only one measure call should have happened
    expect(callCount).toBe(1);
  });

  it("enforces minimum interval of 1000ms", () => {
    const harness = makeMockHarness();
    const scheduler = new BaselineScheduler(harness, {
      intervalMs: 100, // Too low
      agentId: "test-agent",
    });

    scheduler.start();
    // Should still start without error (internally clamps to 1000)
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
  });
});
