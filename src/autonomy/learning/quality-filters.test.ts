import { describe, expect, it } from "vitest";
import {
  applyQualityFilters,
  DEFAULT_QUALITY_FILTER_CONFIG,
} from "./quality-filters.js";
import type { Episode, TrainingExample } from "./types.js";

function makeStep(overrides: Partial<TrainingExample> = {}): TrainingExample {
  return {
    id: "step-1",
    toolName: "SAY",
    input: { params: {}, source: "user" },
    output: { result: { ok: true }, durationMs: 1000 },
    verification: { passed: true, checks: [] },
    reward: { total: 0.8, breakdown: {}, dimensions: [], computedAt: Date.now() },
    metadata: { agentId: "agent", requestId: "req", timestamp: Date.now() },
    ...overrides,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "ep-1",
    description: "High-quality training episode",
    steps: [makeStep()],
    planSteps: 1,
    totalReward: { total: 0.8, breakdown: {}, dimensions: [], computedAt: Date.now() },
    driftScore: 0.1,
    auditAnomalies: [],
    durationMs: 1000,
    success: true,
    completedAt: Date.now(),
    ...overrides,
  };
}

describe("applyQualityFilters", () => {
  it("accepts high-quality episodes", () => {
    const result = applyQualityFilters([makeEpisode()]);
    expect(result.accepted).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
    expect(result.summary.acceptedSteps).toBe(1);
  });

  it("drops episodes with weak reward or high drift", () => {
    const weak = makeEpisode({
      id: "weak",
      totalReward: { total: 0.05, breakdown: {}, dimensions: [], computedAt: Date.now() },
    });
    const drifting = makeEpisode({
      id: "drift",
      driftScore: 0.95,
    });
    const result = applyQualityFilters([weak, drifting]);
    expect(result.accepted).toHaveLength(0);
    expect(result.dropped).toHaveLength(2);
    expect(result.summary.droppedEpisodes).toBe(2);
  });

  it("drops low-quality steps and rejects episode when none remain", () => {
    const badStep = makeStep({
      id: "bad-step",
      verification: { passed: false, checks: [] },
      reward: {
        total: DEFAULT_QUALITY_FILTER_CONFIG.minStepReward - 0.01,
        breakdown: {},
        dimensions: [],
        computedAt: Date.now(),
      },
    });
    const result = applyQualityFilters([
      makeEpisode({ id: "episode-bad", steps: [badStep] }),
    ]);

    expect(result.accepted).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].droppedStepIds).toContain("bad-step");
    expect(result.dropped[0].reasons).toContain(
      "no high-quality steps remained after filtering",
    );
  });

  it("keeps only quality steps for mixed episodes", () => {
    const goodStep = makeStep({ id: "good-step" });
    const slowStep = makeStep({
      id: "slow-step",
      output: { result: {}, durationMs: 999_999 },
    });
    const result = applyQualityFilters([
      makeEpisode({ id: "mixed", steps: [goodStep, slowStep] }),
    ]);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].steps).toHaveLength(1);
    expect(result.accepted[0].steps[0].id).toBe("good-step");
    expect(result.summary.droppedSteps).toBe(1);
  });
});
