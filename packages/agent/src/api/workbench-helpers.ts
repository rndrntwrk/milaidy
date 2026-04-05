/**
 * Workbench task/todo normalization helpers.
 *
 * Extracted from server.ts — used exclusively by workbench-routes.ts
 * to transform elizaOS Task records into the WorkbenchTaskView / WorkbenchTodoView
 * shapes consumed by the dashboard UI.
 */

import { type AgentRuntime, logger, type Task } from "@elizaos/core";
import { isFatalTodoDbError, TodoDbCircuitBreaker } from "./todo-db-circuit.js";
import { readTriggerConfig } from "../triggers/runtime.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WORKBENCH_TASK_TAG = "workbench-task";
export const WORKBENCH_TODO_TAG = "workbench-todo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkbenchTaskView {
  id: string;
  name: string;
  description: string;
  tags: string[];
  isCompleted: boolean;
  updatedAt?: number;
}

export interface WorkbenchTodoView {
  id: string;
  name: string;
  description: string;
  priority: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  type: string;
}

export interface TodoDataServiceLike {
  createTodo: (input: Record<string, unknown>) => Promise<string>;
  getTodos: (
    filters?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>;
  getTodo: (todoId: string) => Promise<Record<string, unknown> | null>;
  updateTodo: (
    todoId: string,
    updates: Record<string, unknown>,
  ) => Promise<boolean>;
  deleteTodo: (todoId: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function readTaskMetadata(task: Task): Record<string, unknown> {
  return asObject(task.metadata) ?? {};
}

export function normalizeTaskId(task: Task): string | null {
  return typeof task.id === "string" && task.id.trim().length > 0
    ? task.id
    : null;
}

export function readTaskCompleted(task: Task): boolean {
  const metadata = readTaskMetadata(task);
  if (typeof metadata.isCompleted === "boolean") return metadata.isCompleted;
  const todoMeta =
    asObject(metadata.workbenchTodo) ?? asObject(metadata.todo) ?? null;
  if (todoMeta && typeof todoMeta.isCompleted === "boolean") {
    return todoMeta.isCompleted;
  }
  return false;
}

export function isWorkbenchTodoTask(task: Task): boolean {
  if (readTriggerConfig(task)) return false;
  const tags = new Set(normalizeStringArray(task.tags));
  if (tags.has(WORKBENCH_TODO_TAG) || tags.has("todo")) return true;
  const metadata = readTaskMetadata(task);
  return (
    asObject(metadata.workbenchTodo) !== null ||
    asObject(metadata.todo) !== null
  );
}

export function toWorkbenchTask(task: Task): WorkbenchTaskView | null {
  if (readTriggerConfig(task) || isWorkbenchTodoTask(task)) return null;
  const id = normalizeTaskId(task);
  if (!id) return null;
  const metadata = readTaskMetadata(task);
  const updatedAt =
    normalizeTimestamp(
      (task as unknown as Record<string, unknown>).updatedAt,
    ) ?? normalizeTimestamp(metadata.updatedAt);
  return {
    id,
    name:
      typeof task.name === "string" && task.name.trim().length > 0
        ? task.name
        : "Task",
    description: typeof task.description === "string" ? task.description : "",
    tags: normalizeStringArray(task.tags),
    isCompleted: readTaskCompleted(task),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

export function toWorkbenchTodo(task: Task): WorkbenchTodoView | null {
  if (!isWorkbenchTodoTask(task)) return null;
  const id = normalizeTaskId(task);
  if (!id) return null;
  const metadata = readTaskMetadata(task);
  const todoMeta =
    asObject(metadata.workbenchTodo) ?? asObject(metadata.todo) ?? {};
  return {
    id,
    name:
      typeof task.name === "string" && task.name.trim().length > 0
        ? task.name
        : "Todo",
    description:
      typeof todoMeta.description === "string"
        ? todoMeta.description
        : typeof task.description === "string"
          ? task.description
          : "",
    priority: parseNullableNumber(todoMeta.priority),
    isUrgent: todoMeta.isUrgent === true,
    isCompleted: readTaskCompleted(task),
    type:
      typeof todoMeta.type === "string" && todoMeta.type.trim().length > 0
        ? todoMeta.type
        : "task",
  };
}

export function normalizeTags(
  value: unknown,
  required: string[] = [],
): string[] {
  const next = new Set<string>([
    ...normalizeStringArray(value),
    ...required.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
  ]);
  return [...next];
}

// ---------------------------------------------------------------------------
// Todo data service (plugin-todo)
// ---------------------------------------------------------------------------

const todoDbCircuitBreaker = new TodoDbCircuitBreaker();

export async function getTodoDataService(
  runtime: AgentRuntime,
): Promise<TodoDataServiceLike | null> {
  const runtimeKey = String(runtime.agentId ?? "unknown");
  if (todoDbCircuitBreaker.isOpen(runtimeKey)) {
    return null;
  }
  try {
    const todoModule = (await import("@elizaos/plugin-todo")) as Record<
      string,
      unknown
    >;
    const createTodoDataService = todoModule.createTodoDataService as
      | ((rt: AgentRuntime) => TodoDataServiceLike)
      | undefined;
    if (!createTodoDataService) return null;
    return createTodoDataService(runtime);
  } catch {
    return null;
  }
}

export function recordTodoDbFailure(
  runtime: AgentRuntime,
  operation: string,
  err: unknown,
): void {
  if (!isFatalTodoDbError(err)) return;
  const runtimeKey = String(runtime.agentId ?? "unknown");
  if (!todoDbCircuitBreaker.open(runtimeKey)) return;
  runtime.logger?.warn(
    {
      src: "eliza-api",
      operation,
      err,
      agentId: runtime.agentId,
    },
    "[eliza-api] Disabling plugin-todo DB integration after fatal todo query failure",
  );
}

export function toWorkbenchTodoFromRecord(
  todo: Record<string, unknown>,
): WorkbenchTodoView | null {
  const metadata = asObject(todo.metadata);
  const lifeopsMirror = asObject(metadata?.lifeopsMirror);
  if (lifeopsMirror?.hiddenFromWorkbench === true) {
    return null;
  }
  const id =
    typeof todo.id === "string" && todo.id.trim().length > 0 ? todo.id : null;
  const name =
    typeof todo.name === "string" && todo.name.trim().length > 0
      ? todo.name
      : null;
  if (!id || !name) return null;
  return {
    id,
    name,
    description: typeof todo.description === "string" ? todo.description : "",
    priority: parseNullableNumber(todo.priority),
    isUrgent: todo.isUrgent === true,
    isCompleted: todo.isCompleted === true,
    type:
      typeof todo.type === "string" && todo.type.trim().length > 0
        ? todo.type
        : "task",
  };
}
