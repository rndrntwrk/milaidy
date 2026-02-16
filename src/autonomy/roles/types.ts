/**
 * Role separation types for the Autonomy Kernel.
 *
 * Defines the formal role interfaces (Planner, Executor, Verifier,
 * MemoryWriter, Auditor) plus SafeModeController and RoleOrchestrator.
 *
 * @module autonomy/roles/types
 */

import type { Goal } from "../goals/manager.js";
import type { DriftReport } from "../identity/drift-monitor.js";
import type { AutonomyIdentityConfig } from "../identity/schema.js";
import type { MemoryGateDecision, MemoryGateStats } from "../memory/gate.js";
import type { ToolCallSource, ToolValidationError } from "../tools/types.js";
import type { TrustSource } from "../types.js";
import type {
  InvariantContext,
  InvariantResult,
} from "../verification/invariants/types.js";
import type {
  ExecutionEvent,
  PipelineResult,
  ToolActionHandler,
  ToolExecutionPipelineInterface,
} from "../workflow/types.js";

// ========== PlannerRole ==========

/**
 * A request to create an execution plan.
 */
export interface PlanRequest {
  /** Description of what needs to be accomplished. */
  description: string;
  /** Where this request originated. */
  source: ToolCallSource;
  /** Trust level of the request source. */
  sourceTrust: number;
  /** Optional constraints on planning. */
  constraints?: string[];
}

/**
 * A single step within an execution plan.
 */
export interface PlanStep {
  /** Unique step identifier. */
  id: string;
  /** The tool to invoke for this step. */
  toolName: string;
  /** Parameters to pass to the tool. */
  params: Record<string, unknown>;
  /** IDs of steps that must complete before this one. */
  dependsOn?: string[];
}

/**
 * An execution plan produced by the Planner.
 */
export interface ExecutionPlan {
  /** Unique plan identifier. */
  id: string;
  /** Goals associated with this plan. */
  goals: Goal[];
  /** Ordered steps to execute. */
  steps: PlanStep[];
  /** When the plan was created. */
  createdAt: number;
  /** Current plan status. */
  status: "pending" | "approved" | "rejected" | "executing" | "complete";
}

/**
 * Result of validating an execution plan.
 */
export interface PlanValidation {
  /** Whether the plan is valid. */
  valid: boolean;
  /** Validation issues found. */
  issues: string[];
}

/**
 * Role responsible for creating and validating execution plans.
 */
export interface PlannerRole {
  /** Create a plan from a request. */
  createPlan(request: PlanRequest): Promise<ExecutionPlan>;
  /** Validate an existing plan. */
  validatePlan(plan: ExecutionPlan): Promise<PlanValidation>;
  /** Get the currently active plan (if any). */
  getActivePlan(): ExecutionPlan | null;
  /** Cancel the active plan. */
  cancelPlan(reason: string): Promise<void>;
}

// ========== ExecutorRole ==========

/**
 * Role responsible for executing tool calls.
 * Re-uses the existing ToolExecutionPipelineInterface.
 */
export type ExecutorRole = ToolExecutionPipelineInterface;

// ========== VerifierRole ==========

/**
 * Context for running verification checks.
 */
export interface VerificationContext {
  /** Unique request identifier. */
  requestId: string;
  /** The tool that was executed. */
  toolName: string;
  /** Parameters passed to the tool. */
  params: Record<string, unknown>;
  /** Result returned by the tool. */
  result: unknown;
  /** How long the tool took in milliseconds. */
  durationMs: number;
  /** The agent that requested execution. */
  agentId: string;
}

/**
 * Unified verification report aggregating all checks.
 */
export interface VerificationReport {
  /** Schema validation results. */
  schema: { valid: boolean; errors: ToolValidationError[] };
  /** Post-condition check results. */
  postConditions: { status: string; hasCriticalFailure: boolean };
  /** Invariant check results (if invariant checker is configured). */
  invariants?: { status: string; hasCriticalViolation: boolean };
  /** Whether all checks passed. */
  overallPassed: boolean;
}

/**
 * Role responsible for verifying execution results.
 */
export interface VerifierRole {
  /** Run all verification checks on an execution result. */
  verify(context: VerificationContext): Promise<VerificationReport>;
  /** Run only invariant checks. */
  checkInvariants(context: InvariantContext): Promise<InvariantResult>;
}

// ========== MemoryWriterRole ==========

/**
 * A request to write to memory.
 */
export interface MemoryWriteRequest {
  /** Content to write. */
  content: string;
  /** Trust source of the content. */
  source: TrustSource;
  /** The agent writing the memory. */
  agentId: string;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Report of a batch memory write operation.
 */
export interface MemoryWriteReport {
  /** Total number of write requests processed. */
  total: number;
  /** Number of writes allowed. */
  allowed: number;
  /** Number of writes quarantined. */
  quarantined: number;
  /** Number of writes rejected. */
  rejected: number;
}

/**
 * Role responsible for trust-gated memory writes.
 */
export interface MemoryWriterRole {
  /** Write a single memory entry. */
  write(request: MemoryWriteRequest): Promise<MemoryGateDecision>;
  /** Write a batch of memory entries. */
  writeBatch(requests: MemoryWriteRequest[]): Promise<MemoryWriteReport>;
  /** Get memory gate statistics. */
  getStats(): MemoryGateStats;
}

// ========== AuditorRole ==========

/**
 * Context for running an audit.
 */
export interface AuditContext {
  /** The request being audited. */
  requestId: string;
  /** Correlation ID linking related events. */
  correlationId: string;
  /** The execution plan (if available). */
  plan?: ExecutionPlan;
  /** Pipeline result (if available). */
  pipelineResult?: PipelineResult;
  /** Identity configuration for drift analysis. */
  identityConfig: AutonomyIdentityConfig;
  /** Recent outputs to analyze for drift. */
  recentOutputs: string[];
}

/**
 * Result of an audit.
 */
export interface AuditReport {
  /** Drift analysis report. */
  driftReport: DriftReport;
  /** Number of events audited. */
  eventCount: number;
  /** Detected anomalies. */
  anomalies: string[];
  /** Recommendations for improvement. */
  recommendations: string[];
  /** When the audit was performed. */
  auditedAt: number;
}

/**
 * Role responsible for auditing executions and detecting drift.
 */
export interface AuditorRole {
  /** Perform a full audit. */
  audit(context: AuditContext): Promise<AuditReport>;
  /** Get the most recent drift report. */
  getDriftReport(): DriftReport | null;
  /** Query events for a specific request. */
  queryEvents(requestId: string): Promise<ExecutionEvent[]>;
}

// ========== SafeModeController ==========

/**
 * Current safe mode status.
 */
export interface SafeModeStatus {
  /** Whether safe mode is active. */
  active: boolean;
  /** When safe mode was entered. */
  enteredAt?: number;
  /** Reason for entering safe mode. */
  reason?: string;
  /** Number of consecutive errors. */
  consecutiveErrors: number;
}

/**
 * Result of a safe mode exit request.
 */
export interface SafeModeExitResult {
  /** Whether the exit was allowed. */
  allowed: boolean;
  /** Reason for the decision. */
  reason: string;
}

/**
 * Controller for managing safe mode triggers and exits.
 */
export interface SafeModeController {
  /** Check whether safe mode should be triggered. */
  shouldTrigger(consecutiveErrors: number, lastError?: string): boolean;
  /** Enter safe mode. */
  enter(reason: string): void;
  /** Request to exit safe mode (requires sufficient trust). */
  requestExit(
    approverSource: ToolCallSource,
    approverTrust: number,
  ): SafeModeExitResult;
  /** Get current safe mode status. */
  getStatus(): SafeModeStatus;
}

// ========== RoleOrchestrator ==========

/**
 * A request to the orchestrator for full lifecycle execution.
 */
export interface OrchestratedRequest {
  /** Description of what to accomplish. */
  description: string;
  /** Source of the request. */
  source: ToolCallSource;
  /** Trust level of the source. */
  sourceTrust: number;
  /** Agent ID making the request. */
  agentId: string;
  /** Handler for executing tool actions. */
  actionHandler: ToolActionHandler;
  /** Identity configuration for drift analysis. */
  identityConfig: AutonomyIdentityConfig;
  /** Recent outputs for drift analysis. */
  recentOutputs?: string[];
}

/**
 * Result of an orchestrated execution.
 */
export interface OrchestratedResult {
  /** The execution plan that was created. */
  plan: ExecutionPlan;
  /** Results of each pipeline execution. */
  executions: PipelineResult[];
  /** Memory write report (if memory was written). */
  memoryReport?: MemoryWriteReport;
  /** Audit report. */
  auditReport: AuditReport;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** Whether the overall orchestration succeeded. */
  success: boolean;
}

/**
 * Orchestrator that coordinates all roles through the full lifecycle.
 */
export interface RoleOrchestrator {
  /** Execute a full lifecycle: plan -> execute -> verify -> write memory -> audit. */
  execute(request: OrchestratedRequest): Promise<OrchestratedResult>;
  /** Get the current orchestration phase. */
  getCurrentPhase():
    | "idle"
    | "planning"
    | "executing"
    | "verifying"
    | "writing_memory"
    | "auditing";
  /** Check if the system is in safe mode. */
  isInSafeMode(): boolean;
}
