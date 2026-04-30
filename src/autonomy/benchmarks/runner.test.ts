/**
 * Tests for benchmark runner.
 */

import { describe, expect, it } from "vitest";

import type { DomainBenchmark } from "../domains/types.js";
import type { EvaluationScenario } from "../metrics/types.js";
import {
  createFixedScoreEvaluator,
  createMappedEvaluator,
  runBenchmark,
  runBenchmarkSuite,
} from "./runner.js";
import type { BenchmarkSuite } from "./types.js";

// ---------- Helpers ----------

function makeScenario(id: string, metric = "instructionCompletionRate"): EvaluationScenario {
  return {
    id,
    metric: metric as EvaluationScenario["metric"],
    description: `Test scenario ${id}`,
    prompts: ["test prompt"],
    expectedBehavior: "expected",
    turns: 1,
  };
}

function makeBenchmark(
  id: string,
  scenarios: EvaluationScenario[],
  threshold = 0.9,
): DomainBenchmark {
  return { id, description: `Benchmark ${id}`, scenarios, passThreshold: threshold };
}

function makeSuite(benchmarks: DomainBenchmark[]): BenchmarkSuite {
  return {
    id: "test-suite",
    name: "Test Suite",
    description: "A test suite",
    benchmarks,
  };
}

// ---------- Tests ----------

describe("runBenchmark", () => {
  it("passes when all scores meet threshold", async () => {
    const benchmark = makeBenchmark("b1", [makeScenario("s1"), makeScenario("s2")], 0.8);
    const evaluator = createFixedScoreEvaluator(0.9);

    const result = await runBenchmark(benchmark, evaluator);

    expect(result.passed).toBe(true);
    expect(result.averageScore).toBe(0.9);
    expect(result.scenarios).toHaveLength(2);
    expect(result.benchmarkId).toBe("b1");
  });

  it("fails when average score is below threshold", async () => {
    const benchmark = makeBenchmark("b1", [makeScenario("s1"), makeScenario("s2")], 0.9);
    const evaluator = createMappedEvaluator({ s1: 1.0, s2: 0.5 });

    const result = await runBenchmark(benchmark, evaluator);

    expect(result.passed).toBe(false);
    expect(result.averageScore).toBe(0.75);
  });

  it("handles empty scenario list", async () => {
    const benchmark = makeBenchmark("empty", [], 0.9);
    const evaluator = createFixedScoreEvaluator(1.0);

    const result = await runBenchmark(benchmark, evaluator);

    expect(result.passed).toBe(false);
    expect(result.averageScore).toBe(0);
    expect(result.scenarios).toHaveLength(0);
  });

  it("clamps scores to 0-1 range", async () => {
    const benchmark = makeBenchmark("b1", [makeScenario("s1")], 0.5);
    const evaluator = createFixedScoreEvaluator(1.5);

    const result = await runBenchmark(benchmark, evaluator);

    expect(result.scenarios[0].score).toBe(1);
  });

  it("records duration", async () => {
    const benchmark = makeBenchmark("b1", [makeScenario("s1")], 0.5);
    const evaluator = createFixedScoreEvaluator(1.0);

    const result = await runBenchmark(benchmark, evaluator);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.executedAt).toBeGreaterThan(0);
  });
});

describe("runBenchmarkSuite", () => {
  it("runs all benchmarks and computes pass rate", async () => {
    const suite = makeSuite([
      makeBenchmark("pass", [makeScenario("s1")], 0.5),
      makeBenchmark("fail", [makeScenario("s2")], 0.99),
    ]);
    const evaluator = createFixedScoreEvaluator(0.8);

    const report = await runBenchmarkSuite(suite, evaluator);

    expect(report.totalBenchmarks).toBe(2);
    expect(report.totalScenarios).toBe(2);
    expect(report.passRate).toBe(0.5);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[1].passed).toBe(false);
  });

  it("reports 100% pass rate when all pass", async () => {
    const suite = makeSuite([
      makeBenchmark("b1", [makeScenario("s1")], 0.5),
      makeBenchmark("b2", [makeScenario("s2")], 0.5),
    ]);
    const evaluator = createFixedScoreEvaluator(1.0);

    const report = await runBenchmarkSuite(suite, evaluator);

    expect(report.passRate).toBe(1);
  });

  it("handles empty suite", async () => {
    const suite = makeSuite([]);
    const evaluator = createFixedScoreEvaluator(1.0);

    const report = await runBenchmarkSuite(suite, evaluator);

    expect(report.totalBenchmarks).toBe(0);
    expect(report.passRate).toBe(0);
  });
});

describe("createMappedEvaluator", () => {
  it("returns mapped scores for known scenarios", async () => {
    const evaluator = createMappedEvaluator({ s1: 0.8, s2: 0.6 });

    const r1 = await evaluator(makeScenario("s1"));
    const r2 = await evaluator(makeScenario("s2"));

    expect(r1.score).toBe(0.8);
    expect(r2.score).toBe(0.6);
  });

  it("returns 0 for unknown scenarios with a note", async () => {
    const evaluator = createMappedEvaluator({ s1: 0.8 });

    const r = await evaluator(makeScenario("unknown"));

    expect(r.score).toBe(0);
    expect(r.notes).toBe("no score mapping");
  });
});
