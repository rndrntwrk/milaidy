/**
 * Tests for InMemoryBaselineHarness.
 */

import { describe, expect, it, vi } from "vitest";
import type { KernelComponents, ScenarioEvaluator, ScenarioResult } from "./evaluator-types.js";
import type { BaselineMetrics, EvaluationScenario } from "./types.js";

// Mock telemetry and event bus before importing harness
vi.mock("../../telemetry/setup.js", () => ({
  metrics: {
    histogram: vi.fn(),
    gauge: vi.fn(),
  },
}));
vi.mock("../../events/event-bus.js", () => ({
  emit: vi.fn(),
  getEventBus: vi.fn(() => ({ emit: vi.fn() })),
}));

const { InMemoryBaselineHarness } = await import("./baseline-harness.js");

// ---------- Helpers ----------

function makeScenario(overrides: Partial<EvaluationScenario> = {}): EvaluationScenario {
  return {
    id: "test:scenario",
    metric: "preferenceFollowingAccuracy",
    description: "Test scenario",
    prompts: ["test prompt"],
    expectedBehavior: "test behavior",
    turns: 1,
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<BaselineMetrics> = {}): BaselineMetrics {
  return {
    preferenceFollowingAccuracy: 0.9,
    instructionCompletionRate: 0.85,
    personaDriftScore: 0.05,
    memoryPoisoningResistance: 0.95,
    compoundingErrorRate: 0.03,
    sycophancyScore: 0.1,
    turnCount: 10,
    measuredAt: Date.now(),
    ...overrides,
  };
}

function makeMockEvaluator(score: number = 0.8): ScenarioEvaluator {
  return {
    evaluate: vi.fn().mockResolvedValue({
      scenarioId: "test",
      metric: "test",
      score,
      details: "mock evaluation",
    } satisfies ScenarioResult),
  };
}

function makeMockComponents(): KernelComponents {
  return {
    trustScorer: {} as KernelComponents["trustScorer"],
    memoryGate: {} as KernelComponents["memoryGate"],
    driftMonitor: {} as KernelComponents["driftMonitor"],
    goalManager: {} as KernelComponents["goalManager"],
  };
}

// ---------- Tests ----------

describe("InMemoryBaselineHarness", () => {
  describe("measure()", () => {
    it("returns all-zero metrics without evaluator (stub behavior)", async () => {
      const harness = new InMemoryBaselineHarness();
      const scenarios = [
        makeScenario({ metric: "preferenceFollowingAccuracy" }),
        makeScenario({ id: "test:2", metric: "memoryPoisoningResistance" }),
      ];

      const result = await harness.measure("agent-1", scenarios);

      expect(result.preferenceFollowingAccuracy).toBe(0);
      expect(result.memoryPoisoningResistance).toBe(0);
      expect(result.turnCount).toBe(2);
      expect(result.measuredAt).toBeGreaterThan(0);
    });

    it("delegates to evaluator when provided", async () => {
      const evaluator = makeMockEvaluator(0.75);
      const components = makeMockComponents();
      const harness = new InMemoryBaselineHarness(evaluator, components);

      const scenarios = [
        makeScenario({ metric: "preferenceFollowingAccuracy" }),
      ];

      const result = await harness.measure("agent-1", scenarios);

      expect(evaluator.evaluate).toHaveBeenCalledOnce();
      expect(result.preferenceFollowingAccuracy).toBe(0.75);
    });

    it("aggregates multiple scenarios per metric", async () => {
      let callCount = 0;
      const evaluator: ScenarioEvaluator = {
        evaluate: vi.fn().mockImplementation(async () => {
          callCount++;
          return {
            scenarioId: `test-${callCount}`,
            metric: "preferenceFollowingAccuracy",
            score: callCount === 1 ? 0.8 : 0.6,
          };
        }),
      };
      const components = makeMockComponents();
      const harness = new InMemoryBaselineHarness(evaluator, components);

      const scenarios = [
        makeScenario({ id: "s1", metric: "preferenceFollowingAccuracy" }),
        makeScenario({ id: "s2", metric: "preferenceFollowingAccuracy" }),
      ];

      const result = await harness.measure("agent-1", scenarios);

      expect(evaluator.evaluate).toHaveBeenCalledTimes(2);
      expect(result.preferenceFollowingAccuracy).toBe(0.7); // avg(0.8, 0.6)
    });

    it("returns 0 for metrics with no scenarios", async () => {
      const harness = new InMemoryBaselineHarness();
      const result = await harness.measure("agent-1", []);

      expect(result.preferenceFollowingAccuracy).toBe(0);
      expect(result.sycophancyScore).toBe(0);
      expect(result.turnCount).toBe(0);
    });
  });

  describe("snapshot() and listSnapshots()", () => {
    it("stores and lists snapshots", async () => {
      const harness = new InMemoryBaselineHarness();
      const m = makeMetrics();

      expect(harness.listSnapshots()).toHaveLength(0);

      await harness.snapshot(m, "baseline-v1");
      expect(harness.listSnapshots()).toEqual(["baseline-v1"]);

      await harness.snapshot(m, "post-phase1");
      expect(harness.listSnapshots()).toEqual(["baseline-v1", "post-phase1"]);
    });

    it("overwrites snapshot with same label", async () => {
      const harness = new InMemoryBaselineHarness();
      await harness.snapshot(makeMetrics({ preferenceFollowingAccuracy: 0.5 }), "v1");
      await harness.snapshot(makeMetrics({ preferenceFollowingAccuracy: 0.9 }), "v1");

      expect(harness.listSnapshots()).toHaveLength(1);

      // Verify the newer snapshot is stored by comparing
      const current = makeMetrics({ preferenceFollowingAccuracy: 0.9 });
      const delta = await harness.compare(current, "v1");
      expect(delta).not.toBeNull();
      // Delta should be 0 since both are 0.9
      const prefDelta = delta!.deltas.find((d) => d.metric === "preferenceFollowingAccuracy");
      expect(Math.abs(prefDelta!.delta)).toBeLessThan(0.01);
    });
  });

  describe("compare()", () => {
    it("returns null for unknown baseline label", async () => {
      const harness = new InMemoryBaselineHarness();
      const result = await harness.compare(makeMetrics(), "nonexistent");
      expect(result).toBeNull();
    });

    it("computes deltas correctly", async () => {
      const harness = new InMemoryBaselineHarness();
      const baseline = makeMetrics({
        preferenceFollowingAccuracy: 0.8,
        personaDriftScore: 0.1,
      });
      await harness.snapshot(baseline, "v1");

      const current = makeMetrics({
        preferenceFollowingAccuracy: 0.9, // improved (higher is better)
        personaDriftScore: 0.02, // improved (lower is better)
      });
      const delta = await harness.compare(current, "v1");

      expect(delta).not.toBeNull();
      expect(delta!.baselineLabel).toBe("v1");
      expect(delta!.deltas).toHaveLength(6);

      const prefDelta = delta!.deltas.find((d) => d.metric === "preferenceFollowingAccuracy")!;
      expect(prefDelta.baseline).toBe(0.8);
      expect(prefDelta.current).toBe(0.9);
      expect(prefDelta.delta).toBeCloseTo(0.1);
      expect(prefDelta.direction).toBe("improved");

      const driftDelta = delta!.deltas.find((d) => d.metric === "personaDriftScore")!;
      expect(driftDelta.direction).toBe("improved"); // lower is better, went down
    });

    it("identifies regressed metrics", async () => {
      const harness = new InMemoryBaselineHarness();
      await harness.snapshot(makeMetrics({ preferenceFollowingAccuracy: 0.95 }), "v1");

      const current = makeMetrics({ preferenceFollowingAccuracy: 0.7 });
      const delta = await harness.compare(current, "v1");

      const prefDelta = delta!.deltas.find((d) => d.metric === "preferenceFollowingAccuracy")!;
      expect(prefDelta.direction).toBe("regressed");
    });

    it("identifies unchanged metrics", async () => {
      const harness = new InMemoryBaselineHarness();
      const m = makeMetrics();
      await harness.snapshot(m, "v1");

      const delta = await harness.compare(m, "v1");

      for (const d of delta!.deltas) {
        expect(d.direction).toBe("unchanged");
      }
      expect(delta!.overallImprovement).toBe(0);
    });

    it("detects SOW target met/unmet", async () => {
      const harness = new InMemoryBaselineHarness();
      await harness.snapshot(makeMetrics(), "v1");

      // preferenceFollowingAccuracy target >= 0.92
      const current = makeMetrics({
        preferenceFollowingAccuracy: 0.93, // met
        instructionCompletionRate: 0.5,    // not met (target >= 0.88)
      });
      const delta = await harness.compare(current, "v1");

      const prefDelta = delta!.deltas.find((d) => d.metric === "preferenceFollowingAccuracy")!;
      expect(prefDelta.targetMet).toBe(true);

      const instrDelta = delta!.deltas.find((d) => d.metric === "instructionCompletionRate")!;
      expect(instrDelta.targetMet).toBe(false);
    });

    it("computes overall improvement correctly", async () => {
      const harness = new InMemoryBaselineHarness();
      await harness.snapshot(makeMetrics({
        preferenceFollowingAccuracy: 0.5,
        instructionCompletionRate: 0.5,
        personaDriftScore: 0.5,
        memoryPoisoningResistance: 0.5,
        compoundingErrorRate: 0.5,
        sycophancyScore: 0.5,
      }), "v1");

      // 4 improved, 2 unchanged
      const current = makeMetrics({
        preferenceFollowingAccuracy: 0.9, // improved
        instructionCompletionRate: 0.9,   // improved
        personaDriftScore: 0.01,          // improved (lower)
        memoryPoisoningResistance: 0.9,   // improved
        compoundingErrorRate: 0.5,        // unchanged
        sycophancyScore: 0.5,             // unchanged
      });

      const delta = await harness.compare(current, "v1");
      expect(delta!.overallImprovement).toBeCloseTo(4 / 6);
    });
  });
});
