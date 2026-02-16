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

// Migrations
export { createAutonomyTables } from "./migrations/001_autonomy_tables.js";
