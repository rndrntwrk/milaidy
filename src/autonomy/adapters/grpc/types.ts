/**
 * Manual TypeScript type definitions mirroring the proto messages
 * defined in autonomy.proto (package milaidy.autonomy.v1).
 *
 * These types are manually maintained until proto codegen tooling
 * (buf generate, protoc-gen-ts, or ts-proto) is set up. When codegen
 * is available, this file should be replaced by the generated output
 * and re-exported from the same path for backward compatibility.
 *
 * @module autonomy/adapters/grpc/types
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Kernel operating states.
 * Mirrors the `KernelState` enum in autonomy.proto and the union type
 * in `autonomy/types.ts`.
 */
export type KernelState =
  | "idle"
  | "planning"
  | "executing"
  | "verifying"
  | "writing_memory"
  | "auditing"
  | "awaiting_approval"
  | "safe_mode"
  | "error";

/**
 * Numeric enum for wire-format compatibility with proto `KernelState`.
 */
export const KernelStateProto = {
  KERNEL_STATE_UNSPECIFIED: 0,
  KERNEL_STATE_IDLE: 1,
  KERNEL_STATE_PLANNING: 2,
  KERNEL_STATE_EXECUTING: 3,
  KERNEL_STATE_VERIFYING: 4,
  KERNEL_STATE_WRITING_MEMORY: 5,
  KERNEL_STATE_AUDITING: 6,
  KERNEL_STATE_AWAITING_APPROVAL: 7,
  KERNEL_STATE_SAFE_MODE: 8,
  KERNEL_STATE_ERROR: 9,
} as const;

/** Risk classification for tool actions. */
export type RiskClass = "read-only" | "reversible" | "irreversible";

export const RiskClassProto = {
  RISK_CLASS_UNSPECIFIED: 0,
  RISK_CLASS_READ_ONLY: 1,
  RISK_CLASS_REVERSIBLE: 2,
  RISK_CLASS_IRREVERSIBLE: 3,
} as const;

/** Source of a tool call request. */
export type ToolCallSource = "llm" | "user" | "system" | "plugin";

export const ToolCallSourceProto = {
  TOOL_CALL_SOURCE_UNSPECIFIED: 0,
  TOOL_CALL_SOURCE_LLM: 1,
  TOOL_CALL_SOURCE_USER: 2,
  TOOL_CALL_SOURCE_SYSTEM: 3,
  TOOL_CALL_SOURCE_PLUGIN: 4,
} as const;

/** Approval decision outcomes. */
export type ApprovalDecision = "approved" | "denied" | "expired";

export const ApprovalDecisionProto = {
  APPROVAL_DECISION_UNSPECIFIED: 0,
  APPROVAL_DECISION_APPROVED: 1,
  APPROVAL_DECISION_DENIED: 2,
  APPROVAL_DECISION_EXPIRED: 3,
} as const;

/** Communication tone options. */
export type CommunicationTone = "formal" | "casual" | "technical" | "empathetic";

export const CommunicationToneProto = {
  COMMUNICATION_TONE_UNSPECIFIED: 0,
  COMMUNICATION_TONE_FORMAL: 1,
  COMMUNICATION_TONE_CASUAL: 2,
  COMMUNICATION_TONE_TECHNICAL: 3,
  COMMUNICATION_TONE_EMPATHETIC: 4,
} as const;

/** Verbosity levels for communication. */
export type Verbosity = "concise" | "balanced" | "detailed";

export const VerbosityProto = {
  VERBOSITY_UNSPECIFIED: 0,
  VERBOSITY_CONCISE: 1,
  VERBOSITY_BALANCED: 2,
  VERBOSITY_DETAILED: 3,
} as const;

/** Drift severity levels. */
export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

export const DriftSeverityProto = {
  DRIFT_SEVERITY_UNSPECIFIED: 0,
  DRIFT_SEVERITY_NONE: 1,
  DRIFT_SEVERITY_LOW: 2,
  DRIFT_SEVERITY_MEDIUM: 3,
  DRIFT_SEVERITY_HIGH: 4,
  DRIFT_SEVERITY_CRITICAL: 5,
} as const;

// ============================================================================
// Message Interfaces
// ============================================================================

/** Communication style constraints for the agent persona. */
export interface CommunicationStyle {
  tone: CommunicationTone;
  verbosity: Verbosity;
  personaVoice: string;
}

/**
 * Full agent identity configuration.
 * Mirrors `AutonomyIdentityConfig` from `identity/schema.ts`.
 */
export interface Identity {
  /** Agent display name. */
  name: string;
  /** Core values governing agent behavior (immutable after init). */
  coreValues: string[];
  /** Communication style constraints. */
  communicationStyle: CommunicationStyle;
  /** Hard behavioral boundaries the agent must never cross. */
  hardBoundaries: string[];
  /** Soft preferences adjustable via high-trust requests. */
  softPreferences: Record<string, unknown>;
  /** SHA-256 integrity hash of protected identity fields. */
  identityHash: string;
  /** Version counter incremented on each sanctioned change. */
  identityVersion: number;
}

/** A single version entry in the identity history. */
export interface IdentityVersion {
  identity: Identity;
  changedAt: string; // ISO 8601 timestamp (google.protobuf.Timestamp)
  changedBy: string;
}

/** A proposed tool call awaiting approval. */
export interface ProposedToolCall {
  tool: string;
  params: Record<string, unknown>;
  source: ToolCallSource;
  requestId: string;
}

/** A pending approval request. */
export interface ApprovalRequest {
  id: string;
  call: ProposedToolCall;
  riskClass: RiskClass;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
}

/** Result of resolving an approval request. */
export interface ApprovalResult {
  id: string;
  decision: ApprovalDecision;
  decidedBy: string;
  decidedAt: string; // ISO 8601
}

/** Current safe mode status. */
export interface SafeModeStatus {
  active: boolean;
  enteredAt?: string; // ISO 8601
  reason?: string;
  consecutiveErrors: number;
}

/** Result of a safe-mode exit request. */
export interface SafeModeExitResult {
  allowed: boolean;
  reason: string;
}

/** Baseline metrics for SOW compliance tracking. */
export interface BaselineMetrics {
  preferenceFollowingAccuracy: number;
  instructionCompletionRate: number;
  personaDriftScore: number;
  memoryPoisoningResistance: number;
  compoundingErrorRate: number;
  sycophancyScore: number;
  turnCount: number;
  measuredAt: string; // ISO 8601
  label?: string;
}

/** SOW target for a single metric. */
export interface MetricTarget {
  metricName: string;
  targetValue: number;
  /** "higher" means >= target; "lower" means <= target. */
  direction: "higher" | "lower";
  currentValue: number;
  targetMet: boolean;
}

// ============================================================================
// Request / Response Interfaces
// ============================================================================

// --- GetAutonomyStatus ---

export interface GetAutonomyStatusRequest {}

export interface GetAutonomyStatusResponse {
  enabled: boolean;
  currentState: KernelState;
  safeModeActive: boolean;
  pendingApprovals: number;
  /** Orchestration phase: idle, planning, executing, verifying, writing_memory, auditing. */
  orchestrationPhase: string;
}

// --- SetAutonomyStatus ---

export interface SetAutonomyStatusRequest {
  enabled: boolean;
}

export interface SetAutonomyStatusResponse {
  enabled: boolean;
  previouslyEnabled: boolean;
}

// --- GetIdentity ---

export interface GetIdentityRequest {}

export interface GetIdentityResponse {
  identity: Identity;
  integrityValid: boolean;
}

// --- UpdateIdentity ---

export interface UpdateIdentityRequest {
  /** Partial update fields. Only provided fields are applied. */
  partialIdentity: Partial<Identity>;
}

export interface UpdateIdentityResponse {
  updatedIdentity: Identity;
  previousVersion: number;
}

// --- GetIdentityHistory ---

export interface GetIdentityHistoryRequest {
  /** Maximum number of versions to return. 0 = all. */
  limit: number;
  /** Offset for pagination. */
  offset: number;
}

export interface GetIdentityHistoryResponse {
  versions: IdentityVersion[];
  totalCount: number;
}

// --- ListApprovals ---

export interface ListApprovalsRequest {}

export interface ListApprovalsResponse {
  approvals: ApprovalRequest[];
}

// --- ResolveApproval ---

export interface ResolveApprovalRequest {
  approvalId: string;
  decision: ApprovalDecision;
  decidedBy: string;
}

export interface ResolveApprovalResponse {
  result: ApprovalResult;
  found: boolean;
}

// --- GetSafeModeStatus ---

export interface GetSafeModeStatusRequest {}

export interface GetSafeModeStatusResponse {
  status: SafeModeStatus;
}

// --- ExitSafeMode ---

export interface ExitSafeModeRequest {
  approverSource: ToolCallSource;
  approverTrust: number;
}

export interface ExitSafeModeResponse {
  result: SafeModeExitResult;
}

// --- GetMetrics ---

export interface GetMetricsRequest {
  /** Optional label filter. If empty, returns the latest metrics. */
  label?: string;
}

export interface GetMetricsResponse {
  metrics: BaselineMetrics;
  targets: MetricTarget[];
}

// ============================================================================
// Service Definition Type
// ============================================================================

/**
 * Type-level description of the AutonomyService RPC surface.
 *
 * Maps each RPC method name to its request and response types.
 * This can be used to build generic gRPC service wrappers, mock servers,
 * or typed client factories without depending on generated code.
 *
 * @example
 * ```ts
 * type Req<M extends keyof AutonomyServiceDefinition> =
 *   AutonomyServiceDefinition[M]["request"];
 * ```
 */
export interface AutonomyServiceDefinition {
  GetAutonomyStatus: {
    request: GetAutonomyStatusRequest;
    response: GetAutonomyStatusResponse;
  };
  SetAutonomyStatus: {
    request: SetAutonomyStatusRequest;
    response: SetAutonomyStatusResponse;
  };
  GetIdentity: {
    request: GetIdentityRequest;
    response: GetIdentityResponse;
  };
  UpdateIdentity: {
    request: UpdateIdentityRequest;
    response: UpdateIdentityResponse;
  };
  GetIdentityHistory: {
    request: GetIdentityHistoryRequest;
    response: GetIdentityHistoryResponse;
  };
  ListApprovals: {
    request: ListApprovalsRequest;
    response: ListApprovalsResponse;
  };
  ResolveApproval: {
    request: ResolveApprovalRequest;
    response: ResolveApprovalResponse;
  };
  GetSafeModeStatus: {
    request: GetSafeModeStatusRequest;
    response: GetSafeModeStatusResponse;
  };
  ExitSafeMode: {
    request: ExitSafeModeRequest;
    response: ExitSafeModeResponse;
  };
  GetMetrics: {
    request: GetMetricsRequest;
    response: GetMetricsResponse;
  };
}

/**
 * Utility type: extract the method names of the AutonomyService.
 */
export type AutonomyServiceMethod = keyof AutonomyServiceDefinition;

/**
 * Utility type: a handler map implementing the AutonomyService.
 * Each key is an RPC method, each value is an async function
 * from request to response.
 */
export type AutonomyServiceHandlers = {
  [M in AutonomyServiceMethod]: (
    request: AutonomyServiceDefinition[M]["request"],
  ) => Promise<AutonomyServiceDefinition[M]["response"]>;
};
