/**
 * Phase 2 gate acceptance tests.
 *
 * P2-063: >=99.5% success on reversible actions.
 * P2-064: zero unauthorized irreversible actions.
 */

import { describe, expect, it, vi } from "vitest";
import { ApprovalGate } from "../approval/approval-gate.js";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import { ToolRegistry } from "../tools/registry.js";
import { BUILTIN_CONTRACTS, registerBuiltinToolContracts } from "../tools/schemas/index.js";
import type { ProposedToolCall, ToolCallSource } from "../tools/types.js";
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

const PARAM_FIXTURES: Record<string, Record<string, unknown>> = {
  RUN_IN_TERMINAL: { command: "echo phase2-gate" },
  INSTALL_PLUGIN: { pluginId: "demo/plugin" },
  GENERATE_IMAGE: { prompt: "a calm ocean at sunrise" },
  GENERATE_VIDEO: { prompt: "slow pan across a city skyline" },
  GENERATE_AUDIO: { prompt: "ambient synth with soft percussion" },
  ANALYZE_IMAGE: { imageUrl: "https://example.com/image.png" },
  PLAY_EMOTE: { emote: "wave" },
  RESTART_AGENT: { reason: "phase2-gate" },
  CREATE_TASK: { request: "Run daily digest at 9 AM" },
  PHETTA_NOTIFY: { message: "phase2 gate test notification" },
  PHETTA_SEND_EVENT: {
    type: "phase2.gate",
    message: "phase2 gate event",
    data: { source: "test" },
  },
};

function makeCall(
  toolName: string,
  requestId: string,
  source: ToolCallSource,
): ProposedToolCall {
  const fixture = PARAM_FIXTURES[toolName];
  if (!fixture) {
    throw new Error(`Missing params fixture for tool: ${toolName}`);
  }
  return {
    tool: toolName,
    params: structuredClone(fixture),
    source,
    requestId,
  };
}

function createPipeline(opts: { autoApproveSources?: ToolCallSource[] } = {}) {
  const toolRegistry = new ToolRegistry();
  registerBuiltinToolContracts(toolRegistry);

  const schemaValidator = new SchemaValidator(toolRegistry);
  const postConditionVerifier = new PostConditionVerifier();
  registerBuiltinPostConditions(postConditionVerifier);

  const stateMachine = new KernelStateMachine();
  const approvalGate = new ApprovalGate({ timeoutMs: 10_000 });
  const eventStore = new InMemoryEventStore();
  const compensationRegistry = new CompensationRegistry();
  registerBuiltinCompensations(compensationRegistry);

  const invariantChecker = new InvariantChecker();
  registerBuiltinInvariants(invariantChecker);

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
      autoApproveSources: opts.autoApproveSources ?? [],
    },
  });

  return { pipeline, approvalGate, eventStore };
}

describe("Phase 2 Acceptance Gates", () => {
  it("P2-063: demonstrates >=99.5% success on reversible actions", async () => {
    const reversibleTools = BUILTIN_CONTRACTS
      .filter((contract) => contract.riskClass === "reversible")
      .map((contract) => contract.name);

    expect(reversibleTools.length).toBeGreaterThan(0);

    const { pipeline } = createPipeline({ autoApproveSources: ["system"] });
    const handler: ToolActionHandler = vi.fn(async (toolName, _params, requestId) => {
      if (toolName === "CREATE_TASK") {
        return {
          result: {
            success: true,
            data: { triggerId: `trigger-${requestId}` },
          },
          durationMs: 1,
        };
      }
      if (toolName === "PHETTA_NOTIFY" || toolName === "PHETTA_SEND_EVENT") {
        return { result: { success: true }, durationMs: 1 };
      }
      return { result: { ok: true }, durationMs: 1 };
    });

    const iterations = 400;
    let successCount = 0;

    for (let i = 0; i < iterations; i += 1) {
      const toolName = reversibleTools[i % reversibleTools.length];
      const result = await pipeline.execute(
        makeCall(toolName, `p2-063-${i}`, "system"),
        handler,
      );
      if (result.success) successCount += 1;
    }

    const successRate = successCount / iterations;
    expect(successRate).toBeGreaterThanOrEqual(0.995);
    expect(handler).toHaveBeenCalledTimes(iterations);
  });

  it("P2-064: demonstrates zero unauthorized irreversible actions", async () => {
    const irreversibleTools = BUILTIN_CONTRACTS
      .filter((contract) => contract.riskClass === "irreversible")
      .map((contract) => contract.name);

    expect(irreversibleTools.length).toBeGreaterThan(0);

    const { pipeline, approvalGate, eventStore } = createPipeline();
    let unauthorizedExecutionCount = 0;

    for (let i = 0; i < irreversibleTools.length; i += 1) {
      const toolName = irreversibleTools[i];
      const requestId = `p2-064-${toolName}-${i}`;
      const handler: ToolActionHandler = vi.fn(async () => {
        unauthorizedExecutionCount += 1;
        return { result: { executed: true }, durationMs: 1 };
      });

      const executePromise = pipeline.execute(
        makeCall(toolName, requestId, "llm"),
        handler,
      );

      await vi.waitFor(() => {
        expect(approvalGate.getPending().some((req) => req.call.requestId === requestId))
          .toBe(true);
      }, { timeout: 1_000 });

      const pending = approvalGate
        .getPending()
        .find((req) => req.call.requestId === requestId);
      if (!pending) {
        throw new Error(`Expected pending approval for requestId=${requestId}`);
      }

      approvalGate.resolve(pending.id, "denied", "phase2-gate-test");
      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Approval denied");
      expect(result.approval?.decision).toBe("denied");
      expect(handler).not.toHaveBeenCalled();

      const events = await eventStore.getByRequestId(requestId);
      const eventTypes = events.map((event) => event.type);
      expect(eventTypes).not.toContain("tool:executing");
    }

    expect(unauthorizedExecutionCount).toBe(0);
  });
});
