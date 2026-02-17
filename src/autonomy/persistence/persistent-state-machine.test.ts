/**
 * Tests for PersistentStateMachine decorator.
 */

import { describe, expect, it, vi } from "vitest";

import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import { PersistentStateMachine } from "./persistent-state-machine.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

// ---------- Mock ----------

function makeMockAdapter(
  execFn?: ReturnType<typeof vi.fn>,
): AutonomyDbAdapter {
  return {
    executeRaw: execFn ?? vi.fn().mockResolvedValue({ rows: [], columns: [] }),
    agentId: "test-agent",
  } as unknown as AutonomyDbAdapter;
}

// ---------- Tests ----------

describe("PersistentStateMachine", () => {
  it("delegates currentState and consecutiveErrors to inner", () => {
    const inner = new KernelStateMachine();
    const adapter = makeMockAdapter();
    const psm = new PersistentStateMachine(inner, adapter);

    expect(psm.currentState).toBe("idle");
    expect(psm.consecutiveErrors).toBe(0);
  });

  it("transition delegates to inner and snapshots on accept", async () => {
    const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
    const inner = new KernelStateMachine();
    const adapter = makeMockAdapter(exec);
    const psm = new PersistentStateMachine(inner, adapter);

    const result = psm.transition("tool_validated");

    expect(result.accepted).toBe(true);
    expect(result.to).toBe("executing");
    expect(psm.currentState).toBe("executing");

    // Wait for the async snapshot to complete
    await vi.waitFor(() => {
      expect(exec).toHaveBeenCalledOnce();
    });
    const sql = exec.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO autonomy_state");
    expect(sql).toContain("executing");
  });

  it("serializes snapshot writes in transition order", async () => {
    const persistedStates: string[] = [];
    const exec = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO autonomy_state")) {
        const match = sql.match(/VALUES \('([^']+)'/);
        const state = match?.[1] ?? "unknown";
        // Simulate slower first write to expose ordering races.
        if (state === "executing") {
          await new Promise((resolve) => setTimeout(resolve, 40));
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        persistedStates.push(state);
      }
      return { rows: [], columns: [] };
    });
    const inner = new KernelStateMachine();
    const adapter = makeMockAdapter(exec);
    const psm = new PersistentStateMachine(inner, adapter);

    psm.transition("tool_validated"); // idle -> executing
    psm.transition("execution_complete"); // executing -> verifying

    await vi.waitFor(() => {
      expect(persistedStates).toEqual(["executing", "verifying"]);
    });
  });

  it("does not snapshot on rejected transition", async () => {
    const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
    const inner = new KernelStateMachine();
    const adapter = makeMockAdapter(exec);
    const psm = new PersistentStateMachine(inner, adapter);

    // Try invalid transition from idle
    const result = psm.transition("approval_granted");

    expect(result.accepted).toBe(false);

    // Give time for any potential async call
    await new Promise((r) => setTimeout(r, 50));
    expect(exec).not.toHaveBeenCalled();
  });

  it("reset delegates and snapshots", async () => {
    const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
    const inner = new KernelStateMachine();
    const adapter = makeMockAdapter(exec);
    const psm = new PersistentStateMachine(inner, adapter);

    // Move to a non-idle state first
    psm.transition("tool_validated");
    await vi.waitFor(() => {
      expect(exec).toHaveBeenCalledTimes(1);
    });
    exec.mockClear();

    psm.reset();
    expect(psm.currentState).toBe("idle");

    await vi.waitFor(() => {
      expect(exec).toHaveBeenCalledOnce();
    });
    const sql = exec.mock.calls[0][0] as string;
    expect(sql).toContain("idle");
  });

  it("onStateChange delegates to inner", () => {
    const inner = new KernelStateMachine();
    const adapter = makeMockAdapter();
    const psm = new PersistentStateMachine(inner, adapter);

    const listener = vi.fn();
    const unsub = psm.onStateChange(listener);

    psm.transition("tool_validated");
    expect(listener).toHaveBeenCalledWith("idle", "executing", "tool_validated");

    unsub();
    psm.transition("execution_complete");
    expect(listener).toHaveBeenCalledTimes(1); // Not called again after unsub
  });

  describe("recover()", () => {
    it("returns recovered state from database", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{ state: "safe_mode", consecutive_errors: 3 }],
        columns: [],
      });
      const inner = new KernelStateMachine();
      const adapter = makeMockAdapter(exec);
      const psm = new PersistentStateMachine(inner, adapter);

      const result = await psm.recover();

      expect(result.recovered).toBe(true);
      expect(result.state).toBe("safe_mode");
      expect(result.consecutiveErrors).toBe(3);
      expect(psm.currentState).toBe("safe_mode");
      expect(psm.consecutiveErrors).toBe(3);
      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("ORDER BY snapshot_at DESC, id DESC");
    });

    it("replays state from idle when inner machine has no restoreSnapshot support", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{ state: "auditing", consecutive_errors: 0 }],
        columns: [],
      });
      const base = new KernelStateMachine();
      const inner = {
        get currentState() {
          return base.currentState;
        },
        get consecutiveErrors() {
          return base.consecutiveErrors;
        },
        transition(trigger: Parameters<KernelStateMachine["transition"]>[0]) {
          return base.transition(trigger);
        },
        onStateChange(listener: Parameters<KernelStateMachine["onStateChange"]>[0]) {
          return base.onStateChange(listener);
        },
        reset() {
          base.reset();
        },
      };
      const adapter = makeMockAdapter(exec);
      const psm = new PersistentStateMachine(inner, adapter);

      const recovered = await psm.recover();

      expect(recovered.recovered).toBe(true);
      expect(psm.currentState).toBe("auditing");
      expect(psm.consecutiveErrors).toBe(0);
    });

    it("returns recovered=false when no snapshots exist", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const inner = new KernelStateMachine();
      const adapter = makeMockAdapter(exec);
      const psm = new PersistentStateMachine(inner, adapter);

      const result = await psm.recover();

      expect(result.recovered).toBe(false);
    });

    it("returns recovered=false on database error", async () => {
      const exec = vi.fn().mockRejectedValue(new Error("db down"));
      const inner = new KernelStateMachine();
      const adapter = makeMockAdapter(exec);
      const psm = new PersistentStateMachine(inner, adapter);

      const result = await psm.recover();

      expect(result.recovered).toBe(false);
    });

    it("recovers latest snapshot after simulated process restart", async () => {
      const snapshots: Array<{ state: string; consecutiveErrors: number }> = [];
      const exec = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO autonomy_state")) {
          const match = sql.match(/VALUES \('([^']+)',\s*(\d+)/);
          snapshots.push({
            state: match?.[1] ?? "idle",
            consecutiveErrors: Number(match?.[2] ?? 0),
          });
          return { rows: [], columns: [] };
        }
        if (sql.includes("SELECT state, consecutive_errors")) {
          const last = snapshots[snapshots.length - 1];
          if (!last) return { rows: [], columns: [] };
          return {
            rows: [
              {
                state: last.state,
                consecutive_errors: last.consecutiveErrors,
              },
            ],
            columns: [],
          };
        }
        return { rows: [], columns: [] };
      });

      const adapter = makeMockAdapter(exec);

      const firstInner = new KernelStateMachine();
      const firstPsm = new PersistentStateMachine(firstInner, adapter);
      firstPsm.transition("tool_validated"); // idle -> executing
      firstPsm.transition("execution_complete"); // executing -> verifying

      await vi.waitFor(() => {
        expect(snapshots.length).toBeGreaterThanOrEqual(2);
      });

      // Simulate restart by creating a fresh wrapper and inner state machine.
      const secondInner = new KernelStateMachine();
      const secondPsm = new PersistentStateMachine(secondInner, adapter);
      const recovered = await secondPsm.recover();

      expect(recovered.recovered).toBe(true);
      expect(recovered.state).toBe("verifying");
      expect(recovered.consecutiveErrors).toBe(0);
      expect(secondPsm.currentState).toBe("verifying");
      expect(secondPsm.consecutiveErrors).toBe(0);
    });
  });

  it("handles snapshot failure gracefully", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("write failed"));
    const inner = new KernelStateMachine();
    const adapter = makeMockAdapter(exec);
    const psm = new PersistentStateMachine(inner, adapter);

    // Should not throw
    const result = psm.transition("tool_validated");
    expect(result.accepted).toBe(true);
    expect(psm.currentState).toBe("executing");

    // Wait for the async error to be logged
    await new Promise((r) => setTimeout(r, 50));
    // No crash — just logged
  });
});
