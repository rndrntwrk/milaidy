import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) return "";
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) return value.join("");
      return String(value ?? "");
    })
    .join("");
}

function createRuntimeForLifeOpsApiTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-api-agent",
    character: { name: "LifeOpsApiAgent" } as AgentRuntime["character"],
    getSetting: () => undefined,
    getService: () => null,
    getRoomsByWorld: async () => [],
    getTasks: async (query?: { tags?: string[] }) => {
      if (!query?.tags || query.tags.length === 0) return tasks;
      return tasks.filter((task) =>
        query.tags?.every((tag) => task.tags?.includes(tag)),
      );
    },
    getTask: async (taskId: UUID) =>
      tasks.find((task) => task.id === taskId) ?? null,
    createTask: async (task: Task) => {
      const id = (task.id as UUID | undefined) ?? (crypto.randomUUID() as UUID);
      tasks.push({ ...task, id });
      return id;
    },
    updateTask: async (taskId: UUID, update: Partial<Task>) => {
      tasks = tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...update,
              metadata: {
                ...((task.metadata as Record<string, unknown> | undefined) ??
                  {}),
                ...((update.metadata as Record<string, unknown> | undefined) ??
                  {}),
              } as Task["metadata"],
            }
          : task,
      );
    },
    deleteTask: async (taskId: UUID) => {
      tasks = tasks.filter((task) => task.id !== taskId);
    },
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          if (sql.length === 0) return [];
          if (/^(select|pragma)\b/i.test(sql)) {
            return sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
          }
          sqlite.exec(sql);
          return [];
        },
      },
    },
  };

  return runtimeSubset as unknown as AgentRuntime;
}

describe("Life-ops API E2E", () => {
  describe("without runtime", () => {
    let port: number;
    let close: () => Promise<void>;

    beforeAll(async () => {
      const server = await startApiServer({ port: 0 });
      port = server.port;
      close = server.close;
    });

    afterAll(async () => {
      await close();
    });

    it("returns 503 for overview and definition writes", async () => {
      const overview = await req(port, "GET", "/api/lifeops/overview");
      expect(overview.status).toBe(503);

      const create = await req(port, "POST", "/api/lifeops/definitions", {
        kind: "habit",
        title: "Test",
        cadence: { kind: "daily", windows: ["morning"] },
      });
      expect(create.status).toBe(503);
    });
  });

  describe("with runtime", () => {
    let port: number;
    let close: () => Promise<void>;

    beforeAll(async () => {
      const server = await startApiServer({
        port: 0,
        runtime: createRuntimeForLifeOpsApiTests(),
      });
      port = server.port;
      close = server.close;
    });

    afterAll(async () => {
      await close();
    });

    it("supports creating, reading, snoozing, and completing life-ops items", async () => {
      const now = new Date();
      const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();

      const goalCreate = await req(port, "POST", "/api/lifeops/goals", {
        title: "Stay on top of personal ops",
        description: "Keep recurring responsibilities visible.",
      });
      expect(goalCreate.status).toBe(201);
      const goal = goalCreate.data.goal as Record<string, unknown>;
      const goalId = goal.id as string;

      const definitionCreate = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "routine",
          title: "Current slot check-in",
          timezone: "UTC",
          goalId,
          cadence: {
            kind: "times_per_day",
            slots: [
              {
                key: "current",
                label: "Current",
                minuteOfDay,
                durationMinutes: 20,
              },
              {
                key: "later",
                label: "Later",
                minuteOfDay: (minuteOfDay + 120) % 1440,
                durationMinutes: 20,
              },
            ],
          },
        },
      );
      expect(definitionCreate.status).toBe(201);
      const definition = definitionCreate.data.definition as Record<
        string,
        unknown
      >;
      const definitionId = definition.id as string;
      expect(
        (definitionCreate.data.reminderPlan as Record<string, unknown>).id,
      ).toBeTruthy();

      const listDefinitions = await req(
        port,
        "GET",
        "/api/lifeops/definitions",
      );
      expect(listDefinitions.status).toBe(200);
      expect(
        (
          listDefinitions.data.definitions as Array<Record<string, unknown>>
        ).some(
          (entry) =>
            (entry.definition as Record<string, unknown>).id === definitionId,
        ),
      ).toBe(true);

      const overview = await req(port, "GET", "/api/lifeops/overview");
      expect(overview.status).toBe(200);
      expect(Array.isArray(overview.data.occurrences)).toBe(true);
      expect(Array.isArray(overview.data.goals)).toBe(true);
      expect(Array.isArray(overview.data.reminders)).toBe(true);
      const currentOccurrence = (
        overview.data.occurrences as Array<Record<string, unknown>>
      ).find(
        (occurrence) =>
          occurrence.definitionId === definitionId &&
          occurrence.state === "visible",
      );
      expect(currentOccurrence).toBeDefined();

      const workbenchOverview = await req(
        port,
        "GET",
        "/api/workbench/overview",
      );
      expect(workbenchOverview.status).toBe(200);
      expect(workbenchOverview.data.lifeopsAvailable).toBe(true);
      expect(typeof workbenchOverview.data.lifeops).toBe("object");

      const snooze = await req(
        port,
        "POST",
        `/api/lifeops/occurrences/${encodeURIComponent(currentOccurrence!.id as string)}/snooze`,
        { minutes: 30 },
      );
      expect(snooze.status).toBe(200);
      expect((snooze.data.occurrence as Record<string, unknown>).state).toBe(
        "snoozed",
      );

      const complete = await req(
        port,
        "POST",
        `/api/lifeops/occurrences/${encodeURIComponent(currentOccurrence!.id as string)}/complete`,
        { note: "finished" },
      );
      expect(complete.status).toBe(200);
      expect((complete.data.occurrence as Record<string, unknown>).state).toBe(
        "completed",
      );

      const goalRead = await req(
        port,
        "GET",
        `/api/lifeops/goals/${encodeURIComponent(goalId)}`,
      );
      expect(goalRead.status).toBe(200);
      expect(Array.isArray(goalRead.data.links)).toBe(true);
      expect(
        (goalRead.data.links as Array<Record<string, unknown>>).length,
      ).toBe(1);
      expect(
        (goalRead.data.links as Array<Record<string, unknown>>)[0]?.linkedId,
      ).toBe(definitionId);
    });

    it("rejects invalid query parameters, calendar ranges, and malformed path ids", async () => {
      const invalidMode = await req(
        port,
        "GET",
        "/api/lifeops/connectors/google/status?mode=desktop",
      );
      expect(invalidMode.status).toBe(400);
      expect(String(invalidMode.data.error)).toContain(
        "mode must be one of: local, remote",
      );

      const invalidForceSync = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?forceSync=sometimes",
      );
      expect(invalidForceSync.status).toBe(400);
      expect(String(invalidForceSync.data.error)).toContain(
        "forceSync must be a boolean",
      );

      const partialCalendarWindow = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?timeMin=2026-04-04T00%3A00%3A00.000Z",
      );
      expect(partialCalendarWindow.status).toBe(400);
      expect(String(partialCalendarWindow.data.error)).toContain(
        "timeMin and timeMax must be provided together",
      );

      const invertedCalendarWindow = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?timeMin=2026-04-04T10%3A00%3A00.000Z&timeMax=2026-04-04T09%3A00%3A00.000Z",
      );
      expect(invertedCalendarWindow.status).toBe(400);
      expect(String(invertedCalendarWindow.data.error)).toContain(
        "timeMax must be later than timeMin",
      );

      const invalidMaxResults = await req(
        port,
        "GET",
        "/api/lifeops/gmail/triage?maxResults=0",
      );
      expect(invalidMaxResults.status).toBe(400);
      expect(String(invalidMaxResults.data.error)).toContain(
        "maxResults must be between 1 and 50",
      );

      const invalidInspectionOwner = await req(
        port,
        "GET",
        "/api/lifeops/reminders/inspection?ownerType=definition&ownerId=test-owner",
      );
      expect(invalidInspectionOwner.status).toBe(400);
      expect(String(invalidInspectionOwner.data.error)).toContain(
        "ownerType must be occurrence or calendar_event",
      );

      const missingInspectionOwnerId = await req(
        port,
        "GET",
        "/api/lifeops/reminders/inspection?ownerType=occurrence",
      );
      expect(missingInspectionOwnerId.status).toBe(400);
      expect(String(missingInspectionOwnerId.data.error)).toContain(
        "ownerId is required",
      );

      const malformedDefinitionId = await req(
        port,
        "GET",
        "/api/lifeops/definitions/%E0%A4%A",
      );
      expect(malformedDefinitionId.status).toBe(400);
      expect(String(malformedDefinitionId.data.error)).toContain(
        "Invalid definition id: malformed URL encoding",
      );
    });
  });
});
