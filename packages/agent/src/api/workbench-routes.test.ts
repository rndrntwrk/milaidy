import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  ensureWorkbenchBootstrapTodo,
  handleWorkbenchRoutes,
  WORKBENCH_BOOTSTRAP_TODO_NAME,
  type WorkbenchRouteContext,
} from "./workbench-routes";

function createBootstrapTodoView(id = "bootstrap-todo") {
  return {
    id,
    name: WORKBENCH_BOOTSTRAP_TODO_NAME,
    description: WORKBENCH_BOOTSTRAP_TODO_NAME,
    priority: null,
    isUrgent: false,
    type: "task",
    isCompleted: false,
    tags: ["TODO", "bootstrap"],
    createdAt: null,
    updatedAt: null,
  };
}

describe("workbench bootstrap todo", () => {
  it("seeds a persisted bootstrap todo from GET /api/workbench/todos when the workbench is empty", async () => {
    const json = vi.fn();
    const error = vi.fn();
    const bootstrapTodo = createBootstrapTodoView();
    const todoData = {
      getTodos: vi.fn().mockResolvedValue([]),
      getTodo: vi.fn().mockResolvedValue({
        id: bootstrapTodo.id,
        name: bootstrapTodo.name,
        description: bootstrapTodo.description,
        priority: null,
        isUrgent: false,
        type: "task",
        isCompleted: false,
      }),
      createTodo: vi.fn().mockResolvedValue(bootstrapTodo.id),
      updateTodo: vi.fn(),
      deleteTodo: vi.fn(),
    };
    const runtime = {
      agentId: "agent-1",
      getTasks: vi.fn().mockResolvedValue([]),
      getTask: vi.fn(),
      createTask: vi.fn(),
      getService: vi.fn().mockReturnValue(null),
      logger: { warn: vi.fn() },
    };

    await handleWorkbenchRoutes({
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "GET",
      pathname: "/api/workbench/todos",
      url: new URL("http://localhost/api/workbench/todos"),
      state: {
        runtime: runtime as unknown as AgentRuntime,
        adminEntityId: null,
      },
      json,
      error,
      readJsonBody: vi.fn(),
      toWorkbenchTask: vi.fn(),
      toWorkbenchTodo: vi.fn(),
      toWorkbenchTodoFromRecord: vi.fn().mockReturnValue(bootstrapTodo),
      getTodoDataService: vi.fn().mockResolvedValue(todoData),
      recordTodoDbFailure: vi.fn(),
      normalizeTags: vi
        .fn()
        .mockImplementation((value: unknown, required: string[] = []) => [
          ...required,
          ...(Array.isArray(value) ? value : []),
        ]),
      readTaskMetadata: vi.fn(),
      readTaskCompleted: vi.fn(),
      parseNullableNumber: vi.fn(),
      asObject: vi.fn(),
      decodePathComponent: vi.fn(),
      taskToTriggerSummary: vi.fn(),
      listTriggerTasks: vi.fn(),
    } as unknown as WorkbenchRouteContext);

    expect(todoData.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        name: WORKBENCH_BOOTSTRAP_TODO_NAME,
        description: WORKBENCH_BOOTSTRAP_TODO_NAME,
      }),
    );
    expect(runtime.createTask).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.anything(), {
      todos: [bootstrapTodo],
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("falls back to a runtime workbench todo when plugin-todo storage is unavailable", async () => {
    const bootstrapTodo = createBootstrapTodoView("runtime-bootstrap");
    const createdTask = {
      id: bootstrapTodo.id,
      name: bootstrapTodo.name,
      description: bootstrapTodo.description,
      tags: ["workbench-todo", "todo", "bootstrap"],
      metadata: {
        isCompleted: false,
        workbenchTodo: {
          description: bootstrapTodo.description,
          isCompleted: false,
          isUrgent: false,
          priority: null,
          source: "workbench-bootstrap",
          type: "task",
        },
      },
    };
    const runtime = {
      agentId: "agent-1",
      getTask: vi.fn().mockResolvedValue(createdTask),
      createTask: vi.fn().mockResolvedValue(bootstrapTodo.id),
      getService: vi.fn().mockReturnValue(null),
      logger: { warn: vi.fn() },
    };

    const result = await ensureWorkbenchBootstrapTodo({
      ctx: {
        normalizeTags: vi
          .fn()
          .mockImplementation((value: unknown, required: string[] = []) => [
            ...required,
            ...(Array.isArray(value) ? value : []),
          ]),
        recordTodoDbFailure: vi.fn(),
        toWorkbenchTodo: vi.fn().mockReturnValue(bootstrapTodo),
        toWorkbenchTodoFromRecord: vi.fn(),
      },
      runtime: runtime as unknown as AgentRuntime,
      adminEntityId: null,
      todos: [],
      todoData: null,
    });

    expect(runtime.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        name: WORKBENCH_BOOTSTRAP_TODO_NAME,
        description: WORKBENCH_BOOTSTRAP_TODO_NAME,
      }),
    );
    expect(result).toEqual(bootstrapTodo);
  });

  it("marks persisted plugin-todo records completed through POST /api/workbench/todos/:id/complete", async () => {
    const json = vi.fn();
    const error = vi.fn();
    const todoData = {
      getTodos: vi.fn(),
      getTodo: vi.fn(),
      createTodo: vi.fn(),
      updateTodo: vi.fn().mockResolvedValue({ ok: true }),
      deleteTodo: vi.fn(),
    };
    const runtime = {
      agentId: "agent-1",
      getTask: vi.fn(),
      updateTask: vi.fn(),
      getService: vi.fn().mockReturnValue(null),
      logger: { warn: vi.fn() },
    };

    await handleWorkbenchRoutes({
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "POST",
      pathname: "/api/workbench/todos/todo-123/complete",
      url: new URL("http://localhost/api/workbench/todos/todo-123/complete"),
      state: {
        runtime: runtime as unknown as AgentRuntime,
        adminEntityId: null,
      },
      json,
      error,
      readJsonBody: vi.fn().mockResolvedValue({ isCompleted: true }),
      toWorkbenchTask: vi.fn(),
      toWorkbenchTodo: vi.fn(),
      toWorkbenchTodoFromRecord: vi.fn(),
      getTodoDataService: vi.fn().mockResolvedValue(todoData),
      recordTodoDbFailure: vi.fn(),
      normalizeTags: vi.fn(),
      readTaskMetadata: vi.fn(),
      readTaskCompleted: vi.fn(),
      parseNullableNumber: vi.fn(),
      asObject: vi.fn(),
      decodePathComponent: vi.fn().mockReturnValue("todo-123"),
      taskToTriggerSummary: vi.fn(),
      listTriggerTasks: vi.fn(),
    } as unknown as WorkbenchRouteContext);

    expect(todoData.updateTodo).toHaveBeenCalledWith("todo-123", {
      isCompleted: true,
      completedAt: expect.any(Date),
    });
    expect(runtime.getTask).not.toHaveBeenCalled();
    expect(runtime.updateTask).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.anything(), { ok: true });
    expect(error).not.toHaveBeenCalled();
  });

  it("marks runtime-backed todos completed when plugin-todo storage is unavailable", async () => {
    const json = vi.fn();
    const error = vi.fn();
    const todoTask = {
      id: "todo-456",
      name: "Follow up",
      description: "Call the user back",
      metadata: {
        source: "existing-metadata",
        workbenchTodo: {
          description: "Call the user back",
          isUrgent: false,
          priority: 2,
          type: "task",
        },
      },
    };
    const runtime = {
      agentId: "agent-1",
      getTask: vi.fn().mockResolvedValue(todoTask),
      updateTask: vi.fn().mockResolvedValue(undefined),
      getService: vi.fn().mockReturnValue(null),
      logger: { warn: vi.fn() },
    };
    const readTaskMetadata = vi
      .fn()
      .mockReturnValue(todoTask.metadata as Record<string, unknown>);

    await handleWorkbenchRoutes({
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "POST",
      pathname: "/api/workbench/todos/todo-456/complete",
      url: new URL("http://localhost/api/workbench/todos/todo-456/complete"),
      state: {
        runtime: runtime as unknown as AgentRuntime,
        adminEntityId: null,
      },
      json,
      error,
      readJsonBody: vi.fn().mockResolvedValue({ isCompleted: true }),
      toWorkbenchTask: vi.fn(),
      toWorkbenchTodo: vi
        .fn()
        .mockReturnValue(createBootstrapTodoView("todo-456")),
      toWorkbenchTodoFromRecord: vi.fn(),
      getTodoDataService: vi.fn().mockResolvedValue(null),
      recordTodoDbFailure: vi.fn(),
      normalizeTags: vi.fn(),
      readTaskMetadata,
      readTaskCompleted: vi.fn(),
      parseNullableNumber: vi.fn(),
      asObject: vi
        .fn()
        .mockImplementation((value: unknown) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null,
        ),
      decodePathComponent: vi.fn().mockReturnValue("todo-456"),
      taskToTriggerSummary: vi.fn(),
      listTriggerTasks: vi.fn(),
    } as unknown as WorkbenchRouteContext);

    expect(runtime.updateTask).toHaveBeenCalledWith("todo-456", {
      metadata: {
        source: "existing-metadata",
        isCompleted: true,
        workbenchTodo: {
          description: "Call the user back",
          isUrgent: false,
          priority: 2,
          type: "task",
          isCompleted: true,
        },
      },
    });
    expect(json).toHaveBeenCalledWith(expect.anything(), { ok: true });
    expect(error).not.toHaveBeenCalled();
  });
});
