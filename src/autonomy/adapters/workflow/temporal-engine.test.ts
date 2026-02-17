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
    expect(result.error).toContain("temporal unavailable");
  });
});
