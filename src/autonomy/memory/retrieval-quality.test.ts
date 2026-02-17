import { describe, expect, it } from "vitest";
import {
  buildBaselineRetrievalQualityTasks,
  computeRecallAtN,
  evaluateRetrievalQuality,
} from "./retrieval-quality.js";

describe("computeRecallAtN", () => {
  it("computes recall over relevant set for top-N ids", () => {
    const recall = computeRecallAtN(
      ["a", "b", "c"],
      ["b", "d"],
      2,
    );
    expect(recall).toBe(0.5);
  });

  it("returns 1.0 when no relevant ids are defined", () => {
    expect(computeRecallAtN(["a"], [], 1)).toBe(1);
  });
});

describe("evaluateRetrievalQuality", () => {
  it("beats similarity-only baseline on built-in retrieval tasks", async () => {
    const tasks = buildBaselineRetrievalQualityTasks(Date.now());
    const summary = await evaluateRetrievalQuality(tasks, { topN: 2 });

    expect(summary.taskCount).toBe(2);
    expect(summary.averageRecallAtN).toBeGreaterThan(0.9);
    expect(summary.baselineAverageRecallAtN).toBeLessThan(0.5);
    expect(summary.deltaFromBaseline).toBeGreaterThan(0.5);
    for (const task of summary.taskResults) {
      expect(task.recallAtN).toBeGreaterThanOrEqual(task.baselineRecallAtN);
    }
  });
});
