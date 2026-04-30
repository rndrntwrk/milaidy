/**
 * Approval gate types for the Autonomy Kernel.
 *
 * @module autonomy/approval/types
 */

import type { ProposedToolCall, RiskClass } from "../tools/types.js";

// ---------- Approval Types ----------

/**
 * An approval request pending user decision.
 */
export interface ApprovalRequest {
  /** Unique approval request ID. */
  id: string;
  /** The proposed tool call requiring approval. */
  call: ProposedToolCall;
  /** Risk classification of the tool. */
  riskClass: RiskClass;
  /** When the request was created. */
  createdAt: number;
  /** When the request expires (auto-denied). */
  expiresAt: number;
}

/**
 * Possible decisions for an approval request.
 */
export type ApprovalDecision = "approved" | "denied" | "expired";

/**
 * Result of an approval request.
 */
export interface ApprovalResult {
  /** The approval request ID. */
  id: string;
  /** The decision made. */
  decision: ApprovalDecision;
  /** Who made the decision (undefined for timeout/expired). */
  decidedBy?: string;
  /** When the decision was made. */
  decidedAt: number;
}

// ---------- Interface ----------

/**
 * Interface for the approval gate (for dependency injection).
 */
export interface ApprovalGateInterface {
  /** Request approval for a tool call. Returns a promise that resolves with the result. */
  requestApproval(
    call: ProposedToolCall,
    riskClass: RiskClass,
  ): Promise<ApprovalResult>;
  /** Resolve a pending approval request. Returns true if the request was found. */
  resolve(id: string, decision: ApprovalDecision, decidedBy?: string): boolean;
  /** Get all pending approval requests. */
  getPending(): ApprovalRequest[];
  /** Get a specific pending request by ID. */
  getPendingById(id: string): ApprovalRequest | undefined;
  /** Dispose: resolve all pending as expired, clear all timers. */
  dispose(): void;
}
