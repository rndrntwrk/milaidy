/**
 * Training job orchestration for hyperparameter tuning + RLVR execution.
 *
 * @module autonomy/learning/training/job-orchestrator
 */

import { createHash } from "node:crypto";
import type { RLVRTrainingDataset } from "./dataset.js";
import {
  computeTrainingEnvironmentFingerprint,
  type TrainingEnvironmentConfig,
} from "./environment.js";
import { GridSearchTuner, type TuningResult } from "./hyperparam-tuner.js";
import {
  StubRLVRLoop,
  type RLVRConfig,
  type RLVRLoop,
  type TrainingResult,
} from "./rlvr-loop.js";

export interface TrainingJobResult {
  jobId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  environmentFingerprint: string;
  bestParams: Record<string, number>;
  finalConfig: Required<RLVRConfig>;
  tuning: TuningResult;
  training: TrainingResult;
  evaluation: {
    averageReward: number;
    scores: number[];
  };
}

function toRequiredConfig(input: RLVRConfig): Required<RLVRConfig> {
  return {
    learningRate: input.learningRate ?? 1e-5,
    batchSize: input.batchSize ?? 32,
    maxEpochs: input.maxEpochs ?? 3,
    klPenalty: input.klPenalty ?? 0.1,
    minRewardThreshold: input.minRewardThreshold ?? 0,
  };
}

function makeJobId(fingerprint: string, startedAt: number): string {
  return `train-${createHash("sha256")
    .update(`${fingerprint}:${startedAt}`)
    .digest("hex")
    .slice(0, 12)}`;
}

export class TrainingJobOrchestrator {
  private readonly loop: RLVRLoop;
  private readonly tuner: GridSearchTuner;

  constructor(loop?: RLVRLoop, tuner?: GridSearchTuner) {
    this.loop = loop ?? new StubRLVRLoop();
    this.tuner = tuner ?? new GridSearchTuner();
  }

  async run(input: {
    dataset: RLVRTrainingDataset;
    environment: TrainingEnvironmentConfig;
  }): Promise<TrainingJobResult> {
    if (input.dataset.examples.length === 0) {
      throw new Error("Training dataset is empty");
    }

    const startedAt = Date.now();
    const fingerprint = computeTrainingEnvironmentFingerprint(input.environment);

    const tuning = await this.tuner.tune(
      input.environment.hyperparameterSpace,
      input.dataset,
      async (params, dataset) => {
        const candidateConfig = {
          ...input.environment.rlvr,
          ...params,
        } satisfies RLVRConfig;
        const trainResult = await this.loop.train(dataset, candidateConfig);
        if (!trainResult.success) return 0;
        const meanKl =
          trainResult.epochMetrics.length === 0
            ? 0
            : trainResult.epochMetrics.reduce(
                (sum, metric) => sum + metric.klDivergence,
                0,
              ) / trainResult.epochMetrics.length;
        const score = trainResult.finalAverageReward - meanKl * 0.1;
        return Math.max(0, Math.min(1, score));
      },
    );

    const finalConfig = toRequiredConfig({
      ...input.environment.rlvr,
      ...tuning.bestParams,
    });
    const training = await this.loop.train(input.dataset, finalConfig);
    const evaluation = await this.loop.evaluate(input.dataset);

    const completedAt = Date.now();

    return {
      jobId: makeJobId(fingerprint, startedAt),
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      environmentFingerprint: fingerprint,
      bestParams: tuning.bestParams,
      finalConfig,
      tuning,
      training,
      evaluation,
    };
  }
}
