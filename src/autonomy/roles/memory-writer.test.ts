import { describe, expect, it, vi } from "vitest";
import type {
  MemoryGate,
  MemoryGateDecision,
  MemoryGateStats,
} from "../memory/gate.js";
import { GatedMemoryWriter } from "./memory-writer.js";
import type { MemoryWriteRequest } from "./types.js";

function createMockMemoryGate(
  decision: MemoryGateDecision["action"] = "allow",
): MemoryGate {
  return {
    evaluate: vi.fn(async () => ({
      action: decision,
      trustScore: {
        score:
          decision === "allow" ? 0.9 : decision === "quarantine" ? 0.5 : 0.1,
        dimensions: {
          sourceReliability: 0.9,
          contentConsistency: 0.9,
          temporalCoherence: 0.9,
          instructionAlignment: 0.9,
        },
        reasoning: ["test"],
        computedAt: Date.now(),
      },
      reason: `Test ${decision}`,
    })),
    getQuarantined: vi.fn(async () => []),
    reviewQuarantined: vi.fn(async () => null),
    getStats: vi.fn(() => ({
      allowed: 10,
      quarantined: 2,
      rejected: 1,
      pendingReview: 2,
    })),
  } as unknown as MemoryGate;
}

const baseRequest: MemoryWriteRequest = {
  content: "Test memory content",
  source: { id: "user-1", type: "user", reliability: 0.9 },
  agentId: "agent-1",
};

describe("GatedMemoryWriter", () => {
  describe("write()", () => {
    it("delegates to MemoryGate.evaluate()", async () => {
      const gate = createMockMemoryGate("allow");
      const writer = new GatedMemoryWriter(gate);

      const decision = await writer.write(baseRequest);

      expect(gate.evaluate).toHaveBeenCalled();
      expect(decision.action).toBe("allow");
    });

    it("returns allow decision", async () => {
      const gate = createMockMemoryGate("allow");
      const writer = new GatedMemoryWriter(gate);
      const decision = await writer.write(baseRequest);
      expect(decision.action).toBe("allow");
    });

    it("returns quarantine decision", async () => {
      const gate = createMockMemoryGate("quarantine");
      const writer = new GatedMemoryWriter(gate);
      const decision = await writer.write(baseRequest);
      expect(decision.action).toBe("quarantine");
    });

    it("returns reject decision", async () => {
      const gate = createMockMemoryGate("reject");
      const writer = new GatedMemoryWriter(gate);
      const decision = await writer.write(baseRequest);
      expect(decision.action).toBe("reject");
    });

    it("constructs valid Memory objects from MemoryWriteRequest", async () => {
      const gate = createMockMemoryGate("allow");
      const writer = new GatedMemoryWriter(gate);

      await writer.write(baseRequest);

      const call = (gate.evaluate as ReturnType<typeof vi.fn>).mock.calls[0];
      const memory = call[0];
      expect(memory.agentId).toBe("agent-1");
      expect(memory.content.text).toBe("Test memory content");
      expect(memory.id).toBeDefined();
    });
  });

  describe("writeBatch()", () => {
    it("aggregates counts correctly", async () => {
      let callCount = 0;
      const gate: MemoryGate = {
        evaluate: vi.fn(async () => {
          const actions: Array<MemoryGateDecision["action"]> = [
            "allow",
            "quarantine",
            "reject",
          ];
          const action = actions[callCount++ % 3];
          return {
            action,
            trustScore: {
              score: 0.5,
              dimensions: {
                sourceReliability: 0.5,
                contentConsistency: 0.5,
                temporalCoherence: 0.5,
                instructionAlignment: 0.5,
              },
              reasoning: [],
              computedAt: Date.now(),
            },
            reason: "test",
          };
        }),
        getQuarantined: vi.fn(async () => []),
        reviewQuarantined: vi.fn(async () => null),
        getStats: vi.fn(() => ({
          allowed: 0,
          quarantined: 0,
          rejected: 0,
          pendingReview: 0,
        })),
      } as unknown as MemoryGate;

      const writer = new GatedMemoryWriter(gate);
      const report = await writer.writeBatch([
        baseRequest,
        { ...baseRequest, content: "Two" },
        { ...baseRequest, content: "Three" },
      ]);

      expect(report.total).toBe(3);
      expect(report.allowed).toBe(1);
      expect(report.quarantined).toBe(1);
      expect(report.rejected).toBe(1);
    });

    it("handles empty batch", async () => {
      const gate = createMockMemoryGate("allow");
      const writer = new GatedMemoryWriter(gate);
      const report = await writer.writeBatch([]);

      expect(report.total).toBe(0);
      expect(report.allowed).toBe(0);
      expect(report.quarantined).toBe(0);
      expect(report.rejected).toBe(0);
    });

    it("handles all-allow batch", async () => {
      const gate = createMockMemoryGate("allow");
      const writer = new GatedMemoryWriter(gate);
      const report = await writer.writeBatch([baseRequest, baseRequest]);

      expect(report.total).toBe(2);
      expect(report.allowed).toBe(2);
    });
  });

  describe("getStats()", () => {
    it("delegates to MemoryGate", () => {
      const gate = createMockMemoryGate("allow");
      const writer = new GatedMemoryWriter(gate);
      const stats = writer.getStats();

      expect(gate.getStats).toHaveBeenCalled();
      expect(stats.allowed).toBe(10);
      expect(stats.quarantined).toBe(2);
      expect(stats.rejected).toBe(1);
    });
  });
});
