/**
 * Role-boundary schemas and validators.
 *
 * Provides runtime request/response validation for role interfaces so role
 * boundaries are explicit and fail closed on malformed inputs/outputs.
 *
 * @module autonomy/roles/schemas
 */

import { z } from "zod";
import type { ProposedToolCall } from "../tools/types.js";
import type {
  PipelineResult,
  ToolActionHandler,
} from "../workflow/types.js";
import type {
  AuditContext,
  AuditReport,
  ExecutionPlan,
  MemoryWriteReport,
  OrchestratedRequest,
  PlanRequest,
  PlanValidation,
  VerificationContext,
  VerificationReport,
} from "./types.js";

const NonEmptyString = z.string().min(1);

const ToolCallSourceSchema = z.enum(["llm", "user", "system", "plugin"]);

const TrustSourceSchema = z
  .object({
    id: NonEmptyString,
    type: z.enum(["user", "agent", "plugin", "system", "external"]),
    channel: z.string().optional(),
    reliability: z.number().min(0).max(1),
  })
  .passthrough();

const IdentityConfigSchema = z
  .object({
    coreValues: z.array(NonEmptyString).min(1),
    communicationStyle: z
      .object({
        tone: NonEmptyString,
        verbosity: NonEmptyString,
        personaVoice: z.string(),
      })
      .passthrough(),
    hardBoundaries: z.array(z.string()),
    softPreferences: z.record(z.string(), z.unknown()),
    identityVersion: z.number().int().min(1),
  })
  .passthrough();

const ToolValidationErrorSchema = z
  .object({
    field: z.string(),
    message: z.string(),
  })
  .passthrough();

const ExecutionPlanStepSchema = z
  .object({
    id: NonEmptyString,
    toolName: NonEmptyString,
    params: z.record(z.string(), z.unknown()),
    dependsOn: z.array(NonEmptyString).optional(),
  })
  .passthrough();

const ExecutionPlanSchema = z
  .object({
    id: NonEmptyString,
    goals: z.array(z.unknown()),
    steps: z.array(ExecutionPlanStepSchema),
    createdAt: z.number().int().nonnegative(),
    status: z.enum([
      "pending",
      "approved",
      "rejected",
      "executing",
      "complete",
    ]),
  })
  .passthrough();

const PlanValidationSchema = z
  .object({
    valid: z.boolean(),
    issues: z.array(z.string()),
  })
  .passthrough();

const ProposedToolCallSchema = z
  .object({
    tool: NonEmptyString,
    params: z.record(z.string(), z.unknown()),
    source: ToolCallSourceSchema,
    requestId: NonEmptyString,
  })
  .passthrough();

const PipelineResultSchema = z
  .object({
    requestId: NonEmptyString,
    toolName: NonEmptyString,
    success: z.boolean(),
    validation: z
      .object({
        valid: z.boolean(),
        errors: z.array(ToolValidationErrorSchema),
      })
      .passthrough(),
    durationMs: z.number().nonnegative(),
  })
  .passthrough();

const VerificationContextSchema = z
  .object({
    requestId: NonEmptyString,
    toolName: NonEmptyString,
    params: z.record(z.string(), z.unknown()),
    result: z.unknown(),
    durationMs: z.number().nonnegative(),
    agentId: NonEmptyString,
  })
  .passthrough();

const VerificationReportSchema = z
  .object({
    schema: z
      .object({
        valid: z.boolean(),
        errors: z.array(ToolValidationErrorSchema),
      })
      .passthrough(),
    postConditions: z
      .object({
        status: z.string(),
        hasCriticalFailure: z.boolean(),
      })
      .passthrough(),
    overallPassed: z.boolean(),
  })
  .passthrough();

const MemoryWriteRequestSchema = z
  .object({
    content: z.string(),
    source: TrustSourceSchema,
    agentId: NonEmptyString,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const MemoryWriteReportSchema = z
  .object({
    total: z.number().int().nonnegative(),
    allowed: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  })
  .passthrough();

const AuditContextSchema = z
  .object({
    requestId: NonEmptyString,
    correlationId: NonEmptyString,
    plan: ExecutionPlanSchema.optional(),
    pipelineResult: PipelineResultSchema.optional(),
    identityConfig: IdentityConfigSchema,
    recentOutputs: z.array(z.string()),
  })
  .passthrough();

const DriftReportSchema = z
  .object({
    driftScore: z.number(),
    dimensions: z
      .object({
        valueAlignment: z.number(),
        styleConsistency: z.number(),
        boundaryRespect: z.number(),
        topicFocus: z.number(),
      })
      .passthrough(),
    windowSize: z.number().int().nonnegative(),
    severity: z.enum(["none", "low", "medium", "high", "critical"]),
    corrections: z.array(z.string()),
    analyzedAt: z.number().int().nonnegative(),
  })
  .passthrough();

const AuditReportSchema = z
  .object({
    driftReport: DriftReportSchema,
    eventCount: z.number().int().nonnegative(),
    anomalies: z.array(z.string()),
    recommendations: z.array(z.string()),
    auditedAt: z.number().int().nonnegative(),
  })
  .passthrough();

const ToolActionHandlerSchema = z.custom<ToolActionHandler>(
  (value) => typeof value === "function",
  "Expected actionHandler function",
);

const OrchestratedRequestSchema = z
  .object({
    description: NonEmptyString,
    constraints: z.array(z.string()).optional(),
    source: ToolCallSourceSchema,
    sourceTrust: z.number().min(0).max(1),
    agentId: NonEmptyString,
    actionHandler: ToolActionHandlerSchema,
    identityConfig: IdentityConfigSchema,
    recentOutputs: z.array(z.string()).optional(),
  })
  .passthrough();

function parseBoundary<T>(
  schema: z.ZodType<T>,
  value: unknown,
  boundary: string,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(
    `Role boundary validation failed for ${boundary}: ${details}`,
  );
}

export function parseOrchestratedRequest(
  value: unknown,
): OrchestratedRequest {
  return parseBoundary(
    OrchestratedRequestSchema,
    value,
    "RoleOrchestrator.execute request",
  ) as OrchestratedRequest;
}

export function parsePlannerCreatePlanRequest(value: unknown): PlanRequest {
  return parseBoundary(
    z
      .object({
        description: NonEmptyString,
        source: ToolCallSourceSchema,
        sourceTrust: z.number().min(0).max(1),
        constraints: z.array(z.string()).optional(),
      })
      .passthrough(),
    value,
    "PlannerRole.createPlan request",
  ) as PlanRequest;
}

export function parsePlannerCreatePlanResponse(value: unknown): ExecutionPlan {
  return parseBoundary(
    ExecutionPlanSchema,
    value,
    "PlannerRole.createPlan response",
  ) as ExecutionPlan;
}

export function parsePlannerValidatePlanResponse(value: unknown): PlanValidation {
  return parseBoundary(
    PlanValidationSchema,
    value,
    "PlannerRole.validatePlan response",
  ) as PlanValidation;
}

export function parseExecutorExecuteRequest(value: unknown): ProposedToolCall {
  return parseBoundary(
    ProposedToolCallSchema,
    value,
    "ExecutorRole.execute request",
  ) as ProposedToolCall;
}

export function parseExecutorExecuteResponse(value: unknown): PipelineResult {
  return parseBoundary(
    PipelineResultSchema,
    value,
    "ExecutorRole.execute response",
  ) as PipelineResult;
}

export function parseVerifierVerifyRequest(value: unknown): VerificationContext {
  return parseBoundary(
    VerificationContextSchema,
    value,
    "VerifierRole.verify request",
  ) as VerificationContext;
}

export function parseVerifierVerifyResponse(value: unknown): VerificationReport {
  return parseBoundary(
    VerificationReportSchema,
    value,
    "VerifierRole.verify response",
  ) as VerificationReport;
}

export function parseMemoryWriteBatchRequest(value: unknown): Array<{
  content: string;
  source: {
    id: string;
    type: "user" | "agent" | "plugin" | "system" | "external";
    channel?: string;
    reliability: number;
  };
  agentId: string;
  metadata?: Record<string, unknown>;
}> {
  return parseBoundary(
    z.array(MemoryWriteRequestSchema),
    value,
    "MemoryWriterRole.writeBatch request",
  );
}

export function parseMemoryWriteBatchResponse(
  value: unknown,
): MemoryWriteReport {
  return parseBoundary(
    MemoryWriteReportSchema,
    value,
    "MemoryWriterRole.writeBatch response",
  ) as MemoryWriteReport;
}

export function parseAuditorAuditRequest(value: unknown): AuditContext {
  return parseBoundary(
    AuditContextSchema,
    value,
    "AuditorRole.audit request",
  ) as AuditContext;
}

export function parseAuditorAuditResponse(value: unknown): AuditReport {
  return parseBoundary(
    AuditReportSchema,
    value,
    "AuditorRole.audit response",
  ) as AuditReport;
}
