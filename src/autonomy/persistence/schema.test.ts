/**
 * Tests for the autonomy persistence schema definitions.
 *
 * Validates that Drizzle table definitions have the correct columns,
 * types, and indexes that match the domain interfaces they back.
 */

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  autonomyApprovalsTable,
  autonomyAuditTable,
  autonomyEventsTable,
  autonomyGoalsTable,
  autonomyIdentityTable,
  autonomyStateTable,
} from "./schema.js";

// ---------- Helpers ----------

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((c) => c.name);
}

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map((i) => i.config.name);
}

// ---------- Tests ----------

describe("Autonomy persistence schema", () => {
  describe("autonomy_events table", () => {
    it("has correct table name", () => {
      expect(getTableName(autonomyEventsTable)).toBe("autonomy_events");
    });

    it("has all required columns", () => {
      const cols = columnNames(autonomyEventsTable);
      expect(cols).toContain("id");
      expect(cols).toContain("request_id");
      expect(cols).toContain("type");
      expect(cols).toContain("payload");
      expect(cols).toContain("correlation_id");
      expect(cols).toContain("prev_hash");
      expect(cols).toContain("event_hash");
      expect(cols).toContain("agent_id");
      expect(cols).toContain("timestamp");
      expect(cols).toContain("created_at");
    });

    it("has indexes for common query patterns", () => {
      const idxs = indexNames(autonomyEventsTable);
      expect(idxs).toContain("idx_autonomy_events_request_id");
      expect(idxs).toContain("idx_autonomy_events_correlation_id");
      expect(idxs).toContain("idx_autonomy_events_type");
      expect(idxs).toContain("idx_autonomy_events_agent_id");
      expect(idxs).toContain("idx_autonomy_events_timestamp");
      expect(idxs).toContain("idx_autonomy_events_event_hash");
    });
  });

  describe("autonomy_goals table", () => {
    it("has correct table name", () => {
      expect(getTableName(autonomyGoalsTable)).toBe("autonomy_goals");
    });

    it("has all required columns matching Goal interface", () => {
      const cols = columnNames(autonomyGoalsTable);
      expect(cols).toContain("id");
      expect(cols).toContain("description");
      expect(cols).toContain("priority");
      expect(cols).toContain("status");
      expect(cols).toContain("parent_goal_id");
      expect(cols).toContain("success_criteria");
      expect(cols).toContain("source");
      expect(cols).toContain("source_trust");
      expect(cols).toContain("created_at");
      expect(cols).toContain("updated_at");
      expect(cols).toContain("completed_at");
    });

    it("has indexes on status and parent for tree queries", () => {
      const idxs = indexNames(autonomyGoalsTable);
      expect(idxs).toContain("idx_autonomy_goals_status");
      expect(idxs).toContain("idx_autonomy_goals_parent");
    });
  });

  describe("autonomy_state table", () => {
    it("has correct table name", () => {
      expect(getTableName(autonomyStateTable)).toBe("autonomy_state");
    });

    it("has state and consecutiveErrors columns for FSM snapshots", () => {
      const cols = columnNames(autonomyStateTable);
      expect(cols).toContain("state");
      expect(cols).toContain("consecutive_errors");
      expect(cols).toContain("agent_id");
      expect(cols).toContain("snapshot_at");
    });
  });

  describe("autonomy_audit table", () => {
    it("has correct table name", () => {
      expect(getTableName(autonomyAuditTable)).toBe("autonomy_audit");
    });

    it("has all columns matching RetentionRecord interface", () => {
      const cols = columnNames(autonomyAuditTable);
      expect(cols).toContain("type");
      expect(cols).toContain("data");
      expect(cols).toContain("retain_until");
      expect(cols).toContain("exported_at");
    });

    it("has retain_until index for expiry queries", () => {
      const idxs = indexNames(autonomyAuditTable);
      expect(idxs).toContain("idx_autonomy_audit_retain_until");
    });
  });

  describe("autonomy_approvals table", () => {
    it("has correct table name", () => {
      expect(getTableName(autonomyApprovalsTable)).toBe("autonomy_approvals");
    });

    it("has all columns for approval request + result", () => {
      const cols = columnNames(autonomyApprovalsTable);
      expect(cols).toContain("id");
      expect(cols).toContain("tool_name");
      expect(cols).toContain("risk_class");
      expect(cols).toContain("call_payload");
      expect(cols).toContain("decision");
      expect(cols).toContain("decided_by");
      expect(cols).toContain("created_at");
      expect(cols).toContain("expires_at");
      expect(cols).toContain("decided_at");
    });

    it("has indexes for querying by decision and tool", () => {
      const idxs = indexNames(autonomyApprovalsTable);
      expect(idxs).toContain("idx_autonomy_approvals_decision");
      expect(idxs).toContain("idx_autonomy_approvals_tool_name");
    });
  });

  describe("autonomy_identity table", () => {
    it("has correct table name", () => {
      expect(getTableName(autonomyIdentityTable)).toBe("autonomy_identity");
    });

    it("has version, identity, hash, and active columns", () => {
      const cols = columnNames(autonomyIdentityTable);
      expect(cols).toContain("version");
      expect(cols).toContain("identity");
      expect(cols).toContain("hash");
      expect(cols).toContain("agent_id");
      expect(cols).toContain("active");
    });

    it("has composite indexes for agent+version and agent+active", () => {
      const idxs = indexNames(autonomyIdentityTable);
      expect(idxs).toContain("idx_autonomy_identity_agent_version");
      expect(idxs).toContain("idx_autonomy_identity_active");
    });
  });

  describe("cross-table consistency", () => {
    it("all tables have unique names", () => {
      const names = [
        getTableName(autonomyEventsTable),
        getTableName(autonomyGoalsTable),
        getTableName(autonomyStateTable),
        getTableName(autonomyAuditTable),
        getTableName(autonomyApprovalsTable),
        getTableName(autonomyIdentityTable),
      ];
      expect(new Set(names).size).toBe(6);
    });

    it("all index names are globally unique across tables", () => {
      const allIndexes = [
        ...indexNames(autonomyEventsTable),
        ...indexNames(autonomyGoalsTable),
        ...indexNames(autonomyStateTable),
        ...indexNames(autonomyAuditTable),
        ...indexNames(autonomyApprovalsTable),
        ...indexNames(autonomyIdentityTable),
      ];
      expect(new Set(allIndexes).size).toBe(allIndexes.length);
    });
  });
});
