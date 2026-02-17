/**
 * Cross-system invariant types for post-execution verification.
 *
 * @module autonomy/verification/invariants/types
 */

import type { KernelState } from "../../types.js";
import type { PipelineResult } from "../../workflow/types.js";

// ---------- Severity ----------

/**
 * Severity of an invariant violation.
 */
export type InvariantSeverity = "critical" | "warning" | "info";

/**
 * Ownership tag for an invariant.
 *
 * Use a stable team/system identifier (e.g. "autonomy:workflow").
 */
export type InvariantOwner = string;

// ---------- Context ----------

/**
 * Context passed to invariant check functions after pipeline execution.
 */
export interface InvariantContext {
  /** The request ID that triggered the pipeline run. */
  requestId: string;
  /** The tool that was executed. */
  toolName: string;
  /** Whether the tool execution succeeded. */
  executionSucceeded: boolean;
  /** Current state machine state. */
  currentState: KernelState;
  /** Number of pending approval requests. */
  pendingApprovalCount: number;
  /** Number of events for this request in the event store. */
  eventCount: number;
  /** The pipeline result. */
  pipelineResult: PipelineResult;
}

// ---------- Invariant ----------

/**
 * A single system-wide invariant check.
 */
export interface Invariant {
  /** Unique identifier. */
  id: string;
  /** Human-readable description. */
  description: string;
  /** Check function — returns true if invariant holds. */
  check: (ctx: InvariantContext) => Promise<boolean>;
  /** Severity if the invariant is violated. */
  severity: InvariantSeverity;
  /** Owning subsystem/team responsible for this invariant. */
  owner: InvariantOwner;
}

// ---------- Results ----------

/**
 * Result of a single invariant check.
 */
export interface InvariantCheckResult {
  /** The invariant ID. */
  invariantId: string;
  /** Owning subsystem/team responsible for this invariant. */
  owner: InvariantOwner;
  /** Whether the invariant held. */
  passed: boolean;
  /** The severity of this invariant. */
  severity: InvariantSeverity;
  /** Error message if the check threw. */
  error?: string;
}

/**
 * Overall invariant checking status.
 */
export type InvariantStatus = "passed" | "failed" | "partial";

/**
 * Result of running all registered invariants.
 */
export interface InvariantResult {
  /** Overall status. */
  status: InvariantStatus;
  /** Individual check results. */
  checks: InvariantCheckResult[];
  /** Whether any critical invariant was violated. */
  hasCriticalViolation: boolean;
}

// ---------- Interface ----------

/**
 * Interface for the invariant checker (for dependency injection).
 */
export interface InvariantCheckerInterface {
  /** Register a single invariant. */
  register(invariant: Invariant): void;
  /** Register multiple invariants. */
  registerMany(invariants: Invariant[]): void;
  /** Run all registered invariants against the given context. */
  check(ctx: InvariantContext): Promise<InvariantResult>;
}
