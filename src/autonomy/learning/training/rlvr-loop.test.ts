/**
 * Tests for RLVR training loop.
 */

import { describe, expect, it } from "vitest";
import { StubRLVRLoop, ExternalRLVRLoop } from "./rlvr-loop.js";
import type { TrainingDataset } from "../types.js";

const dataset: TrainingDataset = {
  id: "ds1",
  label: "test",
  examples: [
    { id: "e1", toolName: "t1", reward: 0.8, source: "autonomous" as const, scenarioId: "s1" },
    { id: "e2", toolName: "t2", reward: 0.6, source: "autonomous" as const, scenarioId: "s2" },
    { id: "e3", toolName: "t3", reward: 0.9, source: "autonomous" as const, scenarioId: "s3" },
  ],
  createdAt: Date.now(),
};

describe("StubRLVRLoop", () => {
  it("trains and returns improving metrics", async () => {
    const loop = new StubRLVRLoop();
    const result = await loop.train(dataset, { maxEpochs: 3 });
    expect(result.success).toBe(true);
    expect(result.epochsCompleted).toBe(3);
    expect(result.epochMetrics).toHaveLength(3);
    // Each epoch should show improvement
    expect(result.epochMetrics[2].averageReward).toBeGreaterThan(result.epochMetrics[0].averageReward);
  });

  it("fails when no examples above threshold", async () => {
    const loop = new StubRLVRLoop();
    const result = await loop.train(dataset, { minRewardThreshold: 0.99 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No training examples");
  });

  it("evaluates dataset without training", async () => {
    const loop = new StubRLVRLoop();
    const { averageReward, scores } = await loop.evaluate(dataset);
    expect(scores).toHaveLength(3);
    expect(averageReward).toBeCloseTo((0.8 + 0.6 + 0.9) / 3, 2);
  });

  it("handles empty dataset evaluation", async () => {
    const loop = new StubRLVRLoop();
    const { averageReward } = await loop.evaluate({ id: "empty", label: "empty", examples: [], createdAt: Date.now() });
    expect(averageReward).toBe(0);
  });

  it("respects maxEpochs config", async () => {
    const loop = new StubRLVRLoop();
    const result = await loop.train(dataset, { maxEpochs: 5 });
    expect(result.epochMetrics).toHaveLength(5);
  });
});

describe("ExternalRLVRLoop", () => {
  it("throws stub error on train", async () => {
    const loop = new ExternalRLVRLoop("http://localhost:8888");
    await expect(loop.train(dataset)).rejects.toThrow("stub");
  });

  it("throws stub error on evaluate", async () => {
    const loop = new ExternalRLVRLoop("http://localhost:8888");
    await expect(loop.evaluate(dataset)).rejects.toThrow("stub");
  });
});
