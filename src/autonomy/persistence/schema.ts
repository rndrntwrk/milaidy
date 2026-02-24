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
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
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
    /** Previous hash in the append-only event chain. */
    prevHash: text("prev_hash"),
    /** Event hash for tamper-evident chain validation. */
    eventHash: text("event_hash").notNull(),
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
    uniqueIndex("idx_autonomy_events_event_hash").on(table.eventHash),
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

// ---------- autonomy_memory ----------

/**
 * Typed memory entries with provenance and trust metadata.
 */
export const autonomyMemoryTable = pgTable(
  "autonomy_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id").notNull(),
    memoryType: text("memory_type").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
    trustScore: real("trust_score").notNull(),
    verified: boolean("verified").notNull().default(false),
    verifiabilityClass: text("verifiability_class").notNull().default("unverified"),
    source: text("source"),
    sourceType: text("source_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_autonomy_memory_agent").on(table.agentId),
    index("idx_autonomy_memory_type").on(table.memoryType),
    index("idx_autonomy_memory_created_at").on(table.createdAt),
  ],
);

// ---------- autonomy_memory_quarantine ----------

/**
 * Quarantined memory entries pending review.
 */
export const autonomyMemoryQuarantineTable = pgTable(
  "autonomy_memory_quarantine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id").notNull(),
    memoryType: text("memory_type").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
    trustScore: real("trust_score").notNull(),
    verified: boolean("verified").notNull().default(false),
    verifiabilityClass: text("verifiability_class").notNull().default("unverified"),
    source: text("source"),
    sourceType: text("source_type"),
    decision: text("decision"),
    decisionReason: text("decision_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_autonomy_memory_quarantine_agent").on(table.agentId),
    index("idx_autonomy_memory_quarantine_decision").on(table.decision),
    index("idx_autonomy_memory_quarantine_expires").on(table.expiresAt),
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

// ---------- canonical_entities ----------

/**
 * Cross-platform entity identity linking.
 * Maps platform-specific user IDs to a canonical entity identity,
 * enabling cross-room memory retrieval.
 */
export const canonicalEntitiesTable = pgTable(
  "canonical_entities",
  {
    /** UUID primary key — the canonical entity ID used across all platform rooms. */
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-readable display name for the entity. */
    displayName: text("display_name").notNull(),
    /** Trust level: 0.0–1.0. Operators start at 1.0. */
    trustLevel: real("trust_level").notNull().default(0.5),
    /** Whether this entity is an operator (system administrator). */
    isOperator: boolean("is_operator").notNull().default(false),
    /**
     * Platform identity map: { "discord": "enoomian#1234", "web_chat": "<uuid>", "telegram": "@enoomian" }
     */
    platformIds: jsonb("platform_ids").$type<Record<string, string>>().notNull().default({}),
    /** User preferences extracted from interactions (e.g. communication style). */
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    /** Known facts about this entity, accumulated over sessions. */
    knownFacts: jsonb("known_facts").$type<string[]>().notNull().default([]),
    /** Per-platform last seen timestamps. */
    lastSeen: jsonb("last_seen").$type<Record<string, number>>().notNull().default({}),
    /** Arbitrary metadata. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    /** When this entity was first seen. */
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
    /** DB insertion time. */
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** Last update time. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_canonical_entities_display_name").on(table.displayName),
    index("idx_canonical_entities_is_operator").on(table.isOperator),
  ],
);

// ---------- entity_memories ----------

/**
 * Entity-scoped memories (mid-term and long-term tiers).
 * These memories follow the person across rooms/platforms,
 * unlike room-scoped ElizaOS memories.
 */
export const entityMemoriesTable = pgTable(
  "entity_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The canonical entity this memory belongs to. */
    canonicalEntityId: uuid("canonical_entity_id").notNull(),
    /** Memory tier: mid-term (session summaries, 30-day TTL) or long-term (permanent facts). */
    memoryTier: text("memory_tier").notNull(), // 'mid-term' | 'long-term'
    /** Memory type from the existing autonomy taxonomy. */
    memoryType: text("memory_type").notNull(),
    /** Memory content. */
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    /** Optional metadata (source platform, room origin, related facts, etc.). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    /** Trust score at write time. */
    trustScore: real("trust_score").notNull(),
    /** Provenance chain. */
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
    /** Source platform (discord, web_chat, telegram). */
    sourcePlatform: text("source_platform"),
    /** Source room ID where this memory originated. */
    sourceRoomId: text("source_room_id"),
    /** Embedding vector stored as JSON array for semantic search. */
    embedding: jsonb("embedding").$type<number[]>(),
    /** Expiry timestamp for mid-term memories (null for long-term). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Number of sessions this fact has appeared in (for promotion logic). */
    sessionCount: integer("session_count").notNull().default(1),
    /** Whether this memory has been superseded by a newer version. */
    superseded: boolean("superseded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_entity_memories_canonical_entity").on(table.canonicalEntityId),
    index("idx_entity_memories_tier").on(table.memoryTier),
    index("idx_entity_memories_type").on(table.memoryType),
    index("idx_entity_memories_expires").on(table.expiresAt),
    index("idx_entity_memories_superseded").on(table.superseded),
    index("idx_entity_memories_entity_tier").on(table.canonicalEntityId, table.memoryTier),
  ],
);

// ---------- Type Exports ----------

/** Inferred row types for use in queries. */
export type AutonomyEventRow = typeof autonomyEventsTable.$inferSelect;
export type AutonomyEventInsert = typeof autonomyEventsTable.$inferInsert;

export type AutonomyGoalRow = typeof autonomyGoalsTable.$inferSelect;
export type AutonomyGoalInsert = typeof autonomyGoalsTable.$inferInsert;

export type AutonomyMemoryRow = typeof autonomyMemoryTable.$inferSelect;
export type AutonomyMemoryInsert = typeof autonomyMemoryTable.$inferInsert;
export type AutonomyMemoryQuarantineRow = typeof autonomyMemoryQuarantineTable.$inferSelect;
export type AutonomyMemoryQuarantineInsert = typeof autonomyMemoryQuarantineTable.$inferInsert;

export type AutonomyStateRow = typeof autonomyStateTable.$inferSelect;
export type AutonomyStateInsert = typeof autonomyStateTable.$inferInsert;

export type AutonomyAuditRow = typeof autonomyAuditTable.$inferSelect;
export type AutonomyAuditInsert = typeof autonomyAuditTable.$inferInsert;

export type AutonomyApprovalRow = typeof autonomyApprovalsTable.$inferSelect;
export type AutonomyApprovalInsert = typeof autonomyApprovalsTable.$inferInsert;

export type AutonomyIdentityRow = typeof autonomyIdentityTable.$inferSelect;
export type AutonomyIdentityInsert = typeof autonomyIdentityTable.$inferInsert;

export type CanonicalEntityRow = typeof canonicalEntitiesTable.$inferSelect;
export type CanonicalEntityInsert = typeof canonicalEntitiesTable.$inferInsert;

export type EntityMemoryRow = typeof entityMemoriesTable.$inferSelect;
export type EntityMemoryInsert = typeof entityMemoriesTable.$inferInsert;
