/**
 * Verification types for post-condition checking.
 *
 * @module autonomy/verification/types
 */

// ---------- Post-Condition ----------

/**
 * Severity level for a post-condition check.
 */
export type PostConditionSeverity = "critical" | "warning" | "info";

/**
 * A single post-condition that can be checked after tool execution.
 */
export interface PostCondition {
  /** Unique identifier for this condition. */
  id: string;
  /** Human-readable description of what this condition verifies. */
  description: string;
  /** Check function — returns true if the condition is met. */
  check: (ctx: VerifierContext) => Promise<boolean>;
  /** How serious a failure of this condition is. */
  severity: PostConditionSeverity;
}

// ---------- Verifier Context ----------

/**
 * Context passed to post-condition check functions.
 */
export interface VerifierContext {
  /** The tool that was executed. */
  toolName: string;
  /** The validated parameters that were passed. */
  params: Record<string, unknown>;
  /** The result returned by the tool execution. */
  result: unknown;
  /** How long the tool took to execute in milliseconds. */
  durationMs: number;
  /** The agent that requested the execution. */
  agentId: string;
  /** Unique request identifier for tracing. */
  requestId: string;
  /**
   * Optional independent verification query path.
   *
   * Post-conditions can call this to validate outcomes against an
   * external or secondary data source rather than trusting tool output.
   */
  query?: VerificationQueryFn;
}

export interface VerificationQueryInput {
  /** Query identifier (e.g., "plugins:installed"). */
  query: string;
  /** Optional query payload. */
  payload?: Record<string, unknown>;
}

export type VerificationQueryFn = (
  input: VerificationQueryInput,
) => Promise<unknown>;

// ---------- Verification Result ----------

/**
 * Status of a single post-condition check.
 */
export interface PostConditionCheckResult {
  /** The condition ID. */
  conditionId: string;
  /** Whether the condition passed. */
  passed: boolean;
  /** The severity of this condition. */
  severity: PostConditionSeverity;
  /** Failure taxonomy code (set only when a check fails). */
  failureCode?: VerificationFailureCode;
  /** Error message if the check threw. */
  error?: string;
}

/**
 * Overall verification status.
 */
export type VerificationStatus = "passed" | "failed" | "partial";

/**
 * Failure taxonomy for verification outcomes.
 */
export type VerificationFailureCode = "check_failed" | "check_error" | "timeout";

/**
 * Aggregate verification failure taxonomy counts.
 */
export interface VerificationFailureTaxonomy {
  totalFailures: number;
  criticalFailures: number;
  warningFailures: number;
  infoFailures: number;
  checkFailures: number;
  errorFailures: number;
  timeoutFailures: number;
}

/**
 * Result of running all post-conditions for a tool execution.
 */
export interface VerificationResult {
  /** Overall status. */
  status: VerificationStatus;
  /** Individual check results. */
  checks: PostConditionCheckResult[];
  /** Whether any critical condition failed. */
  hasCriticalFailure: boolean;
  /** Aggregated failure taxonomy counts for this verification run. */
  failureTaxonomy: VerificationFailureTaxonomy;
}

// ---------- Verifier Interface ----------

/**
 * Interface for the post-condition verifier (for dependency injection).
 */
export interface PostConditionVerifierInterface {
  registerConditions(toolName: string, conditions: PostCondition[]): void;
  verify(ctx: VerifierContext): Promise<VerificationResult>;
}
