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
