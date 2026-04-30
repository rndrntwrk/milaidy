/**
 * Dataset split builders for Phase 4 learning pipelines.
 *
 * @module autonomy/learning/dataset-splits
 */

import { createHash } from "node:crypto";
import type { Episode } from "./types.js";

export interface HeldOutSplitOptions {
  holdoutRatio?: number;
  seed?: string;
  minValidationEpisodes?: number;
}

export interface HeldOutSplitResult {
  train: Episode[];
  validation: Episode[];
}

export interface AdversarialSplitOptions {
  targetRatio?: number;
  driftThreshold?: number;
  minStepReward?: number;
}

export interface AdversarialSplitResult {
  baseline: Episode[];
  adversarial: Episode[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stableEpisodeScore(id: string, seed: string): number {
  const hash = createHash("sha256")
    .update(`${seed}:${id}`)
    .digest("hex")
    .slice(0, 8);
  const asInt = parseInt(hash, 16);
  return asInt / 0xffffffff;
}

export function buildHeldOutValidationSplit(
  episodes: Episode[],
  options: HeldOutSplitOptions = {},
): HeldOutSplitResult {
  if (episodes.length === 0) {
    return { train: [], validation: [] };
  }

  const ratio = clamp(options.holdoutRatio ?? 0.2, 0.05, 0.5);
  const seed = options.seed ?? "phase4-heldout";
  const minValidationRequested = Math.max(0, options.minValidationEpisodes ?? 1);
  const maxValidation = Math.max(0, episodes.length - 1);
  const minValidation = Math.min(minValidationRequested, maxValidation);
  const byScore = [...episodes].sort((a, b) => {
    const delta =
      stableEpisodeScore(String(a.id), seed) -
      stableEpisodeScore(String(b.id), seed);
    if (delta !== 0) return delta;
    return String(a.id).localeCompare(String(b.id));
  });

  const targetCount = Math.round(episodes.length * ratio);
  const validationCount = clamp(targetCount, minValidation, maxValidation);
  return {
    validation: byScore.slice(0, validationCount),
    train: byScore.slice(validationCount),
  };
}

function adversarialRiskScore(
  episode: Episode,
  options: Required<Pick<AdversarialSplitOptions, "driftThreshold" | "minStepReward">>,
): number {
  let score = 0;

  if (episode.auditAnomalies.length > 0) {
    score += 2;
  }
  if (episode.driftScore >= options.driftThreshold) {
    score += 2;
  }

  const hasFailedVerification = episode.steps.some(
    (step) => step.verification.passed !== true,
  );
  if (hasFailedVerification) {
    score += 1;
  }

  const hasWeakReward = episode.steps.some(
    (step) => step.reward.total < options.minStepReward,
  );
  if (hasWeakReward) {
    score += 1;
  }

  if (episode.description.match(/\b(injection|override|jailbreak|poison)\b/i)) {
    score += 1;
  }

  return score;
}

export function buildAdversarialSplit(
  episodes: Episode[],
  options: AdversarialSplitOptions = {},
): AdversarialSplitResult {
  if (episodes.length === 0) {
    return { baseline: [], adversarial: [] };
  }

  const targetRatio = clamp(options.targetRatio ?? 0.2, 0.05, 0.8);
  const driftThreshold = clamp(options.driftThreshold ?? 0.35, 0, 1);
  const minStepReward = clamp(options.minStepReward ?? 0.25, 0, 1);

  const scored = episodes.map((episode) => ({
    episode,
    score: adversarialRiskScore(episode, { driftThreshold, minStepReward }),
  }));

  const targetCount = Math.max(1, Math.round(episodes.length * targetRatio));
  const sorted = [...scored].sort((a, b) => {
    const delta = b.score - a.score;
    if (delta !== 0) return delta;
    return String(a.episode.id).localeCompare(String(b.episode.id));
  });

  const selected = new Set<string>();
  for (const row of sorted) {
    if (row.score >= 2) {
      selected.add(String(row.episode.id));
    }
  }
  for (const row of sorted) {
    if (selected.size >= targetCount) break;
    selected.add(String(row.episode.id));
  }

  const adversarial: Episode[] = [];
  const baseline: Episode[] = [];
  for (const episode of episodes) {
    if (selected.has(String(episode.id))) {
      adversarial.push(episode);
    } else {
      baseline.push(episode);
    }
  }

  return { baseline, adversarial };
}
