/**
 * Workflow engine types — event store, pipeline, and compensation interfaces.
 *
 * @module autonomy/workflow/types
 */

import type { ToolCallSource } from "../tools/types.js";

// ---------- Execution Events ----------

/**
 * Types of events recorded during tool execution.
 */
export type ExecutionEventType =
  | "tool:proposed"
  | "tool:validated"
  | "tool:approval:requested"
  | "tool:approval:resolved"
  | "tool:executing"
  | "tool:executed"
  | "tool:verified"
  | "tool:failed"
  | "tool:compensated"
  | "tool:compensation:incident:opened"
  | "tool:invariants:checked"
  | "tool:decision:logged"
  | "identity:drift:report"
  | "kernel:state:transition"
  | "kernel:safe-mode:transition";

/**
 * A single event in the execution log.
 */
export interface ExecutionEvent {
  /** Monotonically increasing sequence ID. */
  sequenceId: number;
  /** The request ID this event belongs to. */
  requestId: string;
  /** The type of execution event. */
  type: ExecutionEventType;
  /** Event-specific payload. */
  payload: Record<string, unknown>;
  /** When the event was recorded. */
  timestamp: number;
  /** Correlation ID linking related events across subsystems. */
  correlationId?: string;
  /** Previous event hash in the request/event chain. */
  prevHash?: string;
  /** Hash of this event payload and chain context. */
  eventHash?: string;
}

// ---------- Event Store Interface ----------

/**
 * Interface for the append-only execution event store.
 *
 * All data methods return Promises to support both in-memory and
 * persistent (e.g. Postgres) implementations.
 */
export interface EventStoreInterface {
  /** Append an event and return its assigned sequence ID. */
  append(
    requestId: string,
    type: ExecutionEventType,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<number>;
  /** Get all events for a given request ID. */
  getByRequestId(requestId: string): Promise<ExecutionEvent[]>;
  /** Get all events for a given correlation ID. */
  getByCorrelationId(correlationId: string): Promise<ExecutionEvent[]>;
  /** Get the N most recent events. */
  getRecent(n: number): Promise<ExecutionEvent[]>;
  /** Current number of events in the store. */
  readonly size: number;
  /** Clear all events. */
  clear(): void;
}

// ---------- Pipeline Types ----------

/**
 * Configuration for the execution pipeline.
 */
export interface PipelineConfig {
  /** Whether the pipeline is enabled. */
  enabled: boolean;
  /** Maximum concurrent executions. */
  maxConcurrent: number;
  /** Default timeout for tool execution in ms. */
  defaultTimeoutMs: number;
  /** Timeout for approval requests in ms. */
  approvalTimeoutMs: number;
  /** Auto-approve read-only tools. */
  autoApproveReadOnly: boolean;
  /** Sources that are auto-approved. */
  autoApproveSources: ToolCallSource[];
  /** Maximum events in the event store. */
  eventStoreMaxEvents: number;
}

/**
 * Result of a pipeline execution.
 */
export interface PipelineResult {
  /** Unique request identifier. */
  requestId: string;
  /** The tool that was executed. */
  toolName: string;
  /** Whether the execution was successful. */
  success: boolean;
  /** The tool execution result (if successful). */
  result?: unknown;
  /** Validation result from schema validation. */
  validation: {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
  };
  /** Approval details (if approval was required). */
  approval?: { required: boolean; decision?: string; decidedBy?: string };
  /** Verification result (if execution reached verification). */
  verification?: {
    status: string;
    hasCriticalFailure: boolean;
    failureTaxonomy?: import("../verification/types.js").VerificationFailureTaxonomy;
  };
  /** Compensation details (if compensation was attempted). */
  compensation?: { attempted: boolean; success: boolean; detail?: string };
  /** Invariant check results (if invariant checker is configured). */
  invariants?: { status: string; hasCriticalViolation: boolean };
  /** Correlation ID linking all events from this execution. */
  correlationId?: string;
  /** Total pipeline duration in milliseconds. */
  durationMs: number;
  /** Error message (if failed). */
  error?: string;
}

/**
 * Handler function that performs the actual tool execution.
 */
export type ToolActionHandler = (
  toolName: string,
  validatedParams: unknown,
  requestId: string,
) => Promise<{ result: unknown; durationMs: number }>;

// ---------- Pipeline Interface ----------

/**
 * Interface for the tool execution pipeline.
 */
export interface ToolExecutionPipelineInterface {
  execute(
    call: import("../tools/types.js").ProposedToolCall,
    actionHandler: ToolActionHandler,
  ): Promise<PipelineResult>;
}

// ---------- Compensation Types ----------

/**
 * Context passed to compensation functions.
 */
export interface CompensationContext {
  /** The tool that was executed. */
  toolName: string;
  /** The parameters that were passed. */
  params: Record<string, unknown>;
  /** The result that was returned (if any). */
  result?: unknown;
  /** The request ID. */
  requestId: string;
}

/**
 * A compensation function that attempts to reverse a tool's effects.
 */
export type CompensationFn = (
  ctx: CompensationContext,
) => Promise<{ success: boolean; detail?: string }>;

/**
 * Interface for the compensation function registry.
 */
export interface CompensationRegistryInterface {
  /** Register a compensation function for a tool. */
  register(toolName: string, fn: CompensationFn): void;
  /** Check if a compensation function is registered. */
  has(toolName: string): boolean;
  /** Attempt compensation for a tool execution. */
  compensate(
    ctx: CompensationContext,
  ): Promise<{ success: boolean; detail?: string }>;
}

// ---------- Compensation Incident Types ----------

export type CompensationIncidentStatus =
  | "open"
  | "acknowledged"
  | "resolved";

export type CompensationIncidentReason =
  | "critical_verification_failure"
  | "critical_invariant_violation";

export interface CompensationIncident {
  id: string;
  requestId: string;
  toolName: string;
  correlationId: string;
  reason: CompensationIncidentReason;
  compensationAttempted: boolean;
  compensationSuccess: boolean;
  compensationDetail?: string;
  status: CompensationIncidentStatus;
  createdAt: number;
  updatedAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  resolvedAt?: number;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface CompensationIncidentManagerInterface {
  openIncident(input: {
    requestId: string;
    toolName: string;
    correlationId: string;
    reason: CompensationIncidentReason;
    compensationAttempted: boolean;
    compensationSuccess: boolean;
    compensationDetail?: string;
  }): CompensationIncident;
  acknowledgeIncident(
    incidentId: string,
    actor: string,
  ): CompensationIncident | undefined;
  resolveIncident(
    incidentId: string,
    actor: string,
    resolutionNote?: string,
  ): CompensationIncident | undefined;
  getIncidentById(incidentId: string): CompensationIncident | undefined;
  listOpenIncidents(): CompensationIncident[];
  listIncidents(): CompensationIncident[];
}
