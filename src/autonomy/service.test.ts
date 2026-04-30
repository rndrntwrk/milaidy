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
    WorkflowEngine: Symbol.for("WorkflowEngine"),
    ApprovalGate: Symbol.for("ApprovalGate"),
    EventStore: Symbol.for("EventStore"),
    CompensationRegistry: Symbol.for("CompensationRegistry"),
    ExecutionPipeline: Symbol.for("ExecutionPipeline"),
    InvariantChecker: Symbol.for("InvariantChecker"),
    BaselineHarness: Symbol.for("BaselineHarness"),
    Planner: Symbol.for("Planner"),
    Executor: Symbol.for("Executor"),
    Verifier: Symbol.for("Verifier"),
    MemoryWriter: Symbol.for("MemoryWriter"),
    Auditor: Symbol.for("Auditor"),
    SafeMode: Symbol.for("SafeMode"),
    Orchestrator: Symbol.for("Orchestrator"),
    TraceCollector: Symbol.for("TraceCollector"),
    HackDetector: Symbol.for("HackDetector"),
    RolloutCollector: Symbol.for("RolloutCollector"),
    ModelProvider: Symbol.for("ModelProvider"),
    PromptBuilder: Symbol.for("PromptBuilder"),
    CheckpointManager: Symbol.for("CheckpointManager"),
    AdversarialGenerator: Symbol.for("AdversarialGenerator"),
    DomainPackRegistry: Symbol.for("DomainPackRegistry"),
    PolicyEngine: Symbol.for("PolicyEngine"),
    AuditRetentionManager: Symbol.for("AuditRetentionManager"),
    PilotRunner: Symbol.for("PilotRunner"),
  },
}));

import {
  KERNEL_SAFE_MODE_TRANSITION_REQUEST_ID,
  KERNEL_STATE_TRANSITION_REQUEST_ID,
  MilaidyAutonomyService,
  setAutonomyConfig,
} from "./service.js";
import { AUDITOR_DRIFT_REPORT_EVENT_TYPE } from "./roles/auditor.js";
import { metrics } from "../telemetry/setup.js";

/** Minimal mock runtime for testing. */
function createMockRuntime(
  settings: Record<string, string> = {},
  extras: Record<string, unknown> = {},
) {
  return {
    getSetting: (key: string) => settings[key] ?? null,
    ...extras,
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
      expect(svc.getCompensationIncidentManager()).not.toBeNull();
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

    it("registers synthesized contracts for runtime-only actions", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime({}, {
        actions: [
          {
            name: "READ_RUNTIME_STATUS",
            description: "Read runtime-only status",
            parameters: [
              {
                name: "target",
                required: true,
                schema: { type: "string" },
              },
            ],
          },
        ],
      });
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      const pipeline = svc.getExecutionPipeline();
      if (!pipeline) {
        throw new Error("Expected execution pipeline");
      }

      const validHandler = vi.fn(async () => ({
        result: { ok: true },
        durationMs: 1,
      }));
      const validResult = await pipeline.execute(
        {
          tool: "READ_RUNTIME_STATUS",
          params: { target: "agent" },
          source: "system",
          requestId: "runtime-action-valid",
        },
        validHandler,
      );
      expect(validResult.success).toBe(true);
      expect(validHandler).toHaveBeenCalledTimes(1);

      const invalidHandler = vi.fn(async () => ({
        result: { shouldNotRun: true },
        durationMs: 1,
      }));
      const invalidResult = await pipeline.execute(
        {
          tool: "READ_RUNTIME_STATUS",
          params: {},
          source: "system",
          requestId: "runtime-action-invalid",
        },
        invalidHandler,
      );
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toBe("Validation failed");
      expect(invalidHandler).not.toHaveBeenCalled();
    });
  });

  // ---------- DI Container Registration ----------

  describe("DI container registration", () => {
    it("registers all components in the DI container when enabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      // 4 core + 3 tool contracts + 6 workflow + InvariantChecker + BaselineHarness + TrustAwareRetriever + 7 roles + PromptBuilder = 24
      expect(mockRegisterValue).toHaveBeenCalledTimes(24);

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
      expect(registeredTokens).toContain(Symbol.for("WorkflowEngine"));
      expect(registeredTokens).toContain(Symbol.for("ApprovalGate"));
      expect(registeredTokens).toContain(Symbol.for("EventStore"));
      expect(registeredTokens).toContain(Symbol.for("CompensationRegistry"));
      expect(registeredTokens).toContain(Symbol.for("ExecutionPipeline"));
      expect(registeredTokens).toContain(Symbol.for("InvariantChecker"));
      expect(registeredTokens).toContain(Symbol.for("BaselineHarness"));
      expect(registeredTokens).toContain(Symbol.for("TrustAwareRetriever"));
      expect(registeredTokens).toContain(Symbol.for("Planner"));
      expect(registeredTokens).toContain(Symbol.for("Executor"));
      expect(registeredTokens).toContain(Symbol.for("Verifier"));
      expect(registeredTokens).toContain(Symbol.for("MemoryWriter"));
      expect(registeredTokens).toContain(Symbol.for("Auditor"));
      expect(registeredTokens).toContain(Symbol.for("SafeMode"));
      expect(registeredTokens).toContain(Symbol.for("Orchestrator"));

      expect(registeredTokens).toContain(Symbol.for("PromptBuilder"));

      // Verify the values are the actual component instances
      const goalManagerCall = mockRegisterValue.mock.calls.find(
        (c: unknown[]) => c[0] === Symbol.for("GoalManager"),
      );
      expect(goalManagerCall![1]).toBe(svc.getGoalManager());
    });

    it("registers learning components when learning is enabled", async () => {
      setAutonomyConfig({ enabled: true, learning: { enabled: true } });
      const runtime = createMockRuntime();
      await MilaidyAutonomyService.start(runtime);

      // 24 (base) + 6 (learning: TraceCollector, HackDetector, RolloutCollector, ModelProvider, CheckpointManager, AdversarialGenerator) = 30
      expect(mockRegisterValue).toHaveBeenCalledTimes(30);
      const registeredTokens = mockRegisterValue.mock.calls.map((c: unknown[]) => c[0]);
      expect(registeredTokens).toContain(Symbol.for("TraceCollector"));
      expect(registeredTokens).toContain(Symbol.for("HackDetector"));
      expect(registeredTokens).toContain(Symbol.for("RolloutCollector"));
      expect(registeredTokens).toContain(Symbol.for("ModelProvider"));
      expect(registeredTokens).toContain(Symbol.for("CheckpointManager"));
      expect(registeredTokens).toContain(Symbol.for("AdversarialGenerator"));
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

    it("updateIdentityConfig emits identity mutation audit event and telemetry", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      mockEmit.mockClear();
      const before = metrics.getSnapshot();

      const updated = await svc.updateIdentityConfig({
        communicationStyle: { tone: "formal" } as any,
      });

      expect(mockEmit).toHaveBeenCalledWith(
        "autonomy:identity:updated",
        expect.objectContaining({
          toVersion: updated.identityVersion,
          identityHash: updated.identityHash,
        }),
      );

      const after = metrics.getSnapshot();
      const sumCounter = (snapshot: ReturnType<typeof metrics.getSnapshot>, name: string) =>
        Object.entries(snapshot.counters)
          .filter(([key]) => key === name || key.startsWith(`${name}:{`))
          .reduce((acc, [, value]) => acc + (typeof value === "number" ? value : 0), 0);
      expect(
        sumCounter(after, "autonomy_identity_updates_total") -
          sumCounter(before, "autonomy_identity_updates_total"),
      ).toBe(1);
      expect(after.counters["autonomy_identity_version"]).toBe(
        updated.identityVersion,
      );
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

    it("updateIdentityConfig enforces approval policy for high-risk api updates", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      await expect(
        svc.updateIdentityConfig(
          { coreValues: ["helpfulness", "honesty", "safety", "transparency"] },
          {
            source: "api",
            actor: "ops-user",
          },
        ),
      ).rejects.toThrow("Identity update rejected by policy");
    });

    it("updateIdentityConfig accepts high-risk api updates with approval metadata", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      mockEmit.mockClear();

      const updated = await svc.updateIdentityConfig(
        { hardBoundaries: ["never reveal credentials"] },
        {
          source: "api",
          actor: "ops-user",
          approvedBy: "security-reviewer",
          reason: "tighten boundary policy",
        },
      );

      expect(updated.hardBoundaries).toEqual(["never reveal credentials"]);
      expect(mockEmit).toHaveBeenCalledWith(
        "autonomy:identity:updated",
        expect.objectContaining({
          policy: expect.objectContaining({
            source: "api",
            actor: "ops-user",
            risk: "high",
            approvalRequired: true,
            approvedBy: "security-reviewer",
            reason: "tighten boundary policy",
          }),
        }),
      );
    });

    it("updateIdentityConfig rejects direct identityVersion mutation attempts", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      await expect(
        svc.updateIdentityConfig({ identityVersion: 99 } as any),
      ).rejects.toThrow("identityVersion is kernel-managed");
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

    it("returns role accessors when enabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getPlanner()).not.toBeNull();
      expect(svc.getExecutor()).not.toBeNull();
      expect(svc.getVerifier()).not.toBeNull();
      expect(svc.getMemoryWriter()).not.toBeNull();
      expect(svc.getAuditor()).not.toBeNull();
      expect(svc.getSafeModeController()).not.toBeNull();
      expect(svc.getOrchestrator()).not.toBeNull();
    });

    it("returns null role accessors when disabled", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getPlanner()).toBeNull();
      expect(svc.getExecutor()).toBeNull();
      expect(svc.getVerifier()).toBeNull();
      expect(svc.getMemoryWriter()).toBeNull();
      expect(svc.getAuditor()).toBeNull();
      expect(svc.getSafeModeController()).toBeNull();
      expect(svc.getOrchestrator()).toBeNull();
    });

    it("reports all role health checks as ready when enabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      const snapshot = svc.getRoleHealth();
      expect(snapshot.summary.ready).toBe(true);
      expect(snapshot.summary.healthy).toBe(true);
      expect(snapshot.summary.totalRoles).toBe(7);
      expect(snapshot.summary.readyRoles).toBe(7);
      expect(snapshot.summary.unavailableRoles).toHaveLength(0);
      expect(snapshot.roles.planner.ready).toBe(true);
      expect(snapshot.roles.orchestrator.ready).toBe(true);
    });

    it("reports role readiness as false when autonomy is disabled", async () => {
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      const snapshot = svc.getRoleHealth();
      expect(snapshot.summary.ready).toBe(false);
      expect(snapshot.summary.healthy).toBe(false);
      expect(snapshot.summary.readyRoles).toBe(0);
      expect(snapshot.summary.unavailableRoles).toContain("planner");
      expect(snapshot.summary.unavailableRoles).toContain("orchestrator");
    });

    it("persists kernel state and safe-mode transitions to the event store", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      const stateMachine = svc.getStateMachine();
      const eventStore = svc.getEventStore();
      if (!stateMachine || !eventStore) {
        throw new Error("expected state machine and event store");
      }

      stateMachine.transition("escalate_safe_mode");
      stateMachine.transition("safe_mode_exit");

      await vi.waitFor(async () => {
        const transitions = await eventStore.getByRequestId(
          KERNEL_SAFE_MODE_TRANSITION_REQUEST_ID,
        );
        expect(transitions.length).toBeGreaterThanOrEqual(2);
      });

      const kernelTransitions = await eventStore.getByRequestId(
        KERNEL_STATE_TRANSITION_REQUEST_ID,
      );
      const safeModeTransitions = await eventStore.getByRequestId(
        KERNEL_SAFE_MODE_TRANSITION_REQUEST_ID,
      );

      expect(
        kernelTransitions.some(
          (event) => event.type === "kernel:state:transition",
        ),
      ).toBe(true);
      expect(
        safeModeTransitions.some(
          (event) => event.type === "kernel:safe-mode:transition",
        ),
      ).toBe(true);
      expect(
        safeModeTransitions.some((event) => event.payload.active === true),
      ).toBe(true);
      expect(
        safeModeTransitions.some((event) => event.payload.active === false),
      ).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith(
        "autonomy:state:transition",
        expect.objectContaining({
          from: "idle",
          to: "safe_mode",
          trigger: "escalate_safe_mode",
        }),
      );
    });

    it("persists drift reports generated by the auditor", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;
      const auditor = svc.getAuditor();
      const eventStore = svc.getEventStore();
      const identity = svc.getIdentityConfig();
      if (!auditor || !eventStore || !identity) {
        throw new Error("expected auditor, event store, and identity config");
      }

      await auditor.audit({
        requestId: "audit-drift-persist",
        correlationId: "audit-drift-corr",
        identityConfig: identity,
        recentOutputs: ["I can help with that request."],
      });

      const events = await eventStore.getByRequestId("audit-drift-persist");
      const driftEvent = events.find(
        (event) => event.type === AUDITOR_DRIFT_REPORT_EVENT_TYPE,
      );
      expect(driftEvent).toBeDefined();
      expect(driftEvent?.correlationId).toBe("audit-drift-corr");
      expect(driftEvent?.payload).toEqual(
        expect.objectContaining({
          driftScore: expect.any(Number),
          severity: expect.any(String),
          auditedAt: expect.any(Number),
        }),
      );
    });

    it("returns learning accessors when learning enabled", async () => {
      setAutonomyConfig({ enabled: true, learning: { enabled: true } });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getTraceCollector()).not.toBeNull();
      expect(svc.getHackDetector()).not.toBeNull();
      expect(svc.getRolloutCollector()).not.toBeNull();
      expect(svc.getModelProvider()).not.toBeNull();
      expect(svc.getPromptBuilder()).not.toBeNull();
      expect(svc.getCheckpointManager()).not.toBeNull();
      expect(svc.getAdversarialGenerator()).not.toBeNull();
    });

    it("returns null learning accessors when learning disabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getTraceCollector()).toBeNull();
      expect(svc.getHackDetector()).toBeNull();
      expect(svc.getRolloutCollector()).toBeNull();
      expect(svc.getModelProvider()).toBeNull();
      // PromptBuilder is always created
      expect(svc.getPromptBuilder()).not.toBeNull();
      expect(svc.getCheckpointManager()).toBeNull();
      expect(svc.getAdversarialGenerator()).toBeNull();
    });

    it("returns domain accessors when domains enabled", async () => {
      setAutonomyConfig({ enabled: true, domains: { enabled: true } });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getDomainPackRegistry()).not.toBeNull();
      expect(svc.getPolicyEngine()).not.toBeNull();
      expect(svc.getAuditRetentionManager()).not.toBeNull();
      expect(svc.getPilotRunner()).not.toBeNull();
    });

    it("returns null domain accessors when domains disabled", async () => {
      setAutonomyConfig({ enabled: true });
      const runtime = createMockRuntime();
      const svc = (await MilaidyAutonomyService.start(runtime)) as MilaidyAutonomyService;

      expect(svc.getDomainPackRegistry()).toBeNull();
      expect(svc.getPolicyEngine()).toBeNull();
      expect(svc.getAuditRetentionManager()).toBeNull();
      expect(svc.getPilotRunner()).toBeNull();
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
