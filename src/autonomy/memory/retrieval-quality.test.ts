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

    // 2 original baseline tasks + 10 corpus-grounded probes (WP-1)
    expect(summary.taskCount).toBeGreaterThanOrEqual(12);
    expect(summary.averageRecallAtN).toBeGreaterThan(0.8);
    expect(summary.baselineAverageRecallAtN).toBeLessThan(0.5);
    expect(summary.deltaFromBaseline).toBeGreaterThan(0.3);
    for (const task of summary.taskResults) {
      expect(task.recallAtN).toBeGreaterThanOrEqual(task.baselineRecallAtN);
    }
  });

  it("identity-specific probes individually achieve minimum recall", async () => {
    const tasks = buildBaselineRetrievalQualityTasks(Date.now());
    const summary = await evaluateRetrievalQuality(tasks, { topN: 2 });

    // WP-1 identity grounding probes must each individually pass.
    // These are the most critical probes — the core purpose of the SOW.
    const identityProbeIds = [
      "rq-003", // operator identity recognition
      "rq-004", // operator preference recall
      "rq-005", // cross-platform identity resolution
      "rq-010", // operator trust level grounding
      "rq-011", // identity confusion adversarial
    ];

    for (const probeId of identityProbeIds) {
      const result = summary.taskResults.find((t) => t.taskId === probeId);
      if (result) {
        expect(
          result.recallAtN,
          `Identity probe ${probeId} failed: recall=${result.recallAtN}`,
        ).toBeGreaterThanOrEqual(0.5);
      }
    }
  });
});
