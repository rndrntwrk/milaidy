/**
 * Metrics module barrel exports.
 * @module autonomy/metrics
 */

export {
  type BaselineHarness,
  InMemoryBaselineHarness,
} from "./baseline-harness.js";

export type {
  KernelComponents,
  ScenarioEvaluator,
  ScenarioResult,
} from "./evaluator-types.js";

export { FileBaselineHarness } from "./file-harness.js";

export { KernelScenarioEvaluator } from "./kernel-evaluator.js";

export {
  BUILTIN_SCENARIOS,
  SCENARIOS_BY_METRIC,
} from "./scenarios.js";

export type {
  CanonicalMetricCode,
  CanonicalMetricDefinition,
} from "./canonical-metrics.js";
export {
  CANONICAL_AUTONOMY_METRICS,
  CANONICAL_METRIC_CODES,
  getCanonicalMetricDefinition,
} from "./canonical-metrics.js";

export type {
  BaselineMetrics,
  EvaluationScenario,
  MetricsDelta,
} from "./types.js";
export { SOW_TARGETS } from "./types.js";
