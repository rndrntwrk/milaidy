/**
 * Dataset schema for learning tool traces and labels.
 *
 * @module autonomy/learning/dataset-schema
 */

import { z } from "zod";

export const TraceLabelSchema = z
  .object({
    taskOutcome: z.enum(["success", "partial", "fail"]),
    verificationAlignment: z.enum(["aligned", "conflict", "unknown"]),
    policyCompliance: z.enum(["compliant", "non_compliant", "uncertain"]),
    safetyRisk: z.enum(["none", "low", "medium", "high"]),
    rewardHackingSignal: z.enum(["none", "suspected", "confirmed"]),
    notes: z.string().optional(),
    reviewerId: z.string().optional(),
    reviewedAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export type TraceLabel = z.infer<typeof TraceLabelSchema>;

export const LearningTraceExampleSchema = z
  .object({
    id: z.string().min(1),
    requestId: z.string().min(1),
    correlationId: z.string().min(1).optional(),
    toolName: z.string().min(1),
    source: z.string().min(1),
    toolInput: z.record(z.string(), z.unknown()),
    toolOutput: z.unknown().optional(),
    durationMs: z.number().nonnegative(),
    reward: z.number().min(0).max(1),
    verificationPassed: z.boolean(),
    labels: TraceLabelSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type LearningTraceExample = z.infer<typeof LearningTraceExampleSchema>;

export const LearningTraceDatasetSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    examples: z.array(LearningTraceExampleSchema),
  })
  .strict();

export type LearningTraceDataset = z.infer<typeof LearningTraceDatasetSchema>;

export function parseLearningTraceDataset(
  value: unknown,
): LearningTraceDataset {
  return LearningTraceDatasetSchema.parse(value);
}
