/**
 * Migration 002 — Add tamper-evident hash chain columns to autonomy_events.
 *
 * Safe to run repeatedly.
 *
 * @module autonomy/persistence/migrations/002_autonomy_events_hash_chain
 */

import { computeEventHash } from "../../workflow/event-integrity.js";
import type { AutonomyDbAdapter } from "../db-adapter.js";

const ADD_COLUMNS_SQL = `
ALTER TABLE autonomy_events
  ADD COLUMN IF NOT EXISTS prev_hash TEXT;

ALTER TABLE autonomy_events
  ADD COLUMN IF NOT EXISTS event_hash TEXT;
`;

const NEEDS_BACKFILL_SQL = `
SELECT
  EXISTS (
    SELECT 1
    FROM autonomy_events
    WHERE event_hash IS NULL
  ) AS missing_hash,
  EXISTS (
    SELECT 1
    FROM autonomy_events e
    WHERE e.prev_hash IS NULL
      AND EXISTS (
        SELECT 1
        FROM autonomy_events prior
        WHERE COALESCE(prior.agent_id, '') = COALESCE(e.agent_id, '')
          AND prior.id < e.id
      )
  ) AS missing_prev_chain;
`;

const LOAD_EVENTS_SQL = `
SELECT id, request_id, type, payload, correlation_id, agent_id, timestamp
FROM autonomy_events
ORDER BY id ASC;
`;

const FINALIZE_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_autonomy_events_event_hash
  ON autonomy_events (event_hash);

ALTER TABLE autonomy_events
  ALTER COLUMN event_hash SET NOT NULL;
`;

export async function addAutonomyEventsHashChain(
  adapter: AutonomyDbAdapter,
): Promise<void> {
  await adapter.executeRaw(ADD_COLUMNS_SQL);

  const { rows: statusRows } = await adapter.executeRaw(NEEDS_BACKFILL_SQL);
  const missingHash = asBoolean(cell(statusRows[0], "missing_hash"));
  const missingPrevChain = asBoolean(cell(statusRows[0], "missing_prev_chain"));
  const needsBackfill = missingHash || missingPrevChain;

  if (needsBackfill) {
    const { rows: eventRows } = await adapter.executeRaw(LOAD_EVENTS_SQL);
    const lastHashByAgent = new Map<string, string>();

    for (const row of eventRows) {
      const id = Number(cell(row, "id"));
      if (!Number.isFinite(id)) {
        continue;
      }
      const agentKey = asString(cell(row, "agent_id"), "");
      const prevHash = lastHashByAgent.get(agentKey);
      const requestId = asString(cell(row, "request_id"), "");
      const type = asString(cell(row, "type"), "");
      const payload = asPayload(cell(row, "payload"));
      const timestamp = asTimestampMs(cell(row, "timestamp"));
      const correlationId = asOptionalString(cell(row, "correlation_id"));
      const eventHash = computeEventHash({
        requestId,
        type,
        payload,
        timestamp,
        correlationId,
        prevHash,
      });

      await adapter.executeRaw(
        `UPDATE autonomy_events
         SET prev_hash = ${prevHash ? `'${escapeSql(prevHash)}'` : "NULL"},
             event_hash = '${escapeSql(eventHash)}'
         WHERE id = ${Math.trunc(id)}`,
      );

      lastHashByAgent.set(agentKey, eventHash);
    }
  }

  await adapter.executeRaw(FINALIZE_SQL);
}

function cell(row: Record<string, unknown> | undefined, key: string): unknown {
  if (!row) return undefined;
  return row[key] ?? row[key.toUpperCase()];
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return value === "true" || value === "t" || value === "1";
  }
  return false;
}

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const str = String(value);
  return str.length > 0 ? str : undefined;
}

function asPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function asTimestampMs(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
