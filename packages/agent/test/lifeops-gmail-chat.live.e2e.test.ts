import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import type { AgentRuntime } from "@elizaos/core";
import { createConversation, postConversationMessage } from "../../../test/helpers/http";
import { createRealTestRuntime } from "../../../test/helpers/real-runtime";
import { isLiveTestEnabled, selectLiveProvider } from "../../../test/helpers/live-provider";
import { createLifeOpsChatTestRuntime } from "./helpers/lifeops-chat-runtime";
import { gmailAction } from "../src/actions/gmail";
import { startApiServer } from "../src/api/server";
import {
  createLifeOpsConnectorGrant,
  createLifeOpsGmailSyncState,
  LifeOpsRepository,
} from "../src/lifeops/repository";

const AGENT_ID = "lifeops-gmail-live-chat-agent";
const LIVE_GMAIL_CHAT_ENABLED =
  isLiveTestEnabled() && Boolean(selectLiveProvider());

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

async function seedLocalGmail(runtime: AgentRuntime) {
  const repository = new LifeOpsRepository(runtime);
  const nowIso = new Date().toISOString();

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
      tokenRef: null,
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
    let llmRuntime:
      | Awaited<ReturnType<typeof createRealTestRuntime>>["runtime"]
      | null = null;
    let llmRuntimeCleanup: (() => Promise<void>) | null = null;

    beforeAll(async () => {
      const result = await createRealTestRuntime({ withLLM: true });
      llmRuntime = result.runtime;
      llmRuntimeCleanup = result.cleanup;

      runtime = createLifeOpsChatTestRuntime({
        agentId: AGENT_ID,
        characterName: "Milady",
        actions: [gmailAction],
        logger: llmRuntime.logger,
        useModel: llmRuntime.useModel.bind(llmRuntime),
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

      await seedLocalGmail(runtime);

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
      if (llmRuntimeCleanup) {
        await llmRuntimeCleanup();
      }
      llmRuntime = null;
      llmRuntimeCleanup = null;
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
          text: "find emails from suran",
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
