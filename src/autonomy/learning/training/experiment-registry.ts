/**
 * Experiment tracking and artifact registry for training runs.
 *
 * @module autonomy/learning/training/experiment-registry
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

export const ExperimentStatusSchema = z.enum([
  "running",
  "succeeded",
  "failed",
]);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;

export const ArtifactKindSchema = z.enum([
  "dataset",
  "model",
  "report",
  "manifest",
  "checkpoint",
  "metrics",
  "other",
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ExperimentArtifactSchema = z
  .object({
    id: z.string().min(1),
    kind: ArtifactKindSchema,
    path: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type ExperimentArtifact = z.infer<typeof ExperimentArtifactSchema>;

export const ExperimentRunSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    startedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative().optional(),
    status: ExperimentStatusSchema,
    configFingerprint: z.string().min(1),
    parameters: z.record(z.string(), z.number()),
    metrics: z.record(z.string(), z.number()),
    artifacts: z.array(ExperimentArtifactSchema),
    notes: z.string().optional(),
  })
  .strict();
export type ExperimentRun = z.infer<typeof ExperimentRunSchema>;

const ExperimentRegistryFileSchema = z
  .object({
    version: z.literal(1),
    runs: z.array(ExperimentRunSchema),
  })
  .strict();

export class InMemoryExperimentRegistry {
  private readonly runs = new Map<string, ExperimentRun>();

  createRun(input: {
    id: string;
    label: string;
    startedAt?: number;
    configFingerprint: string;
    parameters?: Record<string, number>;
    metrics?: Record<string, number>;
    notes?: string;
  }): ExperimentRun {
    if (this.runs.has(input.id)) {
      throw new Error(`Experiment run already exists: ${input.id}`);
    }
    const run = ExperimentRunSchema.parse({
      id: input.id,
      label: input.label,
      startedAt: input.startedAt ?? Date.now(),
      status: "running",
      configFingerprint: input.configFingerprint,
      parameters: input.parameters ?? {},
      metrics: input.metrics ?? {},
      artifacts: [],
      ...(input.notes ? { notes: input.notes } : {}),
    });
    this.runs.set(run.id, run);
    return run;
  }

  getRun(runId: string): ExperimentRun | undefined {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : undefined;
  }

  listRuns(): ExperimentRun[] {
    return [...this.runs.values()]
      .map((run) => structuredClone(run))
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  updateMetrics(runId: string, metrics: Record<string, number>): ExperimentRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Experiment run not found: ${runId}`);
    const updated = ExperimentRunSchema.parse({
      ...run,
      metrics: {
        ...run.metrics,
        ...metrics,
      },
    });
    this.runs.set(runId, updated);
    return structuredClone(updated);
  }

  addArtifact(
    runId: string,
    artifact: Omit<ExperimentArtifact, "createdAt"> & { createdAt?: number },
  ): ExperimentRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Experiment run not found: ${runId}`);
    const normalized = ExperimentArtifactSchema.parse({
      ...artifact,
      createdAt: artifact.createdAt ?? Date.now(),
    });
    const updated = ExperimentRunSchema.parse({
      ...run,
      artifacts: [...run.artifacts, normalized],
    });
    this.runs.set(runId, updated);
    return structuredClone(updated);
  }

  completeRun(
    runId: string,
    status: Exclude<ExperimentStatus, "running">,
    options: { completedAt?: number; notes?: string } = {},
  ): ExperimentRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Experiment run not found: ${runId}`);
    const updated = ExperimentRunSchema.parse({
      ...run,
      status,
      completedAt: options.completedAt ?? Date.now(),
      ...(options.notes ? { notes: options.notes } : {}),
    });
    this.runs.set(runId, updated);
    return structuredClone(updated);
  }

  bestRun(metric: string, direction: "higher" | "lower"): ExperimentRun | null {
    const runs = [...this.runs.values()].filter((run) =>
      Number.isFinite(run.metrics[metric]),
    );
    if (runs.length === 0) return null;
    runs.sort((a, b) =>
      direction === "higher"
        ? b.metrics[metric] - a.metrics[metric]
        : a.metrics[metric] - b.metrics[metric],
    );
    return structuredClone(runs[0]);
  }

  protected replaceRuns(runs: ExperimentRun[]): void {
    this.runs.clear();
    for (const run of runs) {
      this.runs.set(run.id, run);
    }
  }
}

export class FileExperimentRegistry extends InMemoryExperimentRegistry {
  private readonly filePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.loadFromDisk();
  }

  override createRun(input: {
    id: string;
    label: string;
    startedAt?: number;
    configFingerprint: string;
    parameters?: Record<string, number>;
    metrics?: Record<string, number>;
    notes?: string;
  }): ExperimentRun {
    const run = super.createRun(input);
    this.saveToDisk();
    return run;
  }

  override updateMetrics(
    runId: string,
    metrics: Record<string, number>,
  ): ExperimentRun {
    const run = super.updateMetrics(runId, metrics);
    this.saveToDisk();
    return run;
  }

  override addArtifact(
    runId: string,
    artifact: Omit<ExperimentArtifact, "createdAt"> & { createdAt?: number },
  ): ExperimentRun {
    const run = super.addArtifact(runId, artifact);
    this.saveToDisk();
    return run;
  }

  override completeRun(
    runId: string,
    status: Exclude<ExperimentStatus, "running">,
    options: { completedAt?: number; notes?: string } = {},
  ): ExperimentRun {
    const run = super.completeRun(runId, status, options);
    this.saveToDisk();
    return run;
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return;
    const parsed = ExperimentRegistryFileSchema.parse(JSON.parse(raw));
    this.replaceRuns(parsed.runs);
  }

  private saveToDisk(): void {
    const payload = {
      version: 1 as const,
      runs: this.listRuns().sort((a, b) => a.startedAt - b.startedAt),
    };
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}
