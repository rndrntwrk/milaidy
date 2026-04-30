/**
 * DF4TIR benchmark adapter.
 *
 * @module autonomy/benchmarks/df4tir/adapter
 */

import type { DomainBenchmark } from "../../domains/types.js";
import type { BenchmarkSuite } from "../types.js";
import { DF4TIR_SCENARIOS } from "./scenarios.js";

/** DF4TIR tool-integrated reasoning benchmark — 85% threshold. */
export const DF4TIR_BENCHMARK: DomainBenchmark = {
  id: "df4tir:tool-reasoning",
  description:
    "Dataset for Tool-Integrated Reasoning — multi-step chains, conditional branching, error recovery",
  scenarios: DF4TIR_SCENARIOS,
  passThreshold: 0.85,
};

/** DF4TIR benchmark suite. */
export const DF4TIR_SUITE: BenchmarkSuite = {
  id: "df4tir",
  name: "DF4TIR Tool-Integrated Reasoning",
  description:
    "Evaluates multi-step reasoning chains that require tool use at intermediate steps",
  benchmarks: [DF4TIR_BENCHMARK],
};
