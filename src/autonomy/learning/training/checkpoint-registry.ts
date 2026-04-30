/**
 * Model checkpoint registry with rollback-candidate selection.
 *
 * @module autonomy/learning/training/checkpoint-registry
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

export const ModelCheckpointSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    artifactPath: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    metrics: z.record(z.string(), z.number()),
    experimentRunId: z.string().min(1).optional(),
    parentCheckpointId: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();
export type ModelCheckpoint = z.infer<typeof ModelCheckpointSchema>;

export interface RollbackPlan {
  fromCheckpointId?: string;
  toCheckpointId: string;
  reason: string;
  createdAt: number;
  steps: string[];
}

const CheckpointRegistryFileSchema = z
  .object({
    version: z.literal(1),
    checkpoints: z.array(ModelCheckpointSchema),
  })
  .strict();

const DEFAULT_METRIC_DIRECTION: Record<string, "higher" | "lower"> = {
  finalAverageReward: "higher",
  evaluationAverageReward: "higher",
  personaDriftScore: "lower",
  sycophancyScore: "lower",
  compoundingErrorRate: "lower",
};

function scoreCandidateAgainstCurrent(input: {
  candidate: ModelCheckpoint;
  currentMetrics: Record<string, number>;
  directions: Record<string, "higher" | "lower">;
}): number {
  const keys = Object.keys(input.currentMetrics).filter((key) =>
    Number.isFinite(input.candidate.metrics[key]),
  );
  if (keys.length === 0) return Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const key of keys) {
    const direction = input.directions[key] ?? "higher";
    const current = input.currentMetrics[key];
    const candidate = input.candidate.metrics[key];
    sum += direction === "higher" ? candidate - current : current - candidate;
  }
  return sum / keys.length;
}

export class InMemoryCheckpointRegistry {
  private readonly checkpoints = new Map<string, ModelCheckpoint>();

  register(checkpoint: ModelCheckpoint): ModelCheckpoint {
    if (this.checkpoints.has(checkpoint.id)) {
      throw new Error(`Checkpoint already exists: ${checkpoint.id}`);
    }
    const parsed = ModelCheckpointSchema.parse(checkpoint);
    this.checkpoints.set(parsed.id, parsed);
    return structuredClone(parsed);
  }

  get(checkpointId: string): ModelCheckpoint | undefined {
    const checkpoint = this.checkpoints.get(checkpointId);
    return checkpoint ? structuredClone(checkpoint) : undefined;
  }

  list(): ModelCheckpoint[] {
    return [...this.checkpoints.values()]
      .map((checkpoint) => structuredClone(checkpoint))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  selectRollbackCandidate(input: {
    currentMetrics: Record<string, number>;
    excludeCheckpointIds?: string[];
    metricDirections?: Record<string, "higher" | "lower">;
  }): ModelCheckpoint | null {
    const excluded = new Set(input.excludeCheckpointIds ?? []);
    const directions = {
      ...DEFAULT_METRIC_DIRECTION,
      ...(input.metricDirections ?? {}),
    };

    const scored = this.list()
      .filter((checkpoint) => !excluded.has(checkpoint.id))
      .map((checkpoint) => ({
        checkpoint,
        score: scoreCandidateAgainstCurrent({
          candidate: checkpoint,
          currentMetrics: input.currentMetrics,
          directions,
        }),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score <= 0) return null;
    return best.checkpoint;
  }

  buildRollbackPlan(input: {
    fromCheckpointId?: string;
    toCheckpointId: string;
    reason: string;
    createdAt?: number;
  }): RollbackPlan {
    const target = this.get(input.toCheckpointId);
    if (!target) {
      throw new Error(`Rollback checkpoint not found: ${input.toCheckpointId}`);
    }
    return {
      fromCheckpointId: input.fromCheckpointId,
      toCheckpointId: target.id,
      reason: input.reason,
      createdAt: input.createdAt ?? Date.now(),
      steps: [
        `Freeze current rollout and isolate traffic for checkpoint ${target.id}.`,
        `Load checkpoint artifact from ${target.artifactPath}.`,
        "Run smoke verification on held-out scenarios before full restore.",
        "Switch active model pointer to rollback checkpoint and monitor metrics.",
      ],
    };
  }

  protected replace(checkpoints: ModelCheckpoint[]): void {
    this.checkpoints.clear();
    for (const checkpoint of checkpoints) {
      this.checkpoints.set(checkpoint.id, checkpoint);
    }
  }
}

export class FileCheckpointRegistry extends InMemoryCheckpointRegistry {
  private readonly filePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.loadFromDisk();
  }

  override register(checkpoint: ModelCheckpoint): ModelCheckpoint {
    const parsed = super.register(checkpoint);
    this.saveToDisk();
    return parsed;
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return;
    const parsed = CheckpointRegistryFileSchema.parse(JSON.parse(raw));
    this.replace(parsed.checkpoints);
  }

  private saveToDisk(): void {
    const payload = {
      version: 1 as const,
      checkpoints: this.list().sort((a, b) => a.createdAt - b.createdAt),
    };
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}
