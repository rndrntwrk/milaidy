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

// Migrations
export { createAutonomyTables } from "./migrations/001_autonomy_tables.js";
