/**
 * Reward infrastructure — scalar reward signals from verification results.
 *
 * Extends boolean post-conditions into weighted scalar rewards and
 * provides aggregate reward computation for pipeline results and episodes.
 *
 * @module autonomy/learning/reward
 */

import type { OrchestratedResult } from "../roles/types.js";
import type { RewardDimension } from "../types.js";
import type { PostCondition, VerifierContext } from "../verification/types.js";
import type { PipelineResult } from "../workflow/types.js";
import type { RewardScore, RewardSignal } from "./types.js";

// ---------- Rewardable Post-Condition ----------

/**
 * Extends PostCondition with a scalar reward score and weight.
 */
export interface RewardablePostCondition extends PostCondition {
  /** Weight for this condition in aggregate (0-1). */
  weight: number;
  /** Which reward dimension this condition measures. */
  dimension: RewardDimension;
  /** Compute a scalar reward score. */
  score: (ctx: VerifierContext) => Promise<RewardScore>;
}

// ---------- Reward Aggregator ----------

/**
 * Composes multiple RewardablePostConditions into a single RewardSignal.
 */
export class RewardAggregator {
  private readonly conditions: RewardablePostCondition[];
  private readonly totalWeight: number;

  constructor(conditions: RewardablePostCondition[]) {
    this.conditions = conditions;
    this.totalWeight = conditions.reduce((sum, c) => sum + c.weight, 0);
  }

  /**
   * Run all conditions and aggregate into a single RewardSignal.
   */
  async aggregate(ctx: VerifierContext): Promise<RewardSignal> {
    if (this.conditions.length === 0) {
      return {
        total: 0,
        breakdown: {},
        dimensions: [],
        computedAt: Date.now(),
      };
    }

    const breakdown: Record<string, number> = {};
    const dimensionSet = new Set<RewardDimension>();
    let weightedSum = 0;

    for (const condition of this.conditions) {
      try {
        const result = await condition.score(ctx);
        const normalizedWeight =
          this.totalWeight > 0 ? condition.weight / this.totalWeight : 0;
        weightedSum += result.reward * normalizedWeight;
        breakdown[condition.id] = result.reward;
        dimensionSet.add(condition.dimension);
      } catch {
        // Failed conditions contribute 0 reward
        breakdown[condition.id] = 0;
        dimensionSet.add(condition.dimension);
      }
    }

    return {
      total: Math.max(0, Math.min(1, weightedSum)),
      breakdown,
      dimensions: Array.from(dimensionSet),
      computedAt: Date.now(),
    };
  }
}

// ---------- Checkpoint Reward ----------

/** Default reward weights for pipeline result dimensions. */
export interface CheckpointRewardWeights {
  validation: number;
  verification: number;
  efficiency: number;
  completion: number;
}

const DEFAULT_WEIGHTS: CheckpointRewardWeights = {
  validation: 0.2,
  verification: 0.3,
  efficiency: 0.1,
  completion: 0.4,
};

/**
 * Computes a RewardSignal from a PipelineResult.
 *
 * Maps pipeline outcome dimensions:
 * - validation.valid → safety
 * - verification.hasCriticalFailure → task_completion
 * - durationMs → efficiency (normalized against a target)
 * - success → task_completion
 */
export class CheckpointReward {
  private readonly weights: CheckpointRewardWeights;
  private readonly targetDurationMs: number;

  constructor(
    weights?: Partial<CheckpointRewardWeights>,
    targetDurationMs = 5000,
  ) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
    this.targetDurationMs = targetDurationMs;
  }

  compute(result: PipelineResult): RewardSignal {
    const breakdown: Record<string, number> = {};
    const dimensions: RewardDimension[] = [];

    // Validation dimension → safety
    const validationReward = result.validation.valid ? 1.0 : 0.0;
    breakdown["validation"] = validationReward;
    dimensions.push("safety");

    // Verification dimension → task_completion
    let verificationReward = 1.0;
    if (result.verification) {
      verificationReward = result.verification.hasCriticalFailure ? 0.0 : 1.0;
    }
    breakdown["verification"] = verificationReward;
    dimensions.push("task_completion");

    // Efficiency dimension (inverse of duration ratio, clamped 0-1)
    const durationRatio = result.durationMs / this.targetDurationMs;
    const efficiencyReward = Math.max(
      0,
      Math.min(1, 1 - (durationRatio - 1) * 0.5),
    );
    breakdown["efficiency"] = efficiencyReward;
    dimensions.push("efficiency");

    // Completion dimension → task_completion
    const completionReward = result.success ? 1.0 : 0.0;
    breakdown["completion"] = completionReward;

    // Weighted total
    const totalWeight =
      this.weights.validation +
      this.weights.verification +
      this.weights.efficiency +
      this.weights.completion;

    const total =
      totalWeight > 0
        ? (validationReward * this.weights.validation +
            verificationReward * this.weights.verification +
            efficiencyReward * this.weights.efficiency +
            completionReward * this.weights.completion) /
          totalWeight
        : 0;

    return {
      total: Math.max(0, Math.min(1, total)),
      breakdown,
      dimensions: [...new Set(dimensions)],
      computedAt: Date.now(),
    };
  }
}

// ---------- Episode Reward ----------

/** Weights for episode-level reward computation. */
export interface EpisodeRewardWeights {
  stepReward: number;
  driftPenalty: number;
  anomalyPenalty: number;
  successBonus: number;
}

const DEFAULT_EPISODE_WEIGHTS: EpisodeRewardWeights = {
  stepReward: 0.5,
  driftPenalty: 0.2,
  anomalyPenalty: 0.1,
  successBonus: 0.2,
};

/**
 * Computes a RewardSignal from a full OrchestratedResult.
 *
 * Aggregates per-step rewards, applies drift and anomaly penalties,
 * and adds a success bonus.
 */
export class EpisodeReward {
  private readonly weights: EpisodeRewardWeights;
  private readonly checkpointReward: CheckpointReward;

  constructor(
    checkpointReward: CheckpointReward,
    weights?: Partial<EpisodeRewardWeights>,
  ) {
    this.checkpointReward = checkpointReward;
    this.weights = { ...DEFAULT_EPISODE_WEIGHTS, ...weights };
  }

  compute(result: OrchestratedResult): RewardSignal {
    const breakdown: Record<string, number> = {};
    const dimensions: RewardDimension[] = [
      "task_completion",
      "safety",
      "preference_alignment",
      "efficiency",
    ];

    // Mean step reward
    let meanStepReward = 0;
    if (result.executions.length > 0) {
      const stepRewards = result.executions.map(
        (ex) => this.checkpointReward.compute(ex).total,
      );
      meanStepReward =
        stepRewards.reduce((a, b) => a + b, 0) / stepRewards.length;
    }
    breakdown["step_reward"] = meanStepReward;

    // Drift penalty (based on audit report drift score)
    const driftScore = result.auditReport?.driftReport?.driftScore ?? 0;
    const driftPenalty = Math.min(1, driftScore * 2); // 0.5 drift → full penalty
    breakdown["drift_penalty"] = 1 - driftPenalty;

    // Anomaly penalty
    const anomalyCount = result.auditReport?.anomalies?.length ?? 0;
    const anomalyPenalty = Math.min(1, anomalyCount * 0.25); // 4 anomalies → full penalty
    breakdown["anomaly_penalty"] = 1 - anomalyPenalty;

    // Success bonus
    const successBonus = result.success ? 1.0 : 0.0;
    breakdown["success_bonus"] = successBonus;

    // Weighted total
    const totalWeight =
      this.weights.stepReward +
      this.weights.driftPenalty +
      this.weights.anomalyPenalty +
      this.weights.successBonus;

    const total =
      totalWeight > 0
        ? (meanStepReward * this.weights.stepReward +
            (1 - driftPenalty) * this.weights.driftPenalty +
            (1 - anomalyPenalty) * this.weights.anomalyPenalty +
            successBonus * this.weights.successBonus) /
          totalWeight
        : 0;

    return {
      total: Math.max(0, Math.min(1, total)),
      breakdown,
      dimensions,
      computedAt: Date.now(),
    };
  }
}
