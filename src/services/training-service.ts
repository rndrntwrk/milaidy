/**
 * Training service bridge.
 *
 * This branch may run without the optional external plugin-training source tree,
 * so we expose the same public surface backed by the local fallback service.
 */

import type { AgentRuntime } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import { FallbackTrainingService } from "./fallback-training-service";

export type TrainingEventKind = string;

export type TrainingTrajectorySummary = Record<string, unknown>;
export type TrainingTrajectoryDetail = Record<string, unknown>;
export type TrainingTrajectoryList = {
  available: boolean;
  reason?: string;
  trajectories: TrainingTrajectorySummary[];
  total: number;
  limit: number;
  offset: number;
};

export type TrajectoryQueryOptions = {
  limit?: number;
  offset?: number;
};

export type TrainingDatasetRecord = Record<string, unknown>;
export type DatasetBuildOptions = {
  limit?: number;
  minLlmCallsPerTrajectory?: number;
};

export type TrainingJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TrainingJobRecord = Record<string, unknown>;
export type StartTrainingOptions = {
  datasetId?: string;
  maxTrajectories?: number;
  backend?: "mlx" | "cuda" | "cpu";
  model?: string;
  iterations?: number;
  batchSize?: number;
  learningRate?: number;
};

export type TrainingModelRecord = Record<string, unknown>;
export type ActivateModelResult = Record<string, unknown>;
export type TrainingStreamEvent = Record<string, unknown>;

export type ServiceOptions = {
  getRuntime: () => AgentRuntime | null;
  getConfig: () => MiladyConfig;
  setConfig: (nextConfig: MiladyConfig) => void;
};

export class TrainingService extends FallbackTrainingService {
  constructor(options: ServiceOptions) {
    super(options);
  }
}
