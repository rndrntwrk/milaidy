/**
 * Tests for HyperparamTuner.
 */

import { describe, expect, it } from "vitest";
import { GridSearchTuner } from "./hyperparam-tuner.js";
import type { TrainingDataset } from "../types.js";

const dataset: TrainingDataset = {
  id: "ds1",
  label: "test",
  examples: [],
  createdAt: Date.now(),
};

describe("GridSearchTuner", () => {
  it("finds best params from grid search", async () => {
    const tuner = new GridSearchTuner();
    const result = await tuner.tune(
      { learningRate: [0.001, 0.01, 0.1], batchSize: [16, 32] },
      dataset,
      async (params) => {
        // Simulate: lr=0.01, batchSize=32 is best
        return params.learningRate === 0.01 && params.batchSize === 32 ? 0.95 : 0.5;
      },
    );
    expect(result.bestParams.learningRate).toBe(0.01);
    expect(result.bestParams.batchSize).toBe(32);
    expect(result.bestScore).toBe(0.95);
  });

  it("evaluates all combinations", async () => {
    const tuner = new GridSearchTuner();
    const result = await tuner.tune(
      { a: [1, 2], b: [3, 4], c: [5, 6] },
      dataset,
      async () => 0.5,
    );
    expect(result.trials).toHaveLength(8); // 2 * 2 * 2
  });

  it("handles empty param space", async () => {
    const tuner = new GridSearchTuner();
    const result = await tuner.tune({}, dataset, async () => 0.5);
    expect(result.trials).toHaveLength(1);
    expect(result.bestParams).toEqual({});
  });

  it("handles single parameter", async () => {
    const tuner = new GridSearchTuner();
    const result = await tuner.tune(
      { lr: [0.001, 0.01, 0.1] },
      dataset,
      async (params) => 1 - Math.abs(params.lr - 0.01),
    );
    expect(result.bestParams.lr).toBe(0.01);
    expect(result.trials).toHaveLength(3);
  });

  it("records trial durations", async () => {
    const tuner = new GridSearchTuner();
    const result = await tuner.tune(
      { x: [1, 2] },
      dataset,
      async () => 0.5,
    );
    expect(result.trials.every((t) => t.durationMs >= 0)).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
