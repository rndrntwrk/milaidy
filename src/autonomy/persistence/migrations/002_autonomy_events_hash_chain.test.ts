import { describe, expect, it, vi } from "vitest";

import { computeEventHash } from "../../workflow/event-integrity.js";
import { addAutonomyEventsHashChain } from "./002_autonomy_events_hash_chain.js";
import type { AutonomyDbAdapter } from "../db-adapter.js";

type RawResult = { rows: Record<string, unknown>[]; columns: string[] };

function makeAdapter(
  executeRaw: (sql: string) => Promise<RawResult>,
): AutonomyDbAdapter {
  return { executeRaw } as unknown as AutonomyDbAdapter;
}

describe("addAutonomyEventsHashChain", () => {
  it("skips backfill when chain columns are already complete", async () => {
    const exec = vi.fn(async (sql: string): Promise<RawResult> => {
      if (sql.includes("AS missing_hash")) {
        return {
          rows: [{ missing_hash: false, missing_prev_chain: false }],
          columns: ["missing_hash", "missing_prev_chain"],
        };
      }
      return { rows: [], columns: [] };
    });

    await addAutonomyEventsHashChain(makeAdapter(exec));

    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec.mock.calls[0][0]).toContain("ADD COLUMN IF NOT EXISTS prev_hash");
    expect(exec.mock.calls[1][0]).toContain("AS missing_hash");
    expect(exec.mock.calls[2][0]).toContain("CREATE UNIQUE INDEX");
    expect(
      exec.mock.calls.some(([sql]) => sql.includes("UPDATE autonomy_events")),
    ).toBe(false);
  });

  it("recomputes chain hashes per agent in ID order when backfill is required", async () => {
    const updates: string[] = [];
    const exec = vi.fn(async (sql: string): Promise<RawResult> => {
      if (sql.includes("AS missing_hash")) {
        return {
          rows: [{ missing_hash: true, missing_prev_chain: true }],
          columns: ["missing_hash", "missing_prev_chain"],
        };
      }
      if (sql.includes("SELECT id, request_id, type, payload")) {
        return {
          rows: [
            {
              id: 1,
              request_id: "r1",
              type: "tool:proposed",
              payload: { a: 1 },
              correlation_id: null,
              agent_id: "agent-a",
              timestamp: "2025-01-01T00:00:00.000Z",
            },
            {
              id: 2,
              request_id: "r1",
              type: "tool:validated",
              payload: "{\"b\":2,\"a\":1}",
              correlation_id: "c-1",
              agent_id: "agent-a",
              timestamp: "2025-01-01T00:00:01.000Z",
            },
            {
              id: 3,
              request_id: "r2",
              type: "tool:proposed",
              payload: { z: true },
              correlation_id: null,
              agent_id: "agent-b",
              timestamp: "2025-01-01T00:00:02.000Z",
            },
          ],
          columns: [],
        };
      }
      if (sql.includes("UPDATE autonomy_events")) {
        updates.push(sql);
        return { rows: [], columns: [] };
      }
      return { rows: [], columns: [] };
    });

    await addAutonomyEventsHashChain(makeAdapter(exec));

    const hash1 = computeEventHash({
      requestId: "r1",
      type: "tool:proposed",
      payload: { a: 1 },
      timestamp: Date.parse("2025-01-01T00:00:00.000Z"),
      prevHash: undefined,
      correlationId: undefined,
    });
    const hash2 = computeEventHash({
      requestId: "r1",
      type: "tool:validated",
      payload: { a: 1, b: 2 },
      timestamp: Date.parse("2025-01-01T00:00:01.000Z"),
      prevHash: hash1,
      correlationId: "c-1",
    });
    const hash3 = computeEventHash({
      requestId: "r2",
      type: "tool:proposed",
      payload: { z: true },
      timestamp: Date.parse("2025-01-01T00:00:02.000Z"),
      prevHash: undefined,
      correlationId: undefined,
    });

    const update1 = updates.find((sql) => sql.includes("WHERE id = 1"));
    const update2 = updates.find((sql) => sql.includes("WHERE id = 2"));
    const update3 = updates.find((sql) => sql.includes("WHERE id = 3"));

    expect(update1).toContain("prev_hash = NULL");
    expect(update1).toContain(`event_hash = '${hash1}'`);
    expect(update2).toContain(`prev_hash = '${hash1}'`);
    expect(update2).toContain(`event_hash = '${hash2}'`);
    expect(update3).toContain("prev_hash = NULL");
    expect(update3).toContain(`event_hash = '${hash3}'`);
  });
});
