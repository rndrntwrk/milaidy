import { describe, expect, it } from "vitest";
import type { OrchestratedResult } from "../roles/types.js";
import type { VerifierContext } from "../verification/types.js";
import type { PipelineResult } from "../workflow/types.js";
import {
  CheckpointReward,
  EpisodeReward,
  RewardAggregator,
  type RewardablePostCondition,
} from "./reward.js";

// ---------- Helpers ----------

function makeCondition(
  id: string,
  weight: number,
  reward: number,
): RewardablePostCondition {
  return {
    id,
    description: `Condition ${id}`,
    check: async () => reward >= 0.5,
    severity: "warning",
    weight,
    dimension: "task_completion",
    score: async () => ({ passed: reward >= 0.5, reward, explanation: "ok" }),
  };
}

function makePipelineResult(
  overrides?: Partial<PipelineResult>,
): PipelineResult {
  return {
    requestId: "req-1",
    toolName: "test-tool",
    success: true,
    result: { data: "ok" },
    validation: { valid: true, errors: [] },
    verification: { status: "passed", hasCriticalFailure: false },
    durationMs: 1000,
    ...overrides,
  };
}

function makeOrchestratedResult(
  overrides?: Partial<OrchestratedResult>,
): OrchestratedResult {
  return {
    plan: {
      id: "plan-1",
      goals: [],
      steps: [],
      createdAt: Date.now(),
      status: "complete",
    },
    executions: [makePipelineResult()],
    auditReport: {
      driftReport: {
        driftScore: 0.05,
        dimensions: {
          valueAlignment: 0.95,
          styleConsistency: 0.9,
          boundaryRespect: 1.0,
          topicFocus: 0.85,
        },
        windowSize: 20,
        severity: "none" as const,
        corrections: [],
        analyzedAt: Date.now(),
      },
      eventCount: 5,
      anomalies: [],
      recommendations: [],
      auditedAt: Date.now(),
    },
    durationMs: 2000,
    success: true,
    ...overrides,
  };
}

// ---------- RewardAggregator ----------

describe("RewardAggregator", () => {
  it("returns weighted composite from multiple conditions", async () => {
    const agg = new RewardAggregator([
      makeCondition("a", 0.6, 1.0),
      makeCondition("b", 0.4, 0.5),
    ]);
    const ctx = {} as VerifierContext;
    const signal = await agg.aggregate(ctx);

    // (1.0 * 0.6 + 0.5 * 0.4) / 1.0 = 0.8
    expect(signal.total).toBeCloseTo(0.8, 2);
    expect(signal.breakdown["a"]).toBe(1.0);
    expect(signal.breakdown["b"]).toBe(0.5);
    expect(signal.dimensions).toContain("task_completion");
  });

  it("handles empty conditions list", async () => {
    const agg = new RewardAggregator([]);
    const signal = await agg.aggregate({} as VerifierContext);
    expect(signal.total).toBe(0);
    expect(Object.keys(signal.breakdown)).toHaveLength(0);
    expect(signal.dimensions).toHaveLength(0);
  });

  it("normalizes weights", async () => {
    const agg = new RewardAggregator([
      makeCondition("a", 2, 1.0),
      makeCondition("b", 2, 0.0),
    ]);
    const signal = await agg.aggregate({} as VerifierContext);
    // (1.0 * 2 + 0.0 * 2) / 4 = 0.5
    expect(signal.total).toBeCloseTo(0.5, 2);
  });

  it("handles throwing conditions with zero reward", async () => {
    const throwing: RewardablePostCondition = {
      id: "bad",
      description: "throws",
      check: async () => false,
      severity: "warning",
      weight: 1,
      dimension: "safety",
      score: async () => {
        throw new Error("boom");
      },
    };
    const agg = new RewardAggregator([throwing, makeCondition("ok", 1, 1.0)]);
    const signal = await agg.aggregate({} as VerifierContext);
    expect(signal.breakdown["bad"]).toBe(0);
    expect(signal.breakdown["ok"]).toBe(1.0);
    expect(signal.total).toBeCloseTo(0.5, 2);
  });
});

// ---------- CheckpointReward ----------

describe("CheckpointReward", () => {
  it("maps successful pipeline to high reward", () => {
    const cr = new CheckpointReward();
    const signal = cr.compute(makePipelineResult());

    expect(signal.total).toBeGreaterThan(0.8);
    expect(signal.breakdown["completion"]).toBe(1.0);
    expect(signal.breakdown["validation"]).toBe(1.0);
    expect(signal.breakdown["verification"]).toBe(1.0);
    expect(signal.dimensions).toContain("task_completion");
    expect(signal.dimensions).toContain("safety");
    expect(signal.dimensions).toContain("efficiency");
  });

  it("maps validation failure to low reward", () => {
    const cr = new CheckpointReward();
    const signal = cr.compute(
      makePipelineResult({
        success: false,
        validation: { valid: false, errors: [{ field: "x", message: "bad" }] },
      }),
    );

    expect(signal.breakdown["validation"]).toBe(0.0);
    expect(signal.breakdown["completion"]).toBe(0.0);
    expect(signal.total).toBeLessThan(0.5);
  });

  it("maps critical verification failure to zero verification", () => {
    const cr = new CheckpointReward();
    const signal = cr.compute(
      makePipelineResult({
        verification: { status: "failed", hasCriticalFailure: true },
      }),
    );

    expect(signal.breakdown["verification"]).toBe(0.0);
  });

  it("includes efficiency dimension from durationMs", () => {
    const cr = new CheckpointReward(undefined, 1000);

    // Fast execution → high efficiency
    const fast = cr.compute(makePipelineResult({ durationMs: 500 }));
    expect(fast.breakdown["efficiency"]).toBeGreaterThan(0.7);

    // Slow execution → lower efficiency
    const slow = cr.compute(makePipelineResult({ durationMs: 5000 }));
    expect(slow.breakdown["efficiency"]).toBeLessThan(
      fast.breakdown["efficiency"],
    );
  });

  it("clamps total to 0-1 range", () => {
    const cr = new CheckpointReward();
    const signal = cr.compute(makePipelineResult({ durationMs: 0 }));
    expect(signal.total).toBeGreaterThanOrEqual(0);
    expect(signal.total).toBeLessThanOrEqual(1);
  });
});

// ---------- EpisodeReward ----------

describe("EpisodeReward", () => {
  const cr = new CheckpointReward();

  it("aggregates step rewards", () => {
    const er = new EpisodeReward(cr);
    const signal = er.compute(makeOrchestratedResult());

    expect(signal.total).toBeGreaterThan(0.5);
    expect(signal.breakdown["step_reward"]).toBeDefined();
    expect(signal.dimensions).toContain("task_completion");
  });

  it("penalizes high drift", () => {
    const er = new EpisodeReward(cr);

    const lowDrift = er.compute(makeOrchestratedResult());
    const highDrift = er.compute(
      makeOrchestratedResult({
        auditReport: {
          driftReport: {
            driftScore: 0.6,
            dimensions: {
              valueAlignment: 0.4,
              styleConsistency: 0.4,
              boundaryRespect: 0.5,
              topicFocus: 0.3,
            },
            windowSize: 20,
            severity: "high" as const,
            corrections: [],
            analyzedAt: Date.now(),
          },
          eventCount: 5,
          anomalies: [],
          recommendations: [],
          auditedAt: Date.now(),
        },
      }),
    );

    expect(highDrift.total).toBeLessThan(lowDrift.total);
    expect(highDrift.breakdown["drift_penalty"]).toBeLessThan(
      lowDrift.breakdown["drift_penalty"],
    );
  });

  it("penalizes audit anomalies", () => {
    const er = new EpisodeReward(cr);

    const clean = er.compute(makeOrchestratedResult());
    const anomalous = er.compute(
      makeOrchestratedResult({
        auditReport: {
          driftReport: {
            driftScore: 0.05,
            dimensions: {
              valueAlignment: 0.95,
              styleConsistency: 0.9,
              boundaryRespect: 1.0,
              topicFocus: 0.85,
            },
            windowSize: 20,
            severity: "none" as const,
            corrections: [],
            analyzedAt: Date.now(),
          },
          eventCount: 5,
          anomalies: ["anomaly-1", "anomaly-2", "anomaly-3"],
          recommendations: [],
          auditedAt: Date.now(),
        },
      }),
    );

    expect(anomalous.total).toBeLessThan(clean.total);
  });

  it("handles empty execution list", () => {
    const er = new EpisodeReward(cr);
    const signal = er.compute(makeOrchestratedResult({ executions: [] }));

    expect(signal.breakdown["step_reward"]).toBe(0);
    expect(signal.total).toBeDefined();
  });

  it("reflects overall success", () => {
    const er = new EpisodeReward(cr);

    const succeeded = er.compute(makeOrchestratedResult({ success: true }));
    const failed = er.compute(makeOrchestratedResult({ success: false }));

    expect(succeeded.breakdown["success_bonus"]).toBe(1.0);
    expect(failed.breakdown["success_bonus"]).toBe(0.0);
    expect(succeeded.total).toBeGreaterThan(failed.total);
  });
});
