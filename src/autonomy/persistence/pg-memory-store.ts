/**
 * Postgres-backed Memory Store — persistent typed memory and quarantine.
 *
 * @module autonomy/persistence/pg-memory-store
 */

import { logger } from "@elizaos/core";
import type { MemoryStore, PersistedMemoryRecord, QuarantineRecord } from "../memory/store.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

export class PgMemoryStore implements MemoryStore {
  constructor(private adapter: AutonomyDbAdapter) {}

  async saveMemory(record: PersistedMemoryRecord): Promise<void> {
    try {
      await this.adapter.executeRaw(
        `INSERT INTO autonomy_memory (id, agent_id, memory_type, content, metadata, provenance, trust_score, verified, verifiability_class, source, source_type, created_at, updated_at)
         VALUES ('${esc(record.id)}', '${esc(record.agentId)}', '${esc(record.memoryType)}', '${esc(JSON.stringify(record.content))}'::jsonb,
                 ${record.metadata ? `'${esc(JSON.stringify(record.metadata))}'::jsonb` : "NULL"},
                 '${esc(JSON.stringify(record.provenance))}'::jsonb, ${record.trustScore},
                 ${record.verified ? "true" : "false"}, '${esc(record.verifiabilityClass)}',
                 ${record.source ? `'${esc(record.source)}'` : "NULL"},
                 ${record.sourceType ? `'${esc(record.sourceType)}'` : "NULL"},
                 '${new Date(record.createdAt).toISOString()}'::timestamptz,
                 '${new Date(record.updatedAt).toISOString()}'::timestamptz)
         ON CONFLICT (id) DO UPDATE SET
           memory_type = EXCLUDED.memory_type,
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata,
           provenance = EXCLUDED.provenance,
           trust_score = EXCLUDED.trust_score,
           verified = EXCLUDED.verified,
           verifiability_class = EXCLUDED.verifiability_class,
           source = EXCLUDED.source,
           source_type = EXCLUDED.source_type,
           updated_at = EXCLUDED.updated_at`,
      );
    } catch (err) {
      logger.warn(
        `[memory-store] Failed to persist memory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async saveQuarantine(record: QuarantineRecord): Promise<void> {
    try {
      await this.adapter.executeRaw(
        `INSERT INTO autonomy_memory_quarantine (id, agent_id, memory_type, content, metadata, provenance, trust_score, verified, verifiability_class, source, source_type, decision, decision_reason, reviewed_at, expires_at, created_at, updated_at)
         VALUES ('${esc(record.id)}', '${esc(record.agentId)}', '${esc(record.memoryType)}', '${esc(JSON.stringify(record.content))}'::jsonb,
                 ${record.metadata ? `'${esc(JSON.stringify(record.metadata))}'::jsonb` : "NULL"},
                 '${esc(JSON.stringify(record.provenance))}'::jsonb, ${record.trustScore},
                 ${record.verified ? "true" : "false"}, '${esc(record.verifiabilityClass)}',
                 ${record.source ? `'${esc(record.source)}'` : "NULL"},
                 ${record.sourceType ? `'${esc(record.sourceType)}'` : "NULL"},
                 ${record.decision ? `'${esc(record.decision)}'` : "NULL"},
                 ${record.decisionReason ? `'${esc(record.decisionReason)}'` : "NULL"},
                 ${record.reviewedAt ? `'${new Date(record.reviewedAt).toISOString()}'::timestamptz` : "NULL"},
                 '${new Date(record.expiresAt).toISOString()}'::timestamptz,
                 '${new Date(record.createdAt).toISOString()}'::timestamptz,
                 '${new Date(record.updatedAt).toISOString()}'::timestamptz)
         ON CONFLICT (id) DO UPDATE SET
           memory_type = EXCLUDED.memory_type,
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata,
           provenance = EXCLUDED.provenance,
           trust_score = EXCLUDED.trust_score,
           verified = EXCLUDED.verified,
           verifiability_class = EXCLUDED.verifiability_class,
           source = EXCLUDED.source,
           source_type = EXCLUDED.source_type,
           expires_at = EXCLUDED.expires_at,
           updated_at = EXCLUDED.updated_at`,
      );
    } catch (err) {
      logger.warn(
        `[memory-store] Failed to persist quarantine: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async resolveQuarantine(
    id: string,
    decision: "approved" | "rejected",
    reason?: string,
  ): Promise<void> {
    try {
      await this.adapter.executeRaw(
        `UPDATE autonomy_memory_quarantine
         SET decision = '${esc(decision)}',
             decision_reason = ${reason ? `'${esc(reason)}'` : "NULL"},
             reviewed_at = '${new Date().toISOString()}'::timestamptz,
             updated_at = '${new Date().toISOString()}'::timestamptz
         WHERE id = '${esc(id)}'`,
      );
    } catch (err) {
      logger.warn(
        `[memory-store] Failed to resolve quarantine: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async listPendingQuarantine(): Promise<QuarantineRecord[]> {
    try {
      const { rows } = await this.adapter.executeRaw(
        `SELECT * FROM autonomy_memory_quarantine
         WHERE decision IS NULL
           AND expires_at > NOW()
         ORDER BY created_at ASC`,
      );
      return rows.map(rowToQuarantine);
    } catch (err) {
      logger.warn(
        `[memory-store] Failed to list quarantine: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }
}

// ---------- Helpers ----------

function esc(value: string): string {
  return value.replace(/'/g, "''");
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

function rowToQuarantine(row: Record<string, unknown>): QuarantineRecord {
  return {
    id: String(row.id ?? ""),
    agentId: String(row.agent_id ?? ""),
    memoryType: String(row.memory_type ?? "observation") as QuarantineRecord["memoryType"],
    content: parseJsonb(row.content),
    metadata: parseJsonb(row.metadata),
    provenance: parseJsonb(row.provenance) as QuarantineRecord["provenance"],
    trustScore: Number(row.trust_score ?? 0),
    verified: Boolean(row.verified),
    verifiabilityClass: String(row.verifiability_class ?? "unverified") as QuarantineRecord["verifiabilityClass"],
    source: row.source ? String(row.source) : undefined,
    sourceType: row.source_type ? String(row.source_type) : undefined,
    decision: row.decision ? (String(row.decision) as QuarantineRecord["decision"]) : undefined,
    decisionReason: row.decision_reason ? String(row.decision_reason) : undefined,
    reviewedAt: row.reviewed_at ? toEpochMs(row.reviewed_at) : undefined,
    expiresAt: toEpochMs(row.expires_at),
    createdAt: toEpochMs(row.created_at),
    updatedAt: toEpochMs(row.updated_at),
  };
}
