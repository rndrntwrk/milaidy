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
  it("addEvents stores events with retainUntil", async () => {
    const manager = new AuditRetentionManager();
    await manager.addEvents([makeEvent(), makeEvent({ sequenceId: 2 })], makePolicy());

    expect(manager.size).toBe(2);
    const summary = await manager.getComplianceSummary();
    expect(summary.eventRecords).toBe(2);
    expect(summary.auditRecords).toBe(0);
  });

  it("addAuditReport stores audit records", async () => {
    const manager = new AuditRetentionManager();
    await manager.addAuditReport({ report: "data" }, makePolicy());

    expect(manager.size).toBe(1);
    const summary = await manager.getComplianceSummary();
    expect(summary.auditRecords).toBe(1);
  });

  it("exportExpired returns only expired records", async () => {
    const manager = new AuditRetentionManager();
    // Use 0ms retention so records expire immediately
    await manager.addEvents([makeEvent()], makePolicy({ eventRetentionMs: 0 }));
    // Use long retention so this one stays
    await manager.addAuditReport({ keep: true }, makePolicy({ auditRetentionMs: 999999 }));

    const exported = await manager.exportExpired();
    expect(exported.records).toHaveLength(1);
    expect(exported.records[0].type).toBe("event");
    expect(exported.format).toBe("jsonl");
    expect(exported.exportedAt).toBeGreaterThan(0);
  });

  it("evictExpired removes expired records", async () => {
    const manager = new AuditRetentionManager();
    await manager.addEvents([makeEvent()], makePolicy({ eventRetentionMs: 0 }));
    await manager.addAuditReport({ keep: true }, makePolicy({ auditRetentionMs: 999999 }));

    const evicted = await manager.evictExpired();
    expect(evicted).toBe(1);
    expect(manager.size).toBe(1);
  });

  it("toJsonl outputs valid JSONL format", async () => {
    const manager = new AuditRetentionManager();
    await manager.addEvents([makeEvent()], makePolicy());
    await manager.addAuditReport({ key: "value" }, makePolicy());

    const jsonl = await manager.toJsonl();
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

  it("getComplianceSummary returns correct counts", async () => {
    const manager = new AuditRetentionManager();
    await manager.addEvents(
      [makeEvent(), makeEvent({ sequenceId: 2 }), makeEvent({ sequenceId: 3 })],
      makePolicy(),
    );
    await manager.addAuditReport({ a: 1 }, makePolicy());
    await manager.addAuditReport({ b: 2 }, makePolicy());

    const summary = await manager.getComplianceSummary();
    expect(summary.totalRecords).toBe(5);
    expect(summary.eventRecords).toBe(3);
    expect(summary.auditRecords).toBe(2);
    expect(summary.oldestRetainUntil).toBeGreaterThan(0);
    expect(summary.newestRetainUntil).toBeGreaterThanOrEqual(summary.oldestRetainUntil);
  });

  it("empty manager returns zero summary", async () => {
    const manager = new AuditRetentionManager();

    expect(manager.size).toBe(0);
    const exported = await manager.exportExpired();
    expect(exported.records).toHaveLength(0);

    const summary = await manager.getComplianceSummary();
    expect(summary.totalRecords).toBe(0);
    expect(summary.oldestRetainUntil).toBe(0);
  });

  it("size reflects current record count", async () => {
    const manager = new AuditRetentionManager();
    expect(manager.size).toBe(0);

    await manager.addEvents([makeEvent()], makePolicy());
    expect(manager.size).toBe(1);

    await manager.addAuditReport({}, makePolicy());
    expect(manager.size).toBe(2);
  });
});
