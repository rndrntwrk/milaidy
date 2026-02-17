/**
 * Persistent Approval Gate — approval requests backed by the autonomy DB.
 *
 * Stores approval requests in Postgres and hydrates pending approvals
 * on startup to survive restarts.
 *
 * @module autonomy/approval/persistent-approval-gate
 */

import { logger } from "@elizaos/core";
import type { AutonomyDbAdapter } from "../persistence/db-adapter.js";
import type { ProposedToolCall, RiskClass } from "../tools/types.js";
import type {
  ApprovalDecision,
  ApprovalGateInterface,
  ApprovalRequest,
  ApprovalResult,
} from "./types.js";

interface PendingEntry {
  request: ApprovalRequest;
  resolve: (result: ApprovalResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Default approval timeout: 5 minutes. */
const DEFAULT_TIMEOUT_MS = 300_000;

export class PersistentApprovalGate implements ApprovalGateInterface {
  private adapter: AutonomyDbAdapter;
  private pending = new Map<string, PendingEntry>();
  private timeoutMs: number;
  private eventBus?: {
    emit: (event: string, payload: unknown) => void;
  };

  constructor(
    adapter: AutonomyDbAdapter,
    options?: {
      timeoutMs?: number;
      eventBus?: { emit: (event: string, payload: unknown) => void };
    },
  ) {
    this.adapter = adapter;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.eventBus = options?.eventBus;
  }

  /**
   * Hydrate pending approvals from the database.
   *
   * Call this once on startup after construction.
   */
  async hydratePending(): Promise<void> {
    const now = Date.now();
    try {
      const { rows } = await this.adapter.executeRaw(
        `SELECT * FROM autonomy_approvals
         WHERE decision IS NULL
           AND expires_at > NOW()
         ORDER BY created_at ASC`,
      );

      for (const row of rows) {
        const request = rowToRequest(row);
        if (!request) continue;
        if (request.expiresAt <= now) {
          // Expired — mark in DB
          void this.persistResolution(request.id, "expired");
          continue;
        }
        if (!this.pending.has(request.id)) {
          this.addPending(request);
        }
      }
    } catch (err) {
      logger.warn(
        `[approval-gate] Failed to hydrate pending approvals: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  requestApproval(
    call: ProposedToolCall,
    riskClass: RiskClass,
  ): Promise<ApprovalResult> {
    const id = crypto.randomUUID();
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

      void this.persistRequest(request);

      this.eventBus?.emit("autonomy:approval:requested", {
        requestId: call.requestId,
        toolName: call.tool,
        riskClass,
        expiresAt: request.expiresAt,
      });
    });
  }

  resolve(id: string, decision: ApprovalDecision, decidedBy?: string): boolean {
    // Resolve in-memory if present; otherwise persist resolution anyway.
    const resolved = this.resolveInternal(id, decision, decidedBy);
    if (!resolved) {
      void this.persistResolution(id, decision, decidedBy);
    }
    return true;
  }

  getPending(): ApprovalRequest[] {
    return Array.from(this.pending.values()).map((e) => e.request);
  }

  getPendingById(id: string): ApprovalRequest | undefined {
    return this.pending.get(id)?.request;
  }

  dispose(): void {
    for (const [id] of this.pending) {
      this.resolveInternal(id, "expired");
    }
  }

  // ---------- Internal ----------

  private addPending(request: ApprovalRequest): void {
    const remainingMs = Math.max(0, request.expiresAt - Date.now());
    const timer = setTimeout(() => {
      this.resolveInternal(request.id, "expired");
    }, remainingMs);
    this.pending.set(request.id, {
      request,
      resolve: () => {},
      timer,
    });
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
    void this.persistResolution(id, decision, decidedBy);

    this.eventBus?.emit("autonomy:approval:resolved", {
      requestId: entry.request.call.requestId,
      toolName: entry.request.call.tool,
      decision,
      decidedBy,
    });

    return true;
  }

  private async persistRequest(request: ApprovalRequest): Promise<void> {
    try {
      const callPayload = JSON.stringify({
        tool: request.call.tool,
        params: request.call.params,
        source: request.call.source,
        requestId: request.call.requestId,
      });
      await this.adapter.executeRaw(
        `INSERT INTO autonomy_approvals (id, tool_name, risk_class, call_payload, created_at, expires_at)
         VALUES ('${esc(request.id)}', '${esc(request.call.tool)}', '${esc(request.riskClass)}', '${esc(callPayload)}'::jsonb, '${new Date(request.createdAt).toISOString()}'::timestamptz, '${new Date(request.expiresAt).toISOString()}'::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
      );
    } catch (err) {
      logger.warn(
        `[approval-gate] Failed to persist approval request: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async persistResolution(
    id: string,
    decision: ApprovalDecision,
    decidedBy?: string,
  ): Promise<void> {
    try {
      await this.adapter.executeRaw(
        `UPDATE autonomy_approvals
         SET decision = '${esc(decision)}',
             decided_by = ${decidedBy ? `'${esc(decidedBy)}'` : "NULL"},
             decided_at = '${new Date().toISOString()}'::timestamptz
         WHERE id = '${esc(id)}'`,
      );
    } catch (err) {
      logger.warn(
        `[approval-gate] Failed to persist approval resolution: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------- Helpers ----------

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function parseJsonb(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value as Record<string, unknown>;
}

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "number") return value;
  return 0;
}

function rowToRequest(row: Record<string, unknown>): ApprovalRequest | null {
  const callPayload = parseJsonb(row.call_payload);
  if (!callPayload) return null;

  const call = {
    tool: String(callPayload.tool ?? ""),
    params: (callPayload.params ?? {}) as Record<string, unknown>,
    source: (callPayload.source ?? "system") as ProposedToolCall["source"],
    requestId: String(callPayload.requestId ?? ""),
  };

  return {
    id: String(row.id ?? ""),
    call,
    riskClass: String(row.risk_class ?? "irreversible") as RiskClass,
    createdAt: toEpochMs(row.created_at),
    expiresAt: toEpochMs(row.expires_at),
  };
}
