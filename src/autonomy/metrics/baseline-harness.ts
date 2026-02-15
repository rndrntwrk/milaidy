/**
 * Baseline measurement harness for tracking agent performance
 * across the SOW's key metrics dimensions.
 *
 * @module autonomy/metrics/baseline-harness
 */

import { logger } from "@elizaos/core";
import { emit } from "../../events/event-bus.js";
import { metrics } from "../../telemetry/setup.js";
import type {
  BaselineMetrics,
  EvaluationScenario,
  MetricsDelta,
  SOW_TARGETS,
} from "./types.js";
import { SOW_TARGETS as TARGETS } from "./types.js";

/**
 * Interface for baseline measurement harness.
 */
export interface BaselineHarness {
  /** Run a structured evaluation suite and return metrics. */
  measure(agentId: string, scenarios: EvaluationScenario[]): Promise<BaselineMetrics>;
  /** Store a baseline snapshot for comparison. */
  snapshot(metrics: BaselineMetrics, label: string): Promise<void>;
  /** Compare current metrics against a stored baseline. */
  compare(current: BaselineMetrics, baselineLabel: string): Promise<MetricsDelta | null>;
  /** List all stored snapshot labels. */
  listSnapshots(): string[];
}

/**
 * In-memory baseline harness implementation.
 *
 * For production use, snapshots should be persisted to disk or database.
 * This implementation stores them in memory for development/testing.
 */
export class InMemoryBaselineHarness implements BaselineHarness {
  private snapshots = new Map<string, BaselineMetrics>();

  async measure(
    agentId: string,
    scenarios: EvaluationScenario[],
  ): Promise<BaselineMetrics> {
    const startTime = Date.now();

    // Group scenarios by metric
    const byMetric = new Map<string, EvaluationScenario[]>();
    for (const scenario of scenarios) {
      const existing = byMetric.get(scenario.metric) ?? [];
      existing.push(scenario);
      byMetric.set(scenario.metric, existing);
    }

    // Compute per-metric scores
    // In a full implementation, each scenario would be run against the agent
    // and scored. For now, we provide the measurement framework.
    const metricScores: Record<string, number[]> = {};

    for (const [metric, metricScenarios] of byMetric) {
      metricScores[metric] = [];
      for (const scenario of metricScenarios) {
        // Placeholder: actual evaluation would call the agent here
        // and score the response against expectedBehavior
        logger.debug(
          `[baseline] Evaluating scenario ${scenario.id} for metric ${metric}`,
        );
        // Score will be filled in by actual evaluation logic
        metricScores[metric].push(0);
      }
    }

    const avg = (arr: number[]): number =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const totalTurns = scenarios.reduce((sum, s) => sum + s.turns, 0);

    const result: BaselineMetrics = {
      preferenceFollowingAccuracy: avg(metricScores["preferenceFollowingAccuracy"] ?? []),
      instructionCompletionRate: avg(metricScores["instructionCompletionRate"] ?? []),
      personaDriftScore: avg(metricScores["personaDriftScore"] ?? []),
      memoryPoisoningResistance: avg(metricScores["memoryPoisoningResistance"] ?? []),
      compoundingErrorRate: avg(metricScores["compoundingErrorRate"] ?? []),
      sycophancyScore: avg(metricScores["sycophancyScore"] ?? []),
      turnCount: totalTurns,
      measuredAt: Date.now(),
    };

    // Record to telemetry
    const durationMs = Date.now() - startTime;
    metrics.histogram("autonomy.baseline.measurement_duration_ms", durationMs, { agentId });
    for (const [metric, value] of Object.entries(result)) {
      if (typeof value === "number" && metric !== "turnCount" && metric !== "measuredAt") {
        metrics.gauge(`autonomy.baseline.${metric}`, value, { agentId });
      }
    }

    logger.info(`[baseline] Measurement complete for agent ${agentId} (${durationMs}ms, ${totalTurns} turns)`);

    return result;
  }

  async snapshot(baselineMetrics: BaselineMetrics, label: string): Promise<void> {
    this.snapshots.set(label, { ...baselineMetrics, label });
    logger.info(`[baseline] Snapshot saved: "${label}"`);
  }

  async compare(
    current: BaselineMetrics,
    baselineLabel: string,
  ): Promise<MetricsDelta | null> {
    const baseline = this.snapshots.get(baselineLabel);
    if (!baseline) {
      logger.warn(`[baseline] No snapshot found with label "${baselineLabel}"`);
      return null;
    }

    const metricKeys = [
      "preferenceFollowingAccuracy",
      "instructionCompletionRate",
      "personaDriftScore",
      "memoryPoisoningResistance",
      "compoundingErrorRate",
      "sycophancyScore",
    ] as const;

    const deltas: MetricsDelta["deltas"] = metricKeys.map((metric) => {
      const baselineValue = baseline[metric];
      const currentValue = current[metric];
      const delta = currentValue - baselineValue;
      const target = TARGETS[metric];
      const improved =
        target.direction === "higher"
          ? delta > 0.001
          : delta < -0.001;
      const regressed =
        target.direction === "higher"
          ? delta < -0.001
          : delta > 0.001;
      const targetMet =
        target.direction === "higher"
          ? currentValue >= target.target
          : currentValue <= target.target;

      return {
        metric,
        baseline: baselineValue,
        current: currentValue,
        delta,
        direction: improved ? "improved" as const : regressed ? "regressed" as const : "unchanged" as const,
        targetMet,
      };
    });

    const improved = deltas.filter((d) => d.direction === "improved").length;
    const regressed = deltas.filter((d) => d.direction === "regressed").length;
    const overallImprovement = (improved - regressed) / deltas.length;

    return {
      baselineLabel,
      deltas,
      overallImprovement,
    };
  }

  listSnapshots(): string[] {
    return Array.from(this.snapshots.keys());
  }
}
