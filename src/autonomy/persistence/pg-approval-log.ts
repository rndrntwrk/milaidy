/**
 * Postgres Approval Log — durable record of all approval decisions.
 *
 * Hooks into the {@link ApprovalGate} to persistently log every
 * approval request and its resolution for audit compliance.
 *
 * @module autonomy/persistence/pg-approval-log
 */

import { logger } from "@elizaos/core";

import type { ApprovalDecision, ApprovalRequest, ApprovalResult } from "../approval/types.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

// ---------- Types ----------

export interface ApprovalLogEntry {
  id: string;
  toolName: string;
  riskClass: string;
  callPayload: Record<string, unknown>;
  decision: ApprovalDecision | null;
  decidedBy: string | null;
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
}

export interface ApprovalLogInterface {
  /** Log a new approval request. */
  logRequest(request: ApprovalRequest): Promise<void>;
  /** Log the resolution of an approval request. */
  logResolution(result: ApprovalResult): Promise<void>;
  /** Get all approval records, most recent first. */
  getRecent(limit?: number): Promise<ApprovalLogEntry[]>;
  /** Get a specific approval record by ID. */
  getById(id: string): Promise<ApprovalLogEntry | undefined>;
}

// ---------- Implementation ----------

export class PgApprovalLog implements ApprovalLogInterface {
  private adapter: AutonomyDbAdapter;

  constructor(adapter: AutonomyDbAdapter) {
    this.adapter = adapter;
  }

  async logRequest(request: ApprovalRequest): Promise<void> {
    const callPayload = {
      tool: request.call.tool,
      params: request.call.params,
      source: request.call.source,
      requestId: request.call.requestId,
    };

    await this.adapter.executeRaw(
      `INSERT INTO autonomy_approvals (id, tool_name, risk_class, call_payload, created_at, expires_at)
       VALUES ('${esc(request.id)}', '${esc(request.call.tool)}', '${esc(request.riskClass)}', '${esc(JSON.stringify(callPayload))}'::jsonb, '${new Date(request.createdAt).toISOString()}'::timestamptz, '${new Date(request.expiresAt).toISOString()}'::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
    );
  }

  async logResolution(result: ApprovalResult): Promise<void> {
    await this.adapter.executeRaw(
      `UPDATE autonomy_approvals
       SET decision = '${esc(result.decision)}',
           decided_by = ${result.decidedBy ? `'${esc(result.decidedBy)}'` : "NULL"},
           decided_at = '${new Date(result.decidedAt).toISOString()}'::timestamptz
       WHERE id = '${esc(result.id)}'`,
    );
  }

  async getRecent(limit = 50): Promise<ApprovalLogEntry[]> {
    const { rows } = await this.adapter.executeRaw(
      `SELECT * FROM autonomy_approvals ORDER BY created_at DESC LIMIT ${Math.max(1, Math.floor(limit))}`,
    );
    return rows.map(rowToEntry);
  }

  async getById(id: string): Promise<ApprovalLogEntry | undefined> {
    const { rows } = await this.adapter.executeRaw(
      `SELECT * FROM autonomy_approvals WHERE id = '${esc(id)}'`,
    );
    if (rows.length === 0) return undefined;
    return rowToEntry(rows[0]);
  }
}

// ---------- Helpers ----------

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function rowToEntry(row: Record<string, unknown>): ApprovalLogEntry {
  return {
    id: String(row.id ?? ""),
    toolName: String(row.tool_name ?? ""),
    riskClass: String(row.risk_class ?? ""),
    callPayload: parseJsonb(row.call_payload),
    decision: row.decision ? String(row.decision) as ApprovalDecision : null,
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    createdAt: toEpochMs(row.created_at),
    expiresAt: toEpochMs(row.expires_at),
    decidedAt: row.decided_at ? toEpochMs(row.decided_at) : null,
  };
}

function parseJsonb(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value as Record<string, unknown>;
}

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "number") return value;
  return 0;
}
