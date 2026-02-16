/**
 * Tests for PrefEval benchmark adapter.
 */

import { describe, expect, it } from "vitest";

import { createFixedScoreEvaluator, runBenchmark, runBenchmarkSuite } from "../runner.js";
import { PREFEVAL_BENCHMARK, PREFEVAL_SUITE } from "./adapter.js";
import { PREFEVAL_SCENARIOS } from "./scenarios.js";

describe("PrefEval benchmark", () => {
  it("has 5 scenarios", () => {
    expect(PREFEVAL_SCENARIOS).toHaveLength(5);
  });

  it("all scenarios have unique IDs", () => {
    const ids = PREFEVAL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("benchmark threshold is 0.92 (SOW target)", () => {
    expect(PREFEVAL_BENCHMARK.passThreshold).toBe(0.92);
  });

  it("passes with high scores", async () => {
    const result = await runBenchmark(PREFEVAL_BENCHMARK, createFixedScoreEvaluator(0.95));
    expect(result.passed).toBe(true);
  });

  it("fails with low scores", async () => {
    const result = await runBenchmark(PREFEVAL_BENCHMARK, createFixedScoreEvaluator(0.5));
    expect(result.passed).toBe(false);
  });

  it("suite produces a report", async () => {
    const report = await runBenchmarkSuite(PREFEVAL_SUITE, createFixedScoreEvaluator(1.0));
    expect(report.suiteId).toBe("prefeval");
    expect(report.totalScenarios).toBe(5);
  });
});
