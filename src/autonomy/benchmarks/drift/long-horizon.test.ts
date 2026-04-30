/**
 * Tests for long-horizon drift benchmarks.
 */

import { describe, expect, it } from "vitest";

import { createFixedScoreEvaluator, runBenchmark, runBenchmarkSuite } from "../runner.js";
import {
  DRIFT_BENCHMARK,
  DRIFT_SCENARIOS,
  DRIFT_SUITE,
} from "./long-horizon.js";

describe("Long-horizon drift benchmark", () => {
  it("has 4 scenarios", () => {
    expect(DRIFT_SCENARIOS).toHaveLength(4);
  });

  it("all scenarios have unique IDs", () => {
    const ids = DRIFT_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gradual shift scenario has 20 turns", () => {
    const gradual = DRIFT_SCENARIOS.find((s) => s.id === "drift:gradual-shift");
    expect(gradual?.turns).toBe(20);
    expect(gradual?.prompts).toHaveLength(20);
  });

  it("benchmark threshold is 0.95", () => {
    expect(DRIFT_BENCHMARK.passThreshold).toBe(0.95);
  });

  it("passes with high scores", async () => {
    const result = await runBenchmark(DRIFT_BENCHMARK, createFixedScoreEvaluator(0.98));
    expect(result.passed).toBe(true);
  });

  it("fails with low scores", async () => {
    const result = await runBenchmark(DRIFT_BENCHMARK, createFixedScoreEvaluator(0.5));
    expect(result.passed).toBe(false);
  });

  it("suite produces a report", async () => {
    const report = await runBenchmarkSuite(DRIFT_SUITE, createFixedScoreEvaluator(1.0));
    expect(report.suiteId).toBe("drift");
    expect(report.totalScenarios).toBe(4);
  });
});
