/**
 * Postgres-backed Audit Retention Manager — durable compliance storage.
 *
 * Implements {@link AuditRetentionManagerInterface} using the autonomy_audit
 * table via {@link AutonomyDbAdapter}.
 *
 * @module autonomy/persistence/pg-retention-manager
 */

import { logger } from "@elizaos/core";

import type { ExecutionEvent } from "../workflow/types.js";
import type {
  AuditRetentionManagerInterface,
  ComplianceSummary,
  RetentionExport,
  RetentionRecord,
} from "../domains/governance/retention-manager.js";
import type { RetentionPolicy } from "../domains/governance/types.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

// ---------- Implementation ----------

export class PgRetentionManager implements AuditRetentionManagerInterface {
  private adapter: AutonomyDbAdapter;
  private _size = 0;

  constructor(adapter: AutonomyDbAdapter) {
    this.adapter = adapter;
  }

  get size(): number {
    return this._size;
  }

  async addEvents(events: ExecutionEvent[], policy: RetentionPolicy): Promise<void> {
    const retainUntil = new Date(Date.now() + policy.eventRetentionMs).toISOString();
    for (const event of events) {
      await this.adapter.executeRaw(
        `INSERT INTO autonomy_audit (type, data, retain_until)
         VALUES ('event', '${esc(JSON.stringify(event))}'::jsonb, '${retainUntil}'::timestamptz)`,
      );
      this._size++;
    }
  }

  async addAuditReport(report: Record<string, unknown>, policy: RetentionPolicy): Promise<void> {
    const retainUntil = new Date(Date.now() + policy.auditRetentionMs).toISOString();
    await this.adapter.executeRaw(
      `INSERT INTO autonomy_audit (type, data, retain_until)
       VALUES ('audit', '${esc(JSON.stringify(report))}'::jsonb, '${retainUntil}'::timestamptz)`,
    );
    this._size++;
  }

  async exportExpired(): Promise<RetentionExport> {
    const now = new Date().toISOString();
    const exportedAt = Date.now();

    const { rows } = await this.adapter.executeRaw(
      `UPDATE autonomy_audit
       SET exported_at = '${now}'::timestamptz
       WHERE retain_until <= '${now}'::timestamptz
       RETURNING *`,
    );

    return {
      records: rows.map(rowToRecord),
      exportedAt,
      format: "jsonl",
    };
  }

  async evictExpired(): Promise<number> {
    const now = new Date().toISOString();
    const { rows } = await this.adapter.executeRaw(
      `DELETE FROM autonomy_audit
       WHERE retain_until <= '${now}'::timestamptz
       RETURNING id`,
    );
    const evicted = rows.length;
    this._size = Math.max(0, this._size - evicted);
    return evicted;
  }

  async toJsonl(): Promise<string> {
    const { rows } = await this.adapter.executeRaw(
      "SELECT * FROM autonomy_audit ORDER BY id ASC",
    );
    return rows.map((r) => JSON.stringify(rowToRecord(r))).join("\n");
  }

  async getComplianceSummary(): Promise<ComplianceSummary> {
    const { rows } = await this.adapter.executeRaw(
      `SELECT
         count(*)::int AS total_records,
         count(*) FILTER (WHERE type = 'event')::int AS event_records,
         count(*) FILTER (WHERE type = 'audit')::int AS audit_records,
         EXTRACT(EPOCH FROM min(retain_until)) * 1000 AS oldest_retain_until,
         EXTRACT(EPOCH FROM max(retain_until)) * 1000 AS newest_retain_until
       FROM autonomy_audit`,
    );

    const r = rows[0] ?? {};
    return {
      totalRecords: Number(r.total_records ?? 0),
      eventRecords: Number(r.event_records ?? 0),
      auditRecords: Number(r.audit_records ?? 0),
      oldestRetainUntil: Number(r.oldest_retain_until ?? 0),
      newestRetainUntil: Number(r.newest_retain_until ?? 0),
    };
  }

  /** Sync size from database after restart. */
  async syncSize(): Promise<void> {
    try {
      const { rows } = await this.adapter.executeRaw(
        "SELECT count(*)::int AS cnt FROM autonomy_audit",
      );
      this._size = Number(rows[0]?.cnt ?? 0);
    } catch {
      // Non-fatal
    }
  }
}

// ---------- Helpers ----------

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function rowToRecord(row: Record<string, unknown>): RetentionRecord {
  return {
    type: String(row.type ?? "event") as "event" | "audit",
    data: parseJsonb(row.data, {}),
    retainUntil: toEpochMs(row.retain_until),
    exportedAt: row.exported_at ? toEpochMs(row.exported_at) : undefined,
  };
}

function parseJsonb(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value as Record<string, unknown>;
}

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "number") return value;
  return 0;
}
