/**
 * Hyperparameter Tuner — grid search and configuration optimization.
 *
 * @module autonomy/learning/training/hyperparam-tuner
 */

import type { TrainingDataset } from "../types.js";

/** A hyperparameter space definition. */
export interface HyperparamSpace {
  [key: string]: number[];
}

/** Result of a single hyperparameter configuration trial. */
export interface TrialResult {
  /** The hyperparameter configuration used. */
  params: Record<string, number>;
  /** The objective metric value. */
  score: number;
  /** Duration of this trial in ms. */
  durationMs: number;
}

/** Result of a tuning run. */
export interface TuningResult {
  /** Best configuration found. */
  bestParams: Record<string, number>;
  /** Best score achieved. */
  bestScore: number;
  /** All trial results. */
  trials: TrialResult[];
  /** Total duration in ms. */
  durationMs: number;
}

/** Objective function type. */
export type ObjectiveFunction = (
  params: Record<string, number>,
  dataset: TrainingDataset,
) => Promise<number>;

/**
 * Grid search hyperparameter tuner.
 *
 * Exhaustively evaluates all combinations in the parameter space.
 */
export class GridSearchTuner {
  /**
   * Run grid search over the parameter space.
   */
  async tune(
    space: HyperparamSpace,
    dataset: TrainingDataset,
    objective: ObjectiveFunction,
  ): Promise<TuningResult> {
    const start = Date.now();
    const combos = this.cartesianProduct(space);
    const trials: TrialResult[] = [];

    for (const params of combos) {
      const trialStart = Date.now();
      const score = await objective(params, dataset);
      trials.push({
        params,
        score,
        durationMs: Date.now() - trialStart,
      });
    }

    trials.sort((a, b) => b.score - a.score);

    return {
      bestParams: trials[0]?.params ?? {},
      bestScore: trials[0]?.score ?? 0,
      trials,
      durationMs: Date.now() - start,
    };
  }

  private cartesianProduct(space: HyperparamSpace): Array<Record<string, number>> {
    const keys = Object.keys(space);
    if (keys.length === 0) return [{}];

    const results: Array<Record<string, number>> = [];
    const values = keys.map((k) => space[k]);

    function recurse(depth: number, current: Record<string, number>): void {
      if (depth === keys.length) {
        results.push({ ...current });
        return;
      }
      for (const val of values[depth]) {
        current[keys[depth]] = val;
        recurse(depth + 1, current);
      }
    }

    recurse(0, {});
    return results;
  }
}
