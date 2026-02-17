import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposedToolCall } from "../tools/types.js";
import { metrics } from "../../telemetry/setup.js";
import { ApprovalGate } from "./approval-gate.js";

function makeCall(overrides: Partial<ProposedToolCall> = {}): ProposedToolCall {
  return {
    tool: "RUN_IN_TERMINAL",
    params: { command: "echo hello" },
    source: "llm",
    requestId: "test-req-1",
    ...overrides,
  };
}

describe("ApprovalGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("requestApproval()", () => {
    it("returns a promise that resolves when approved", async () => {
      const gate = new ApprovalGate({ timeoutMs: 10_000 });
      const promise = gate.requestApproval(makeCall(), "irreversible");

      // Should have one pending request
      expect(gate.getPending()).toHaveLength(1);

      // Approve it
      const found = gate.resolve(gate.getPending()[0].id, "approved", "user-1");
      expect(found).toBe(true);

      const result = await promise;
      expect(result.decision).toBe("approved");
      expect(result.decidedBy).toBe("user-1");
      expect(result.decidedAt).toBeGreaterThan(0);
    });

    it("returns a promise that resolves when denied", async () => {
      const gate = new ApprovalGate({ timeoutMs: 10_000 });
      const promise = gate.requestApproval(makeCall(), "irreversible");

      gate.resolve(gate.getPending()[0].id, "denied", "admin");

      const result = await promise;
      expect(result.decision).toBe("denied");
      expect(result.decidedBy).toBe("admin");
    });

    it("auto-expires after timeout", async () => {
      const gate = new ApprovalGate({ timeoutMs: 5_000 });
      const promise = gate.requestApproval(makeCall(), "irreversible");

      expect(gate.getPending()).toHaveLength(1);

      // Advance time past timeout
      vi.advanceTimersByTime(5_001);

      const result = await promise;
      expect(result.decision).toBe("expired");
      expect(result.decidedBy).toBeUndefined();
      expect(gate.getPending()).toHaveLength(0);
    });

    it("handles concurrent requests independently", async () => {
      const gate = new ApprovalGate({ timeoutMs: 10_000 });

      const promise1 = gate.requestApproval(
        makeCall({ requestId: "req-1" }),
        "irreversible",
      );
      const promise2 = gate.requestApproval(
        makeCall({ requestId: "req-2" }),
        "reversible",
      );

      expect(gate.getPending()).toHaveLength(2);

      const pending = gate.getPending();
      gate.resolve(pending[0].id, "approved");
      gate.resolve(pending[1].id, "denied");

      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1.decision).toBe("approved");
      expect(result2.decision).toBe("denied");
      expect(gate.getPending()).toHaveLength(0);
    });

    it("creates request with correct fields", () => {
      const gate = new ApprovalGate({ timeoutMs: 30_000 });
      const call = makeCall({ tool: "INSTALL_PLUGIN", requestId: "req-99" });
      gate.requestApproval(call, "irreversible");

      const pending = gate.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].call).toBe(call);
      expect(pending[0].riskClass).toBe("irreversible");
      expect(pending[0].expiresAt).toBe(pending[0].createdAt + 30_000);
    });

    it("records approval request/decision queue and latency metrics", async () => {
      const gate = new ApprovalGate({ timeoutMs: 10_000 });
      const before = metrics.getSnapshot();

      const pendingPromise = gate.requestApproval(
        makeCall({ requestId: "req-metrics" }),
        "irreversible",
      );
      const mid = metrics.getSnapshot();
      const requestKey = 'autonomy_approval_requests_total:{"risk_class":"irreversible"}';
      expect((mid.counters[requestKey] ?? 0) - (before.counters[requestKey] ?? 0)).toBe(1);
      expect(mid.counters["autonomy_approval_queue_size"]).toBe(1);

      gate.resolve(gate.getPending()[0].id, "approved", "operator");
      await pendingPromise;

      const after = metrics.getSnapshot();
      const decisionKey = 'autonomy_approval_decisions_total:{"decision":"approved"}';
      expect((after.counters[decisionKey] ?? 0) - (before.counters[decisionKey] ?? 0)).toBe(1);
      expect(after.histograms["autonomy_approval_turnaround_ms:{}"]).toBeDefined();
      expect(after.counters["autonomy_approval_queue_size"]).toBe(0);
    });
  });

  describe("resolve()", () => {
    it("returns false for unknown request ID", () => {
      const gate = new ApprovalGate();
      expect(gate.resolve("unknown-id", "approved")).toBe(false);
    });

    it("returns false for already-resolved request", async () => {
      const gate = new ApprovalGate({ timeoutMs: 10_000 });
      gate.requestApproval(makeCall(), "irreversible");

      const id = gate.getPending()[0].id;
      expect(gate.resolve(id, "approved")).toBe(true);
      expect(gate.resolve(id, "denied")).toBe(false);
    });
  });

  describe("getPendingById()", () => {
    it("returns the request for a valid ID", () => {
      const gate = new ApprovalGate();
      gate.requestApproval(makeCall(), "irreversible");
      const id = gate.getPending()[0].id;
      expect(gate.getPendingById(id)).toBeDefined();
      expect(gate.getPendingById(id)?.id).toBe(id);
    });

    it("returns undefined for unknown ID", () => {
      const gate = new ApprovalGate();
      expect(gate.getPendingById("nonexistent")).toBeUndefined();
    });
  });

  describe("dispose()", () => {
    it("resolves all pending requests as expired", async () => {
      const gate = new ApprovalGate({ timeoutMs: 60_000 });

      const promise1 = gate.requestApproval(
        makeCall({ requestId: "req-1" }),
        "irreversible",
      );
      const promise2 = gate.requestApproval(
        makeCall({ requestId: "req-2" }),
        "reversible",
      );

      expect(gate.getPending()).toHaveLength(2);

      gate.dispose();

      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1.decision).toBe("expired");
      expect(result2.decision).toBe("expired");
      expect(gate.getPending()).toHaveLength(0);
    });

    it("does not leak timers after dispose", () => {
      const gate = new ApprovalGate({ timeoutMs: 60_000 });
      gate.requestApproval(makeCall(), "irreversible");
      gate.dispose();

      // Advancing time should not cause issues
      vi.advanceTimersByTime(120_000);
      expect(gate.getPending()).toHaveLength(0);
    });
  });

  describe("event emissions", () => {
    it("emits autonomy:approval:requested on requestApproval", () => {
      const mockEmit = vi.fn();
      const gate = new ApprovalGate({
        timeoutMs: 10_000,
        eventBus: { emit: mockEmit },
      });

      gate.requestApproval(
        makeCall({ tool: "RUN_IN_TERMINAL", requestId: "req-7" }),
        "irreversible",
      );

      expect(mockEmit).toHaveBeenCalledWith("autonomy:approval:requested", {
        requestId: "req-7",
        toolName: "RUN_IN_TERMINAL",
        riskClass: "irreversible",
        expiresAt: expect.any(Number),
      });
    });

    it("emits autonomy:approval:resolved on resolve", () => {
      const mockEmit = vi.fn();
      const gate = new ApprovalGate({
        timeoutMs: 10_000,
        eventBus: { emit: mockEmit },
      });

      gate.requestApproval(
        makeCall({ tool: "INSTALL_PLUGIN", requestId: "req-8" }),
        "irreversible",
      );
      mockEmit.mockClear();

      gate.resolve(gate.getPending()[0].id, "approved", "admin");

      expect(mockEmit).toHaveBeenCalledWith("autonomy:approval:resolved", {
        requestId: "req-8",
        toolName: "INSTALL_PLUGIN",
        decision: "approved",
        decidedBy: "admin",
      });
    });

    it("emits resolved event on timeout expiry", async () => {
      const mockEmit = vi.fn();
      const gate = new ApprovalGate({
        timeoutMs: 5_000,
        eventBus: { emit: mockEmit },
      });

      const promise = gate.requestApproval(
        makeCall({ requestId: "req-9" }),
        "irreversible",
      );
      mockEmit.mockClear();

      vi.advanceTimersByTime(5_001);
      await promise;

      expect(mockEmit).toHaveBeenCalledWith("autonomy:approval:resolved", {
        requestId: "req-9",
        toolName: "RUN_IN_TERMINAL",
        decision: "expired",
        decidedBy: undefined,
      });
    });
  });
});
