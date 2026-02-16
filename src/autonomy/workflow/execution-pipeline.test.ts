import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalGate } from "../approval/approval-gate.js";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import type { ProposedToolCall, ToolValidationResult } from "../tools/types.js";
import type { VerificationResult } from "../verification/types.js";
import { CompensationRegistry } from "./compensation-registry.js";
import { registerBuiltinCompensations } from "./compensations/index.js";
import { InMemoryEventStore } from "./event-store.js";
import { ToolExecutionPipeline } from "./execution-pipeline.js";
import type { ToolActionHandler } from "./types.js";

// ---------- Helpers ----------

function makeCall(overrides: Partial<ProposedToolCall> = {}): ProposedToolCall {
  return {
    tool: "PLAY_EMOTE",
    params: { emote: "wave" },
    source: "llm",
    requestId: "test-req-1",
    ...overrides,
  };
}

function createMockValidator(overrides: Partial<ToolValidationResult> = {}) {
  const result: ToolValidationResult = {
    valid: true,
    errors: [],
    validatedParams: { emote: "wave" },
    riskClass: "read-only",
    requiresApproval: false,
    ...overrides,
  };
  return { validate: vi.fn().mockReturnValue(result) };
}

function createMockVerifier(overrides: Partial<VerificationResult> = {}) {
  const result: VerificationResult = {
    status: "passed",
    checks: [],
    hasCriticalFailure: false,
    ...overrides,
  };
  return {
    verify: vi.fn().mockResolvedValue(result),
    registerConditions: vi.fn(),
  };
}

function createSuccessHandler(
  result: unknown = { ok: true },
): ToolActionHandler {
  return vi.fn().mockResolvedValue({ result, durationMs: 50 });
}

function createPipeline(
  overrides: {
    validator?: ReturnType<typeof createMockValidator>;
    verifier?: ReturnType<typeof createMockVerifier>;
    handler?: ToolActionHandler;
    config?: Record<string, unknown>;
    eventBus?: { emit: ReturnType<typeof vi.fn> };
  } = {},
) {
  const stateMachine = new KernelStateMachine();
  const eventStore = new InMemoryEventStore();
  const approvalGate = new ApprovalGate({ timeoutMs: 10_000 });
  const compensationRegistry = new CompensationRegistry();
  registerBuiltinCompensations(compensationRegistry);

  const validator = overrides.validator ?? createMockValidator();
  const verifier = overrides.verifier ?? createMockVerifier();

  const pipeline = new ToolExecutionPipeline({
    schemaValidator: validator,
    approvalGate,
    postConditionVerifier: verifier,
    compensationRegistry,
    stateMachine,
    eventStore,
    config: overrides.config as Record<string, unknown> | undefined,
    eventBus: overrides.eventBus,
  });

  return {
    pipeline,
    stateMachine,
    eventStore,
    approvalGate,
    compensationRegistry,
    validator,
    verifier,
  };
}

describe("ToolExecutionPipeline", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("full happy path", () => {
    it("executes successfully with valid read-only tool (no approval)", async () => {
      const handler = createSuccessHandler({ emoted: true });
      const { pipeline, stateMachine, eventStore } = createPipeline();

      const result = await pipeline.execute(makeCall(), handler);

      expect(result.success).toBe(true);
      expect(result.toolName).toBe("PLAY_EMOTE");
      expect(result.requestId).toBe("test-req-1");
      expect(result.result).toEqual({ emoted: true });
      expect(result.validation.valid).toBe(true);
      expect(result.verification?.status).toBe("passed");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
      expect(stateMachine.currentState).toBe("idle");
      expect(eventStore.size).toBeGreaterThan(0);
    });

    it("calls actionHandler with validated params and requestId", async () => {
      const handler = createSuccessHandler();
      const validator = createMockValidator({
        validatedParams: { emote: "dance" },
      });
      const { pipeline } = createPipeline({ validator });

      await pipeline.execute(makeCall(), handler);

      expect(handler).toHaveBeenCalledWith(
        "PLAY_EMOTE",
        { emote: "dance" },
        "test-req-1",
      );
    });
  });

  describe("validation failure", () => {
    it("returns failure when validation fails", async () => {
      const validator = createMockValidator({
        valid: false,
        errors: [
          {
            field: "emote",
            code: "missing_field",
            message: "Required",
            severity: "error",
          },
        ],
        validatedParams: undefined,
        riskClass: undefined,
        requiresApproval: false,
      });
      const handler = createSuccessHandler();
      const { pipeline } = createPipeline({ validator });

      const result = await pipeline.execute(makeCall(), handler);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Validation failed");
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors).toHaveLength(1);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("approval path", () => {
    it("requires and waits for approval when tool requires it", async () => {
      const validator = createMockValidator({
        requiresApproval: true,
        riskClass: "irreversible",
      });
      const handler = createSuccessHandler();
      const { pipeline, approvalGate } = createPipeline({ validator });

      // Start execution in background
      const resultPromise = pipeline.execute(
        makeCall({ tool: "RUN_IN_TERMINAL", requestId: "req-approval" }),
        handler,
      );

      // Wait a tick for the approval request to be registered
      await new Promise((r) => setTimeout(r, 0));

      // Approve the pending request
      const pending = approvalGate.getPending();
      expect(pending).toHaveLength(1);
      approvalGate.resolve(pending[0].id, "approved", "user");

      const result = await resultPromise;
      expect(result.success).toBe(true);
      expect(result.approval?.required).toBe(true);
      expect(result.approval?.decision).toBe("approved");
    });

    it("returns failure when approval is denied", async () => {
      const validator = createMockValidator({
        requiresApproval: true,
        riskClass: "irreversible",
      });
      const handler = createSuccessHandler();
      const { pipeline, approvalGate, stateMachine } = createPipeline({
        validator,
      });

      const resultPromise = pipeline.execute(
        makeCall({ tool: "RUN_IN_TERMINAL" }),
        handler,
      );

      await new Promise((r) => setTimeout(r, 0));

      const pending = approvalGate.getPending();
      approvalGate.resolve(pending[0].id, "denied", "admin");

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe("Approval denied");
      expect(result.approval?.decision).toBe("denied");
      expect(handler).not.toHaveBeenCalled();
      expect(stateMachine.currentState).toBe("idle");
    });
  });

  describe("auto-approve rules", () => {
    it("auto-approves read-only tools when autoApproveReadOnly is true", async () => {
      const validator = createMockValidator({
        requiresApproval: true,
        riskClass: "read-only",
      });
      const handler = createSuccessHandler();
      const { pipeline } = createPipeline({
        validator,
        config: { autoApproveReadOnly: true },
      });

      const result = await pipeline.execute(makeCall(), handler);

      expect(result.success).toBe(true);
      // Should NOT have gone through approval
      expect(result.approval).toBeUndefined();
    });

    it("auto-approves trusted sources", async () => {
      const validator = createMockValidator({
        requiresApproval: true,
        riskClass: "irreversible",
      });
      const handler = createSuccessHandler();
      const { pipeline } = createPipeline({
        validator,
        config: { autoApproveSources: ["system"] },
      });

      const result = await pipeline.execute(
        makeCall({ source: "system" }),
        handler,
      );

      expect(result.success).toBe(true);
      expect(result.approval).toBeUndefined();
    });

    it("does NOT auto-approve irreversible tools from untrusted sources", async () => {
      const validator = createMockValidator({
        requiresApproval: true,
        riskClass: "irreversible",
      });
      const handler = createSuccessHandler();
      const { pipeline, approvalGate } = createPipeline({ validator });

      const resultPromise = pipeline.execute(
        makeCall({ source: "llm" }),
        handler,
      );

      await new Promise((r) => setTimeout(r, 0));
      const pending = approvalGate.getPending();
      expect(pending).toHaveLength(1);

      approvalGate.resolve(pending[0].id, "approved");
      await resultPromise;
    });
  });

  describe("execution error", () => {
    it("returns failure when actionHandler throws", async () => {
      const validator = createMockValidator();
      const handler = vi.fn().mockRejectedValue(new Error("exec boom"));
      const { pipeline, stateMachine } = createPipeline({ validator });

      const result = await pipeline.execute(makeCall(), handler);

      expect(result.success).toBe(false);
      expect(result.error).toBe("exec boom");
      // State machine transitions to error via fatal_error
      expect(stateMachine.consecutiveErrors).toBe(1);
    });
  });

  describe("critical verification failure + compensation", () => {
    it("attempts compensation when verification has critical failure", async () => {
      const validator = createMockValidator({ riskClass: "reversible" });
      const verifier = createMockVerifier({
        status: "failed",
        hasCriticalFailure: true,
        checks: [
          { conditionId: "check-1", passed: false, severity: "critical" },
        ],
      });
      const handler = createSuccessHandler({ outputPath: "/tmp/image.png" });
      const { pipeline, stateMachine } = createPipeline({
        validator,
        verifier,
      });

      const result = await pipeline.execute(
        makeCall({ tool: "GENERATE_IMAGE", params: { prompt: "cat" } }),
        handler,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Critical verification failure");
      expect(result.verification?.hasCriticalFailure).toBe(true);
      expect(result.compensation?.attempted).toBe(true);
      expect(result.compensation?.success).toBe(true);
      // State machine should have recovered back to idle
      expect(stateMachine.currentState).toBe("idle");
    });

    it("reports compensation not attempted for unregistered tool", async () => {
      const validator = createMockValidator({ riskClass: "reversible" });
      const verifier = createMockVerifier({
        status: "failed",
        hasCriticalFailure: true,
      });
      const handler = createSuccessHandler();
      const { pipeline } = createPipeline({ validator, verifier });

      const result = await pipeline.execute(
        makeCall({ tool: "UNKNOWN_TOOL" }),
        handler,
      );

      expect(result.success).toBe(false);
      expect(result.compensation?.attempted).toBe(false);
    });
  });

  describe("event store ordering", () => {
    it("records events in the correct order for a successful execution", async () => {
      const handler = createSuccessHandler();
      const { pipeline, eventStore } = createPipeline();

      await pipeline.execute(makeCall({ requestId: "trace-1" }), handler);

      const events = await eventStore.getByRequestId("trace-1");
      const types = events.map((e) => e.type);

      expect(types).toEqual([
        "tool:proposed",
        "tool:validated",
        "tool:executing",
        "tool:executed",
        "tool:verified",
      ]);

      // Verify sequence IDs are monotonic
      for (let i = 1; i < events.length; i++) {
        expect(events[i].sequenceId).toBeGreaterThan(events[i - 1].sequenceId);
      }
    });
  });

  describe("state transitions", () => {
    it("returns to idle after successful execution", async () => {
      const handler = createSuccessHandler();
      const { pipeline, stateMachine } = createPipeline();

      const transitions: Array<[string, string, string]> = [];
      stateMachine.onStateChange((from, to, trigger) => {
        transitions.push([from, to, trigger]);
      });

      await pipeline.execute(makeCall(), handler);

      expect(transitions).toEqual([
        ["idle", "executing", "tool_validated"],
        ["executing", "verifying", "execution_complete"],
        ["verifying", "idle", "verification_passed"],
      ]);
      expect(stateMachine.currentState).toBe("idle");
    });
  });

  describe("event bus emissions", () => {
    it("emits pipeline:started and pipeline:completed events", async () => {
      const mockEmit = vi.fn();
      const handler = createSuccessHandler();
      const { pipeline } = createPipeline({ eventBus: { emit: mockEmit } });

      await pipeline.execute(makeCall({ requestId: "evt-1" }), handler);

      expect(mockEmit).toHaveBeenCalledWith("autonomy:pipeline:started", {
        requestId: "evt-1",
        toolName: "PLAY_EMOTE",
        source: "llm",
        correlationId: expect.any(String),
      });

      expect(mockEmit).toHaveBeenCalledWith("autonomy:pipeline:completed", {
        requestId: "evt-1",
        toolName: "PLAY_EMOTE",
        success: true,
        durationMs: expect.any(Number),
        correlationId: expect.any(String),
      });
    });

    it("emits compensation:attempted event on critical failure", async () => {
      const mockEmit = vi.fn();
      const validator = createMockValidator({ riskClass: "reversible" });
      const verifier = createMockVerifier({
        status: "failed",
        hasCriticalFailure: true,
      });
      const handler = createSuccessHandler();
      const { pipeline } = createPipeline({
        validator,
        verifier,
        eventBus: { emit: mockEmit },
      });

      await pipeline.execute(makeCall({ tool: "GENERATE_IMAGE" }), handler);

      expect(mockEmit).toHaveBeenCalledWith("autonomy:compensation:attempted", {
        requestId: "test-req-1",
        toolName: "GENERATE_IMAGE",
        success: true,
        detail: expect.any(String),
        correlationId: expect.any(String),
      });
    });
  });
});
