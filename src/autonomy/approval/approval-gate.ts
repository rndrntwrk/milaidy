/**
 * Approval Gate — in-memory approval request management with timeout.
 *
 * Manages pending approval requests for tool calls that require
 * explicit user authorization. Requests auto-expire after a
 * configurable timeout.
 *
 * @module autonomy/approval/approval-gate
 */

import type { ProposedToolCall, RiskClass } from "../tools/types.js";
import type {
  ApprovalDecision,
  ApprovalGateInterface,
  ApprovalRequest,
  ApprovalResult,
} from "./types.js";

/** Default approval timeout: 5 minutes. */
const DEFAULT_TIMEOUT_MS = 300_000;

interface PendingEntry {
  request: ApprovalRequest;
  resolve: (result: ApprovalResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ApprovalGate implements ApprovalGateInterface {
  private pending = new Map<string, PendingEntry>();
  private timeoutMs: number;
  private nextId = 1;
  private eventBus?: {
    emit: (event: string, payload: unknown) => void;
  };

  constructor(options?: {
    timeoutMs?: number;
    eventBus?: { emit: (event: string, payload: unknown) => void };
  }) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.eventBus = options?.eventBus;
  }

  requestApproval(
    call: ProposedToolCall,
    riskClass: RiskClass,
  ): Promise<ApprovalResult> {
    const id = `approval-${this.nextId++}`;
    const now = Date.now();
    const request: ApprovalRequest = {
      id,
      call,
      riskClass,
      createdAt: now,
      expiresAt: now + this.timeoutMs,
    };

    return new Promise<ApprovalResult>((resolvePromise) => {
      const timer = setTimeout(() => {
        this.resolveInternal(id, "expired");
      }, this.timeoutMs);

      this.pending.set(id, {
        request,
        resolve: resolvePromise,
        timer,
      });

      // Emit approval requested event
      this.eventBus?.emit("autonomy:approval:requested", {
        requestId: call.requestId,
        toolName: call.tool,
        riskClass,
        expiresAt: request.expiresAt,
      });
    });
  }

  resolve(id: string, decision: ApprovalDecision, decidedBy?: string): boolean {
    return this.resolveInternal(id, decision, decidedBy);
  }

  getPending(): ApprovalRequest[] {
    return Array.from(this.pending.values()).map((e) => e.request);
  }

  getPendingById(id: string): ApprovalRequest | undefined {
    return this.pending.get(id)?.request;
  }

  dispose(): void {
    // Resolve all pending as expired and clear timers
    for (const [id] of this.pending) {
      this.resolveInternal(id, "expired");
    }
  }

  private resolveInternal(
    id: string,
    decision: ApprovalDecision,
    decidedBy?: string,
  ): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(id);

    const result: ApprovalResult = {
      id,
      decision,
      decidedBy,
      decidedAt: Date.now(),
    };

    entry.resolve(result);

    // Emit approval resolved event
    this.eventBus?.emit("autonomy:approval:resolved", {
      requestId: entry.request.call.requestId,
      toolName: entry.request.call.tool,
      decision,
      decidedBy,
    });

    return true;
  }
}
