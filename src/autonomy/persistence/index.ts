/**
 * Autonomy Kernel persistence layer barrel exports.
 *
 * @module autonomy/persistence
 */

// Database adapter
export {
  AutonomyDbAdapter,
  type AutonomyDbAdapterConfig,
  type DrizzleDb,
} from "./db-adapter.js";
// Migrations
export { createAutonomyTables } from "./migrations/001_autonomy_tables.js";
export { addAutonomyEventsHashChain } from "./migrations/002_autonomy_events_hash_chain.js";
export { PersistentStateMachine } from "./persistent-state-machine.js";
export {
  type ApprovalLogEntry,
  type ApprovalLogInterface,
  PgApprovalLog,
} from "./pg-approval-log.js";
// Persistent implementations
export { PgEventStore } from "./pg-event-store.js";
export { PgGoalManager } from "./pg-goal-manager.js";
export {
  type IdentityStoreInterface,
  type IdentityVersionEntry,
  PgIdentityStore,
} from "./pg-identity-store.js";
export { PgMemoryStore } from "./pg-memory-store.js";
export { PgRetentionManager } from "./pg-retention-manager.js";
// Schema — Drizzle table definitions and inferred row types
export {
  type AutonomyApprovalInsert,
  type AutonomyApprovalRow,
  type AutonomyAuditInsert,
  type AutonomyAuditRow,
  type AutonomyEventInsert,
  type AutonomyEventRow,
  type AutonomyGoalInsert,
  type AutonomyGoalRow,
  type AutonomyIdentityInsert,
  type AutonomyIdentityRow,
  type AutonomyMemoryInsert,
  type AutonomyMemoryQuarantineInsert,
  type AutonomyMemoryQuarantineRow,
  type AutonomyMemoryRow,
  type AutonomyStateInsert,
  type AutonomyStateRow,
  autonomyApprovalsTable,
  autonomyAuditTable,
  autonomyEventsTable,
  autonomyGoalsTable,
  autonomyIdentityTable,
  autonomyMemoryQuarantineTable,
  autonomyMemoryTable,
  autonomyStateTable,
} from "./schema.js";
