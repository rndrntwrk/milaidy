/**
 * Tests for BFCL benchmark adapter.
 */

import { describe, expect, it } from "vitest";

import { createFixedScoreEvaluator, runBenchmark, runBenchmarkSuite } from "../runner.js";
import { BFCL_BENCHMARK, BFCL_SUITE } from "./adapter.js";
import { BFCL_SCENARIOS } from "./scenarios.js";

describe("BFCL benchmark", () => {
  it("has 5 scenarios", () => {
    expect(BFCL_SCENARIOS).toHaveLength(5);
  });

  it("all scenarios have unique IDs", () => {
    const ids = BFCL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("benchmark threshold is 0.9", () => {
    expect(BFCL_BENCHMARK.passThreshold).toBe(0.9);
  });

  it("passes with high scores", async () => {
    const result = await runBenchmark(BFCL_BENCHMARK, createFixedScoreEvaluator(0.95));
    expect(result.passed).toBe(true);
  });

  it("fails with low scores", async () => {
    const result = await runBenchmark(BFCL_BENCHMARK, createFixedScoreEvaluator(0.5));
    expect(result.passed).toBe(false);
  });

  it("suite produces a report", async () => {
    const report = await runBenchmarkSuite(BFCL_SUITE, createFixedScoreEvaluator(1.0));
    expect(report.suiteId).toBe("bfcl");
    expect(report.totalBenchmarks).toBe(1);
    expect(report.totalScenarios).toBe(5);
  });
});
