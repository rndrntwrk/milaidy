/**
 * Tests for PgRetentionManager.
 */

import { describe, expect, it, vi } from "vitest";

import { PgRetentionManager } from "./pg-retention-manager.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";
import type { ExecutionEvent } from "../workflow/types.js";

// ---------- Mock ----------

function makeMockAdapter(
  execFn?: ReturnType<typeof vi.fn>,
): AutonomyDbAdapter {
  return {
    executeRaw: execFn ?? vi.fn().mockResolvedValue({ rows: [], columns: [] }),
    agentId: "test-agent",
  } as unknown as AutonomyDbAdapter;
}

function makeEvent(overrides?: Partial<ExecutionEvent>): ExecutionEvent {
  return {
    sequenceId: 1,
    requestId: "req-1",
    type: "tool:executed",
    payload: { tool: "READ_FILE" },
    timestamp: Date.now(),
    ...overrides,
  } as ExecutionEvent;
}

const policy = { eventRetentionMs: 60_000, auditRetentionMs: 120_000, exportBeforeEviction: true };

// ---------- Tests ----------

describe("PgRetentionManager", () => {
  describe("addEvents()", () => {
    it("inserts event records", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgRetentionManager(adapter);

      await mgr.addEvents([makeEvent(), makeEvent({ sequenceId: 2 })], policy);

      expect(exec).toHaveBeenCalledTimes(2);
      expect(mgr.size).toBe(2);
      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("INSERT INTO autonomy_audit");
      expect(sql).toContain("'event'");
    });
  });

  describe("addAuditReport()", () => {
    it("inserts audit record", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgRetentionManager(adapter);

      await mgr.addAuditReport({ policyId: "coding-governance", passed: true }, policy);

      expect(exec).toHaveBeenCalledOnce();
      expect(mgr.size).toBe(1);
      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("'audit'");
    });
  });

  describe("exportExpired()", () => {
    it("returns exported records", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          { type: "event", data: { tool: "A" }, retain_until: "2025-01-01T00:00:00Z", exported_at: "2025-01-02T00:00:00Z" },
        ],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgRetentionManager(adapter);

      const result = await mgr.exportExpired();

      expect(result.records).toHaveLength(1);
      expect(result.records[0].type).toBe("event");
      expect(result.format).toBe("jsonl");
      expect(result.exportedAt).toBeGreaterThan(0);
    });
  });

  describe("evictExpired()", () => {
    it("returns number of evicted records", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
        columns: ["id"],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgRetentionManager(adapter);
      // Simulate 5 records
      (mgr as any)._size = 5;

      const count = await mgr.evictExpired();

      expect(count).toBe(3);
      expect(mgr.size).toBe(2);
    });
  });

  describe("toJsonl()", () => {
    it("returns JSONL string", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          { type: "event", data: { a: 1 }, retain_until: "2025-01-01T00:00:00Z" },
          { type: "audit", data: { b: 2 }, retain_until: "2025-02-01T00:00:00Z" },
        ],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgRetentionManager(adapter);

      const jsonl = await mgr.toJsonl();
      const lines = jsonl.split("\n");

      expect(lines).toHaveLength(2);
      const parsed0 = JSON.parse(lines[0]);
      expect(parsed0.type).toBe("event");
      expect(parsed0.data).toEqual({ a: 1 });
    });
  });

  describe("getComplianceSummary()", () => {
    it("returns aggregate summary", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{
          total_records: 5,
          event_records: 3,
          audit_records: 2,
          oldest_retain_until: 1700000000000,
          newest_retain_until: 1800000000000,
        }],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgRetentionManager(adapter);

      const summary = await mgr.getComplianceSummary();

      expect(summary.totalRecords).toBe(5);
      expect(summary.eventRecords).toBe(3);
      expect(summary.auditRecords).toBe(2);
      expect(summary.oldestRetainUntil).toBe(1700000000000);
    });
  });

  describe("syncSize()", () => {
    it("updates size from database", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{ cnt: 42 }],
        columns: ["cnt"],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgRetentionManager(adapter);

      await mgr.syncSize();
      expect(mgr.size).toBe(42);
    });
  });
});
