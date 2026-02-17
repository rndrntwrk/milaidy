import { describe, expect, it } from "vitest";

import { ApprovalGate } from "../approval/approval-gate.js";
import { runLoadTest } from "../benchmarks/performance/load-test.js";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import { ToolRegistry } from "../tools/registry.js";
import { registerBuiltinToolContracts } from "../tools/schemas/index.js";
import type { ProposedToolCall } from "../tools/types.js";
import { PostConditionVerifier } from "../verification/postcondition-verifier.js";
import { registerBuiltinPostConditions } from "../verification/postconditions/index.js";
import { SchemaValidator } from "../verification/schema-validator.js";
import { CompensationRegistry } from "./compensation-registry.js";
import { registerBuiltinCompensations } from "./compensations/index.js";
import { InMemoryEventStore } from "./event-store.js";
import { ToolExecutionPipeline } from "./execution-pipeline.js";

function makeCall(i: number): ProposedToolCall {
  return {
    tool: "PLAY_EMOTE",
    params: { emote: "wave" },
    source: "system",
    requestId: `bench-${i}`,
  };
}

describe("Execution Pipeline benchmark", () => {
  it("measures throughput and latency under sustained load", async () => {
    const registry = new ToolRegistry();
    registerBuiltinToolContracts(registry);

    const pipeline = new ToolExecutionPipeline({
      schemaValidator: new SchemaValidator(registry),
      approvalGate: new ApprovalGate({ timeoutMs: 5_000 }),
      postConditionVerifier: (() => {
        const verifier = new PostConditionVerifier();
        registerBuiltinPostConditions(verifier);
        return verifier;
      })(),
      compensationRegistry: (() => {
        const r = new CompensationRegistry();
        registerBuiltinCompensations(r);
        return r;
      })(),
      stateMachine: new KernelStateMachine(),
      eventStore: new InMemoryEventStore(),
    });

    let i = 0;
    const result = await runLoadTest(
      { totalRequests: 25, concurrency: 1, timeoutMs: 2_000 },
      async () => {
        const call = makeCall(i++);
        const out = await pipeline.execute(call, async () => ({
          result: { ok: true },
          durationMs: 1,
        }));
        if (!out.success) {
          throw new Error(out.error ?? "pipeline execution failed");
        }
      },
    );

    expect(result.totalCompleted).toBe(25);
    expect(result.successes).toBe(25);
    expect(result.failures).toBe(0);
    expect(result.throughput).toBeGreaterThan(0);
    expect(result.latency.p95).toBeLessThan(500);
  });
});
