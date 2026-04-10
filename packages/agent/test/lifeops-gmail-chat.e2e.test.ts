import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime, Content, State, Task, UUID } from "@elizaos/core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createConversation,
  postConversationMessage,
} from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";
import { gmailAction } from "../src/actions/gmail";
import { startApiServer } from "../src/api/server";
import { resolveOAuthDir } from "../src/config/paths";
import {
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "../src/lifeops/repository";
import { DatabaseSync } from "../src/test-utils/sqlite-compat";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

const AGENT_ID = "lifeops-gmail-chat-agent";
const GOOGLE_GMAIL_MESSAGES_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";

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

function createRuntimeForGmailChatTests(): AgentRuntime {
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
    useModel: async () => "<response></response>",
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
          const role =
            memory.entityId === runtimeArg.agentId ? "assistant" : "user";
          return [`${role}: ${text}`];
        })
        .join("\n");

      const enrichedMessage = {
        ...message,
        content: {
          ...(((message.content as Record<string, unknown> | undefined) ??
            {}) as Record<string, unknown>),
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
      const result = await gmailAction.handler?.(
        runtimeArg,
        enrichedMessage as never,
        state,
        {
          parameters: {},
        } as never,
      );
      const responseText =
        typeof result?.text === "string" && result.text.trim().length > 0
          ? result.text
          : "I couldn't find anything in your email.";

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

function buildMetadataMessage(args: {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  internalDate: string;
  labelIds?: string[];
  bodyText?: string;
}): Record<string, unknown> {
  return {
    id: args.id,
    threadId: args.threadId,
    labelIds: args.labelIds ?? ["INBOX"],
    snippet: args.snippet,
    internalDate: args.internalDate,
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "Subject", value: args.subject },
        { name: "From", value: args.from },
        { name: "To", value: args.to },
        {
          name: "Date",
          value: new Date(Number(args.internalDate)).toUTCString(),
        },
      ],
      parts: args.bodyText
        ? [
            {
              mimeType: "text/plain",
              body: {
                data: Buffer.from(args.bodyText, "utf-8").toString("base64url"),
              },
            },
          ]
        : undefined,
    },
  };
}

async function seedLocalGmail(runtime: AgentRuntime, stateDir: string) {
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
        clientId: "lifeops-gmail-chat-client",
        redirectUri: "http://127.0.0.1/callback",
        accessToken: "gmail-chat-access-token",
        refreshToken: "gmail-chat-refresh-token",
        tokenType: "Bearer",
        grantedScopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.readonly",
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
        email: "shawmakesmagic@gmail.com",
        name: "Shaw",
      },
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      capabilities: ["google.basic_identity", "google.gmail.triage"],
      tokenRef,
      mode: "local",
      metadata: {},
      lastRefreshAt: nowIso,
    }),
  );
}

describe("life-ops gmail chat transcripts", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let stateDir = "";
  let runtime: AgentRuntime;
  let envBackup: { restore: () => void };
  const fetchMock = vi.fn<typeof fetch>();

  const messageFixtures = new Map<string, Record<string, unknown>>([
    [
      "msg-suran-recent",
      buildMetadataMessage({
        id: "msg-suran-recent",
        threadId: "thread-suran-recent",
        subject: "Suran follow-up",
        from: "Suran Lee <suran@example.com>",
        to: "Shaw <shawmakesmagic@gmail.com>",
        snippet: "Wanted to follow up on the last few weeks.",
        internalDate: String(Date.parse("2026-04-08T16:00:00.000Z")),
        labelIds: ["INBOX", "UNREAD"],
        bodyText:
          "Hey Shaw,\n\nWanted to follow up on the last few weeks and see if you had time to review the notes.\n\nBest,\nSuran",
      }),
    ],
    [
      "msg-suran-old",
      buildMetadataMessage({
        id: "msg-suran-old",
        threadId: "thread-suran-old",
        subject: "Older Suran note",
        from: "Suran Lee <suran@example.com>",
        to: "Shaw <shawmakesmagic@gmail.com>",
        snippet: "This is the older message outside the window.",
        internalDate: String(Date.parse("2026-03-01T16:00:00.000Z")),
        labelIds: ["INBOX"],
      }),
    ],
    [
      "msg-alex-unread",
      buildMetadataMessage({
        id: "msg-alex-unread",
        threadId: "thread-alex-unread",
        subject: "Alex venue update",
        from: "Alex <alex@example.com>",
        to: "Shaw <shawmakesmagic@gmail.com>",
        snippet: "Please confirm the venue.",
        internalDate: String(Date.parse("2026-04-09T12:00:00.000Z")),
        labelIds: ["INBOX", "UNREAD"],
      }),
    ],
    [
      "msg-venue-reply",
      buildMetadataMessage({
        id: "msg-venue-reply",
        threadId: "thread-venue-reply",
        subject: "Venue confirmation",
        from: "Morgan <morgan@example.com>",
        to: "Shaw <shawmakesmagic@gmail.com>",
        snippet: "Can you confirm the venue for tomorrow?",
        internalDate: String(Date.parse("2026-04-09T15:00:00.000Z")),
        labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
      }),
    ],
  ]);

  beforeAll(async () => {
    envBackup = saveEnv(
      "ELIZA_STATE_DIR",
      "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
    );
    stateDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "lifeops-gmail-chat-"),
    );
    process.env.ELIZA_STATE_DIR = stateDir;
    process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID =
      "lifeops-gmail-chat-client";
    runtime = createRuntimeForGmailChatTests();
    await seedLocalGmail(runtime, stateDir);

    fetchMock.mockImplementation(async (input) => {
      const url =
        typeof input === "string" ? new URL(input) : new URL(input.url);
      if (url.origin + url.pathname === GOOGLE_GMAIL_MESSAGES_ENDPOINT) {
        const query = String(url.searchParams.get("q") ?? "").toLowerCase();
        let ids: string[] = [];
        if (query.includes("from:suran") || query.includes('from:"suran"')) {
          ids = query.includes("newer_than:21d")
            ? ["msg-suran-recent"]
            : ["msg-suran-recent", "msg-suran-old"];
        } else if (query.includes("alex@example.com")) {
          ids = ["msg-alex-unread"];
        } else if (query.includes("venue")) {
          ids = ["msg-venue-reply"];
        }
        return new Response(
          JSON.stringify({
            messages: ids.map((id) => ({
              id,
              threadId: String(
                messageFixtures.get(id)?.threadId ?? `thread-${id}`,
              ),
            })),
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (url.href.startsWith(`${GOOGLE_GMAIL_MESSAGES_ENDPOINT}/`)) {
        const messageId = decodeURIComponent(
          url.pathname.split("/").pop() ?? "",
        );
        const fixture = messageFixtures.get(messageId);
        if (!fixture) {
          return new Response(
            JSON.stringify({ error: { message: "Message not found" } }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: { message: "Unhandled fetch" } }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
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
      "lifeops-gmail-chat-client";
    fetchMock.mockClear();
  });

  it("handles sender and timeframe Gmail searches through the Discord chat transcript", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps Gmail sender/timeframe transcript",
    });

    const direct = await postConversationMessage(port, conversationId, {
      text: "look for all emails sent to me from suran in the last few weeks",
      source: "discord",
    });
    expect(direct.status).toBe(200);
    expect(String(direct.data.text ?? "")).toContain("Suran follow-up");
    expect(String(direct.data.text ?? "")).toContain("last 21 days");
    expect(String(direct.data.text ?? "")).not.toContain("Older Suran note");
  });

  it("handles unread and reply-needed Gmail transcript questions end to end", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps Gmail unread and reply-needed transcript",
    });

    const unread = await postConversationMessage(port, conversationId, {
      text: "show unread emails from alex@example.com",
      source: "discord",
    });
    expect(unread.status).toBe(200);
    expect(String(unread.data.text ?? "")).toContain("Alex venue update");
    expect(String(unread.data.text ?? "")).toContain("unread");

    const replyNeeded = await postConversationMessage(port, conversationId, {
      text: "which emails need a reply about venue",
      source: "discord",
    });
    expect(replyNeeded.status).toBe(200);
    expect(String(replyNeeded.data.text ?? "")).toContain("Venue confirmation");
    expect(String(replyNeeded.data.text ?? "")).toContain("reply needed");
  });

  it("reads the body of a previously found Gmail message in follow-up chat", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps Gmail read follow-up transcript",
    });

    const search = await postConversationMessage(port, conversationId, {
      text: "find an email from suran",
      source: "discord",
    });
    expect(search.status).toBe(200);
    expect(String(search.data.text ?? "")).toContain("Suran follow-up");

    const read = await postConversationMessage(port, conversationId, {
      text: "yeah, can you read it to me?",
      source: "discord",
    });
    expect(read.status).toBe(200);
    expect(String(read.data.text ?? "")).toContain("Suran follow-up");
    expect(String(read.data.text ?? "")).toContain(
      "Wanted to follow up on the last few weeks",
    );
    expect(String(read.data.text ?? "")).toContain("Best,");
  });
});
