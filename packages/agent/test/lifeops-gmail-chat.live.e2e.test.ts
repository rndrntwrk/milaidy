import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import type { AgentRuntime } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { createConversation, postConversationMessage } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";
import { isLiveTestEnabled, selectLiveProvider } from "../../../test/helpers/live-provider";
import { createLifeOpsChatTestRuntime } from "./helpers/lifeops-chat-runtime";
import { gmailAction } from "../src/actions/gmail";
import { startApiServer } from "../src/api/server";
import { resolveOAuthDir } from "../src/config/paths";
import {
  createLifeOpsConnectorGrant,
  createLifeOpsGmailSyncState,
  LifeOpsRepository,
} from "../src/lifeops/repository";

const AGENT_ID = "lifeops-gmail-live-chat-agent";
const LIVE_PROVIDER =
  selectLiveProvider("openai") ?? selectLiveProvider();
const LIVE_GMAIL_CHAT_ENABLED =
  isLiveTestEnabled() && Boolean(LIVE_PROVIDER);

async function callOpenAICompatible(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
}) {
  const response = await fetch(`${args.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: "user", content: args.prompt }],
      temperature: 0,
      max_tokens: 768,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `OpenAI-compatible provider error ${response.status}: ${await response.text()}`,
    );
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(args: {
  apiKey: string;
  model: string;
  prompt: string;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 768,
      messages: [{ role: "user", content: args.prompt }],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Anthropic provider error ${response.status}: ${await response.text()}`,
    );
  }
  const data = (await response.json()) as {
    content?: Array<{ text?: string }>;
  };
  return data.content?.[0]?.text ?? "";
}

async function callGoogle(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
}) {
  const response = await fetch(
    `${args.baseUrl}/models/${args.model}:generateContent?key=${args.apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: args.prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 768,
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Google provider error ${response.status}: ${await response.text()}`,
    );
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function liveUseModel(
  modelType: ModelType,
  params: { prompt?: unknown },
): Promise<string> {
  if (!LIVE_PROVIDER) {
    throw new Error("No live provider available");
  }
  const prompt = String(params?.prompt ?? "");
  const model =
    modelType === ModelType.TEXT_LARGE
      ? LIVE_PROVIDER.largeModel
      : LIVE_PROVIDER.smallModel;
  const execute = async () => {
    if (LIVE_PROVIDER.name === "anthropic") {
      return callAnthropic({
        apiKey: LIVE_PROVIDER.apiKey,
        model,
        prompt,
      });
    }
    if (LIVE_PROVIDER.name === "google") {
      return callGoogle({
        apiKey: LIVE_PROVIDER.apiKey,
        baseUrl: LIVE_PROVIDER.baseUrl,
        model,
        prompt,
      });
    }
    return callOpenAICompatible({
      apiKey: LIVE_PROVIDER.apiKey,
      baseUrl: LIVE_PROVIDER.baseUrl,
      model,
      prompt,
    });
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      lastError = error;
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      const shouldRetry =
        message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("timeout") ||
        message.includes("temporar") ||
        /\b50\d\b/.test(message);
      if (!shouldRetry || attempt === 2) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 750 * (attempt + 1)),
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function buildGmailMessage(args: {
  id: string;
  externalId: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  snippet: string;
  receivedAt: string;
  isUnread?: boolean;
  isImportant?: boolean;
  likelyReplyNeeded?: boolean;
  triageScore?: number;
}) {
  return {
    id: args.id,
    externalId: args.externalId,
    threadId: args.threadId,
    agentId: AGENT_ID,
    provider: "google" as const,
    side: "owner" as const,
    subject: args.subject,
    from: args.from,
    fromEmail: args.fromEmail,
    replyTo: args.fromEmail,
    to: ["shawmakesmagic@gmail.com"],
    cc: [],
    snippet: args.snippet,
    receivedAt: args.receivedAt,
    isUnread: args.isUnread ?? false,
    isImportant: args.isImportant ?? false,
    likelyReplyNeeded: args.likelyReplyNeeded ?? false,
    triageScore: args.triageScore ?? 50,
    triageReason: args.likelyReplyNeeded ? "reply needed" : "search hit",
    labels: args.isUnread ? ["INBOX", "UNREAD"] : ["INBOX"],
    htmlLink: `https://mail.google.com/mail/u/0/#all/${args.threadId}`,
    metadata: {
      messageIdHeader: `<${args.externalId}@example.com>`,
      referencesHeader: `<${args.threadId}@example.com>`,
    },
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function seedLocalGmail(runtime: AgentRuntime, stateDir: string) {
  const repository = new LifeOpsRepository(runtime);
  const nowIso = new Date().toISOString();
  const tokenRef = `${AGENT_ID}/owner/local.json`;
  const tokenPath = path.join(
    resolveOAuthDir(process.env, stateDir),
    "lifeops",
    "google",
    tokenRef,
  );
  await fs.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(
    tokenPath,
    JSON.stringify(
      {
        provider: "google",
        agentId: AGENT_ID,
        side: "owner",
        mode: "local",
        clientId: "lifeops-gmail-live-chat-client",
        redirectUri: "http://127.0.0.1/callback",
        accessToken: "gmail-live-chat-access-token",
        refreshToken: "gmail-live-chat-refresh-token",
        tokenType: "Bearer",
        grantedScopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
        ],
        expiresAt: Date.now() + 60 * 60 * 1000,
        refreshTokenExpiresAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      null,
      2,
    ),
    {
      encoding: "utf-8",
      mode: 0o600,
    },
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
        "https://www.googleapis.com/auth/gmail.send",
      ],
      capabilities: [
        "google.basic_identity",
        "google.gmail.triage",
        "google.gmail.send",
      ],
      tokenRef,
      mode: "local",
      metadata: {},
      lastRefreshAt: nowIso,
    }),
  );

  await repository.upsertGmailSyncState(
    createLifeOpsGmailSyncState({
      agentId: AGENT_ID,
      provider: "google",
      side: "owner",
      mailbox: "me",
      maxResults: 50,
      syncedAt: nowIso,
    }),
  );

  const messages = [
    buildGmailMessage({
      id: "gmail-live-suran-recent",
      externalId: "gmail-live-suran-recent-ext",
      threadId: "gmail-live-suran-thread-recent",
      subject: "Suran follow-up",
      from: "Suran Lee",
      fromEmail: "suran@example.com",
      snippet:
        "Wanted to follow up on the last few weeks and see if next week works.",
      receivedAt: "2026-04-09T16:00:00.000Z",
      isUnread: true,
      likelyReplyNeeded: true,
      triageScore: 92,
    }),
    buildGmailMessage({
      id: "gmail-live-suran-old",
      externalId: "gmail-live-suran-old-ext",
      threadId: "gmail-live-suran-thread-old",
      subject: "Older Suran note",
      from: "Suran Lee",
      fromEmail: "suran@example.com",
      snippet: "This is the older Suran message.",
      receivedAt: "2026-03-01T16:00:00.000Z",
      triageScore: 60,
    }),
    buildGmailMessage({
      id: "gmail-live-venue",
      externalId: "gmail-live-venue-ext",
      threadId: "gmail-live-venue-thread",
      subject: "Venue confirmation",
      from: "Morgan",
      fromEmail: "morgan@example.com",
      snippet: "Can you confirm the venue for tomorrow?",
      receivedAt: "2026-04-09T15:00:00.000Z",
      isUnread: true,
      isImportant: true,
      likelyReplyNeeded: true,
      triageScore: 95,
    }),
  ];

  for (const message of messages) {
    await repository.upsertGmailMessage(message, "owner");
  }
}

describe.skipIf(!LIVE_GMAIL_CHAT_ENABLED)(
  "life-ops gmail live chat",
  () => {
    let port = 0;
    let closeServer: (() => Promise<void>) | null = null;
    let runtime: AgentRuntime;
    let envBackup: { restore: () => void };
    let stateDir = "";

    beforeAll(async () => {
      envBackup = saveEnv(
        "ELIZA_STATE_DIR",
        "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      );
      stateDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "lifeops-gmail-live-chat-"),
      );
      process.env.ELIZA_STATE_DIR = stateDir;
      process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID =
        "lifeops-gmail-live-chat-client";

      runtime = createLifeOpsChatTestRuntime({
        agentId: AGENT_ID,
        characterName: "Milady",
        actions: [gmailAction],
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as AgentRuntime["logger"],
        useModel: liveUseModel as AgentRuntime["useModel"],
        handleTurn: async ({ runtime: runtimeArg, message, state }) => {
          const result = await gmailAction.handler?.(
            runtimeArg,
            message as never,
            state,
            {
              parameters: {},
            } as never,
          );
          return {
            text:
              typeof result?.text === "string" && result.text.trim().length > 0
                ? result.text
                : "I couldn't figure out the Gmail request.",
            data: result?.data,
          };
        },
      });

      await seedLocalGmail(runtime, stateDir);

      const server = await startApiServer({
        port: 0,
        runtime,
      });
      port = server.port;
      closeServer = server.close;
    }, 180_000);

    afterAll(async () => {
      if (closeServer) {
        await closeServer();
      }
      if (stateDir) {
        await fs.rm(stateDir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      }
      envBackup.restore();
    });

    it(
      "handles narrative Gmail sender searches with the real model",
      async () => {
        const { conversationId } = await createConversation(port, {
          includeGreeting: false,
          title: "Live Gmail narrative sender search",
        });

        const response = await postConversationMessage(port, conversationId, {
          text: "can you search my email and tell me if anyone named suran emailed me",
          source: "discord",
        });

        expect(response.status).toBe(200);
        expect(String(response.data.text ?? "")).toMatch(/suran/i);
      },
      180_000,
    );

    it(
      "handles reply-needed Gmail searches with the real model",
      async () => {
        const { conversationId } = await createConversation(port, {
          includeGreeting: false,
          title: "Live Gmail reply-needed search",
        });

        const response = await postConversationMessage(port, conversationId, {
          text: "which emails need a reply about venue",
          source: "discord",
        });

        expect(response.status).toBe(200);
        expect(String(response.data.text ?? "")).toMatch(/venue/i);
      },
      180_000,
    );

    it(
      "drafts a Gmail reply from prior conversation context with the real model",
      async () => {
        const { conversationId } = await createConversation(port, {
          includeGreeting: false,
          title: "Live Gmail draft follow-up",
        });

        const search = await postConversationMessage(port, conversationId, {
          text: "can you search my email and tell me if anyone named suran emailed me",
          source: "discord",
        });
        expect(search.status).toBe(200);
        expect(String(search.data.text ?? "")).toMatch(/suran/i);

        const draft = await postConversationMessage(port, conversationId, {
          text: "draft a reply to that email thanking him and saying next week works",
          source: "discord",
        });
        expect(draft.status).toBe(200);

        const combined = [
          String(draft.data.text ?? ""),
          String(draft.data.bodyText ?? ""),
        ].join("\n");
        expect(combined).toMatch(/next week/i);
      },
      180_000,
    );
  },
);
