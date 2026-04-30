/**
 * Model Selector — selects between model providers based on evaluation scores.
 *
 * @module autonomy/learning/model-selector
 */

import type { ModelProvider, TrainingDataset } from "./types.js";

/** Configuration for a candidate model. */
export interface ModelCandidate {
  /** Unique model identifier. */
  id: string;
  /** The model provider instance. */
  provider: ModelProvider;
  /** Optional metadata about the model. */
  metadata?: Record<string, unknown>;
}

/** Result of model evaluation. */
export interface ModelEvalResult {
  /** Model ID. */
  modelId: string;
  /** Overall score (0-1). */
  score: number;
  /** Per-metric scores. */
  metricScores: Record<string, number>;
  /** Evaluation duration in ms. */
  durationMs: number;
}

/** Model selection result. */
export interface SelectionResult {
  /** Selected model ID. */
  selectedModelId: string;
  /** Selected model provider. */
  provider: ModelProvider;
  /** All evaluation results. */
  evaluations: ModelEvalResult[];
}

/** Evaluation function type. */
export type ModelEvaluator = (
  provider: ModelProvider,
  dataset: TrainingDataset,
) => Promise<{ score: number; metricScores: Record<string, number> }>;

/**
 * Selects the best model provider from a set of candidates
 * by running evaluations on a held-out dataset.
 */
export class ModelSelector {
  private readonly candidates: ModelCandidate[] = [];

  /** Register a candidate model. */
  addCandidate(candidate: ModelCandidate): void {
    this.candidates.push(candidate);
  }

  /** Get all registered candidates. */
  getCandidates(): ModelCandidate[] {
    return [...this.candidates];
  }

  /**
   * Evaluate all candidates and select the best one.
   */
  async select(
    dataset: TrainingDataset,
    evaluator: ModelEvaluator,
  ): Promise<SelectionResult> {
    if (this.candidates.length === 0) {
      throw new Error("No model candidates registered");
    }

    const evaluations: ModelEvalResult[] = [];

    for (const candidate of this.candidates) {
      const start = Date.now();
      const { score, metricScores } = await evaluator(
        candidate.provider,
        dataset,
      );
      evaluations.push({
        modelId: candidate.id,
        score,
        metricScores,
        durationMs: Date.now() - start,
      });
    }

    evaluations.sort((a, b) => b.score - a.score);
    const bestId = evaluations[0].modelId;
    const bestCandidate = this.candidates.find((c) => c.id === bestId)!;

    return {
      selectedModelId: bestId,
      provider: bestCandidate.provider,
      evaluations,
    };
  }
}
