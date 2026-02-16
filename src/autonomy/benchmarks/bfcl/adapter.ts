/**
 * BFCL benchmark adapter.
 *
 * Maps BFCL evaluation scenarios into the benchmark runner framework
 * using the autonomy kernel's tool contracts for function-calling accuracy.
 *
 * @module autonomy/benchmarks/bfcl/adapter
 */

import type { DomainBenchmark } from "../../domains/types.js";
import type { BenchmarkSuite } from "../types.js";
import { BFCL_SCENARIOS } from "./scenarios.js";

/** BFCL function-calling accuracy benchmark — 90% threshold. */
export const BFCL_BENCHMARK: DomainBenchmark = {
  id: "bfcl:function-calling",
  description:
    "Berkeley Function Calling Leaderboard — tool selection, parameter extraction, and schema compliance",
  scenarios: BFCL_SCENARIOS,
  passThreshold: 0.9,
};

/** BFCL benchmark suite. */
export const BFCL_SUITE: BenchmarkSuite = {
  id: "bfcl",
  name: "BFCL Function Calling",
  description:
    "Evaluates tool-calling accuracy based on the Berkeley Function Calling Leaderboard methodology",
  benchmarks: [BFCL_BENCHMARK],
};
