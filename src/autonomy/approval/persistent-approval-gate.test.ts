import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutonomyDbAdapter } from "../persistence/db-adapter.js";
import { PersistentApprovalGate } from "./persistent-approval-gate.js";

function makeCall(overrides?: Partial<Record<string, unknown>>) {
  return {
    tool: "RUN_IN_TERMINAL",
    params: { command: "echo hi" },
    source: "llm" as const,
    requestId: "req-1",
    ...(overrides ?? {}),
  };
}

describe("PersistentApprovalGate", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists request and resolution for in-memory pending approvals", async () => {
    const executeRaw = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    const adapter = { executeRaw } as unknown as AutonomyDbAdapter;
    const gate = new PersistentApprovalGate(adapter, { timeoutMs: 10_000 });

    const pendingPromise = gate.requestApproval(makeCall(), "irreversible");
    const [pending] = gate.getPending();
    expect(pending).toBeDefined();
    if (!pending) {
      throw new Error("expected one pending approval");
    }
    expect(pending.call.tool).toBe("RUN_IN_TERMINAL");

    const accepted = gate.resolve(pending.id, "approved", "tester");
    expect(accepted).toBe(true);

    const result = await pendingPromise;
    expect(result.decision).toBe("approved");
    expect(result.decidedBy).toBe("tester");

    const sqlCalls = executeRaw.mock.calls.map((call) => String(call[0]));
    expect(sqlCalls.some((sql) => sql.includes("INSERT INTO autonomy_approvals"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("UPDATE autonomy_approvals"))).toBe(true);
  });

  it("expires pending requests on timeout", async () => {
    vi.useFakeTimers();

    const executeRaw = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    const adapter = { executeRaw } as unknown as AutonomyDbAdapter;
    const gate = new PersistentApprovalGate(adapter, { timeoutMs: 50 });

    const pendingPromise = gate.requestApproval(makeCall({ requestId: "req-timeout" }), "irreversible");
    expect(gate.getPending()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(51);
    const result = await pendingPromise;

    expect(result.decision).toBe("expired");
    expect(gate.getPending()).toHaveLength(0);
  });

  it("hydrates pending approvals from storage and resolves them", async () => {
    const now = Date.now();
    const rows = [
      {
        id: "approval-1",
        risk_class: "irreversible",
        created_at: new Date(now - 1_000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        call_payload: JSON.stringify({
          tool: "INSTALL_PLUGIN",
          params: { plugin: "x" },
          source: "user",
          requestId: "req-hydrated",
        }),
      },
    ];

    const executeRaw = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM autonomy_approvals")) {
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    });
    const adapter = { executeRaw } as unknown as AutonomyDbAdapter;
    const gate = new PersistentApprovalGate(adapter, { timeoutMs: 10_000 });

    await gate.hydratePending();
    expect(gate.getPending()).toHaveLength(1);
    expect(gate.getPendingById("approval-1")?.call.requestId).toBe("req-hydrated");

    const resolved = gate.resolve("approval-1", "denied", "reviewer");
    expect(resolved).toBe(true);
    expect(gate.getPending()).toHaveLength(0);

    const sqlCalls = executeRaw.mock.calls.map((call) => String(call[0]));
    expect(sqlCalls.some((sql) => sql.includes("SELECT * FROM autonomy_approvals"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("UPDATE autonomy_approvals"))).toBe(true);
  });
});
