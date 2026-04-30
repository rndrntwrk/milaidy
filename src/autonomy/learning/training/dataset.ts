/**
 * Training dataset schema and adapters for RLVR pipelines.
 *
 * @module autonomy/learning/training/dataset
 */

import { z } from "zod";
import type { LearningTraceDataset } from "../dataset-schema.js";

export const RLVRTrainingExampleSchema = z
  .object({
    id: z.string().min(1),
    toolName: z.string().min(1),
    reward: z.number().min(0).max(1),
    source: z.string().min(1).optional(),
    scenarioId: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type RLVRTrainingExample = z.infer<typeof RLVRTrainingExampleSchema>;

export const RLVRTrainingDatasetSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    examples: z.array(RLVRTrainingExampleSchema),
    createdAt: z.number().int().nonnegative(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type RLVRTrainingDataset = z.infer<typeof RLVRTrainingDatasetSchema>;

export function parseRLVRTrainingDataset(value: unknown): RLVRTrainingDataset {
  return RLVRTrainingDatasetSchema.parse(value);
}

export function fromLearningTraceDataset(
  dataset: LearningTraceDataset,
): RLVRTrainingDataset {
  return parseRLVRTrainingDataset({
    id: dataset.id,
    label: dataset.label,
    createdAt: dataset.createdAt,
    examples: dataset.examples.map((example) => ({
      id: example.id,
      toolName: example.toolName,
      reward: example.reward,
      source: example.source,
      scenarioId: example.requestId,
      metadata: {
        verificationPassed: example.verificationPassed,
        labels: example.labels,
      },
    })),
  });
}
