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
    executeRaw: overrides?.executeRaw ?? vi.fn().mockResolvedValue({ rows: [], columns: [] }),
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
      const exec = vi.fn()
        .mockResolvedValueOnce({ rows: [], columns: ["event_hash"] })
        .mockResolvedValueOnce({ rows: [{ id: 42 }], columns: ["id"] });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      const id = await store.append("req-1", "tool:proposed", { tool: "READ_FILE" }, "corr-1");

      expect(id).toBe(42);
      expect(store.size).toBe(1);
      expect(exec).toHaveBeenCalledTimes(2);
      // Verify SQL contains key parts
      const sql = exec.mock.calls[1][0] as string;
      expect(sql).toContain("INSERT INTO autonomy_events");
      expect(sql).toContain("req-1");
      expect(sql).toContain("tool:proposed");
      expect(sql).toContain("corr-1");
      expect(sql).toContain("prev_hash");
      expect(sql).toContain("event_hash");
    });

    it("passes NULL for missing correlationId", async () => {
      const exec = vi.fn()
        .mockResolvedValueOnce({ rows: [], columns: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }], columns: ["id"] });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await store.append("req-1", "tool:proposed", {});

      const sql = exec.mock.calls[1][0] as string;
      expect(sql).toContain("NULL");
    });

    it("escapes single quotes in values", async () => {
      const exec = vi.fn()
        .mockResolvedValueOnce({ rows: [], columns: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }], columns: ["id"] });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await store.append("req-o'brian", "tool:proposed", { path: "it's" });

      const sql = exec.mock.calls[1][0] as string;
      expect(sql).toContain("req-o''brian");
      expect(sql).toContain("it''s");
    });

    it("throws on database error", async () => {
      const exec = vi.fn()
        .mockResolvedValueOnce({ rows: [], columns: [] })
        .mockRejectedValueOnce(new Error("db gone"));
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await expect(store.append("req-1", "tool:proposed", {})).rejects.toThrow("db gone");
      expect(store.size).toBe(0);
    });

    it("increments size on each successful append", async () => {
      const exec = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("RETURNING id")) {
          return { rows: [{ id: 1 }], columns: ["id"] };
        }
        return { rows: [], columns: [] };
      });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await store.append("r1", "tool:proposed", {});
      await store.append("r2", "tool:proposed", {});
      await store.append("r3", "tool:proposed", {});

      expect(store.size).toBe(3);
    });

    it("evicts expired rows before append when retention is enabled", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2025-01-01T00:00:10.000Z"));
        const exec = vi.fn()
          .mockResolvedValueOnce({ rows: [{ id: 9 }], columns: ["id"] }) // retention delete
          .mockResolvedValueOnce({ rows: [], columns: ["event_hash"] }) // hash lookup
          .mockResolvedValueOnce({ rows: [{ id: 10 }], columns: ["id"] }); // insert

        const adapter = makeMockAdapter({ executeRaw: exec });
        const store = new PgEventStore(adapter, {
          retentionMs: 5_000,
          cleanupIntervalMs: 1,
        });

        await store.append("req-1", "tool:proposed", {});

        expect(exec.mock.calls[0][0]).toContain("DELETE FROM autonomy_events");
        expect(exec.mock.calls[0][0]).toContain("timestamp < '2025-01-01T00:00:05.000Z'");
      } finally {
        vi.useRealTimers();
      }
    });

    it("throttles retention cleanup by cleanup interval", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2025-01-01T00:00:10.000Z"));
        const exec = vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes("DELETE FROM autonomy_events")) {
            return { rows: [], columns: ["id"] };
          }
          if (sql.includes("SELECT event_hash")) {
            return { rows: [], columns: ["event_hash"] };
          }
          if (sql.includes("RETURNING id")) {
            return { rows: [{ id: 1 }], columns: ["id"] };
          }
          return { rows: [], columns: [] };
        });
        const adapter = makeMockAdapter({ executeRaw: exec });
        const store = new PgEventStore(adapter, {
          retentionMs: 5_000,
          cleanupIntervalMs: 60_000,
        });

        await store.append("req-1", "tool:proposed", {});
        await store.append("req-2", "tool:proposed", {});

        const retentionDeletes = exec.mock.calls.filter(
          ([sql]) => (sql as string).includes("DELETE FROM autonomy_events"),
        );
        expect(retentionDeletes).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
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
        .mockResolvedValueOnce({ rows: [], columns: ["event_hash"] }) // latest hash lookup
        .mockResolvedValueOnce({ rows: [{ id: 1 }], columns: ["id"] }) // append
        .mockResolvedValueOnce({ rows: [{ cnt: 42 }], columns: ["cnt"] }); // syncSize

      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      await store.append("r1", "tool:proposed", {});
      expect(store.size).toBe(1);

      await store.syncSize();
      expect(store.size).toBe(42);
    });

    it("restores readable event history and size after adapter restart", async () => {
      type StoredRow = {
        id: number;
        request_id: string;
        type: string;
        payload: Record<string, unknown>;
        correlation_id: string | null;
        timestamp: string;
        prev_hash: string | null;
        event_hash: string | null;
      };

      const rows: StoredRow[] = [];
      let nextId = 1;
      const plannedInserts: Array<{
        requestId: string;
        type: string;
        payload: Record<string, unknown>;
        correlationId?: string;
      }> = [
        {
          requestId: "req-restart-1",
          type: "tool:proposed",
          payload: { toolName: "PLAY_EMOTE" },
        },
        {
          requestId: "req-restart-1",
          type: "tool:validated",
          payload: { valid: true },
          correlationId: "corr-r1",
        },
      ];

      const exec = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("SELECT event_hash")) {
          const last = rows[rows.length - 1];
          return {
            rows: last?.event_hash ? [{ event_hash: last.event_hash }] : [],
            columns: ["event_hash"],
          };
        }

        if (sql.includes("INSERT INTO autonomy_events")) {
          const planned = plannedInserts.shift();
          const id = nextId++;
          rows.push({
            id,
            request_id: planned?.requestId ?? `req-${id}`,
            type: planned?.type ?? "tool:proposed",
            payload: planned?.payload ?? {},
            correlation_id: planned?.correlationId ?? null,
            timestamp: `2025-01-01T00:00:0${id}Z`,
            prev_hash: id > 1 ? `hash-${id - 1}` : null,
            event_hash: `hash-${id}`,
          });
          return { rows: [{ id }], columns: ["id"] };
        }

        if (sql.includes("SELECT count(*)::int AS cnt")) {
          return { rows: [{ cnt: rows.length }], columns: ["cnt"] };
        }

        if (sql.includes("FROM autonomy_events") && sql.includes("WHERE request_id =")) {
          const match = sql.match(/WHERE request_id = '([^']+)'/);
          const requestId = match?.[1] ?? "";
          return {
            rows: rows
              .filter((row) => row.request_id === requestId)
              .map((row) => ({
                ...row,
                payload: row.payload,
              })),
            columns: [],
          };
        }

        return { rows: [], columns: [] };
      });

      const adapter = makeMockAdapter({ executeRaw: exec });

      const firstStore = new PgEventStore(adapter);
      await firstStore.append("req-restart-1", "tool:proposed", {
        toolName: "PLAY_EMOTE",
      });
      await firstStore.append(
        "req-restart-1",
        "tool:validated",
        { valid: true },
        "corr-r1",
      );
      expect(firstStore.size).toBe(2);

      // Simulate process restart with a fresh PgEventStore instance.
      const restartedStore = new PgEventStore(adapter);
      expect(restartedStore.size).toBe(0);

      const historyBeforeSync = await restartedStore.getByRequestId("req-restart-1");
      expect(historyBeforeSync).toHaveLength(2);
      expect(historyBeforeSync[0].type).toBe("tool:proposed");
      expect(historyBeforeSync[1].type).toBe("tool:validated");

      await restartedStore.syncSize();
      expect(restartedStore.size).toBe(2);
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

    it("maps hash-chain columns when present", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          {
            id: 7,
            request_id: "r7",
            type: "tool:executed",
            payload: {},
            prev_hash: "prev",
            event_hash: "hash",
            timestamp: "2025-01-01T00:00:00Z",
          },
        ],
        columns: [],
      });
      const adapter = makeMockAdapter({ executeRaw: exec });
      const store = new PgEventStore(adapter);

      const events = await store.getByRequestId("r7");
      expect(events[0].prevHash).toBe("prev");
      expect(events[0].eventHash).toBe("hash");
    });
  });
});
