/**
 * Benchmark framework types.
 *
 * Defines the shape of benchmark suites, results, and reports
 * for the autonomy kernel evaluation system.
 *
 * @module autonomy/benchmarks/types
 */

import type { DomainBenchmark } from "../domains/types.js";
import type { BaselineMetrics, EvaluationScenario } from "../metrics/types.js";

// ---------- Scenario Evaluation ----------

/** Result of running a single evaluation scenario. */
export interface ScenarioResult {
  scenarioId: string;
  metric: string;
  /** Score for this scenario (0-1). */
  score: number;
  /** Whether this scenario passed its threshold. */
  passed: boolean;
  /** Duration in ms. */
  durationMs: number;
  /** Optional notes or error messages. */
  notes?: string;
}

// ---------- Benchmark Results ----------

/** Result of running a complete benchmark. */
export interface BenchmarkResult {
  benchmarkId: string;
  /** Average score across all scenarios (0-1). */
  averageScore: number;
  /** Whether the benchmark passed its threshold. */
  passed: boolean;
  /** Pass threshold that was applied. */
  threshold: number;
  /** Per-scenario results. */
  scenarios: ScenarioResult[];
  /** Total duration in ms. */
  durationMs: number;
  /** Timestamp of execution. */
  executedAt: number;
}

// ---------- Benchmark Suite ----------

/** A named collection of benchmarks to run together. */
export interface BenchmarkSuite {
  id: string;
  name: string;
  description: string;
  /** Benchmarks in this suite. */
  benchmarks: DomainBenchmark[];
}

// ---------- Reports ----------

/** Full report from a benchmark suite run. */
export interface BenchmarkReport {
  suiteId: string;
  suiteName: string;
  /** Per-benchmark results. */
  results: BenchmarkResult[];
  /** Overall pass rate (fraction of benchmarks that passed). */
  passRate: number;
  /** Total benchmarks run. */
  totalBenchmarks: number;
  /** Total scenarios run. */
  totalScenarios: number;
  /** Total duration in ms. */
  durationMs: number;
  /** Timestamp of report generation. */
  generatedAt: number;
}

// ---------- Scenario Evaluator ----------

/**
 * Function that evaluates a single scenario and returns a score.
 *
 * Implementations may use rule-based checks, LLM grading, or
 * live execution against the autonomy kernel.
 */
export type ScenarioEvaluator = (
  scenario: EvaluationScenario,
) => Promise<{ score: number; notes?: string }>;
