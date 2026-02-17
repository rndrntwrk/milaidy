import { describe, expect, it } from "vitest";
import {
  buildAdversarialSplit,
  buildHeldOutValidationSplit,
} from "./dataset-splits.js";
import type { Episode, TrainingExample } from "./types.js";

function makeStep(overrides: Partial<TrainingExample> = {}): TrainingExample {
  return {
    id: "step-1",
    toolName: "TEST",
    input: { params: {}, source: "user" },
    output: { result: {}, durationMs: 1000 },
    verification: { passed: true, checks: [] },
    reward: { total: 0.8, breakdown: {}, dimensions: [], computedAt: Date.now() },
    metadata: { agentId: "agent", requestId: "req", timestamp: Date.now() },
    ...overrides,
  };
}

function makeEpisode(id: string, overrides: Partial<Episode> = {}): Episode {
  return {
    id,
    description: `Episode ${id}`,
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

describe("buildHeldOutValidationSplit", () => {
  it("creates deterministic train/validation split", () => {
    const episodes = Array.from({ length: 10 }, (_, i) => makeEpisode(`ep-${i}`));
    const first = buildHeldOutValidationSplit(episodes, {
      holdoutRatio: 0.2,
      seed: "seed-a",
    });
    const second = buildHeldOutValidationSplit(episodes, {
      holdoutRatio: 0.2,
      seed: "seed-a",
    });

    expect(first.validation).toHaveLength(2);
    expect(first.validation.map((ep) => ep.id)).toEqual(
      second.validation.map((ep) => ep.id),
    );
  });

  it("keeps at least one episode in train set", () => {
    const episodes = [makeEpisode("only-one")];
    const split = buildHeldOutValidationSplit(episodes, { holdoutRatio: 0.5 });
    expect(split.train).toHaveLength(1);
    expect(split.validation).toHaveLength(0);
  });
});

describe("buildAdversarialSplit", () => {
  it("prioritizes risky/anomalous episodes for adversarial split", () => {
    const episodes = [
      makeEpisode("clean-1"),
      makeEpisode("clean-2"),
      makeEpisode("risk-anomaly", { auditAnomalies: ["policy mismatch"] }),
      makeEpisode("risk-drift", { driftScore: 0.8 }),
      makeEpisode("risk-verification", {
        steps: [makeStep({ verification: { passed: false, checks: [] } })],
      }),
    ];

    const split = buildAdversarialSplit(episodes, { targetRatio: 0.4 });
    const adversarialIds = new Set(split.adversarial.map((ep) => ep.id));

    expect(split.adversarial.length).toBeGreaterThanOrEqual(2);
    expect(adversarialIds.has("risk-anomaly")).toBe(true);
    expect(adversarialIds.has("risk-drift")).toBe(true);
  });

  it("uses reward threshold to classify weak examples", () => {
    const episodes = [
      makeEpisode("high"),
      makeEpisode("weak", {
        steps: [makeStep({ reward: { total: 0.1, breakdown: {}, dimensions: [], computedAt: Date.now() } })],
      }),
      makeEpisode("other"),
    ];
    const split = buildAdversarialSplit(episodes, {
      targetRatio: 0.34,
      minStepReward: 0.2,
    });

    expect(split.adversarial.map((ep) => ep.id)).toContain("weak");
  });
});
