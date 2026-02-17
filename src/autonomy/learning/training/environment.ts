/**
 * Reproducible training environment configuration and manifest helpers.
 *
 * @module autonomy/learning/training/environment
 */

import { createHash } from "node:crypto";
import type { HyperparamSpace } from "./hyperparam-tuner.js";
import type { RLVRConfig } from "./rlvr-loop.js";

export const DEFAULT_RLVR_CONFIG: Required<RLVRConfig> = {
  learningRate: 1e-5,
  batchSize: 32,
  maxEpochs: 3,
  klPenalty: 0.1,
  minRewardThreshold: 0,
};

export const DEFAULT_HYPERPARAM_SPACE: HyperparamSpace = {
  learningRate: [5e-6, 1e-5, 2e-5],
  batchSize: [16, 32],
  klPenalty: [0.05, 0.1, 0.2],
};

export interface TrainingEnvironmentConfig {
  id: string;
  datasetFile: string;
  outputDir: string;
  seed: string;
  runtime: {
    node: string;
    platform: string;
    arch: string;
  };
  rlvr: Required<RLVRConfig>;
  hyperparameterSpace: HyperparamSpace;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface BuildTrainingEnvironmentInput {
  id: string;
  datasetFile: string;
  outputDir: string;
  seed?: string;
  rlvr?: RLVRConfig;
  hyperparameterSpace?: HyperparamSpace;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

function mergeRlvrConfig(overrides?: RLVRConfig): Required<RLVRConfig> {
  return {
    learningRate: overrides?.learningRate ?? DEFAULT_RLVR_CONFIG.learningRate,
    batchSize: overrides?.batchSize ?? DEFAULT_RLVR_CONFIG.batchSize,
    maxEpochs: overrides?.maxEpochs ?? DEFAULT_RLVR_CONFIG.maxEpochs,
    klPenalty: overrides?.klPenalty ?? DEFAULT_RLVR_CONFIG.klPenalty,
    minRewardThreshold:
      overrides?.minRewardThreshold ?? DEFAULT_RLVR_CONFIG.minRewardThreshold,
  };
}

function normalizeHyperparameterSpace(
  overrides?: HyperparamSpace,
): HyperparamSpace {
  if (!overrides) return { ...DEFAULT_HYPERPARAM_SPACE };
  return {
    ...DEFAULT_HYPERPARAM_SPACE,
    ...overrides,
  };
}

export function createTrainingEnvironmentConfig(
  input: BuildTrainingEnvironmentInput,
): TrainingEnvironmentConfig {
  return {
    id: input.id,
    datasetFile: input.datasetFile,
    outputDir: input.outputDir,
    seed: input.seed ?? "training-default-seed",
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    },
    rlvr: mergeRlvrConfig(input.rlvr),
    hyperparameterSpace: normalizeHyperparameterSpace(input.hyperparameterSpace),
    createdAt: input.createdAt ?? Date.now(),
    metadata: input.metadata,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeTrainingEnvironmentFingerprint(
  config: TrainingEnvironmentConfig,
): string {
  return createHash("sha256")
    .update(
      stableStringify({
        id: config.id,
        datasetFile: config.datasetFile,
        outputDir: config.outputDir,
        seed: config.seed,
        runtime: config.runtime,
        rlvr: config.rlvr,
        hyperparameterSpace: config.hyperparameterSpace,
      }),
    )
    .digest("hex");
}

export function buildTrainingEnvironmentManifest(input: {
  environment: TrainingEnvironmentConfig;
  fingerprint?: string;
  job?: Record<string, unknown>;
}): Record<string, unknown> {
  const fingerprint =
    input.fingerprint ??
    computeTrainingEnvironmentFingerprint(input.environment);
  return {
    generatedAt: new Date().toISOString(),
    environment: input.environment,
    fingerprint,
    ...(input.job ? { job: input.job } : {}),
  };
}
