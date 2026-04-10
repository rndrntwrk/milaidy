import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AgentRuntime, Content, State, Task, UUID } from "@elizaos/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createConversation,
  postConversationMessage,
} from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";
import { calendarAction } from "../src/actions/calendar";
import { startApiServer } from "../src/api/server";
import { resolveOAuthDir } from "../src/config/paths";
import {
  addDaysToLocalDate,
  buildUtcDateFromLocalParts,
  getZonedDateParts,
} from "../src/lifeops/time";
import {
  createLifeOpsCalendarSyncState,
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "../src/lifeops/repository";
import { DatabaseSync } from "../src/test-utils/sqlite-compat";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

const AGENT_ID = "lifeops-calendar-chat-agent";
const TEST_TIME_ZONE = "America/Los_Angeles";

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

function createRuntimeForCalendarChatTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const memoriesByRoom = new Map<string, Array<Record<string, unknown>>>();
  const roomsById = new Map<string, { id: UUID; worldId: UUID }>();
  const worldsById = new Map<
    string,
    { id: UUID; metadata?: Record<string, unknown> | null }
  >();

  const runtimeSubset = {
    agentId: AGENT_ID,
    character: {
      name: "Chen",
      postExamples: ["Sure."],
    } as AgentRuntime["character"],
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    } as AgentRuntime["logger"],
    useModel: async (_modelType: unknown, params?: { prompt?: string }) => {
      const prompt = String(params?.prompt ?? "");
      if (prompt.includes("Extract calendar event creation fields")) {
        return "<response><title>Dentist appointment</title><windowPreset>tomorrow_afternoon</windowPreset><durationMinutes>60</durationMinutes></response>";
      }
      if (prompt.includes("Extract up to 3 short calendar search queries")) {
        const promptLower = prompt.toLowerCase();
        if (promptLower.includes("april")) {
          return "<response><query1>april 12</query1><query2></query2><query3></query3></response>";
        }
        return "<response><query1></query1><query2></query2><query3></query3></response>";
      }
      return "<response></response>";
    },
    getSetting: () => undefined,
    getService: () => null,
    getRoomsByWorld: async () => [],
    getRoom: async (roomId: UUID) => roomsById.get(String(roomId)) ?? null,
    getWorld: async (worldId: UUID) => worldsById.get(String(worldId)) ?? null,
    updateWorld: async (world: {
      id: UUID;
      metadata?: Record<string, unknown>;
    }) => {
      worldsById.set(String(world.id), world);
    },
    ensureConnection: async (args: {
      roomId: UUID;
      worldId: UUID;
      metadata?: Record<string, unknown>;
    }) => {
      roomsById.set(String(args.roomId), {
        id: args.roomId,
        worldId: args.worldId,
      });
      if (!worldsById.has(String(args.worldId))) {
        worldsById.set(String(args.worldId), {
          id: args.worldId,
          metadata: args.metadata ?? {},
        });
      }
    },
    createMemory: async (memory: Record<string, unknown>) => {
      const roomId = String(memory.roomId ?? "");
      if (!roomId) return;
      const current = memoriesByRoom.get(roomId) ?? [];
      current.push({
        ...memory,
        createdAt:
          typeof memory.createdAt === "number" ? memory.createdAt : Date.now(),
      });
      memoriesByRoom.set(roomId, current);
    },
    getMemories: async (query: { roomId?: string; count?: number }) => {
      const roomId = String(query.roomId ?? "");
      const current = memoriesByRoom.get(roomId) ?? [];
      const count = Math.max(1, query.count ?? current.length);
      return current.slice(-count) as Awaited<
        ReturnType<AgentRuntime["getMemories"]>
      >;
    },
    getMemoriesByRoomIds: async (query: {
      roomIds?: string[];
      limit?: number;
    }) => {
      const roomIds = Array.isArray(query.roomIds) ? query.roomIds : [];
      const merged: Array<Record<string, unknown>> = [];
      for (const roomId of roomIds) {
        merged.push(...(memoriesByRoom.get(String(roomId)) ?? []));
      }
      merged.sort(
        (left, right) =>
          Number(left.createdAt ?? 0) - Number(right.createdAt ?? 0),
      );
      return merged.slice(-(query.limit ?? merged.length)) as Awaited<
        ReturnType<AgentRuntime["getMemoriesByRoomIds"]>
      >;
    },
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

  const runtime = runtimeSubset as unknown as AgentRuntime;
  runtime.messageService = {
    handleMessage: async (
      runtimeArg: AgentRuntime,
      message: Record<string, unknown>,
      onResponse: (content: Content) => Promise<object[]>,
    ) => {
      const roomId = message.roomId as UUID;
      const memories = await runtimeArg.getMemories({
        roomId: String(roomId),
        count: 12,
      });
      const recentMessages = memories
        .flatMap((memory) => {
          if (!memory || typeof memory !== "object") {
            return [];
          }
          const content =
            "content" in memory &&
            memory.content &&
            typeof memory.content === "object"
              ? (memory.content as Record<string, unknown>)
              : null;
          const text =
            typeof content?.text === "string" ? content.text.trim() : "";
          if (!text) {
            return [];
          }
          const role = memory.entityId === runtimeArg.agentId ? "assistant" : "user";
          return [`${role}: ${text}`];
        })
        .join("\n");

      const enrichedMessage = {
        ...message,
        content: {
          ...(((message.content as Record<string, unknown> | undefined) ?? {}) as Record<
            string,
            unknown
          >),
          source:
            typeof (message.content as Record<string, unknown> | undefined)
              ?.source === "string"
              ? (message.content as Record<string, unknown>).source
              : "discord",
        },
      };
      const state: State = {
        values: {
          recentMessages,
        },
        data: {},
        text: recentMessages,
      } as State;
      const result = await calendarAction.handler?.(
        runtimeArg,
        enrichedMessage as never,
        state,
        {
          parameters: {
            details: {
              timeZone: TEST_TIME_ZONE,
            },
          },
        } as never,
      );
      const responseText =
        typeof result?.text === "string" && result.text.trim().length > 0
          ? result.text
          : "I couldn't find anything in your calendar.";

      await onResponse({ text: responseText } as Content);
      return {
        didRespond: true,
        responseContent: { text: responseText },
        responseMessages: [
          {
            id: crypto.randomUUID() as UUID,
            entityId: runtimeArg.agentId,
            roomId,
            createdAt: Date.now(),
            content: { text: responseText },
          },
        ],
      };
    },
  } as AgentRuntime["messageService"];

  return runtime;
}

function localDayAtOffset(daysFromToday: number): {
  year: number;
  month: number;
  day: number;
} {
  const now = getZonedDateParts(new Date(), TEST_TIME_ZONE);
  return addDaysToLocalDate(
    {
      year: now.year,
      month: now.month,
      day: now.day,
    },
    daysFromToday,
  );
}

function localIso(
  daysFromToday: number,
  hour: number,
  minute = 0,
): string {
  const date = localDayAtOffset(daysFromToday);
  return buildUtcDateFromLocalParts(TEST_TIME_ZONE, {
    year: date.year,
    month: date.month,
    day: date.day,
    hour,
    minute,
    second: 0,
    millisecond: 0,
  }).toISOString();
}

function localMonthDayLabel(daysFromToday: number): string {
  const date = localDayAtOffset(daysFromToday);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(
    new Date(
      Date.UTC(date.year, Math.max(0, date.month - 1), date.day, 12, 0, 0),
    ),
  );
}

function allDayStart(daysFromToday: number): string {
  return localIso(daysFromToday, 0, 0);
}

function allDayEnd(daysFromToday: number): string {
  return localIso(daysFromToday + 1, 0, 0);
}

async function seedGoogleCalendar(runtime: AgentRuntime, stateDir: string) {
  const repository = new LifeOpsRepository(runtime);
  const tokenRef = `${AGENT_ID}/owner/local.json`;
  const tokenPath = path.join(
    resolveOAuthDir(process.env, stateDir),
    "lifeops",
    "google",
    tokenRef,
  );
  const tokenDir = path.dirname(tokenPath);
  await fs.promises.mkdir(tokenDir, { recursive: true, mode: 0o700 });
  const nowIso = new Date().toISOString();
  await fs.promises.writeFile(
    tokenPath,
    JSON.stringify(
      {
        provider: "google",
        agentId: AGENT_ID,
        side: "owner",
        mode: "local",
        clientId: "lifeops-calendar-chat-client",
        redirectUri: "http://127.0.0.1/callback",
        accessToken: "calendar-chat-access-token",
        refreshToken: "calendar-chat-refresh-token",
        tokenType: "Bearer",
        grantedScopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/calendar.readonly",
        ],
        expiresAt: Date.now() + 60 * 60 * 1000,
        refreshTokenExpiresAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      null,
      2,
    ),
    { encoding: "utf-8", mode: 0o600 },
  );

  await repository.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId: AGENT_ID,
      provider: "google",
      side: "owner",
      identity: {
        email: "shaw@example.com",
        name: "Shaw",
      },
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
      capabilities: ["google.basic_identity", "google.calendar.read"],
      tokenRef,
      mode: "local",
      metadata: {},
      lastRefreshAt: nowIso,
    }),
  );

  const events = [
    {
      id: "evt-dentist",
      externalId: "dentist-ext",
      agentId: AGENT_ID,
      provider: "google" as const,
      side: "owner" as const,
      calendarId: "primary",
      title: "Dentist appointment",
      description: "",
      location: "Main St Dental",
      status: "confirmed",
      startAt: localIso(0, 11, 0),
      endAt: localIso(0, 12, 0),
      isAllDay: false,
      timezone: TEST_TIME_ZONE,
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "evt-hotel",
      externalId: "hotel-ext",
      agentId: AGENT_ID,
      provider: "google" as const,
      side: "owner" as const,
      calendarId: "primary",
      title: "Stay at Fairfield by Marriott Inn & Suites Boulder",
      description: "",
      location: "Fairfield by Marriott Inn & Suites Boulder, Boulder",
      status: "confirmed",
      startAt: allDayStart(1),
      endAt: allDayEnd(1),
      isAllDay: true,
      timezone: TEST_TIME_ZONE,
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [
        {
          email: "shawmakesmagic@gmail.com",
          displayName: "shawmakesmagic@gmail.com",
          responseStatus: "accepted",
        },
      ],
      metadata: {},
      syncedAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "evt-outbound-flight",
      externalId: "flight-denver-ext",
      agentId: AGENT_ID,
      provider: "google" as const,
      side: "owner" as const,
      calendarId: "primary",
      title: "Flight to Denver (WN 3677)",
      description: "",
      location: "San Francisco SFO",
      status: "confirmed",
      startAt: localIso(1, 14, 25),
      endAt: localIso(1, 17, 5),
      isAllDay: false,
      timezone: TEST_TIME_ZONE,
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [
        {
          email: "shawmakesmagic@gmail.com",
          displayName: "shawmakesmagic@gmail.com",
          responseStatus: "accepted",
        },
      ],
      metadata: {},
      syncedAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "evt-meeting",
      externalId: "meeting-ext",
      agentId: AGENT_ID,
      provider: "google" as const,
      side: "owner" as const,
      calendarId: "primary",
      title: "Meeting",
      description: "",
      location: "Maikoh Holistics",
      status: "confirmed",
      startAt: localIso(1, 15, 0),
      endAt: localIso(1, 15, 30),
      isAllDay: false,
      timezone: TEST_TIME_ZONE,
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [
        {
          email: "shawmakesmagic@gmail.com",
          displayName: "shawmakesmagic@gmail.com",
          responseStatus: "accepted",
        },
      ],
      metadata: {},
      syncedAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "evt-return-flight",
      externalId: "flight-sfo-ext",
      agentId: AGENT_ID,
      provider: "google" as const,
      side: "owner" as const,
      calendarId: "primary",
      title: "Flight to San Francisco (WN 2287)",
      description: "return to SFO",
      location: "Denver DEN",
      status: "confirmed",
      startAt: localIso(9, 13, 10),
      endAt: localIso(9, 15, 55),
      isAllDay: false,
      timezone: TEST_TIME_ZONE,
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [
        {
          email: "shawmakesmagic@gmail.com",
          displayName: "shawmakesmagic@gmail.com",
          responseStatus: "accepted",
        },
      ],
      metadata: {},
      syncedAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  for (const event of events) {
    await repository.upsertCalendarEvent(event);
  }
  await repository.upsertCalendarSyncState(
    createLifeOpsCalendarSyncState({
      agentId: AGENT_ID,
      provider: "google",
      side: "owner",
      calendarId: "primary",
      windowStartAt: allDayStart(0),
      windowEndAt: allDayEnd(90),
      syncedAt: nowIso,
    }),
  );
}

describe("life-ops calendar chat transcripts", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let stateDir = "";
  let runtime: AgentRuntime;
  let envBackup: { restore: () => void };

  beforeAll(async () => {
    envBackup = saveEnv(
      "ELIZA_STATE_DIR",
      "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
    );
    stateDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "lifeops-calendar-chat-"),
    );
    process.env.ELIZA_STATE_DIR = stateDir;
    process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID =
      "lifeops-calendar-chat-client";
    runtime = createRuntimeForCalendarChatTests();
    await seedGoogleCalendar(runtime, stateDir);

    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;
  }, 60_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
    await fs.promises.rm(stateDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    envBackup.restore();
  });

  beforeEach(() => {
    process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID =
      "lifeops-calendar-chat-client";
  });

  it("answers the Discord tomorrow schedule transcript without leaking today's dentist appointment", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps calendar Discord tomorrow transcript",
    });

    const response = await postConversationMessage(port, conversationId, {
      text: "can you tell me whats on my schedule tomorrow",
      source: "discord",
    });

    expect(response.status).toBe(200);
    expect(String(response.data.text ?? "")).toContain(
      "Stay at Fairfield by Marriott Inn & Suites Boulder",
    );
    expect(String(response.data.text ?? "")).toContain(
      "Flight to Denver (WN 3677)",
    );
    expect(String(response.data.text ?? "")).toContain("Meeting");
    expect(String(response.data.text ?? "")).not.toContain(
      "Dentist appointment",
    );
  });

  it("handles the Discord flight transcript across confirmation and vague follow-up turns", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps calendar Discord flight transcript",
    });

    const flightsThisWeek = await postConversationMessage(port, conversationId, {
      text: "do i have any flights this week?",
      source: "discord",
    });
    expect(flightsThisWeek.status).toBe(200);
    expect(String(flightsThisWeek.data.text ?? "")).toContain(
      "Flight to Denver (WN 3677)",
    );
    expect(String(flightsThisWeek.data.text ?? "")).not.toContain(
      "Fairfield",
    );

    const confirmation = await postConversationMessage(port, conversationId, {
      text: "yes",
      source: "discord",
    });
    expect(confirmation.status).toBe(200);
    expect(String(confirmation.data.text ?? "")).toContain(
      "Flight to Denver (WN 3677)",
    );
    expect(String(confirmation.data.text ?? "")).not.toContain("Fairfield");

    const returnFlight = await postConversationMessage(port, conversationId, {
      text: "when do i fly back from denver?",
      source: "discord",
    });
    expect(returnFlight.status).toBe(200);
    expect(String(returnFlight.data.text ?? "")).toContain(
      "Flight to San Francisco (WN 2287)",
    );
    expect(String(returnFlight.data.text ?? "")).not.toContain(
      "Flight to Denver (WN 3677)",
    );

    const vagueFollowUp = await postConversationMessage(port, conversationId, {
      text: "yeah, probably next week?",
      source: "discord",
    });
    expect(vagueFollowUp.status).toBe(200);
    expect(String(vagueFollowUp.data.text ?? "")).toContain(
      "Flight to San Francisco (WN 2287)",
    );
    expect(String(vagueFollowUp.data.text ?? "")).not.toContain("Fairfield");

    const wideSearch = await postConversationMessage(port, conversationId, {
      text: "try to find it yourself idk, next week or the week after",
      source: "discord",
    });
    expect(wideSearch.status).toBe(200);
    expect(String(wideSearch.data.text ?? "")).toContain(
      "Flight to San Francisco (WN 2287)",
    );
    expect(String(wideSearch.data.text ?? "")).not.toContain("Launching");
    expect(String(wideSearch.data.text ?? "")).not.toContain("Spawned");
    expect(String(wideSearch.data.text ?? "")).not.toContain("scratch/");
  });

  it("answers exact month-day schedule questions through the chat transcript", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps calendar exact-date transcript",
    });

    const dateLabel = localMonthDayLabel(1);
    const response = await postConversationMessage(port, conversationId, {
      text: `what event do i have on ${dateLabel}`,
      source: "discord",
    });

    expect(response.status).toBe(200);
    const text = String(response.data.text ?? "");
    expect(text).toContain("Flight to Denver (WN 3677)");
    expect(text).toContain("Meeting");
    expect(text).toContain("Stay at Fairfield by Marriott Inn & Suites Boulder");
    expect(text).not.toContain("Dentist appointment");
  });

  it("handles next-event and trip-window transcript questions end to end", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps calendar next-event and trip-window transcript",
    });

    const nextEvent = await postConversationMessage(port, conversationId, {
      text: "what's my next meeting",
      source: "discord",
    });
    expect(nextEvent.status).toBe(200);
    expect(String(nextEvent.data.text ?? "")).toContain("Next event");

    const tripWindow = await postConversationMessage(port, conversationId, {
      text: "what's on my calendar while i'm in boulder",
      source: "discord",
    });
    expect(tripWindow.status).toBe(200);
    expect(String(tripWindow.data.text ?? "")).toContain(
      "while you're in boulder",
    );
    expect(String(tripWindow.data.text ?? "")).toContain(
      "Stay at Fairfield by Marriott Inn & Suites Boulder",
    );
  });
});
