import { describe, expect, it, vi } from "vitest";
import { TemporalWorkflowEngine } from "./temporal-engine.js";

function createTemporalMocks() {
  const closeMock = vi.fn(async () => {});
  const connectMock = vi.fn(async () => ({ close: closeMock }));
  const startMock = vi.fn();
  const getHandleMock = vi.fn();

  class WorkflowClient {
    constructor(_opts: { connection: unknown; namespace: string }) {}
    start = startMock;
    getHandle = getHandleMock;
  }

  const temporalModule = {
    Connection: { connect: connectMock },
    WorkflowClient,
  };

  return {
    temporalModule,
    connectMock,
    closeMock,
    startMock,
    getHandleMock,
  };
}

describe("TemporalWorkflowEngine", () => {
  it("returns error for unregistered workflow", async () => {
    const mocks = createTemporalMocks();
    const engine = new TemporalWorkflowEngine(
      {},
      { temporalModule: mocks.temporalModule },
    );

    const result = await engine.execute("missing", {});

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("not registered");
    expect(mocks.startMock).not.toHaveBeenCalled();
  });

  it("executes a registered workflow and tracks status/cancel", async () => {
    const mocks = createTemporalMocks();
    const handle = {
      workflowId: "wf-1",
      runId: "run-1",
      result: vi.fn(async () => ({ ok: true })),
      cancel: vi.fn(async () => {}),
    };
    mocks.startMock.mockResolvedValue(handle);

    const engine = new TemporalWorkflowEngine(
      {},
      { temporalModule: mocks.temporalModule },
    );
    engine.register({ id: "wf", name: "Workflow", steps: [] });

    const result = await engine.execute("wf", { input: 1 });

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.executionId).toBe("wf-1:run-1");
    expect(result.output).toEqual({ ok: true });
    expect(mocks.startMock).toHaveBeenCalledTimes(1);

    const status = await engine.getStatus(result.executionId);
    expect(status).toEqual(result);

    const cancelled = await engine.cancel(result.executionId);
    expect(cancelled).toBe(true);
    expect(handle.cancel).toHaveBeenCalledTimes(1);

    await engine.close();
    expect(mocks.closeMock).toHaveBeenCalledTimes(1);
  });

  it("reattaches to existing workflow on already-started error", async () => {
    const mocks = createTemporalMocks();
    mocks.startMock.mockRejectedValueOnce(
      Object.assign(new Error("workflow already started"), {
        name: "WorkflowExecutionAlreadyStartedError",
      }),
    );
    const existingHandle = {
      workflowId: "plan-fixed",
      runId: "run-existing",
      result: vi.fn(async () => ({ reused: true })),
    };
    mocks.getHandleMock.mockReturnValue(existingHandle);

    const engine = new TemporalWorkflowEngine(
      {},
      { temporalModule: mocks.temporalModule },
    );
    engine.register({
      id: "plan-execution",
      name: "Plan Execution",
      steps: [],
      temporal: { workflowId: "plan-fixed" },
    });

    const result = await engine.execute("plan-execution", { foo: "bar" });

    expect(result.success).toBe(true);
    expect(result.executionId).toBe("plan-fixed:run-existing");
    expect(result.output).toEqual({ reused: true });
    expect(mocks.getHandleMock).toHaveBeenCalledWith("plan-fixed");
  });

  it("survives adapter restart by reattaching to existing workflow", async () => {
    const mocks = createTemporalMocks();
    const sharedHandle = {
      workflowId: "plan-restart",
      runId: "run-9",
      result: vi.fn(async () => ({ stable: true })),
    };

    mocks.startMock
      .mockResolvedValueOnce(sharedHandle)
      .mockRejectedValueOnce(
        Object.assign(new Error("already started"), {
          name: "WorkflowExecutionAlreadyStartedError",
        }),
      );
    mocks.getHandleMock.mockReturnValue(sharedHandle);

    const def = {
      id: "plan-execution",
      name: "Plan Execution",
      steps: [],
      temporal: { workflowId: "plan-restart" },
    };

    const engine1 = new TemporalWorkflowEngine(
      {},
      { temporalModule: mocks.temporalModule },
    );
    engine1.register(def);
    const first = await engine1.execute("plan-execution", { attempt: 1 });
    expect(first.success).toBe(true);
    expect(first.executionId).toBe("plan-restart:run-9");
    await engine1.close();

    // Simulate process restart with a fresh adapter instance.
    const engine2 = new TemporalWorkflowEngine(
      {},
      { temporalModule: mocks.temporalModule },
    );
    engine2.register(def);
    const second = await engine2.execute("plan-execution", { attempt: 2 });
    expect(second.success).toBe(true);
    expect(second.executionId).toBe("plan-restart:run-9");
    expect(second.output).toEqual({ stable: true });
    expect(mocks.getHandleMock).toHaveBeenCalledWith("plan-restart");
  });

  it("returns failure on non-idempotent start errors", async () => {
    const mocks = createTemporalMocks();
    mocks.startMock.mockRejectedValueOnce(new Error("temporal unavailable"));

    const engine = new TemporalWorkflowEngine(
      {},
      { temporalModule: mocks.temporalModule },
    );
    engine.register({ id: "wf", name: "Workflow", steps: [] });

    const result = await engine.execute("wf", {});

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.deadLettered).toBe(true);
    expect(result.error).toContain("temporal unavailable");
    const deadLetters = await engine.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].reason).toBe("start_error");
  });

  it("times out workflow result and dead-letters execution", async () => {
    const mocks = createTemporalMocks();
    const handle = {
      workflowId: "wf-timeout",
      runId: "run-timeout",
      result: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { ok: true };
      }),
      cancel: vi.fn(async () => {}),
    };
    mocks.startMock.mockResolvedValue(handle);

    const engine = new TemporalWorkflowEngine(
      { defaultTimeoutMs: 10 },
      { temporalModule: mocks.temporalModule },
    );
    engine.register({ id: "wf", name: "Workflow", steps: [] });

    const result = await engine.execute("wf", { input: 1 });

    expect(result.success).toBe(false);
    expect(result.status).toBe("timed_out");
    expect(result.deadLettered).toBe(true);
    expect(result.error).toContain("timed out");
    expect(handle.cancel).toHaveBeenCalledTimes(1);

    const deadLetters = await engine.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].executionId).toBe("wf-timeout:run-timeout");
    expect(deadLetters[0].reason).toBe("timeout");
  });
});
