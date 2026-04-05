import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockProcessScheduledWork } = vi.hoisted(() => ({
  mockProcessScheduledWork: vi.fn(),
}));

vi.mock("./service.js", () => ({
  LifeOpsService: class {
    processScheduledWork = mockProcessScheduledWork;
  },
}));

import {
  ensureLifeOpsSchedulerTask,
  executeLifeOpsSchedulerTask,
  LIFEOPS_TASK_INTERVAL_MS,
  LIFEOPS_TASK_NAME,
  LIFEOPS_TASK_TAGS,
  registerLifeOpsTaskWorker,
} from "./runtime.js";

function createRuntimeMock(tasks: Task[] = []) {
  const workerRegistry = new Map<string, unknown>();
  const state = {
    tasks: [...tasks],
  };
  const runtime = {
    agentId: "agent-lifeops" as UUID,
    getService: vi.fn(() => ({
      getAutonomousRoomId: () => "room-lifeops" as UUID,
    })),
    getTasks: vi.fn(async () => [...state.tasks]),
    createTask: vi.fn(async (task: Task) => {
      const id = (task.id ?? "lifeops-task-id") as UUID;
      state.tasks.push({ ...task, id });
      return id;
    }),
    updateTask: vi.fn(async (taskId: UUID, update: Partial<Task>) => {
      state.tasks = state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...update,
              metadata: {
                ...((task.metadata as Record<string, unknown> | undefined) ??
                  {}),
                ...((update.metadata as Record<string, unknown> | undefined) ??
                  {}),
              },
            }
          : task,
      );
    }),
    registerTaskWorker: vi.fn((worker: { name: string }) => {
      workerRegistry.set(worker.name, worker);
    }),
    getTaskWorker: vi.fn((name: string) => workerRegistry.get(name)),
  } as unknown as IAgentRuntime;

  return {
    runtime,
    workerRegistry,
    state,
  };
}

describe("lifeops runtime scheduler", () => {
  beforeEach(() => {
    mockProcessScheduledWork.mockReset().mockResolvedValue({
      now: new Date().toISOString(),
      reminderAttempts: [],
      workflowRuns: [],
    });
  });

  it("creates the persistent scheduler task when missing", async () => {
    const { runtime, state } = createRuntimeMock();

    const taskId = await ensureLifeOpsSchedulerTask(runtime);

    expect(taskId).toBe("lifeops-task-id");
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.name).toBe(LIFEOPS_TASK_NAME);
    expect(state.tasks[0]?.tags).toEqual([...LIFEOPS_TASK_TAGS]);
    expect(state.tasks[0]?.metadata).toMatchObject({
      updateInterval: LIFEOPS_TASK_INTERVAL_MS,
      baseInterval: LIFEOPS_TASK_INTERVAL_MS,
      blocking: true,
      lifeopsScheduler: {
        kind: "runtime_runner",
        version: 1,
      },
    });
  });

  it("reuses and refreshes the existing scheduler task", async () => {
    const existingTask: Task = {
      id: "existing-lifeops-task" as UUID,
      name: LIFEOPS_TASK_NAME,
      description: "old",
      tags: [...LIFEOPS_TASK_TAGS],
      metadata: {
        lifeopsScheduler: {
          kind: "runtime_runner",
          version: 1,
        },
      },
    };
    const { runtime } = createRuntimeMock([existingTask]);

    const taskId = await ensureLifeOpsSchedulerTask(runtime);

    expect(taskId).toBe(existingTask.id);
    expect(vi.mocked(runtime.updateTask)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.createTask)).not.toHaveBeenCalled();
  });

  it("registers a worker that executes scheduled work", async () => {
    const { runtime, workerRegistry } = createRuntimeMock();

    registerLifeOpsTaskWorker(runtime);
    const worker = workerRegistry.get(LIFEOPS_TASK_NAME) as {
      execute: (
        runtime: IAgentRuntime,
        options: Record<string, unknown>,
        task: Task,
      ) => Promise<{ nextInterval: number }>;
    };

    expect(worker).toBeDefined();
    const result = await worker.execute(
      runtime,
      { now: "2026-04-04T12:00:00.000Z" },
      { id: "task-1" as UUID, name: LIFEOPS_TASK_NAME },
    );

    expect(mockProcessScheduledWork).toHaveBeenCalledWith({
      now: "2026-04-04T12:00:00.000Z",
    });
    expect(result.nextInterval).toBe(LIFEOPS_TASK_INTERVAL_MS);
  });

  it("supports direct scheduler execution", async () => {
    const { runtime } = createRuntimeMock();

    const result = await executeLifeOpsSchedulerTask(runtime, {
      now: "2026-04-04T13:00:00.000Z",
    });

    expect(mockProcessScheduledWork).toHaveBeenCalledWith({
      now: "2026-04-04T13:00:00.000Z",
    });
    expect(result).toEqual({ nextInterval: LIFEOPS_TASK_INTERVAL_MS });
  });
});
