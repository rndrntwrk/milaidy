import { describe, expect, it } from "vitest";
import type { ExecutionEvent } from "../../workflow/types.js";
import { AuditRetentionManager } from "./retention-manager.js";
import type { RetentionPolicy } from "./types.js";

// ---------- Helpers ----------

function makePolicy(overrides?: Partial<RetentionPolicy>): RetentionPolicy {
  return {
    eventRetentionMs: 1000, // 1 second for testing
    auditRetentionMs: 2000,
    exportBeforeEviction: true,
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<ExecutionEvent>): ExecutionEvent {
  return {
    sequenceId: 1,
    requestId: "req-1",
    type: "tool:executed",
    payload: { data: "test" },
    timestamp: Date.now(),
    ...overrides,
  } as ExecutionEvent;
}

// ---------- Tests ----------

describe("AuditRetentionManager", () => {
  it("addEvents stores events with retainUntil", () => {
    const manager = new AuditRetentionManager();
    manager.addEvents([makeEvent(), makeEvent({ sequenceId: 2 })], makePolicy());

    expect(manager.size).toBe(2);
    const summary = manager.getComplianceSummary();
    expect(summary.eventRecords).toBe(2);
    expect(summary.auditRecords).toBe(0);
  });

  it("addAuditReport stores audit records", () => {
    const manager = new AuditRetentionManager();
    manager.addAuditReport({ report: "data" }, makePolicy());

    expect(manager.size).toBe(1);
    const summary = manager.getComplianceSummary();
    expect(summary.auditRecords).toBe(1);
  });

  it("exportExpired returns only expired records", () => {
    const manager = new AuditRetentionManager();
    // Use 0ms retention so records expire immediately
    manager.addEvents([makeEvent()], makePolicy({ eventRetentionMs: 0 }));
    // Use long retention so this one stays
    manager.addAuditReport({ keep: true }, makePolicy({ auditRetentionMs: 999999 }));

    const exported = manager.exportExpired();
    expect(exported.records).toHaveLength(1);
    expect(exported.records[0].type).toBe("event");
    expect(exported.format).toBe("jsonl");
    expect(exported.exportedAt).toBeGreaterThan(0);
  });

  it("evictExpired removes expired records", () => {
    const manager = new AuditRetentionManager();
    manager.addEvents([makeEvent()], makePolicy({ eventRetentionMs: 0 }));
    manager.addAuditReport({ keep: true }, makePolicy({ auditRetentionMs: 999999 }));

    const evicted = manager.evictExpired();
    expect(evicted).toBe(1);
    expect(manager.size).toBe(1);
  });

  it("toJsonl outputs valid JSONL format", () => {
    const manager = new AuditRetentionManager();
    manager.addEvents([makeEvent()], makePolicy());
    manager.addAuditReport({ key: "value" }, makePolicy());

    const jsonl = manager.toJsonl();
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);

    // Each line should parse as valid JSON
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.type).toBeDefined();
      expect(parsed.data).toBeDefined();
      expect(parsed.retainUntil).toBeGreaterThan(0);
    }
  });

  it("getComplianceSummary returns correct counts", () => {
    const manager = new AuditRetentionManager();
    manager.addEvents(
      [makeEvent(), makeEvent({ sequenceId: 2 }), makeEvent({ sequenceId: 3 })],
      makePolicy(),
    );
    manager.addAuditReport({ a: 1 }, makePolicy());
    manager.addAuditReport({ b: 2 }, makePolicy());

    const summary = manager.getComplianceSummary();
    expect(summary.totalRecords).toBe(5);
    expect(summary.eventRecords).toBe(3);
    expect(summary.auditRecords).toBe(2);
    expect(summary.oldestRetainUntil).toBeGreaterThan(0);
    expect(summary.newestRetainUntil).toBeGreaterThanOrEqual(summary.oldestRetainUntil);
  });

  it("empty manager returns zero summary", () => {
    const manager = new AuditRetentionManager();

    expect(manager.size).toBe(0);
    const exported = manager.exportExpired();
    expect(exported.records).toHaveLength(0);

    const summary = manager.getComplianceSummary();
    expect(summary.totalRecords).toBe(0);
    expect(summary.oldestRetainUntil).toBe(0);
  });

  it("size reflects current record count", () => {
    const manager = new AuditRetentionManager();
    expect(manager.size).toBe(0);

    manager.addEvents([makeEvent()], makePolicy());
    expect(manager.size).toBe(1);

    manager.addAuditReport({}, makePolicy());
    expect(manager.size).toBe(2);
  });
});
