/**
 * Benchmark runner — executes benchmark suites and produces reports.
 *
 * The runner iterates over benchmarks in a suite, evaluates each
 * scenario using a pluggable evaluator, and aggregates results
 * into a structured report.
 *
 * @module autonomy/benchmarks/runner
 */

import type { DomainBenchmark } from "../domains/types.js";
import type { EvaluationScenario } from "../metrics/types.js";
import type {
  BenchmarkReport,
  BenchmarkResult,
  BenchmarkSuite,
  ScenarioEvaluator,
  ScenarioResult,
} from "./types.js";

// ---------- Runner ----------

/**
 * Run a single evaluation scenario.
 */
async function runScenario(
  scenario: EvaluationScenario,
  evaluator: ScenarioEvaluator,
  threshold: number,
): Promise<ScenarioResult> {
  const start = Date.now();
  const { score, notes } = await evaluator(scenario);
  const durationMs = Date.now() - start;

  return {
    scenarioId: scenario.id,
    metric: scenario.metric,
    score: Math.max(0, Math.min(1, score)),
    passed: score >= threshold,
    durationMs,
    notes,
  };
}

/**
 * Run a complete benchmark (all its scenarios).
 */
export async function runBenchmark(
  benchmark: DomainBenchmark,
  evaluator: ScenarioEvaluator,
): Promise<BenchmarkResult> {
  const start = Date.now();
  const scenarios: ScenarioResult[] = [];

  for (const scenario of benchmark.scenarios) {
    const result = await runScenario(scenario, evaluator, benchmark.passThreshold);
    scenarios.push(result);
  }

  const durationMs = Date.now() - start;
  const averageScore =
    scenarios.length > 0
      ? scenarios.reduce((sum, s) => sum + s.score, 0) / scenarios.length
      : 0;

  return {
    benchmarkId: benchmark.id,
    averageScore,
    passed: averageScore >= benchmark.passThreshold,
    threshold: benchmark.passThreshold,
    scenarios,
    durationMs,
    executedAt: Date.now(),
  };
}

/**
 * Run a full benchmark suite and produce a report.
 */
export async function runBenchmarkSuite(
  suite: BenchmarkSuite,
  evaluator: ScenarioEvaluator,
): Promise<BenchmarkReport> {
  const start = Date.now();
  const results: BenchmarkResult[] = [];

  for (const benchmark of suite.benchmarks) {
    const result = await runBenchmark(benchmark, evaluator);
    results.push(result);
  }

  const durationMs = Date.now() - start;
  const passedCount = results.filter((r) => r.passed).length;
  const totalScenarios = results.reduce((sum, r) => sum + r.scenarios.length, 0);

  return {
    suiteId: suite.id,
    suiteName: suite.name,
    results,
    passRate: results.length > 0 ? passedCount / results.length : 0,
    totalBenchmarks: results.length,
    totalScenarios,
    durationMs,
    generatedAt: Date.now(),
  };
}

/**
 * Create a passthrough evaluator that returns a fixed score.
 * Useful for testing and dry runs.
 */
export function createFixedScoreEvaluator(
  score: number,
): ScenarioEvaluator {
  return async () => ({ score });
}

/**
 * Create an evaluator from a score map (scenario ID → score).
 * Falls back to 0 for unknown scenarios.
 */
export function createMappedEvaluator(
  scores: Record<string, number>,
): ScenarioEvaluator {
  return async (scenario) => ({
    score: scores[scenario.id] ?? 0,
    notes: scores[scenario.id] === undefined ? "no score mapping" : undefined,
  });
}
