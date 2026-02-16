/**
 * Integration tests for the full execution pipeline with real implementations.
 *
 * Uses real (not mocked) SchemaValidator, PostConditionVerifier,
 * InvariantChecker, ApprovalGate, EventStore, CompensationRegistry,
 * and KernelStateMachine.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalGate } from "../approval/approval-gate.js";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import { ToolRegistry } from "../tools/registry.js";
import { registerBuiltinToolContracts } from "../tools/schemas/index.js";
import type { ProposedToolCall } from "../tools/types.js";
import { InvariantChecker } from "../verification/invariants/invariant-checker.js";
import { registerBuiltinInvariants } from "../verification/invariants/index.js";
import { PostConditionVerifier } from "../verification/postcondition-verifier.js";
import { registerBuiltinPostConditions } from "../verification/postconditions/index.js";
import { SchemaValidator } from "../verification/schema-validator.js";
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
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...overrides,
  };
}

function successHandler(result: unknown = { ok: true }): ToolActionHandler {
  return vi.fn().mockResolvedValue({ result, durationMs: 10 });
}

function createFullPipeline(opts: {
  approvalTimeoutMs?: number;
  eventBus?: { emit: (event: string, payload: unknown) => void };
  withInvariantChecker?: boolean;
} = {}) {
  const toolRegistry = new ToolRegistry();
  registerBuiltinToolContracts(toolRegistry);

  const schemaValidator = new SchemaValidator(toolRegistry);
  const postConditionVerifier = new PostConditionVerifier();
  registerBuiltinPostConditions(postConditionVerifier);

  const stateMachine = new KernelStateMachine();
  const approvalGate = new ApprovalGate({
    timeoutMs: opts.approvalTimeoutMs ?? 10_000,
    eventBus: opts.eventBus,
  });
  const eventStore = new InMemoryEventStore();
  const compensationRegistry = new CompensationRegistry();
  registerBuiltinCompensations(compensationRegistry);

  let invariantChecker: InvariantChecker | undefined;
  if (opts.withInvariantChecker !== false) {
    invariantChecker = new InvariantChecker();
    registerBuiltinInvariants(invariantChecker);
  }

  const pipeline = new ToolExecutionPipeline({
    schemaValidator,
    approvalGate,
    postConditionVerifier,
    compensationRegistry,
    stateMachine,
    eventStore,
    invariantChecker,
    config: {
      autoApproveReadOnly: true,
      autoApproveSources: [],
    },
    eventBus: opts.eventBus,
  });

  return {
    pipeline,
    schemaValidator,
    postConditionVerifier,
    stateMachine,
    approvalGate,
    eventStore,
    compensationRegistry,
    invariantChecker,
    toolRegistry,
  };
}

// ---------- Tests ----------

describe("Integration: Full Pipeline", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("executes a read-only tool successfully without approval", async () => {
    const { pipeline, stateMachine, eventStore } = createFullPipeline();
    const handler = successHandler();
    const call = makeCall({ tool: "PLAY_EMOTE", params: { emote: "wave" } });

    const result = await pipeline.execute(call, handler);

    expect(result.success).toBe(true);
    expect(result.validation.valid).toBe(true);
    expect(result.approval).toBeUndefined();
    expect(result.verification?.hasCriticalFailure).toBe(false);
    expect(result.invariants).toBeDefined();
    expect(result.invariants?.hasCriticalViolation).toBe(false);
    expect(result.correlationId).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(stateMachine.currentState).toBe("idle");
    expect(handler).toHaveBeenCalledOnce();

    // Check events were recorded
    const events = eventStore.getByRequestId(call.requestId);
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0].type).toBe("tool:proposed");
  });

  it("records events in correct order for successful execution", async () => {
    const { pipeline, eventStore } = createFullPipeline();
    const call = makeCall();

    await pipeline.execute(call, successHandler());

    const events = eventStore.getByRequestId(call.requestId);
    const types = events.map((e) => e.type);

    expect(types).toContain("tool:proposed");
    expect(types).toContain("tool:validated");
    expect(types).toContain("tool:executing");
    expect(types).toContain("tool:executed");
    expect(types).toContain("tool:verified");
    expect(types).toContain("tool:invariants:checked");

    // Order check: proposed before validated, validated before executing, etc.
    expect(types.indexOf("tool:proposed")).toBeLessThan(types.indexOf("tool:validated"));
    expect(types.indexOf("tool:validated")).toBeLessThan(types.indexOf("tool:executing"));
    expect(types.indexOf("tool:executing")).toBeLessThan(types.indexOf("tool:executed"));
    expect(types.indexOf("tool:executed")).toBeLessThan(types.indexOf("tool:verified"));
    expect(types.indexOf("tool:verified")).toBeLessThan(types.indexOf("tool:invariants:checked"));
  });

  it("validation failure stops execution early", async () => {
    const { pipeline, eventStore, stateMachine } = createFullPipeline();
    const handler = successHandler();
    // Unknown tool → schema validation fails
    const call = makeCall({ tool: "NONEXISTENT_TOOL" });

    const result = await pipeline.execute(call, handler);

    expect(result.success).toBe(false);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
    expect(handler).not.toHaveBeenCalled();

    const events = eventStore.getByRequestId(call.requestId);
    const types = events.map((e) => e.type);
    expect(types).toContain("tool:proposed");
    expect(types).toContain("tool:validated");
    expect(types).toContain("tool:failed");
    expect(types).not.toContain("tool:executing");
  });

  it("approval denial blocks execution", async () => {
    const { pipeline, approvalGate } = createFullPipeline();
    const handler = successHandler();
    // RUN_IN_TERMINAL requires approval (irreversible)
    const call = makeCall({
      tool: "RUN_IN_TERMINAL",
      params: { command: "ls" },
    });

    // Deny the approval after a short delay
    const executePromise = pipeline.execute(call, handler);
    // Poll for the pending approval
    await vi.waitFor(() => {
      expect(approvalGate.getPending().length).toBeGreaterThan(0);
    }, { timeout: 1000 });
    const pending = approvalGate.getPending();
    approvalGate.resolve(pending[0].id, "denied", "test-user");

    const result = await executePromise;

    expect(result.success).toBe(false);
    expect(result.error).toBe("Approval denied");
    expect(result.approval?.decision).toBe("denied");
    expect(handler).not.toHaveBeenCalled();
  });

  it("approved execution completes successfully", async () => {
    const { pipeline, approvalGate, stateMachine } = createFullPipeline();
    const handler = successHandler({ success: true, exitCode: 0, output: "total 0\n" });
    const call = makeCall({
      tool: "RUN_IN_TERMINAL",
      params: { command: "ls" },
    });

    const executePromise = pipeline.execute(call, handler);
    // Poll for the pending approval
    await vi.waitFor(() => {
      expect(approvalGate.getPending().length).toBeGreaterThan(0);
    }, { timeout: 1000 });
    const pending = approvalGate.getPending();
    approvalGate.resolve(pending[0].id, "approved", "test-user");

    const result = await executePromise;

    expect(result.success).toBe(true);
    expect(result.approval?.decision).toBe("approved");
    expect(result.approval?.decidedBy).toBe("test-user");
    expect(handler).toHaveBeenCalledOnce();
    expect(stateMachine.currentState).toBe("idle");
  });

  it("auto-approves read-only tools", async () => {
    const { pipeline, approvalGate } = createFullPipeline();
    const handler = successHandler();
    const call = makeCall({ tool: "PLAY_EMOTE", params: { emote: "dance" } });

    const result = await pipeline.execute(call, handler);

    expect(result.success).toBe(true);
    // No approval was required for read-only
    expect(result.approval).toBeUndefined();
    expect(approvalGate.getPending()).toHaveLength(0);
  });

  it("handler errors are caught and reported", async () => {
    const { pipeline, stateMachine } = createFullPipeline();
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const call = makeCall({ tool: "PLAY_EMOTE", params: { emote: "wave" } });

    const result = await pipeline.execute(call, handler);

    expect(result.success).toBe(false);
    expect(result.error).toBe("boom");
  });

  it("invariant checker results are included in pipeline result", async () => {
    const { pipeline } = createFullPipeline({ withInvariantChecker: true });
    const call = makeCall();

    const result = await pipeline.execute(call, successHandler());

    expect(result.invariants).toBeDefined();
    expect(result.invariants?.status).toBeDefined();
    expect(typeof result.invariants?.hasCriticalViolation).toBe("boolean");
  });

  it("pipeline without invariant checker omits invariants from result", async () => {
    const { pipeline } = createFullPipeline({ withInvariantChecker: false });
    const call = makeCall();

    const result = await pipeline.execute(call, successHandler());

    expect(result.success).toBe(true);
    expect(result.invariants).toBeUndefined();
  });

  it("correlation ID links all events from a single execution", async () => {
    const { pipeline, eventStore } = createFullPipeline();
    const call = makeCall();

    const result = await pipeline.execute(call, successHandler());

    expect(result.correlationId).toBeDefined();
    const correlatedEvents = eventStore.getByCorrelationId(result.correlationId!);
    expect(correlatedEvents.length).toBeGreaterThanOrEqual(4);

    // All events should have the same correlation ID
    for (const event of correlatedEvents) {
      expect(event.correlationId).toBe(result.correlationId);
    }

    // Events should match request ID events
    const requestEvents = eventStore.getByRequestId(call.requestId);
    expect(correlatedEvents.length).toBe(requestEvents.length);
  });

  it("multiple sequential executions maintain isolation", async () => {
    const { pipeline, eventStore, stateMachine } = createFullPipeline();

    const call1 = makeCall({ requestId: "iso-1" });
    const call2 = makeCall({ requestId: "iso-2" });

    const result1 = await pipeline.execute(call1, successHandler({ a: 1 }));
    const result2 = await pipeline.execute(call2, successHandler({ b: 2 }));

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.correlationId).not.toBe(result2.correlationId);

    const events1 = eventStore.getByRequestId("iso-1");
    const events2 = eventStore.getByRequestId("iso-2");
    expect(events1.length).toBeGreaterThan(0);
    expect(events2.length).toBeGreaterThan(0);

    // No cross-contamination
    for (const e of events1) {
      expect(e.requestId).toBe("iso-1");
    }
    for (const e of events2) {
      expect(e.requestId).toBe("iso-2");
    }

    expect(stateMachine.currentState).toBe("idle");
  });
});
