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
      expect(goal.domain).toBe("user_lifeops");
      expect(goal.subjectType).toBe("owner");

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
      expect(definition.domain).toBe("user_lifeops");
      expect(definition.subjectType).toBe("owner");
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
      expect(Array.isArray(overview.data.owner?.occurrences)).toBe(true);
      expect(Array.isArray(overview.data.agentOps?.occurrences)).toBe(true);
      expect((overview.data.agentOps?.occurrences as unknown[]) ?? []).toHaveLength(
        0,
      );
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
      expect(Array.isArray(workbenchOverview.data.lifeops.owner?.occurrences)).toBe(
        true,
      );
      expect(Array.isArray(workbenchOverview.data.lifeops.agentOps?.occurrences)).toBe(
        true,
      );

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

      const definitionRead = await req(
        port,
        "GET",
        `/api/lifeops/definitions/${encodeURIComponent(definitionId)}`,
      );
      expect(definitionRead.status).toBe(200);
      const performance = definitionRead.data.performance as Record<
        string,
        unknown
      >;
      expect(performance.totalCompletedCount).toBe(1);
      expect(performance.currentOccurrenceStreak).toBe(1);
      expect(performance.bestOccurrenceStreak).toBeGreaterThanOrEqual(1);
      expect(performance.currentPerfectDayStreak).toBe(1);
      expect(performance.bestPerfectDayStreak).toBeGreaterThanOrEqual(1);
      expect(performance.lastCompletedAt).toEqual(expect.any(String));
      const last7Days = performance.last7Days as Record<string, unknown>;
      expect(last7Days.completedCount).toBeGreaterThanOrEqual(1);
      expect(last7Days.perfectDayCount).toBeGreaterThanOrEqual(1);
      expect(last7Days.scheduledCount).toBeGreaterThanOrEqual(
        Number(last7Days.completedCount),
      );
      expect(
        Number(last7Days.completedCount) +
          Number(last7Days.skippedCount) +
          Number(last7Days.pendingCount),
      ).toBe(Number(last7Days.scheduledCount));

      const occurrenceExplanation = await req(
        port,
        "GET",
        `/api/lifeops/occurrences/${encodeURIComponent(currentOccurrence!.id as string)}/explanation`,
      );
      expect(occurrenceExplanation.status).toBe(200);
      expect(
        (occurrenceExplanation.data.definition as Record<string, unknown>).id,
      ).toBe(definitionId);
      expect(
        (
          occurrenceExplanation.data.summary as Record<string, unknown>
        ).originalIntent,
      ).toBe("Current slot check-in");
      expect(
        String(
          (occurrenceExplanation.data.summary as Record<string, unknown>)
            .lastActionSummary,
        ),
      ).toContain("occurrence completed");
      const explanationPerformance = occurrenceExplanation.data
        .definitionPerformance as Record<string, unknown>;
      expect(explanationPerformance.totalCompletedCount).toBe(1);
      expect(
        (explanationPerformance.last7Days as Record<string, unknown>)
          .completedCount,
      ).toBeGreaterThanOrEqual(1);

      const goalReview = await req(
        port,
        "GET",
        `/api/lifeops/goals/${encodeURIComponent(goalId)}/review`,
      );
      expect(goalReview.status).toBe(200);
      expect(
        (goalReview.data.summary as Record<string, unknown>).linkedDefinitionCount,
      ).toBe(1);
      expect(
        (goalReview.data.summary as Record<string, unknown>).completedLast7Days,
      ).toBeGreaterThanOrEqual(1);
      expect(
        (goalReview.data.goal as Record<string, unknown>).reviewState,
      ).toBe("on_track");
      expect(
        Array.isArray(goalReview.data.suggestions as unknown[]),
      ).toBe(true);

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

    it("separates owner lifeops from agent ops", async () => {
      const now = new Date();
      const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();

      const agentGoalCreate = await req(port, "POST", "/api/lifeops/goals", {
        title: "Keep the bridge healthy",
        description: "Track agent-private operational goals.",
        ownership: {
          domain: "agent_ops",
          subjectType: "agent",
        },
      });
      expect(agentGoalCreate.status).toBe(201);
      const agentGoal = agentGoalCreate.data.goal as Record<string, unknown>;
      expect(agentGoal.domain).toBe("agent_ops");
      expect(agentGoal.subjectType).toBe("agent");
      expect(agentGoal.visibilityScope).toBe("agent_and_admin");
      expect(agentGoal.contextPolicy).toBe("never");

      const agentDefinitionCreate = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "routine",
          title: "Review bridge health",
          description: "Internal agent operations checklist.",
          timezone: "UTC",
          ownership: {
            domain: "agent_ops",
            subjectType: "agent",
          },
          cadence: {
            kind: "times_per_day",
            slots: [
              {
                key: "current",
                label: "Current",
                minuteOfDay,
                durationMinutes: 20,
              },
            ],
          },
        },
      );
      expect(agentDefinitionCreate.status).toBe(201);
      const agentDefinition = agentDefinitionCreate.data.definition as Record<
        string,
        unknown
      >;
      const agentDefinitionId = agentDefinition.id as string;
      expect(agentDefinition.domain).toBe("agent_ops");
      expect(agentDefinition.subjectType).toBe("agent");
      expect(agentDefinition.visibilityScope).toBe("agent_and_admin");
      expect(agentDefinition.contextPolicy).toBe("never");

      const overview = await req(port, "GET", "/api/lifeops/overview");
      expect(overview.status).toBe(200);
      const agentOccurrence = (
        overview.data.agentOps?.occurrences as Array<Record<string, unknown>>
      ).find((occurrence) => occurrence.definitionId === agentDefinitionId);
      expect(agentOccurrence).toBeDefined();
      expect(agentOccurrence?.subjectType).toBe("agent");
      expect(
        (overview.data.occurrences as Array<Record<string, unknown>>).some(
          (occurrence) => occurrence.id === agentOccurrence?.id,
        ),
      ).toBe(false);
      expect(
        (overview.data.goals as Array<Record<string, unknown>>).some(
          (goal) => goal.id === agentGoal.id,
        ),
      ).toBe(false);
      expect(
        (
          overview.data.agentOps?.occurrences as Array<Record<string, unknown>>
        ).some((occurrence) => occurrence.id === agentOccurrence?.id),
      ).toBe(true);
      expect(
        (overview.data.agentOps?.goals as Array<Record<string, unknown>>).some(
          (goal) => goal.id === agentGoal.id,
        ),
      ).toBe(true);

      const workbenchOverview = await req(
        port,
        "GET",
        "/api/workbench/overview",
      );
      expect(workbenchOverview.status).toBe(200);
      expect(
        (
          workbenchOverview.data.lifeops.agentOps.occurrences as Array<
            Record<string, unknown>
          >
        ).some((occurrence) => occurrence.id === agentOccurrence?.id),
      ).toBe(true);
      expect(
        (
          workbenchOverview.data.lifeops.agentOps.goals as Array<
            Record<string, unknown>
          >
        ).some((goal) => goal.id === agentGoal.id),
      ).toBe(true);
      expect(
        (workbenchOverview.data.todos as Array<Record<string, unknown>>).some(
          (todo) => todo.name === "Review bridge health",
        ),
      ).toBe(false);
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

      const invalidDefinitionTimezone = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "task",
          title: "Broken timezone task",
          timezone: "Mars/Olympus",
          cadence: {
            kind: "once",
            dueAt: "2026-04-05T10:00:00.000Z",
          },
        },
      );
      expect(invalidDefinitionTimezone.status).toBe(400);
      expect(String(invalidDefinitionTimezone.data.error)).toContain(
        "timezone must be a valid IANA time zone",
      );

      const invalidWindowPolicy = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "task",
          title: "Broken windows task",
          timezone: "UTC",
          cadence: {
            kind: "daily",
            windows: ["custom"],
          },
          windowPolicy: {
            timezone: "UTC",
            windows: [
              {
                name: "custom",
                label: "Broken",
                startMinute: 600,
                endMinute: 500,
              },
            ],
          },
        },
      );
      expect(invalidWindowPolicy.status).toBe(400);
      expect(String(invalidWindowPolicy.data.error)).toContain(
        "windowPolicy.windows[0].endMinute must be greater than startMinute",
      );

      const invalidQuietHours = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "task",
          title: "Broken quiet hours task",
          timezone: "UTC",
          cadence: {
            kind: "once",
            dueAt: "2026-04-05T10:00:00.000Z",
          },
          reminderPlan: {
            steps: [
              {
                channel: "sms",
                offsetMinutes: 0,
                label: "SMS",
              },
            ],
            quietHours: {
              timezone: "UTC",
              startMinute: 0,
              endMinute: 60,
              channels: ["pager"],
            },
          },
        },
      );
      expect(invalidQuietHours.status).toBe(400);
      expect(String(invalidQuietHours.data.error)).toContain(
        "reminderPlan.quietHours.channels[0] must be one of",
      );

      const invalidCalendarEventTimezone = await req(
        port,
        "POST",
        "/api/lifeops/calendar/events",
        {
          title: "Bad calendar event",
          startAt: "2026-04-05T10:00:00.000Z",
          endAt: "2026-04-05T11:00:00.000Z",
          timeZone: "Moon/Base",
        },
      );
      expect(invalidCalendarEventTimezone.status).toBe(400);
      expect(String(invalidCalendarEventTimezone.data.error)).toContain(
        "timeZone must be a valid IANA time zone",
      );

      const invalidWorkflowTimezone = await req(
        port,
        "POST",
        "/api/lifeops/workflows",
        {
          title: "Broken schedule workflow",
          triggerType: "schedule",
          schedule: {
            kind: "cron",
            cronExpression: "not-a-cron",
            timezone: "UTC",
          },
          actionPlan: {
            steps: [
              {
                kind: "summarize",
                id: "summary-step",
                prompt: "Summarize today",
              },
            ],
          },
        },
      );
      expect(invalidWorkflowTimezone.status).toBe(400);
      expect(String(invalidWorkflowTimezone.data.error)).toContain(
        "schedule.cronExpression must be a valid 5-field cron expression",
      );

      const invalidWorkflowScheduleTimezone = await req(
        port,
        "POST",
        "/api/lifeops/workflows",
        {
          title: "Broken timezone workflow",
          triggerType: "schedule",
          schedule: {
            kind: "interval",
            everyMinutes: 30,
            timezone: "Invalid/Timezone",
          },
          actionPlan: {
            steps: [
              {
                kind: "summarize",
                id: "summary-step",
                prompt: "Summarize today",
              },
            ],
          },
        },
      );
      expect(invalidWorkflowScheduleTimezone.status).toBe(400);
      expect(String(invalidWorkflowScheduleTimezone.data.error)).toContain(
        "schedule.timezone must be a valid IANA time zone",
      );
    });
  });
});
