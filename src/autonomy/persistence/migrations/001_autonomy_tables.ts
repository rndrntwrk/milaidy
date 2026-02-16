/**
 * Migration 001 — Create autonomy kernel tables.
 *
 * Uses IF NOT EXISTS so the migration is idempotent and safe to
 * re-run on startup.
 *
 * @module autonomy/persistence/migrations/001_autonomy_tables
 */

import type { AutonomyDbAdapter } from "../db-adapter.js";

const MIGRATION_SQL = `
-- autonomy_events: append-only execution event log
CREATE TABLE IF NOT EXISTS autonomy_events (
  id            SERIAL       PRIMARY KEY,
  request_id    TEXT         NOT NULL,
  type          TEXT         NOT NULL,
  payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  agent_id      TEXT,
  timestamp     TIMESTAMPTZ  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_events_request_id
  ON autonomy_events (request_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_events_correlation_id
  ON autonomy_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_events_type
  ON autonomy_events (type);
CREATE INDEX IF NOT EXISTS idx_autonomy_events_agent_id
  ON autonomy_events (agent_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_events_timestamp
  ON autonomy_events (timestamp);

-- autonomy_goals: goal lifecycle persistence
CREATE TABLE IF NOT EXISTS autonomy_goals (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  description      TEXT         NOT NULL,
  priority         TEXT         NOT NULL DEFAULT 'medium',
  status           TEXT         NOT NULL DEFAULT 'active',
  parent_goal_id   UUID,
  success_criteria JSONB        NOT NULL DEFAULT '[]'::jsonb,
  source           TEXT         NOT NULL,
  source_trust     JSONB        NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL,
  updated_at       TIMESTAMPTZ  NOT NULL,
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_autonomy_goals_status
  ON autonomy_goals (status);
CREATE INDEX IF NOT EXISTS idx_autonomy_goals_parent
  ON autonomy_goals (parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_goals_priority
  ON autonomy_goals (priority);

-- autonomy_state: kernel state machine snapshots
CREATE TABLE IF NOT EXISTS autonomy_state (
  id                 SERIAL       PRIMARY KEY,
  state              TEXT         NOT NULL DEFAULT 'idle',
  consecutive_errors INTEGER      NOT NULL DEFAULT 0,
  agent_id           TEXT         NOT NULL,
  snapshot_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_state_agent_id
  ON autonomy_state (agent_id);

-- autonomy_audit: retention records for compliance
CREATE TABLE IF NOT EXISTS autonomy_audit (
  id           SERIAL       PRIMARY KEY,
  type         TEXT         NOT NULL,
  data         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  retain_until TIMESTAMPTZ  NOT NULL,
  exported_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_audit_type
  ON autonomy_audit (type);
CREATE INDEX IF NOT EXISTS idx_autonomy_audit_retain_until
  ON autonomy_audit (retain_until);

-- autonomy_approvals: approval decision log
CREATE TABLE IF NOT EXISTS autonomy_approvals (
  id           TEXT         PRIMARY KEY,
  tool_name    TEXT         NOT NULL,
  risk_class   TEXT         NOT NULL,
  call_payload JSONB        NOT NULL DEFAULT '{}'::jsonb,
  decision     TEXT,
  decided_by   TEXT,
  created_at   TIMESTAMPTZ  NOT NULL,
  expires_at   TIMESTAMPTZ  NOT NULL,
  decided_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_autonomy_approvals_decision
  ON autonomy_approvals (decision);
CREATE INDEX IF NOT EXISTS idx_autonomy_approvals_tool_name
  ON autonomy_approvals (tool_name);
CREATE INDEX IF NOT EXISTS idx_autonomy_approvals_created_at
  ON autonomy_approvals (created_at);

-- autonomy_identity: identity version history
CREATE TABLE IF NOT EXISTS autonomy_identity (
  id         SERIAL       PRIMARY KEY,
  version    INTEGER      NOT NULL,
  identity   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  hash       TEXT         NOT NULL,
  agent_id   TEXT         NOT NULL,
  active     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_identity_agent_version
  ON autonomy_identity (agent_id, version);
CREATE INDEX IF NOT EXISTS idx_autonomy_identity_active
  ON autonomy_identity (agent_id, active);
`;

/**
 * Execute the migration — creates all autonomy tables idempotently.
 */
export async function createAutonomyTables(
  adapter: AutonomyDbAdapter,
): Promise<void> {
  // Split by statement and execute each one individually
  // (PGLite doesn't support multi-statement execute in all cases)
  const statements = MIGRATION_SQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await adapter.executeRaw(`${stmt};`);
  }
}
