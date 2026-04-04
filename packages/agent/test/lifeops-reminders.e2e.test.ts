import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { startApiServer } from "../src/api/server";
import { LifeOpsRepository } from "../src/lifeops/repository";
import { req } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";

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

function createRuntimeForReminderTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-reminders-agent",
    character: { name: "LifeOpsRemindersAgent" } as AgentRuntime["character"],
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

describe("life-ops reminder processing", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let envBackup: { restore: () => void };
  let runtime: AgentRuntime;
  const fetchMock = vi.fn<typeof fetch>();

  beforeAll(async () => {
    envBackup = saveEnv(
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
    );
    runtime = createRuntimeForReminderTests();

    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (closeServer) {
      await closeServer();
    }
    envBackup.restore();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.TWILIO_ACCOUNT_SID = "AC123456789";
    process.env.TWILIO_AUTH_TOKEN = "twilio-auth-token";
    process.env.TWILIO_PHONE_NUMBER = "+14155550199";
  });

  it("serializes concurrent reminder processing so the same SMS step is delivered once", async () => {
    const consentRes = await req(
      port,
      "POST",
      "/api/lifeops/channels/phone-consent",
      {
        phoneNumber: "415-555-0101",
        consentGiven: true,
        allowSms: true,
        allowVoice: false,
      },
    );
    expect(consentRes.status).toBe(201);

    const definitionRes = await req(port, "POST", "/api/lifeops/definitions", {
      kind: "task",
      title: "Reply to the venue",
      timezone: "UTC",
      priority: 1,
      cadence: {
        kind: "once",
        dueAt: "2026-04-04T16:00:00.000Z",
        visibilityLeadMinutes: 0,
        visibilityLagMinutes: 180,
      },
      reminderPlan: {
        steps: [
          {
            channel: "sms",
            offsetMinutes: 0,
            label: "SMS now",
          },
        ],
      },
    });
    expect(definitionRes.status).toBe(201);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(
        "https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json",
      );
      const body = new URLSearchParams(String(init?.body ?? ""));
      expect(body.get("To")).toBe("+14155550101");
      expect(body.get("From")).toBe("+14155550199");
      expect(body.get("Body")).toContain("Reply to the venue");
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(JSON.stringify({ sid: "SM123" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const [firstProcess, secondProcess] = await Promise.all([
      req(port, "POST", "/api/lifeops/reminders/process", {
        now: "2026-04-04T16:05:00.000Z",
        limit: 10,
      }),
      req(port, "POST", "/api/lifeops/reminders/process", {
        now: "2026-04-04T16:05:00.000Z",
        limit: 10,
      }),
    ]);

    expect(firstProcess.status).toBe(200);
    expect(secondProcess.status).toBe(200);
    const attemptCounts = [
      (firstProcess.data.attempts as Array<unknown>).length,
      (secondProcess.data.attempts as Array<unknown>).length,
    ].sort((left, right) => left - right);
    expect(attemptCounts).toEqual([0, 1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const repository = new LifeOpsRepository(runtime);
    const attempts = await repository.listReminderAttempts(
      "lifeops-reminders-agent",
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      channel: "sms",
      outcome: "delivered",
      connectorRef: "twilio:+14155550101",
      scheduledFor: "2026-04-04T16:00:00.000Z",
    });
    expect(attempts[0]?.deliveryMetadata).toMatchObject({
      sid: "SM123",
      status: 201,
      urgency: "critical",
      title: "Reply to the venue",
    });
  });
});
