import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { handleAliceTaskThreadsRead } from "./alice-task-thread-routes";

function context(service: unknown) {
  const runtime = {
    getService: vi.fn((name: string) => {
      expect(name).toBe("ORCHESTRATOR_TASK_SERVICE");
      return service;
    }),
    getServiceLoadPromise: vi.fn(),
  };
  return {
    runtime: runtime as unknown as IAgentRuntime,
    pathname: "/api/coding-agents/coordinator/threads",
    method: "GET",
    url: new URL(
      "http://localhost/api/coding-agents/coordinator/threads?limit=30&includeArchived=true&status=completed&search=corpus",
    ),
    res: {} as never,
    json: vi.fn(),
    error: vi.fn(),
    loader: runtime.getServiceLoadPromise,
  };
}

describe("Alice task thread reads", () => {
  it("reads the persisted task service with the sidebar filters without starting services", async () => {
    const tasks = [{ id: "stored-task", title: "Corpus", status: "completed" }];
    const listTasks = vi.fn(async () => tasks);
    const ctx = context({ listTasks });
    expect(await handleAliceTaskThreadsRead(ctx)).toBe(true);
    expect(listTasks).toHaveBeenCalledWith({
      limit: 30,
      includeArchived: true,
      status: "completed",
      search: "corpus",
    });
    expect(ctx.json).toHaveBeenCalledWith(ctx.res, tasks);
    expect(ctx.loader).not.toHaveBeenCalled();
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it("reports an unavailable reader instead of an empty task list", async () => {
    const ctx = context(null);
    expect(await handleAliceTaskThreadsRead(ctx)).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "Task thread reader is not available",
      503,
    );
    expect(ctx.json).not.toHaveBeenCalled();
    expect(ctx.loader).not.toHaveBeenCalled();
  });

  it("reports a storage failure without returning empty tasks", async () => {
    const ctx = context({
      listTasks: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    expect(await handleAliceTaskThreadsRead(ctx)).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "Failed to read task threads",
      503,
    );
    expect(ctx.json).not.toHaveBeenCalled();
    expect(ctx.loader).not.toHaveBeenCalled();
  });
});
