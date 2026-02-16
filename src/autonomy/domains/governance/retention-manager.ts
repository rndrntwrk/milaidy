/**
 * Audit Retention Manager — stores execution events and audit reports
 * with time-based retention, JSONL export, and compliance metadata.
 *
 * @module autonomy/domains/governance/retention-manager
 */

import type { ExecutionEvent } from "../../workflow/types.js";
import type { RetentionPolicy } from "./types.js";

// ---------- Types ----------

/** A record managed by the retention system. */
export interface RetentionRecord {
  type: "event" | "audit";
  data: Record<string, unknown>;
  retainUntil: number;
  exportedAt?: number;
}

/** Result of exporting expired records. */
export interface RetentionExport {
  records: RetentionRecord[];
  exportedAt: number;
  format: "jsonl";
}

/** Compliance summary of retained records. */
export interface ComplianceSummary {
  totalRecords: number;
  eventRecords: number;
  auditRecords: number;
  oldestRetainUntil: number;
  newestRetainUntil: number;
}

// ---------- Interface ----------

/**
 * Interface for the audit retention manager.
 */
export interface AuditRetentionManagerInterface {
  /** Add execution events with retention policy. */
  addEvents(events: ExecutionEvent[], policy: RetentionPolicy): void;
  /** Add an audit report with retention policy. */
  addAuditReport(
    report: Record<string, unknown>,
    policy: RetentionPolicy,
  ): void;
  /** Export records that have expired (past retention period). */
  exportExpired(): RetentionExport;
  /** Evict expired records. Returns number of records evicted. */
  evictExpired(): number;
  /** Export all records as JSONL string. */
  toJsonl(): string;
  /** Get count of retained records. */
  readonly size: number;
  /** Get compliance metadata summary. */
  getComplianceSummary(): ComplianceSummary;
}

// ---------- Implementation ----------

/**
 * In-memory audit retention manager.
 *
 * Stores retention records with computed expiry timestamps and supports
 * export-before-eviction for compliance audit trails.
 */
export class AuditRetentionManager implements AuditRetentionManagerInterface {
  private records: RetentionRecord[] = [];

  addEvents(events: ExecutionEvent[], policy: RetentionPolicy): void {
    const now = Date.now();
    for (const event of events) {
      this.records.push({
        type: "event",
        data: event as unknown as Record<string, unknown>,
        retainUntil: now + policy.eventRetentionMs,
      });
    }
  }

  addAuditReport(
    report: Record<string, unknown>,
    policy: RetentionPolicy,
  ): void {
    const now = Date.now();
    this.records.push({
      type: "audit",
      data: report,
      retainUntil: now + policy.auditRetentionMs,
    });
  }

  exportExpired(): RetentionExport {
    const now = Date.now();
    const expired = this.records.filter((r) => r.retainUntil <= now);
    const exportedAt = now;

    // Mark as exported
    for (const record of expired) {
      record.exportedAt = exportedAt;
    }

    return {
      records: expired,
      exportedAt,
      format: "jsonl",
    };
  }

  evictExpired(): number {
    const now = Date.now();
    const before = this.records.length;
    this.records = this.records.filter((r) => r.retainUntil > now);
    return before - this.records.length;
  }

  toJsonl(): string {
    return this.records.map((r) => JSON.stringify(r)).join("\n");
  }

  get size(): number {
    return this.records.length;
  }

  getComplianceSummary(): ComplianceSummary {
    let eventRecords = 0;
    let auditRecords = 0;
    let oldest = Number.POSITIVE_INFINITY;
    let newest = 0;

    for (const record of this.records) {
      if (record.type === "event") eventRecords++;
      else auditRecords++;
      if (record.retainUntil < oldest) oldest = record.retainUntil;
      if (record.retainUntil > newest) newest = record.retainUntil;
    }

    return {
      totalRecords: this.records.length,
      eventRecords,
      auditRecords,
      oldestRetainUntil: this.records.length > 0 ? oldest : 0,
      newestRetainUntil: newest,
    };
  }
}
