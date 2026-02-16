/**
 * Postgres Identity Store — durable identity version history.
 *
 * Stores every version of the agent's identity config in
 * autonomy_identity for audit trails and rollback capability.
 *
 * @module autonomy/persistence/pg-identity-store
 */

import { logger } from "@elizaos/core";

import type { AutonomyIdentityConfig } from "../identity/schema.js";
import { computeIdentityHash } from "../identity/schema.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

// ---------- Types ----------

export interface IdentityVersionEntry {
  version: number;
  identity: AutonomyIdentityConfig;
  hash: string;
  agentId: string;
  active: boolean;
  createdAt: number;
}

export interface IdentityStoreInterface {
  /** Save a new identity version. Deactivates previous active version. */
  saveVersion(identity: AutonomyIdentityConfig): Promise<IdentityVersionEntry>;
  /** Get the currently active identity version. */
  getActive(): Promise<IdentityVersionEntry | undefined>;
  /** Get identity history for the agent, most recent first. */
  getHistory(limit?: number): Promise<IdentityVersionEntry[]>;
  /** Get a specific version by number. */
  getVersion(version: number): Promise<IdentityVersionEntry | undefined>;
}

// ---------- Implementation ----------

export class PgIdentityStore implements IdentityStoreInterface {
  private adapter: AutonomyDbAdapter;

  constructor(adapter: AutonomyDbAdapter) {
    this.adapter = adapter;
  }

  async saveVersion(identity: AutonomyIdentityConfig): Promise<IdentityVersionEntry> {
    const agentId = this.adapter.agentId;
    const hash = computeIdentityHash(identity);
    const version = identity.identityVersion;

    // Deactivate previous active version
    await this.adapter.executeRaw(
      `UPDATE autonomy_identity SET active = false
       WHERE agent_id = '${esc(agentId)}' AND active = true`,
    );

    // Insert new version
    const { rows } = await this.adapter.executeRaw(
      `INSERT INTO autonomy_identity (version, identity, hash, agent_id, active)
       VALUES (${version}, '${esc(JSON.stringify(identity))}'::jsonb, '${esc(hash)}', '${esc(agentId)}', true)
       RETURNING *`,
    );

    const entry = rowToEntry(rows[0]);
    logger.info(`[autonomy:identity-store] Saved identity v${version} for ${agentId}`);
    return entry;
  }

  async getActive(): Promise<IdentityVersionEntry | undefined> {
    const { rows } = await this.adapter.executeRaw(
      `SELECT * FROM autonomy_identity
       WHERE agent_id = '${esc(this.adapter.agentId)}' AND active = true
       ORDER BY version DESC LIMIT 1`,
    );
    if (rows.length === 0) return undefined;
    return rowToEntry(rows[0]);
  }

  async getHistory(limit = 50): Promise<IdentityVersionEntry[]> {
    const { rows } = await this.adapter.executeRaw(
      `SELECT * FROM autonomy_identity
       WHERE agent_id = '${esc(this.adapter.agentId)}'
       ORDER BY version DESC
       LIMIT ${Math.max(1, Math.floor(limit))}`,
    );
    return rows.map(rowToEntry);
  }

  async getVersion(version: number): Promise<IdentityVersionEntry | undefined> {
    const { rows } = await this.adapter.executeRaw(
      `SELECT * FROM autonomy_identity
       WHERE agent_id = '${esc(this.adapter.agentId)}' AND version = ${version}`,
    );
    if (rows.length === 0) return undefined;
    return rowToEntry(rows[0]);
  }
}

// ---------- Helpers ----------

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function rowToEntry(row: Record<string, unknown>): IdentityVersionEntry {
  return {
    version: Number(row.version ?? 0),
    identity: parseJsonb(row.identity) as AutonomyIdentityConfig,
    hash: String(row.hash ?? ""),
    agentId: String(row.agent_id ?? ""),
    active: Boolean(row.active),
    createdAt: toEpochMs(row.created_at),
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
