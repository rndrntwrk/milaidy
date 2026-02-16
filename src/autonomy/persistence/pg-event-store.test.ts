/**
 * Tests for PgEventStore.
 *
 * Uses a mock AutonomyDbAdapter to verify SQL generation and
 * row-to-event conversion without a real database.
 */

import { describe, expect, it, vi } from "vitest";

import { PgEventStore } from "./pg-event-store.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

// ---------- Mock ----------

function makeMockAdapter(
  overrides?: Partial<{
    executeRaw: ReturnType<typeof vi.fn>;
    agentId: string;
  }>,
): AutonomyDbAdapter {
  return {
    executeRaw: overrides?.executeRaw ?? vi.fn().mockResolvedValue({ rows: [{ id: 1 }], columns: ["id"] }),
    agentId: overrides?.agentId ?? "test-agent",
    tables: {} as any,
    raw: {} as any,
    initialize: vi.fn(),
    migrate: vi.fn(),
    tableExists: vi.fn(),
  } as unknown as AutonomyDbAdapter;
}

// ---------- Tests ----------

describe("PgEventStore", () => {
  describe("append()", () => {
    it("inserts a row and returns the ID", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [{ id: 42 }], columns: ["id"] });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      const id = await store.append("req-1", "tool:proposed", { tool: "READ_FILE" }, "corr-1");

      expect(id).toBe(42);
      expect(store.size).toBe(1);
      expect(exec).toHaveBeenCalledOnce();
      // Verify SQL contains key parts
      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("INSERT INTO autonomy_events");
      expect(sql).toContain("req-1");
      expect(sql).toContain("tool:proposed");
      expect(sql).toContain("corr-1");
    });

    it("passes NULL for missing correlationId", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], columns: ["id"] });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await store.append("req-1", "tool:proposed", {});

      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("NULL");
    });

    it("escapes single quotes in values", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], columns: ["id"] });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await store.append("req-o'brian", "tool:proposed", { path: "it's" });

      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("req-o''brian");
      expect(sql).toContain("it''s");
    });

    it("throws on database error", async () => {
      const exec = vi.fn().mockRejectedValue(new Error("db gone"));
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await expect(store.append("req-1", "tool:proposed", {})).rejects.toThrow("db gone");
      expect(store.size).toBe(0);
    });

    it("increments size on each successful append", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], columns: ["id"] });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await store.append("r1", "tool:proposed", {});
      await store.append("r2", "tool:proposed", {});
      await store.append("r3", "tool:proposed", {});

      expect(store.size).toBe(3);
    });
  });

  describe("getByRequestId()", () => {
    it("queries by request_id and returns ExecutionEvents", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          { id: 1, request_id: "req-1", type: "tool:proposed", payload: { tool: "A" }, correlation_id: null, timestamp: "2025-01-01T00:00:00Z" },
          { id: 2, request_id: "req-1", type: "tool:executed", payload: { ok: true }, correlation_id: "corr-1", timestamp: "2025-01-01T00:00:01Z" },
        ],
        columns: [],
      });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      const events = await store.getByRequestId("req-1");

      expect(events).toHaveLength(2);
      expect(events[0].sequenceId).toBe(1);
      expect(events[0].requestId).toBe("req-1");
      expect(events[0].type).toBe("tool:proposed");
      expect(events[0].payload).toEqual({ tool: "A" });
      expect(events[0].correlationId).toBeUndefined();
      expect(events[1].correlationId).toBe("corr-1");
    });

    it("returns empty array for no results", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      expect(await store.getByRequestId("nonexistent")).toEqual([]);
    });

    it("returns empty array on database error", async () => {
      const exec = vi.fn().mockRejectedValue(new Error("timeout"));
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      expect(await store.getByRequestId("req-1")).toEqual([]);
    });
  });

  describe("getByCorrelationId()", () => {
    it("queries by correlation_id", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          { id: 5, request_id: "req-1", type: "tool:proposed", payload: {}, correlation_id: "corr-X", timestamp: new Date() },
        ],
        columns: [],
      });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      const events = await store.getByCorrelationId("corr-X");

      expect(events).toHaveLength(1);
      expect(events[0].correlationId).toBe("corr-X");
      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("correlation_id = 'corr-X'");
    });
  });

  describe("getRecent()", () => {
    it("returns events in ascending order", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          { id: 10, request_id: "r1", type: "tool:executed", payload: {}, timestamp: "2025-01-01T01:00:00Z" },
          { id: 5, request_id: "r1", type: "tool:proposed", payload: {}, timestamp: "2025-01-01T00:00:00Z" },
        ],
        columns: [],
      });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      const events = await store.getRecent(2);

      // Should be reversed (oldest first)
      expect(events[0].sequenceId).toBe(5);
      expect(events[1].sequenceId).toBe(10);
    });

    it("returns empty for n <= 0", async () => {
      const adapter = makeMockAdapter();
      const store = new PgEventStore(adapter);

      expect(await store.getRecent(0)).toEqual([]);
      expect(await store.getRecent(-1)).toEqual([]);
    });
  });

  describe("syncSize()", () => {
    it("updates internal size from database count", async () => {
      const exec = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }], columns: ["id"] }) // append
        .mockResolvedValueOnce({ rows: [{ cnt: 42 }], columns: ["cnt"] }); // syncSize

      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await store.append("r1", "tool:proposed", {});
      expect(store.size).toBe(1);

      await store.syncSize();
      expect(store.size).toBe(42);
    });
  });

  describe("rowToEvent conversion", () => {
    it("handles JSON string payload", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          { id: 1, request_id: "r1", type: "tool:proposed", payload: '{"tool":"X"}', timestamp: "2025-01-01T00:00:00Z" },
        ],
        columns: [],
      });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      const events = await store.getByRequestId("r1");
      expect(events[0].payload).toEqual({ tool: "X" });
    });

    it("handles Date object timestamp", async () => {
      const date = new Date("2025-06-15T12:00:00Z");
      const exec = vi.fn().mockResolvedValue({
        rows: [
          { id: 1, request_id: "r1", type: "tool:proposed", payload: {}, timestamp: date },
        ],
        columns: [],
      });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      const events = await store.getByRequestId("r1");
      expect(events[0].timestamp).toBe(date.getTime());
    });
  });
});
