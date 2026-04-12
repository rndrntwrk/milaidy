import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime, State } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isLiveTestEnabled,
  selectLiveProvider,
} from "../../../test/helpers/live-provider";
import { saveEnv } from "../../../test/helpers/test-utils";
import { gmailAction } from "../src/actions/gmail";
import { resolveOAuthDir } from "../src/config/paths";
import {
  createLifeOpsConnectorGrant,
  createLifeOpsGmailSyncState,
  LifeOpsRepository,
} from "../src/lifeops/repository";
import { createLifeOpsChatTestRuntime } from "./helpers/lifeops-chat-runtime";

const AGENT_ID = "lifeops-gmail-live-chat-agent";
const LIVE_PROVIDER = selectLiveProvider("openai") ?? selectLiveProvider();
const LIVE_GMAIL_CHAT_ENABLED = isLiveTestEnabled() && Boolean(LIVE_PROVIDER);

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
      headers: { "Content-Type": "application/json" },
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
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
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
          "https://www.googleapis.com/auth/gmail.metadata",
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
        "https://www.googleapis.com/auth/gmail.metadata",
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

function makeMessage(text: string) {
  return {
    entityId: AGENT_ID,
    content: {
      source: "discord",
      text,
    },
  } as never;
}

function emptyState(): State {
  return {
    values: {
      recentMessages: "",
    },
    data: {},
  } as State;
}

function followUpState(args: {
  previousUserText: string;
  previousResult: {
    success?: boolean;
    text?: string;
    data?: unknown;
  };
}): State {
  return {
    values: {
      recentMessages: [
        `user: ${args.previousUserText}`,
        `assistant: ${args.previousResult.text ?? ""}`,
      ].join("\n"),
    },
    data: {
      actionResults: [
        {
          content: {
            type: "action_result",
            actionName: "GMAIL_ACTION",
            actionStatus:
              args.previousResult.success === false ? "failed" : "completed",
            text: args.previousResult.text,
            data:
              args.previousResult.data &&
              typeof args.previousResult.data === "object"
                ? args.previousResult.data
                : {},
          },
        },
      ],
    },
  } as State;
}

if (LIVE_GMAIL_CHAT_ENABLED) {
  describe("life-ops gmail live action flows", () => {
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
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as AgentRuntime["logger"],
        useModel: liveUseModel as AgentRuntime["useModel"],
        handleTurn: async () => ({
          text: "",
        }),
      });

      await seedLocalGmail(runtime, stateDir);
    }, 180_000);

    afterAll(async () => {
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

    it("searches Gmail narratively with the real model", async () => {
      const prompt =
        "can you search my email and tell me if anyone named suran emailed me";
      const result = await gmailAction.handler?.(
        runtime,
        makeMessage(prompt),
        emptyState() as never,
        { parameters: {} } as never,
      );

      expect(result?.success).toBe(true);
      expect(String(result?.text ?? "")).toMatch(/suran/i);
    }, 180_000);

    it("finds reply-needed Gmail items with the real model", async () => {
      const prompt = "which emails need a reply about venue";
      const result = await gmailAction.handler?.(
        runtime,
        makeMessage(prompt),
        emptyState() as never,
        { parameters: {} } as never,
      );

      expect(result?.success).toBe(true);
      expect(String(result?.text ?? "")).toMatch(/venue/i);
    }, 180_000);

    it("drafts a Gmail reply from prior Gmail context with the real model", async () => {
      const searchPrompt =
        "can you search my email and tell me if anyone named suran emailed me";
      const searchResult = await gmailAction.handler?.(
        runtime,
        makeMessage(searchPrompt),
        emptyState() as never,
        { parameters: {} } as never,
      );

      expect(searchResult?.success).toBe(true);
      expect(String(searchResult?.text ?? "")).toMatch(/suran/i);

      const draftResult = await gmailAction.handler?.(
        runtime,
        makeMessage(
          "draft a reply to that email thanking him and saying next week works",
        ),
        followUpState({
          previousUserText: searchPrompt,
          previousResult: {
            success: searchResult?.success,
            text: searchResult?.text,
            data: searchResult?.data,
          },
        }) as never,
        { parameters: {} } as never,
      );

      expect(draftResult?.success).toBe(true);
      const combined = [
        String(draftResult?.text ?? ""),
        String(
          draftResult?.data &&
            typeof draftResult.data === "object" &&
            "bodyText" in draftResult.data
            ? (draftResult.data as Record<string, unknown>).bodyText
            : "",
        ),
      ].join("\n");
      expect(combined).toMatch(/next week/i);
    }, 180_000);
  });
}
