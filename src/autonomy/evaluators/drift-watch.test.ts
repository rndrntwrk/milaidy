/**
 * Tests for the drift-watch post-evaluator.
 *
 * Exercises:
 *   - Pass-through when no autonomy service / no monitor
 *   - No-op when responses are empty or have no text
 *   - Sliding window accumulation + cap at MAX_WINDOW
 *   - Event emission on non-trivial drift
 *   - No event emission on severity "none"
 *   - Output window reset helper
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// Mock event bus
const mockEmit = vi.fn();
vi.mock("../../events/event-bus.js", () => ({
  getEventBus: () => ({ emit: mockEmit }),
}));

import { createDriftWatchEvaluator, _resetOutputWindow } from "./drift-watch.js";

// ---------- Test Helpers ----------

function createMockMessage(text?: string) {
  return {
    id: "msg-1",
    content: { text },
    entityId: "user-1",
    metadata: { type: "message" as const },
  } as unknown as import("@elizaos/core").Memory;
}

function createMockResponse(text: string) {
  return {
    id: "resp-1",
    content: { text },
    entityId: "agent-1",
    metadata: { type: "message" as const },
  } as unknown as import("@elizaos/core").Memory;
}

/** Create a mock runtime with optional drift monitor. */
function createMockRuntime(opts: {
  monitor?: {
    analyze: ReturnType<typeof vi.fn>;
  };
} = {}) {
  const svc = opts.monitor
    ? { getDriftMonitor: () => opts.monitor }
    : null;

  return {
    agentId: "agent-1",
    getService: (type: string) => (type === "AUTONOMY" ? svc : null),
  } as unknown as import("@elizaos/core").IAgentRuntime;
}

function noDriftReport() {
  return {
    driftScore: 0,
    severity: "none",
    dimensions: {
      valueAlignment: 1,
      styleConsistency: 1,
      boundaryRespect: 1,
      topicFocus: 1,
    },
    windowSize: 1,
    corrections: [],
    analyzedAt: Date.now(),
  };
}

function highDriftReport() {
  return {
    driftScore: 0.6,
    severity: "high",
    dimensions: {
      valueAlignment: 0.4,
      styleConsistency: 0.5,
      boundaryRespect: 0.3,
      topicFocus: 0.7,
    },
    windowSize: 3,
    corrections: ["Reset agent context", "Review interactions"],
    analyzedAt: Date.now(),
  };
}

// ---------- Tests ----------

describe("drift-watch evaluator", () => {
  const evaluator = createDriftWatchEvaluator();

  afterEach(() => {
    vi.clearAllMocks();
    _resetOutputWindow();
  });

  describe("metadata", () => {
    it("has correct name and is always-run", () => {
      expect(evaluator.name).toBe("milaidy-drift-watch");
      expect(evaluator.alwaysRun).toBe(true);
    });

    it("does not set explicit phase (defaults to post)", () => {
      // phase should be undefined (ElizaOS defaults to "post")
      expect((evaluator as Record<string, unknown>).phase).toBeUndefined();
    });
  });

  describe("validate", () => {
    it("always returns true", async () => {
      const runtime = createMockRuntime();
      const message = createMockMessage("hello");
      expect(await evaluator.validate(runtime, message)).toBe(true);
    });

    it("returns true even for empty messages", async () => {
      const runtime = createMockRuntime();
      const message = createMockMessage("");
      expect(await evaluator.validate(runtime, message)).toBe(true);
    });
  });

  describe("handler — no autonomy service", () => {
    it("returns undefined when no AUTONOMY service", async () => {
      const runtime = createMockRuntime(); // no monitor
      const message = createMockMessage("hello");
      const result = await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("I can help with that."),
      ]);

      expect(result).toBeUndefined();
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe("handler — no responses", () => {
    it("returns undefined when responses array is empty", async () => {
      const monitor = { analyze: vi.fn() };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      await evaluator.handler(runtime, message, undefined, undefined, undefined, []);

      expect(monitor.analyze).not.toHaveBeenCalled();
    });

    it("returns undefined when responses is undefined", async () => {
      const monitor = { analyze: vi.fn() };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      await evaluator.handler(runtime, message);

      expect(monitor.analyze).not.toHaveBeenCalled();
    });

    it("skips responses with no text content", async () => {
      const monitor = { analyze: vi.fn() };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      const emptyResponse = {
        id: "r1",
        content: { text: "" },
      } as unknown as import("@elizaos/core").Memory;

      const nullTextResponse = {
        id: "r2",
        content: {},
      } as unknown as import("@elizaos/core").Memory;

      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        emptyResponse,
        nullTextResponse,
      ]);

      expect(monitor.analyze).not.toHaveBeenCalled();
    });
  });

  describe("handler — drift analysis", () => {
    it("calls monitor.analyze with collected output texts", async () => {
      const monitor = { analyze: vi.fn().mockResolvedValue(noDriftReport()) };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("Response one"),
        createMockResponse("Response two"),
      ]);

      expect(monitor.analyze).toHaveBeenCalledOnce();
      const [outputs, identity] = monitor.analyze.mock.calls[0];
      expect(outputs).toContain("Response one");
      expect(outputs).toContain("Response two");
      expect(identity.name).toBe("Milaidy");
    });

    it("accumulates outputs across calls (sliding window)", async () => {
      const monitor = { analyze: vi.fn().mockResolvedValue(noDriftReport()) };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      // First call
      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("First batch"),
      ]);

      // Second call
      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("Second batch"),
      ]);

      expect(monitor.analyze).toHaveBeenCalledTimes(2);
      const secondCallOutputs = monitor.analyze.mock.calls[1][0];
      expect(secondCallOutputs).toContain("First batch");
      expect(secondCallOutputs).toContain("Second batch");
    });

    it("caps sliding window at MAX_WINDOW (50)", async () => {
      const monitor = { analyze: vi.fn().mockResolvedValue(noDriftReport()) };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      // Push 55 outputs (exceeds MAX_WINDOW of 50)
      for (let i = 0; i < 55; i++) {
        await evaluator.handler(runtime, message, undefined, undefined, undefined, [
          createMockResponse(`Output ${i}`),
        ]);
      }

      const lastCallOutputs = monitor.analyze.mock.calls[54][0];
      expect(lastCallOutputs).toHaveLength(50);
      // Oldest should have been shifted out
      expect(lastCallOutputs).not.toContain("Output 0");
      expect(lastCallOutputs).not.toContain("Output 4");
      expect(lastCallOutputs).toContain("Output 5");
      expect(lastCallOutputs).toContain("Output 54");
    });
  });

  describe("handler — event emission", () => {
    it("emits autonomy:identity:drift when severity is non-trivial", async () => {
      const monitor = { analyze: vi.fn().mockResolvedValue(highDriftReport()) };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("Some drifting response"),
      ]);

      expect(mockEmit).toHaveBeenCalledWith(
        "autonomy:identity:drift",
        expect.objectContaining({
          agentId: "agent-1",
          driftScore: 0.6,
          severity: "high",
          corrections: ["Reset agent context", "Review interactions"],
        }),
      );
    });

    it("does NOT emit when severity is none", async () => {
      const monitor = { analyze: vi.fn().mockResolvedValue(noDriftReport()) };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("Normal response"),
      ]);

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("handles missing agentId gracefully", async () => {
      const monitor = { analyze: vi.fn().mockResolvedValue(highDriftReport()) };
      const runtime = {
        agentId: undefined,
        getService: (type: string) =>
          type === "AUTONOMY" ? { getDriftMonitor: () => monitor } : null,
      } as unknown as import("@elizaos/core").IAgentRuntime;
      const message = createMockMessage("hello");

      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("Drifty response"),
      ]);

      expect(mockEmit).toHaveBeenCalledWith(
        "autonomy:identity:drift",
        expect.objectContaining({ agentId: "unknown" }),
      );
    });
  });

  describe("_resetOutputWindow", () => {
    it("clears the sliding window", async () => {
      const monitor = { analyze: vi.fn().mockResolvedValue(noDriftReport()) };
      const runtime = createMockRuntime({ monitor });
      const message = createMockMessage("hello");

      // Accumulate outputs
      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("Before reset"),
      ]);

      _resetOutputWindow();

      // Next call should have fresh window
      await evaluator.handler(runtime, message, undefined, undefined, undefined, [
        createMockResponse("After reset"),
      ]);

      const secondCallOutputs = monitor.analyze.mock.calls[1][0];
      expect(secondCallOutputs).toEqual(["After reset"]);
      expect(secondCallOutputs).not.toContain("Before reset");
    });
  });
});
