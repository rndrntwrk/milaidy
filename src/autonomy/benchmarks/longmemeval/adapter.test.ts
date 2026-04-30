/**
 * Tests for LongMemEval benchmark adapter.
 */

import { describe, expect, it } from "vitest";

import { createFixedScoreEvaluator, runBenchmark, runBenchmarkSuite } from "../runner.js";
import { LONGMEMEVAL_BENCHMARK, LONGMEMEVAL_SUITE } from "./adapter.js";
import { LONGMEMEVAL_SCENARIOS } from "./scenarios.js";

describe("LongMemEval benchmark", () => {
  it("has 5 scenarios", () => {
    expect(LONGMEMEVAL_SCENARIOS).toHaveLength(5);
  });

  it("all scenarios have unique IDs", () => {
    const ids = LONGMEMEVAL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("benchmark threshold is 0.88", () => {
    expect(LONGMEMEVAL_BENCHMARK.passThreshold).toBe(0.88);
  });

  it("passes with high scores", async () => {
    const result = await runBenchmark(LONGMEMEVAL_BENCHMARK, createFixedScoreEvaluator(0.95));
    expect(result.passed).toBe(true);
  });

  it("fails with low scores", async () => {
    const result = await runBenchmark(LONGMEMEVAL_BENCHMARK, createFixedScoreEvaluator(0.5));
    expect(result.passed).toBe(false);
  });

  it("suite produces a report", async () => {
    const report = await runBenchmarkSuite(LONGMEMEVAL_SUITE, createFixedScoreEvaluator(1.0));
    expect(report.suiteId).toBe("longmemeval");
    expect(report.totalScenarios).toBe(5);
  });
});
