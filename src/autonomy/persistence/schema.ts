/**
 * Drizzle table definitions for the Autonomy Kernel persistence layer.
 *
 * These tables back the durable versions of EventStore, GoalManager,
 * StateMachine, AuditRetentionManager, ApprovalGate, and Identity.
 *
 * @module autonomy/persistence/schema
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- autonomy_events ----------

/**
 * Append-only execution event log.
 * Maps to {@link ExecutionEvent} from workflow/types.ts.
 */
export const autonomyEventsTable = pgTable(
  "autonomy_events",
  {
    /** Monotonically increasing PK — mirrors ExecutionEvent.sequenceId. */
    id: serial("id").primaryKey(),
    /** The request ID this event belongs to. */
    requestId: text("request_id").notNull(),
    /** Event type (tool:proposed, tool:executed, etc.). */
    type: text("type").notNull(),
    /** Event-specific payload. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Correlation ID linking related events across subsystems. */
    correlationId: text("correlation_id"),
    /** Agent ID that produced this event. */
    agentId: text("agent_id"),
    /** Epoch-ms timestamp from the in-memory event. */
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    /** DB insertion time. */
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_autonomy_events_request_id").on(table.requestId),
    index("idx_autonomy_events_correlation_id").on(table.correlationId),
    index("idx_autonomy_events_type").on(table.type),
    index("idx_autonomy_events_agent_id").on(table.agentId),
    index("idx_autonomy_events_timestamp").on(table.timestamp),
  ],
);

// ---------- autonomy_goals ----------

/**
 * Goal lifecycle persistence.
 * Maps to {@link Goal} from goals/manager.ts.
 */
export const autonomyGoalsTable = pgTable(
  "autonomy_goals",
  {
    /** UUID primary key — matches Goal.id. */
    id: uuid("id").primaryKey().defaultRandom(),
    /** Goal description. */
    description: text("description").notNull(),
    /** Priority: critical | high | medium | low. */
    priority: text("priority").notNull(),
    /** Status: active | completed | paused | failed. */
    status: text("status").notNull().default("active"),
    /** Parent goal ID for hierarchical decomposition. */
    parentGoalId: uuid("parent_goal_id"),
    /** Success criteria (string array stored as JSONB). */
    successCriteria: jsonb("success_criteria").$type<string[]>().notNull().default([]),
    /** Source: user | system | agent. */
    source: text("source").notNull(),
    /** Trust score of the source at creation time. */
    sourceTrust: jsonb("source_trust").$type<number>().notNull(),
    /** Epoch-ms creation timestamp. */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** Epoch-ms last update timestamp. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    /** Epoch-ms completion timestamp (null if not terminal). */
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_autonomy_goals_status").on(table.status),
    index("idx_autonomy_goals_parent").on(table.parentGoalId),
    index("idx_autonomy_goals_priority").on(table.priority),
  ],
);

// ---------- autonomy_state ----------

/**
 * Kernel state machine snapshots.
 * Stores the current FSM state on every transition for crash recovery.
 */
export const autonomyStateTable = pgTable(
  "autonomy_state",
  {
    id: serial("id").primaryKey(),
    /** Current FSM state (idle, executing, safe_mode, etc.). */
    state: text("state").notNull().default("idle"),
    /** Consecutive error count for safe-mode escalation. */
    consecutiveErrors: integer("consecutive_errors").notNull().default(0),
    /** Agent ID owning this state machine. */
    agentId: text("agent_id").notNull(),
    /** When this snapshot was taken. */
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_autonomy_state_agent_id").on(table.agentId),
  ],
);

// ---------- autonomy_audit ----------

/**
 * Audit retention records (events + audit reports).
 * Maps to {@link RetentionRecord} from governance/retention-manager.ts.
 */
export const autonomyAuditTable = pgTable(
  "autonomy_audit",
  {
    id: serial("id").primaryKey(),
    /** Record type: event | audit. */
    type: text("type").notNull(),
    /** Record data (event payload or audit report). */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    /** Epoch-ms: when this record should be retained until. */
    retainUntil: timestamp("retain_until", { withTimezone: true }).notNull(),
    /** When the record was exported (null if not yet exported). */
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    /** DB insertion time. */
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_autonomy_audit_type").on(table.type),
    index("idx_autonomy_audit_retain_until").on(table.retainUntil),
  ],
);

// ---------- autonomy_approvals ----------

/**
 * Persistent approval decision log.
 * Records every approval request and its resolution for audit compliance.
 */
export const autonomyApprovalsTable = pgTable(
  "autonomy_approvals",
  {
    /** Approval request ID (matches ApprovalRequest.id). */
    id: text("id").primaryKey(),
    /** Tool name that required approval. */
    toolName: text("tool_name").notNull(),
    /** Risk classification of the tool. */
    riskClass: text("risk_class").notNull(),
    /** The proposed tool call (full object). */
    callPayload: jsonb("call_payload").$type<Record<string, unknown>>().notNull(),
    /** Decision: approved | denied | expired. */
    decision: text("decision"),
    /** Who made the decision. */
    decidedBy: text("decided_by"),
    /** When the request was created. */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** When the request expires. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** When the decision was made. */
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_autonomy_approvals_decision").on(table.decision),
    index("idx_autonomy_approvals_tool_name").on(table.toolName),
    index("idx_autonomy_approvals_created_at").on(table.createdAt),
  ],
);

// ---------- autonomy_identity ----------

/**
 * Identity version history.
 * Stores every version of the agent's identity config for audit
 * and rollback capability.
 */
export const autonomyIdentityTable = pgTable(
  "autonomy_identity",
  {
    id: serial("id").primaryKey(),
    /** Identity version number (monotonically increasing). */
    version: integer("version").notNull(),
    /** Full identity config snapshot as JSONB. */
    identity: jsonb("identity").$type<Record<string, unknown>>().notNull(),
    /** SHA-256 hash of the identity for tamper detection. */
    hash: text("hash").notNull(),
    /** Agent ID owning this identity. */
    agentId: text("agent_id").notNull(),
    /** Whether this is the currently active version. */
    active: boolean("active").notNull().default(true),
    /** When this version was recorded. */
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_autonomy_identity_agent_version").on(table.agentId, table.version),
    index("idx_autonomy_identity_active").on(table.agentId, table.active),
  ],
);

// ---------- Type Exports ----------

/** Inferred row types for use in queries. */
export type AutonomyEventRow = typeof autonomyEventsTable.$inferSelect;
export type AutonomyEventInsert = typeof autonomyEventsTable.$inferInsert;

export type AutonomyGoalRow = typeof autonomyGoalsTable.$inferSelect;
export type AutonomyGoalInsert = typeof autonomyGoalsTable.$inferInsert;

export type AutonomyStateRow = typeof autonomyStateTable.$inferSelect;
export type AutonomyStateInsert = typeof autonomyStateTable.$inferInsert;

export type AutonomyAuditRow = typeof autonomyAuditTable.$inferSelect;
export type AutonomyAuditInsert = typeof autonomyAuditTable.$inferInsert;

export type AutonomyApprovalRow = typeof autonomyApprovalsTable.$inferSelect;
export type AutonomyApprovalInsert = typeof autonomyApprovalsTable.$inferInsert;

export type AutonomyIdentityRow = typeof autonomyIdentityTable.$inferSelect;
export type AutonomyIdentityInsert = typeof autonomyIdentityTable.$inferInsert;
