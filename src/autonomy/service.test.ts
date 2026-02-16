/**
 * Tests for MilaidyAutonomyService
 *
 * Exercises:
 *   - Config plumbing: setAutonomyConfig() → start() → components created
 *   - Config fallback: AUTONOMY_CONFIG runtime setting (JSON string)
 *   - Service initialization (enabled / disabled)
 *   - Component instantiation and accessors
 *   - AutonomyServiceLike interface (enable/disable/isLoopRunning)
 *   - Stop and dispose lifecycle
 *   - Event emission on init and shutdown
 *   - DI container registration (single owner)
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// Mock @elizaos/core Service base class
vi.mock("@elizaos/core", () => ({
  Service: class MockService {
    protected runtime: unknown;
    constructor(runtime?: unknown) {
      this.runtime = runtime ?? {};
    }
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock event bus
const mockEmit = vi.fn();
vi.mock("../events/event-bus.js", () => ({
  getEventBus: () => ({ emit: mockEmit }),
}));

// Mock DI container — capture registrations
const mockRegisterValue = vi.fn();
vi.mock("../di/container.js", () => ({
  getContainer: () => ({ registerValue: mockRegisterValue }),
  TOKENS: {
    TrustScorer: Symbol.for("TrustScorer"),
    MemoryGate: Symbol.for("MemoryGate"),
    DriftMonitor: Symbol.for("DriftMonitor"),
    GoalManager: Symbol.for("GoalManager"),
    TrustAwareRetriever: Symbol.for("TrustAwareRetriever"),
    ToolRegistry: Symbol.for("ToolRegistry"),
    SchemaValidator: Symbol.for("SchemaValidator"),
    PostConditionVerifier: Symbol.for("PostConditionVerifier"),
    StateMachine: Symbol.for("StateMachine"),
    ApprovalGate: Symbol.for("ApprovalGate"),
    EventStore: Symbol.for("EventStore"),
    CompensationRegistry: Symbol.for("CompensationRegistry"),
    ExecutionPipeline: Symbol.for("ExecutionPipeline"),
    InvariantChecker: Symbol.for("InvariantChecker"),
  },
}));

import { MilaidyAutonomyService, setAutonomyConfig } from "./service.js";

/** Minimal mock runtime for testing. */
function createMockRuntime(settings: Record<string, string> = {}) {
  return {
    getSetting: (key: string) => settings[key] ?? null,
  } as unknown as import("@elizaos/core").IAgentRuntime;
}

describe("MilaidyAutonomyService", () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Ensure no pending config leaks between tests
    setAutonomyConfig(undefined);
  });

  describe("static properties", () => {
    it("has serviceType AUTONOMY", () => {
      expect(MilaidyAutonomyService.serviceType).toBe("AUTONOMY");
    });
  });

  // ---------- Config Plumbing ----------

  describe("config plumbing via setAutonomyConfig()", () => {
    it("reads config set by setAutonomyConfig() (preferred path)", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.isLoopRunning()).toBe(true);
      expect(svc.getTrustScorer()).not.toBeNull();
      expect(svc.getGoalManager()).not.toBeNull();
    });

    it("consumes pending config (one-shot)", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      await MilaidyAutonomyService.start(runtime);

      // Second start without setAutonomyConfig — falls to defaults (disabled)
      const svc2 = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      expect(svc2.isLoopRunning()).toBe(false);
    });

    it("applies custom trust config from setAutonomyConfig()", async () => {
      setAutonomyConfig({
        enabled: true,
        trust: { writeThreshold: 0.9 },
      });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.isLoopRunning()).toBe(true);
      // The scorer was created — we can't inspect its config directly,
      // but we verify it was instantiated with the enabled config
      expect(svc.getTrustScorer()).not.toBeNull();
    });

    it("prefers setAutonomyConfig() over runtime setting", async () => {
      // setAutonomyConfig says enabled, runtime setting says disabled
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime({
        AUTONOMY_CONFIG: JSON.stringify({ enabled: false }),
      });
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      // Should use the preferred path (enabled)
      expect(svc.isLoopRunning()).toBe(true);
    });
  });

  describe("config fallback via runtime setting", () => {
    it("falls back to AUTONOMY_CONFIG runtime setting", async () => {
      // No setAutonomyConfig call — uses runtime setting
      const runtime = createMockRuntime({
        AUTONOMY_CONFIG: JSON.stringify({ enabled: true }),
      });
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.isLoopRunning()).toBe(true);
    });

    it("handles malformed AUTONOMY_CONFIG gracefully", async () => {
      const runtime = createMockRuntime({
        AUTONOMY_CONFIG: "not-json{{{",
      });
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      expect(svc.isLoopRunning()).toBe(false);
    });
  });

  // ---------- Start (disabled / enabled) ----------

  describe("start() — disabled", () => {
    it("returns a service with no components when autonomy is disabled", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.isLoopRunning()).toBe(false);
      expect(svc.getTrustScorer()).toBeNull();
      expect(svc.getMemoryGate()).toBeNull();
      expect(svc.getDriftMonitor()).toBeNull();
      expect(svc.getGoalManager()).toBeNull();
    });

    it("does not emit kernel:initialized when disabled", async () => {
      const runtime = createMockRuntime();
      await MilaidyAutonomyService.start(runtime);

      expect(mockEmit).not.toHaveBeenCalledWith(
        "autonomy:kernel:initialized",
        expect.anything(),
      );
    });

    it("does not register in DI container when disabled", async () => {
      const runtime = createMockRuntime();
      await MilaidyAutonomyService.start(runtime);

      expect(mockRegisterValue).not.toHaveBeenCalled();
    });
  });

  describe("start() — enabled", () => {
    it("instantiates all components when enabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.isLoopRunning()).toBe(true);
      expect(svc.getTrustScorer()).not.toBeNull();
      expect(svc.getMemoryGate()).not.toBeNull();
      expect(svc.getDriftMonitor()).not.toBeNull();
      expect(svc.getGoalManager()).not.toBeNull();
    });

    it("emits autonomy:kernel:initialized", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      await MilaidyAutonomyService.start(runtime);

      expect(mockEmit).toHaveBeenCalledWith("autonomy:kernel:initialized", {
        enabled: true,
        configIssues: 0,
      });
    });

    it("reports config issues count in event", async () => {
      setAutonomyConfig({
        enabled: true,
        trust: { writeThreshold: 0.2, quarantineThreshold: 0.5 },
      });
      const runtime = createMockRuntime();
      await MilaidyAutonomyService.start(runtime);

      const call = mockEmit.mock.calls.find(
        (c: unknown[]) => c[0] === "autonomy:kernel:initialized",
      );
      expect(call![1].configIssues).toBeGreaterThan(0);
    });
  });

  // ---------- DI Container Registration ----------

  describe("DI container registration", () => {
    it("registers all components in the DI container when enabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      // 4 core + 3 tool contracts + 5 workflow + InvariantChecker + TrustAwareRetriever = 14
      expect(mockRegisterValue).toHaveBeenCalledTimes(14);

      // Verify the registered values are the same instances as the service's
      const registeredTokens = mockRegisterValue.mock.calls.map((c: unknown[]) => c[0]);
      expect(registeredTokens).toContain(Symbol.for("TrustScorer"));
      expect(registeredTokens).toContain(Symbol.for("MemoryGate"));
      expect(registeredTokens).toContain(Symbol.for("DriftMonitor"));
      expect(registeredTokens).toContain(Symbol.for("GoalManager"));
      expect(registeredTokens).toContain(Symbol.for("ToolRegistry"));
      expect(registeredTokens).toContain(Symbol.for("SchemaValidator"));
      expect(registeredTokens).toContain(Symbol.for("PostConditionVerifier"));
      expect(registeredTokens).toContain(Symbol.for("StateMachine"));
      expect(registeredTokens).toContain(Symbol.for("ApprovalGate"));
      expect(registeredTokens).toContain(Symbol.for("EventStore"));
      expect(registeredTokens).toContain(Symbol.for("CompensationRegistry"));
      expect(registeredTokens).toContain(Symbol.for("ExecutionPipeline"));
      expect(registeredTokens).toContain(Symbol.for("InvariantChecker"));
      expect(registeredTokens).toContain(Symbol.for("TrustAwareRetriever"));

      // Verify the values are the actual component instances
      const goalManagerCall = mockRegisterValue.mock.calls.find(
        (c: unknown[]) => c[0] === Symbol.for("GoalManager"),
      );
      expect(goalManagerCall![1]).toBe(svc.getGoalManager());
    });
  });

  // ---------- AutonomyServiceLike Interface ----------

  describe("AutonomyServiceLike interface", () => {
    it("enableAutonomy() creates components and sets running", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.isLoopRunning()).toBe(false);
      await svc.enableAutonomy();
      expect(svc.isLoopRunning()).toBe(true);
      expect(svc.getGoalManager()).not.toBeNull();
    });

    it("enableAutonomy() initializes identity config", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getIdentityConfig()).toBeNull();
      await svc.enableAutonomy();
      const identity = svc.getIdentityConfig();
      expect(identity).not.toBeNull();
      expect(identity!.coreValues).toEqual(["helpfulness", "honesty", "safety"]);
      expect(identity!.identityVersion).toBe(1);
    });

    it("enableAutonomy() is idempotent", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      const gm = svc.getGoalManager();

      await svc.enableAutonomy();
      expect(svc.getGoalManager()).toBe(gm);
    });

    it("disableAutonomy() tears down components", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      await svc.disableAutonomy();
      expect(svc.isLoopRunning()).toBe(false);
      expect(svc.getTrustScorer()).toBeNull();
      expect(svc.getGoalManager()).toBeNull();
    });

    it("disableAutonomy() is safe when already disabled", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      await expect(svc.disableAutonomy()).resolves.toBeUndefined();
    });
  });

  // ---------- Stop ----------

  describe("stop()", () => {
    it("disposes components and emits shutdown event", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      mockEmit.mockClear();

      await svc.stop();

      expect(svc.isLoopRunning()).toBe(false);
      expect(svc.getTrustScorer()).toBeNull();
      expect(svc.getMemoryGate()).toBeNull();
      expect(svc.getDriftMonitor()).toBeNull();
      expect(svc.getGoalManager()).toBeNull();
      expect(mockEmit).toHaveBeenCalledWith("autonomy:kernel:shutdown", {
        reason: "service stopped",
      });
    });

    it("is safe to call when not enabled", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      await expect(svc.stop()).resolves.toBeUndefined();
    });
  });

  // ---------- Identity Accessors ----------

  describe("identity accessors", () => {
    it("initializes default identity when enabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      const identity = svc.getIdentityConfig();
      expect(identity).not.toBeNull();
      expect(identity!.coreValues).toEqual(["helpfulness", "honesty", "safety"]);
      expect(identity!.identityVersion).toBe(1);
      expect(identity!.identityHash).toBeDefined();
    });

    it("returns null identity when disabled", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getIdentityConfig()).toBeNull();
    });

    it("uses config-provided identity", async () => {
      const { createDefaultAutonomyIdentity } = await import("./identity/schema.js");
      const identity = createDefaultAutonomyIdentity();
      identity.coreValues = ["custom-value"];
      identity.identityVersion = 5;

      setAutonomyConfig({ enabled: true, identity });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      const result = svc.getIdentityConfig();
      expect(result!.coreValues).toEqual(["custom-value"]);
      expect(result!.identityVersion).toBe(5);
    });

    it("getIdentityConfig returns a copy", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      const a = svc.getIdentityConfig();
      const b = svc.getIdentityConfig();
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });

    it("updateIdentityConfig increments version and recomputes hash", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      const original = svc.getIdentityConfig()!;
      const updated = await svc.updateIdentityConfig({
        coreValues: ["helpfulness", "honesty", "safety", "transparency"],
      });

      expect(updated.identityVersion).toBe(original.identityVersion + 1);
      expect(updated.identityHash).not.toBe(original.identityHash);
      expect(updated.coreValues).toContain("transparency");
    });

    it("updateIdentityConfig merges communicationStyle partially", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      const original = svc.getIdentityConfig()!;
      const updated = await svc.updateIdentityConfig({
        communicationStyle: { tone: "formal" } as any,
      });

      // Tone changed
      expect(updated.communicationStyle.tone).toBe("formal");
      // Verbosity and personaVoice preserved from original
      expect(updated.communicationStyle.verbosity).toBe(original.communicationStyle.verbosity);
      expect(updated.communicationStyle.personaVoice).toBe(original.communicationStyle.personaVoice);
    });

    it("updateIdentityConfig validates and rejects invalid updates", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      await expect(
        svc.updateIdentityConfig({ coreValues: [] }),
      ).rejects.toThrow("Identity validation failed");
    });

    it("updateIdentityConfig creates default identity if none exists", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      // Service is disabled, identity is null
      const updated = await svc.updateIdentityConfig({
        coreValues: ["new-value"],
      });

      expect(updated.identityVersion).toBe(2); // 1 (default) + 1 (update)
      expect(updated.coreValues).toEqual(["new-value"]);
    });

    it("nulls out identity on stop", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getIdentityConfig()).not.toBeNull();
      await svc.stop();
      expect(svc.getIdentityConfig()).toBeNull();
    });

    it("nulls out identity on disableAutonomy", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getIdentityConfig()).not.toBeNull();
      await svc.disableAutonomy();
      expect(svc.getIdentityConfig()).toBeNull();
    });
  });

  // ---------- Component Accessors ----------

  describe("component accessors", () => {
    it("returns real TrustScorer when enabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      const scorer = svc.getTrustScorer();

      expect(scorer).toBeDefined();
      expect(typeof scorer!.score).toBe("function");
    });

    it("returns real GoalManager when enabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      const gm = svc.getGoalManager();

      expect(gm).toBeDefined();
      expect(typeof gm!.addGoal).toBe("function");
      expect(typeof gm!.updateGoal).toBe("function");
    });

    it("GoalManager can create and retrieve goals", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      const gm = svc.getGoalManager()!;

      const goal = await gm.addGoal({
        description: "Test goal",
        priority: "medium",
        status: "active",
        successCriteria: ["done"],
        source: "user",
        sourceTrust: 0.9,
      });

      expect(goal.id).toBeDefined();
      expect(goal.description).toBe("Test goal");

      const active = await gm.getActiveGoals();
      expect(active).toHaveLength(1);
    });
  });
});
