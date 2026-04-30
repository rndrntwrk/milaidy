/**
 * Scenario evaluator types for the baseline measurement system.
 *
 * Defines the interface for pluggable evaluation strategies and
 * the kernel component references needed for evaluation.
 *
 * @module autonomy/metrics/evaluator-types
 */

import type { GoalManager } from "../goals/manager.js";
import type { PersonaDriftMonitor } from "../identity/drift-monitor.js";
import type { MemoryGate } from "../memory/gate.js";
import type { TrustScorer } from "../trust/scorer.js";
import type { EvaluationScenario } from "./types.js";

/**
 * Aggregated kernel component references needed for evaluation.
 */
export interface KernelComponents {
  trustScorer: TrustScorer;
  memoryGate: MemoryGate;
  driftMonitor: PersonaDriftMonitor;
  goalManager: GoalManager;
}

/**
 * Result of evaluating a single scenario.
 */
export interface ScenarioResult {
  /** ID of the scenario that was evaluated. */
  scenarioId: string;
  /** Which metric this result contributes to. */
  metric: string;
  /** Score from 0 to 1. */
  score: number;
  /** Optional human-readable details about the evaluation. */
  details?: string;
}

/**
 * Interface for evaluating scenarios against kernel components.
 *
 * Implementations exercise kernel components to produce measurable
 * scores without requiring LLM calls.
 */
export interface ScenarioEvaluator {
  evaluate(
    scenario: EvaluationScenario,
    components: KernelComponents,
  ): Promise<ScenarioResult>;
}
