/**
 * Postgres-backed Event Store — durable append-only execution log.
 *
 * Implements {@link EventStoreInterface} using the autonomy_events table
 * via {@link AutonomyDbAdapter}. Falls back gracefully to in-memory
 * operation if the database write fails (log + continue).
 *
 * @module autonomy/persistence/pg-event-store
 */

import { logger } from "@elizaos/core";

import type {
  EventStoreInterface,
  ExecutionEvent,
  ExecutionEventType,
} from "../workflow/types.js";
import { computeEventHash } from "../workflow/event-integrity.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";
import type { AutonomyEventRow } from "./schema.js";

// ---------- Implementation ----------

export class PgEventStore implements EventStoreInterface {
  private adapter: AutonomyDbAdapter;
  private _size = 0;

  constructor(adapter: AutonomyDbAdapter) {
    this.adapter = adapter;
  }

  get size(): number {
    return this._size;
  }

  async append(
    requestId: string,
    type: ExecutionEventType,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<number> {
    const timestamp = new Date().toISOString();
    const agentId = this.adapter.agentId;

    try {
      const { rows: hashRows } = await this.adapter.executeRaw(
        `SELECT event_hash
         FROM autonomy_events
         WHERE agent_id = '${escapeSql(agentId)}'
         ORDER BY id DESC
         LIMIT 1`,
      );
      const prevHashValue = hashRows[0]?.event_hash ?? hashRows[0]?.EVENT_HASH;
      const prevHash =
        typeof prevHashValue === "string" && prevHashValue.length > 0
          ? prevHashValue
          : undefined;
      const timestampMs = Date.parse(timestamp);
      const eventHash = computeEventHash({
        requestId,
        type,
        payload,
        timestamp: Number.isNaN(timestampMs) ? Date.now() : timestampMs,
        correlationId,
        prevHash,
      });

      const { rows } = await this.adapter.executeRaw(
        `INSERT INTO autonomy_events (request_id, type, payload, correlation_id, agent_id, timestamp, prev_hash, event_hash)
         VALUES ('${escapeSql(requestId)}', '${escapeSql(type)}', '${escapeSql(JSON.stringify(payload))}'::jsonb, ${correlationId ? `'${escapeSql(correlationId)}'` : "NULL"}, '${escapeSql(agentId)}', '${timestamp}'::timestamptz, ${prevHash ? `'${escapeSql(prevHash)}'` : "NULL"}, '${escapeSql(eventHash)}')
         RETURNING id`,
      );

      this._size++;
      const id = Number(rows[0]?.id ?? rows[0]?.ID ?? 0);
      return id;
    } catch (err) {
      logger.error(
        `[autonomy:pg-event-store] Failed to append event: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async getByRequestId(requestId: string): Promise<ExecutionEvent[]> {
    try {
      const { rows } = await this.adapter.executeRaw(
        `SELECT id, request_id, type, payload, correlation_id, timestamp, prev_hash, event_hash
         FROM autonomy_events
         WHERE request_id = '${escapeSql(requestId)}'
         ORDER BY id ASC`,
      );
      return rows.map(rowToEvent);
    } catch (err) {
      logger.error(
        `[autonomy:pg-event-store] getByRequestId failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  async getByCorrelationId(correlationId: string): Promise<ExecutionEvent[]> {
    try {
      const { rows } = await this.adapter.executeRaw(
        `SELECT id, request_id, type, payload, correlation_id, timestamp, prev_hash, event_hash
         FROM autonomy_events
         WHERE correlation_id = '${escapeSql(correlationId)}'
         ORDER BY id ASC`,
      );
      return rows.map(rowToEvent);
    } catch (err) {
      logger.error(
        `[autonomy:pg-event-store] getByCorrelationId failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  async getRecent(n: number): Promise<ExecutionEvent[]> {
    if (n <= 0) return [];
    try {
      const { rows } = await this.adapter.executeRaw(
        `SELECT id, request_id, type, payload, correlation_id, timestamp, prev_hash, event_hash
         FROM autonomy_events
         ORDER BY id DESC
         LIMIT ${Math.max(0, Math.floor(n))}`,
      );
      // Reverse so oldest is first (consistent with in-memory behavior)
      return rows.reverse().map(rowToEvent);
    } catch (err) {
      logger.error(
        `[autonomy:pg-event-store] getRecent failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  clear(): void {
    // Fire-and-forget — clear is used in tests mostly
    this.adapter.executeRaw(
      `DELETE FROM autonomy_events WHERE agent_id = '${escapeSql(this.adapter.agentId)}'`,
    ).then(() => {
      this._size = 0;
    }).catch((err) => {
      logger.error(
        `[autonomy:pg-event-store] clear failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Sync the size counter from the database. Call after construction
   * to recover state after a restart.
   */
  async syncSize(): Promise<void> {
    try {
      const { rows } = await this.adapter.executeRaw(
        `SELECT count(*)::int AS cnt FROM autonomy_events
         WHERE agent_id = '${escapeSql(this.adapter.agentId)}'`,
      );
      this._size = Number(rows[0]?.cnt ?? rows[0]?.CNT ?? 0);
    } catch {
      // Non-fatal — size will be inaccurate but append will still work
    }
  }
}

// ---------- Helpers ----------

/**
 * Minimal SQL string escaping — prevents SQL injection for string literals.
 * For production use, parameterized queries via Drizzle query builder
 * would be preferable, but raw SQL is used here for compatibility with
 * the AutonomyDbAdapter's executeRaw() which mirrors the project's
 * existing database access patterns.
 */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Convert a database row to an ExecutionEvent.
 */
function rowToEvent(row: Record<string, unknown>): ExecutionEvent {
  const r = row as Partial<AutonomyEventRow> & Record<string, unknown>;
  return {
    sequenceId: Number(r.id ?? r.ID ?? 0),
    requestId: String(r.request_id ?? r.REQUEST_ID ?? ""),
    type: String(r.type ?? r.TYPE ?? "") as ExecutionEventType,
    payload: (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload ?? {}) as Record<string, unknown>,
    timestamp: r.timestamp instanceof Date
      ? r.timestamp.getTime()
      : typeof r.timestamp === "string"
        ? new Date(r.timestamp).getTime()
        : Number(r.timestamp ?? 0),
    ...(r.correlation_id ? { correlationId: String(r.correlation_id) } : {}),
    ...(r.prev_hash ? { prevHash: String(r.prev_hash) } : {}),
    ...(r.event_hash ? { eventHash: String(r.event_hash) } : {}),
  };
}
