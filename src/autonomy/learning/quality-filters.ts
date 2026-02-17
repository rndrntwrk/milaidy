/**
 * Quality filters for learning/training episodes and examples.
 *
 * Applies deterministic gating rules so only high-signal examples are kept
 * for downstream training datasets.
 *
 * @module autonomy/learning/quality-filters
 */

import type { Episode, TrainingExample } from "./types.js";

export interface QualityFilterConfig {
  minDescriptionLength: number;
  minStepReward: number;
  maxStepDurationMs: number;
  requireVerificationPass: boolean;
  maxEpisodeDriftScore: number;
  minEpisodeReward: number;
}

export interface QualityFilterDrop {
  episodeId: string;
  reasons: string[];
  droppedStepIds: string[];
}

export interface QualityFilterResult {
  accepted: Episode[];
  dropped: QualityFilterDrop[];
  summary: {
    inputEpisodes: number;
    acceptedEpisodes: number;
    droppedEpisodes: number;
    inputSteps: number;
    acceptedSteps: number;
    droppedSteps: number;
  };
}

export const DEFAULT_QUALITY_FILTER_CONFIG: QualityFilterConfig = {
  minDescriptionLength: 12,
  minStepReward: 0.2,
  maxStepDurationMs: 120_000,
  requireVerificationPass: true,
  maxEpisodeDriftScore: 0.6,
  minEpisodeReward: 0.2,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function shouldKeepStep(
  step: TrainingExample,
  config: QualityFilterConfig,
): { keep: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const reward = step.reward?.total;
  if (!isFiniteNumber(reward)) {
    reasons.push("non-finite step reward");
  } else if (reward < config.minStepReward) {
    reasons.push(
      `step reward ${reward.toFixed(3)} below floor ${config.minStepReward.toFixed(3)}`,
    );
  }

  const duration = step.output?.durationMs;
  if (!isFiniteNumber(duration) || duration < 0) {
    reasons.push("invalid step duration");
  } else if (duration > config.maxStepDurationMs) {
    reasons.push(
      `step duration ${duration}ms exceeds max ${config.maxStepDurationMs}ms`,
    );
  }

  if (config.requireVerificationPass && step.verification?.passed !== true) {
    reasons.push("verification did not pass");
  }

  return { keep: reasons.length === 0, reasons };
}

export function applyQualityFilters(
  episodes: Episode[],
  configOverrides: Partial<QualityFilterConfig> = {},
): QualityFilterResult {
  const config: QualityFilterConfig = {
    ...DEFAULT_QUALITY_FILTER_CONFIG,
    ...configOverrides,
  };

  const accepted: Episode[] = [];
  const dropped: QualityFilterDrop[] = [];
  let acceptedSteps = 0;
  let droppedSteps = 0;

  for (const episode of episodes) {
    const reasons: string[] = [];
    const droppedStepIds: string[] = [];
    const acceptedEpisodeSteps: TrainingExample[] = [];

    if ((episode.description ?? "").trim().length < config.minDescriptionLength) {
      reasons.push(
        `description shorter than ${config.minDescriptionLength} characters`,
      );
    }

    if (!isFiniteNumber(episode.totalReward?.total)) {
      reasons.push("non-finite episode reward");
    } else if (episode.totalReward.total < config.minEpisodeReward) {
      reasons.push(
        `episode reward ${episode.totalReward.total.toFixed(3)} below floor ${config.minEpisodeReward.toFixed(3)}`,
      );
    }

    if (!isFiniteNumber(episode.driftScore)) {
      reasons.push("non-finite drift score");
    } else if (episode.driftScore > config.maxEpisodeDriftScore) {
      reasons.push(
        `drift score ${episode.driftScore.toFixed(3)} above max ${config.maxEpisodeDriftScore.toFixed(3)}`,
      );
    }

    for (const step of episode.steps) {
      const stepGate = shouldKeepStep(step, config);
      if (stepGate.keep) {
        acceptedEpisodeSteps.push(step);
        acceptedSteps += 1;
      } else {
        droppedStepIds.push(step.id);
        droppedSteps += 1;
      }
    }

    if (acceptedEpisodeSteps.length === 0) {
      reasons.push("no high-quality steps remained after filtering");
    }

    if (reasons.length > 0) {
      dropped.push({
        episodeId: episode.id,
        reasons,
        droppedStepIds,
      });
      continue;
    }

    accepted.push({
      ...episode,
      steps: acceptedEpisodeSteps,
    });
  }

  const inputSteps = episodes.reduce((sum, episode) => sum + episode.steps.length, 0);
  return {
    accepted,
    dropped,
    summary: {
      inputEpisodes: episodes.length,
      acceptedEpisodes: accepted.length,
      droppedEpisodes: dropped.length,
      inputSteps,
      acceptedSteps,
      droppedSteps,
    },
  };
}
