import { describe, expect, it, vi } from "vitest";

import {
  ensureRequiredPluginSchemas,
  getRequiredSchemaMigrationTargets,
  listMissingRequiredPluginTables,
} from "./schema-backfill.js";

describe("schema backfill", () => {
  it("selects only required plugins that expose schemas", () => {
    expect(
      getRequiredSchemaMigrationTargets([
        {
          name: "@elizaos/plugin-todo",
          plugin: { schema: { todosTable: {} } },
        },
        {
          name: "@elizaos/plugin-goals",
          plugin: { schema: { goalsTable: {} } },
        },
        {
          name: "@elizaos/plugin-agent-orchestrator",
          plugin: { schema: { ignored: true } },
        },
      ]),
    ).toEqual([
      {
        name: "@elizaos/plugin-todo",
        schema: { todosTable: {} },
        tables: ["todo.todos", "todo.todo_tags"],
      },
      {
        name: "@elizaos/plugin-goals",
        schema: { goalsTable: {} },
        tables: ["goals.goals", "goals.goal_tags"],
      },
    ]);
  });

  it("reports missing required tables per plugin", async () => {
    const missing = await listMissingRequiredPluginTables(
      {
        execute: vi.fn().mockResolvedValue({
          rows: [
            { table_schema: "todo", table_name: "todos" },
            { table_schema: "goals", table_name: "goals" },
          ],
        }),
      },
      [
        {
          name: "@elizaos/plugin-todo",
          schema: { todosTable: {} },
          tables: ["todo.todos", "todo.todo_tags"],
        },
        {
          name: "@elizaos/plugin-goals",
          schema: { goalsTable: {} },
          tables: ["goals.goals", "goals.goal_tags"],
        },
      ],
    );

    expect(missing).toEqual(
      new Map([
        ["@elizaos/plugin-todo", ["todo.todo_tags"]],
        ["@elizaos/plugin-goals", ["goals.goal_tags"]],
      ]),
    );
  });

  it("runs targeted migrations when required tables are missing", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ table_schema: "todo", table_name: "todos" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { table_schema: "todo", table_name: "todos" },
          { table_schema: "todo", table_name: "todo_tags" },
        ],
      });
    const runPluginMigrations = vi.fn().mockResolvedValue(undefined);

    await ensureRequiredPluginSchemas(
      {
        adapter: { runPluginMigrations },
        db: { execute },
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
        },
      },
      [
        {
          name: "@elizaos/plugin-todo",
          plugin: { schema: { todosTable: {} } },
        },
      ],
    );

    expect(runPluginMigrations).toHaveBeenCalledWith(
      [
        {
          name: "@elizaos/plugin-todo",
          schema: { todosTable: {} },
        },
      ],
      expect.objectContaining({
        dryRun: false,
      }),
    );
  });
});
