/**
 * LongMemEval benchmark adapter.
 *
 * @module autonomy/benchmarks/longmemeval/adapter
 */

import type { DomainBenchmark } from "../../domains/types.js";
import type { BenchmarkSuite } from "../types.js";
import { LONGMEMEVAL_SCENARIOS } from "./scenarios.js";

/** LongMemEval memory benchmark — 88% threshold. */
export const LONGMEMEVAL_BENCHMARK: DomainBenchmark = {
  id: "longmemeval:memory-retention",
  description:
    "Long-term memory evaluation — fact retention, preference persistence, interference resistance",
  scenarios: LONGMEMEVAL_SCENARIOS,
  passThreshold: 0.88,
};

/** LongMemEval benchmark suite. */
export const LONGMEMEVAL_SUITE: BenchmarkSuite = {
  id: "longmemeval",
  name: "LongMemEval Memory Retention",
  description:
    "Evaluates long-term memory retention, retrieval accuracy, and resistance to memory interference",
  benchmarks: [LONGMEMEVAL_BENCHMARK],
};
