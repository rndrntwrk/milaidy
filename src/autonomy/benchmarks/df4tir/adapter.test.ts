/**
 * Tests for DF4TIR benchmark adapter.
 */

import { describe, expect, it } from "vitest";

import { createFixedScoreEvaluator, runBenchmark, runBenchmarkSuite } from "../runner.js";
import { DF4TIR_BENCHMARK, DF4TIR_SUITE } from "./adapter.js";
import { DF4TIR_SCENARIOS } from "./scenarios.js";

describe("DF4TIR benchmark", () => {
  it("has 4 scenarios", () => {
    expect(DF4TIR_SCENARIOS).toHaveLength(4);
  });

  it("all scenarios have unique IDs", () => {
    const ids = DF4TIR_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("benchmark threshold is 0.85", () => {
    expect(DF4TIR_BENCHMARK.passThreshold).toBe(0.85);
  });

  it("passes with high scores", async () => {
    const result = await runBenchmark(DF4TIR_BENCHMARK, createFixedScoreEvaluator(0.9));
    expect(result.passed).toBe(true);
  });

  it("fails with low scores", async () => {
    const result = await runBenchmark(DF4TIR_BENCHMARK, createFixedScoreEvaluator(0.5));
    expect(result.passed).toBe(false);
  });

  it("suite produces a report", async () => {
    const report = await runBenchmarkSuite(DF4TIR_SUITE, createFixedScoreEvaluator(1.0));
    expect(report.suiteId).toBe("df4tir");
    expect(report.totalScenarios).toBe(4);
  });
});
