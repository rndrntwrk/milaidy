/**
 * Autonomy Kernel persistence layer barrel exports.
 *
 * @module autonomy/persistence
 */

// Schema — Drizzle table definitions and inferred row types
export {
  autonomyEventsTable,
  autonomyGoalsTable,
  autonomyStateTable,
  autonomyAuditTable,
  autonomyApprovalsTable,
  autonomyMemoryTable,
  autonomyMemoryQuarantineTable,
  autonomyIdentityTable,
  type AutonomyEventRow,
  type AutonomyEventInsert,
  type AutonomyGoalRow,
  type AutonomyGoalInsert,
  type AutonomyStateRow,
  type AutonomyStateInsert,
  type AutonomyAuditRow,
  type AutonomyAuditInsert,
  type AutonomyApprovalRow,
  type AutonomyApprovalInsert,
  type AutonomyMemoryRow,
  type AutonomyMemoryInsert,
  type AutonomyMemoryQuarantineRow,
  type AutonomyMemoryQuarantineInsert,
  type AutonomyIdentityRow,
  type AutonomyIdentityInsert,
} from "./schema.js";

// Database adapter
export {
  AutonomyDbAdapter,
  type AutonomyDbAdapterConfig,
  type DrizzleDb,
} from "./db-adapter.js";

// Persistent implementations
export { PgEventStore } from "./pg-event-store.js";
export { PgGoalManager } from "./pg-goal-manager.js";
export { PgRetentionManager } from "./pg-retention-manager.js";
export { PersistentStateMachine } from "./persistent-state-machine.js";
export { PgApprovalLog, type ApprovalLogEntry, type ApprovalLogInterface } from "./pg-approval-log.js";
export { PgIdentityStore, type IdentityVersionEntry, type IdentityStoreInterface } from "./pg-identity-store.js";
export { PgMemoryStore } from "./pg-memory-store.js";

// Migrations
export { createAutonomyTables } from "./migrations/001_autonomy_tables.js";
export { addAutonomyEventsHashChain } from "./migrations/002_autonomy_events_hash_chain.js";
