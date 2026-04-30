/**
 * Database adapter for the Autonomy Kernel persistence layer.
 *
 * Wraps `runtime.adapter.db` (a Drizzle PgDatabase instance) and
 * provides typed access to autonomy tables, raw SQL execution,
 * and migration helpers.
 *
 * @module autonomy/persistence/db-adapter
 */

import { logger } from "@elizaos/core";

import {
  autonomyApprovalsTable,
  autonomyAuditTable,
  autonomyEventsTable,
  autonomyGoalsTable,
  autonomyIdentityTable,
  autonomyMemoryQuarantineTable,
  autonomyMemoryTable,
  autonomyStateTable,
  canonicalEntitiesTable,
  entityMemoriesTable,
} from "./schema.js";

// ---------- Types ----------

/**
 * Minimal Drizzle db shape — avoids hard-coupling to a specific
 * Drizzle version or driver by accepting the intersection of
 * PGLite and node-postgres Drizzle instances.
 */
export interface DrizzleDb {
  select: (...args: unknown[]) => unknown;
  insert: (table: unknown) => unknown;
  update: (table: unknown) => unknown;
  delete: (table: unknown) => unknown;
  execute: (query: { queryChunks: unknown[] }) => Promise<{
    rows: Record<string, unknown>[];
    fields?: Array<{ name: string }>;
  }>;
}

/**
 * Configuration for the autonomy database adapter.
 */
export interface AutonomyDbAdapterConfig {
  /** Whether to auto-migrate on initialization. Defaults to true. */
  autoMigrate?: boolean;
  /** Agent ID for multi-agent table partitioning. */
  agentId?: string;
}

// ---------- Implementation ----------

/**
 * Typed database adapter for autonomy kernel persistence.
 *
 * Usage:
 * ```typescript
 * const adapter = new AutonomyDbAdapter(runtime.adapter.db as DrizzleDb);
 * await adapter.initialize();
 * ```
 */
export class AutonomyDbAdapter {
  private db: DrizzleDb;
  private config: Required<AutonomyDbAdapterConfig>;
  private initialized = false;

  /** Drizzle `sql` tag function — lazily imported. */
  private sqlHelper: { raw: (query: string) => { queryChunks: unknown[] } } | null = null;

  constructor(db: DrizzleDb, config?: AutonomyDbAdapterConfig) {
    this.db = db;
    this.config = {
      autoMigrate: config?.autoMigrate ?? true,
      agentId: config?.agentId ?? "default",
    };
  }

  // ---------- Lifecycle ----------

  /**
   * Initialize the adapter: import drizzle-orm sql helper and
   * optionally run migrations.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Dynamically import drizzle-orm for the sql tag
    const drizzle = (await import("drizzle-orm")) as {
      sql: { raw: (query: string) => { queryChunks: unknown[] } };
    };
    this.sqlHelper = drizzle.sql;

    if (this.config.autoMigrate) {
      await this.migrate();
    }

    this.initialized = true;
    logger.info("[autonomy:db] Adapter initialized");
  }

  /**
   * Run schema migration: create tables if they don't exist.
   */
  async migrate(): Promise<void> {
    const { createAutonomyTables } = await import("./migrations/001_autonomy_tables.js");
    const { addAutonomyEventsHashChain } = await import(
      "./migrations/002_autonomy_events_hash_chain.js"
    );
    const { createCanonicalEntitiesTables } = await import(
      "./migrations/003_canonical_entities.js"
    );
    await createAutonomyTables(this);
    await addAutonomyEventsHashChain(this);
    await createCanonicalEntitiesTables(this);
    logger.info("[autonomy:db] Migration complete");
  }

  // ---------- Accessors ----------

  /** The raw Drizzle db instance for advanced queries. */
  get raw(): DrizzleDb {
    return this.db;
  }

  /** Agent ID for this adapter instance. */
  get agentId(): string {
    return this.config.agentId;
  }

  /** Table references for Drizzle query builder usage. */
  get tables() {
    return {
      events: autonomyEventsTable,
      goals: autonomyGoalsTable,
      state: autonomyStateTable,
      audit: autonomyAuditTable,
      approvals: autonomyApprovalsTable,
      memory: autonomyMemoryTable,
      memoryQuarantine: autonomyMemoryQuarantineTable,
      identity: autonomyIdentityTable,
      canonicalEntities: canonicalEntitiesTable,
      entityMemories: entityMemoriesTable,
    } as const;
  }

  // ---------- Raw SQL ----------

  /**
   * Execute raw SQL and return rows.
   */
  async executeRaw(
    sqlText: string,
  ): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
    if (!this.sqlHelper) {
      throw new Error("[autonomy:db] Adapter not initialized — call initialize() first");
    }

    const rawQuery = this.sqlHelper.raw(sqlText);
    const result = await this.db.execute(rawQuery);
    const rows = Array.isArray(result.rows)
      ? result.rows
      : [];

    let columns: string[] = [];
    if (result.fields && Array.isArray(result.fields)) {
      columns = result.fields.map((f) => f.name);
    } else if (rows.length > 0) {
      columns = Object.keys(rows[0]);
    }

    return { rows, columns };
  }

  /**
   * Check if a table exists in the public schema.
   */
  async tableExists(tableName: string): Promise<boolean> {
    const { rows } = await this.executeRaw(
      `SELECT to_regclass('public.${tableName}') AS table_name`,
    );
    if (rows.length === 0) return false;
    const cell = rows[0].table_name ?? rows[0].TABLE_NAME;
    return cell !== null && cell !== undefined && cell !== "";
  }
}
