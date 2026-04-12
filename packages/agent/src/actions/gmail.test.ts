import { ModelType } from "@elizaos/core";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { describeLLM } from "../../../../test/helpers/skip-without";

const {
  mockCheckSenderPrivateAccess,
  mockResolveCanonicalOwnerIdForMessage,
  mockGetGoogleConnectorStatus,
  mockGetGmailTriage,
  mockGetGmailNeedsResponse,
  mockGetGmailSearch,
  mockReadGmailMessage,
  mockCreateGmailReplyDraft,
  mockCreateGmailBatchReplyDrafts,
  mockSendGmailReply,
  mockSendGmailMessage,
  mockSendGmailReplies,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockCheckSenderPrivateAccess: vi.fn(),
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
  mockGetGmailTriage: vi.fn(),
  mockGetGmailNeedsResponse: vi.fn(),
  mockGetGmailSearch: vi.fn(),
  mockReadGmailMessage: vi.fn(),
  mockCreateGmailReplyDraft: vi.fn(),
  mockCreateGmailBatchReplyDrafts: vi.fn(),
  mockSendGmailReply: vi.fn(),
  mockSendGmailMessage: vi.fn(),
  mockSendGmailReplies: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@miladyai/shared/eliza-core-roles", () => ({
  checkSenderPrivateAccess: mockCheckSenderPrivateAccess,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    getGoogleConnectorStatus = mockGetGoogleConnectorStatus;
    getGmailTriage = mockGetGmailTriage;
    getGmailNeedsResponse = mockGetGmailNeedsResponse;
    getGmailSearch = mockGetGmailSearch;
    readGmailMessage = mockReadGmailMessage;
    createGmailReplyDraft = mockCreateGmailReplyDraft;
    createGmailBatchReplyDrafts = mockCreateGmailBatchReplyDrafts;
    sendGmailReply = mockSendGmailReply;
    sendGmailMessage = mockSendGmailMessage;
    sendGmailReplies = mockSendGmailReplies;
  },
  LifeOpsServiceError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { gmailAction } from "./gmail";

let realRuntime:
  | Awaited<ReturnType<typeof createRealTestRuntime>>["runtime"]
  | null = null;
let realRuntimeCleanup: (() => Promise<void>) | null = null;

function getRuntime() {
  if (!realRuntime) throw new Error("Real runtime not initialized");
  return {
    agentId: "agent-1",
    useModel: realRuntime.useModel.bind(realRuntime),
    logger: { warn: mockLoggerWarn },
  } as never;
}

const stubRuntime = {
  agentId: "agent-1",
  useModel: () => {
    throw new Error("useModel not available in stub");
  },
  logger: { warn: mockLoggerWarn },
} as never;

function msg(text: string, source = "client_chat") {
  return {
    entityId: "owner-1",
    content: { source, text },
  } as never;
}

function invoke(intent: string, extra: Record<string, unknown> = {}) {
  return invokeWithRuntime(getRuntime(), intent, extra);
}

function invokeWithRuntime(
  runtime: ReturnType<typeof getRuntime>,
  intent: string,
  extra: Record<string, unknown> = {},
) {
  const { subaction, query, queries, messageId, bodyText, details, state } =
    extra;
  return gmailAction.handler?.(
    runtime,
    msg(intent),
    (state ?? {}) as never,
    {
      parameters: {
        subaction,
        intent,
        query,
        queries,
        messageId,
        bodyText,
        details,
      },
    } as never,
  );
}

function makeRuntimeWithModelResponses(...responses: Array<string | Error>) {
  let index = 0;
  return {
    agentId: "agent-1",
    useModel: vi.fn(async () => {
      const response = responses[index];
      index += 1;
      if (response instanceof Error) {
        throw response;
      }
      if (typeof response === "string") {
        return response;
      }
      throw new Error("unexpected model call");
    }),
    logger: { warn: mockLoggerWarn },
  } as never;
}

function searchResult(args: {
  query: string;
  subject: string;
  from: string;
  fromEmail?: string;
}) {
  return {
    query: args.query,
    messages: [
      {
        id: `msg-${args.query.replace(/\W+/g, "-")}`,
        externalId: `ext-${args.query.replace(/\W+/g, "-")}`,
        threadId: "thread-search",
        agentId: "agent-1",
        provider: "google",
        side: "owner",
        subject: args.subject,
        from: args.from,
        fromEmail: args.fromEmail ?? "sender@example.com",
        replyTo: args.fromEmail ?? "sender@example.com",
        to: ["shawmakesmagic@gmail.com"],
        cc: [],
        snippet: "Search snippet",
        receivedAt: "2026-04-08T16:00:00.000Z",
        isUnread: false,
        isImportant: false,
        likelyReplyNeeded: false,
        triageScore: 50,
        triageReason: "search hit",
        labels: ["INBOX"],
        htmlLink: "https://mail.google.com/mail/u/0/#all/thread-search",
        metadata: {},
        syncedAt: "2026-04-08T16:00:00.000Z",
        updatedAt: "2026-04-08T16:00:00.000Z",
      },
    ],
    source: "cache",
    syncedAt: "2026-04-09T16:00:00.000Z",
    summary: {
      totalCount: 1,
      unreadCount: 0,
      importantCount: 0,
      replyNeededCount: 0,
    },
  };
}

describeLLM("gmailAction", () => {
  beforeAll(async () => {
    const result = await createRealTestRuntime({ withLLM: true });
    realRuntime = result.runtime;
    realRuntimeCleanup = result.cleanup;
  }, 180_000);

  afterAll(async () => {
    if (realRuntimeCleanup) await realRuntimeCleanup();
    realRuntime = null;
    realRuntimeCleanup = null;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockCheckSenderPrivateAccess.mockResolvedValue({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
      hasPrivateAccess: true,
      accessRole: "OWNER",
      accessSource: "owner",
    });
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("owner-1");
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: [
        "google.basic_identity",
        "google.gmail.triage",
        "google.gmail.send",
      ],
    });
  });

  it("returns inbox triage", async () => {
    mockGetGmailTriage.mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          externalId: "ext-1",
          threadId: "thread-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Investor follow-up",
          from: "Jane Doe",
          fromEmail: "jane@example.com",
          replyTo: "jane@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Checking in on next week",
          receivedAt: "2026-04-09T16:00:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 90,
          triageReason: "reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-1",
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        unreadCount: 1,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
    });

    const result = await invoke("what's in my inbox", { subaction: "triage" });

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Investor follow-up");
  });

  it("turns raw Gmail service errors into a natural reply", async () => {
    mockGetGmailSearch.mockRejectedValue(
      new (await import("../lifeops/service.js")).LifeOpsServiceError(
        429,
        "Too many requests to Gmail upstream.",
      ),
    );

    const result = await gmailAction.handler?.(
      stubRuntime,
      msg("search my email for suran"),
      {} as never,
      {
        parameters: {
          subaction: "search",
          query: "suran",
        },
      } as never,
    );

    expect(result).toMatchObject({
      success: false,
      text: "Gmail is rate-limited right now. Try again in a bit.",
    });
  });

  it("still executes an explicit gmail subaction", async () => {
    mockGetGmailTriage.mockResolvedValue({
      messages: [],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        unreadCount: 0,
        importantNewCount: 0,
        likelyReplyNeededCount: 0,
      },
    });

    const result = await invoke("check my inbox", { subaction: "triage" });

    expect(mockGetGmailTriage).toHaveBeenCalledTimes(1);
    expect(result?.success).toBe(true);
  });

  it("allows owner access from discord", async () => {
    const valid = await gmailAction.validate?.(
      stubRuntime,
      msg("what emails need a reply", "discord"),
      {} as never,
    );

    expect(valid).toBe(true);
  });

  it("allows Gmail follow-ups when one of the last 12 messages contains an email term", async () => {
    const valid = await gmailAction.validate?.(
      stubRuntime,
      msg("same as last one", "discord"),
      {
        values: {
          recentMessages: [
            "user: hey",
            "assistant: sure",
            "user: send an email to shawmakesmagic@gmail.com",
            "assistant: what should it say?",
            "user: thinking",
          ].join("\n"),
        },
      } as never,
    );

    expect(valid).toBe(true);
  });

  it("allows localized Gmail follow-ups when the recent context contains a translated email term", async () => {
    const valid = await gmailAction.validate?.(
      stubRuntime,
      msg("igual que el ultimo", "discord"),
      {
        values: {
          preferredLanguage: "es",
          recentMessages: [
            "user: hola",
            "assistant: claro",
            "user: manda un correo a shawmakesmagic@gmail.com",
            "assistant: que asunto y cuerpo quieres?",
          ].join("\n"),
        },
      } as never,
    );

    expect(valid).toBe(true);
  });

  it("rejects Gmail actions when the last 12 messages contain no email terms", async () => {
    const valid = await gmailAction.validate?.(
      stubRuntime,
      msg("same as last one", "discord"),
      {
        values: {
          recentMessages: [
            "user: hey",
            "assistant: sure",
            "user: thinking",
          ].join("\n"),
        },
      } as never,
    );

    expect(valid).toBe(false);
  });

  it("rejects connector-admin access without an explicit grant", async () => {
    mockCheckSenderPrivateAccess.mockResolvedValue({
      entityId: "mod-1",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
      hasPrivateAccess: false,
      accessRole: null,
      accessSource: null,
    });

    const valid = await gmailAction.validate?.(
      stubRuntime,
      {
        entityId: "mod-1",
        content: { source: "discord", text: "what emails need a reply" },
      } as never,
      {} as never,
    );

    expect(valid).toBe(false);
  });

  it("returns needs-response results", async () => {
    mockGetGmailNeedsResponse.mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          externalId: "ext-1",
          threadId: "thread-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Schedule meeting",
          from: "Alex",
          fromEmail: "alex@example.com",
          replyTo: "alex@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Does next Thursday work?",
          receivedAt: "2026-04-09T16:00:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 88,
          triageReason: "reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-1",
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        unreadCount: 1,
        importantCount: 1,
      },
    });

    const result = await invoke("what emails need a reply", {
      subaction: "needs_response",
    });

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Schedule meeting");
  });

  it("searches gmail with an explicit query", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "oneblade",
        subject: "OneBlade receipt",
        from: "Amazon",
        fromEmail: "orders@amazon.com",
      }),
    );

    const result = await invoke("search my email for oneblade", {
      subaction: "search",
      query: "oneblade",
    });

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "oneblade" }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("OneBlade receipt");
  });

  it("sends grounded Gmail results through the action callback", async () => {
    const callback = vi.fn(async () => []);
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        subject: "Checking in",
        from: "Suran Goonatilake",
        fromEmail: "suran@example.com",
      }),
    );

    const result = await gmailAction.handler?.(
      getRuntime(),
      msg("search my email for suran"),
      {} as never,
      {
        parameters: {
          subaction: "search",
          query: "from:suran",
        },
      } as never,
      callback,
    );

    expect(result?.success).toBe(true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "GMAIL_ACTION",
        source: "action",
      }),
    );
  });

  it("returns a grounded rate-limit error when Gmail search is throttled", async () => {
    mockGetGmailSearch.mockRejectedValueOnce(
      new (await import("../lifeops/service.js")).LifeOpsServiceError(
        429,
        "Too many requests",
      ),
    );

    const result = await invoke("find email from suran", {
      subaction: "search",
      query: "suran",
    });

    expect(result).toMatchObject({
      success: false,
      text: expect.stringMatching(/rate[- ]?limit/i),
    });
  });

  it("creates a single reply draft", async () => {
    mockCreateGmailReplyDraft.mockResolvedValue({
      messageId: "msg-3",
      threadId: "thread-3",
      subject: "Re: Scheduling",
      to: ["alex@example.com"],
      cc: [],
      bodyText: "Thanks, next week works for me.",
      previewLines: ["Thanks,", "Next week works for me."],
      sendAllowed: true,
      requiresConfirmation: true,
    });

    const result = await invoke("draft a reply", {
      subaction: "draft_reply",
      messageId: "msg-3",
    });

    expect(mockCreateGmailReplyDraft).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ messageId: "msg-3" }),
    );
    expect(result?.success).toBe(true);
  });

  it("resolves a natural draft-reply target through Gmail search when no message id is provided", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:alex subject:venue",
        subject: "Alex venue update",
        from: "Alex",
        fromEmail: "alex@example.com",
      }),
    );
    mockCreateGmailReplyDraft.mockResolvedValue({
      messageId: "msg-from-alex-subject-venue",
      threadId: "thread-venue",
      subject: "Re: Alex venue update",
      to: ["alex@example.com"],
      cc: [],
      bodyText: "Thanks, next week works for me.",
      previewLines: ["Thanks, next week works for me."],
      sendAllowed: true,
      requiresConfirmation: true,
    });
    const runtime = makeRuntimeWithModelResponses(
      JSON.stringify({
        subaction: "draft_reply",
        shouldAct: true,
        queries: ["from:alex subject:venue"],
      }),
      new Error("skip reply rewrite"),
    );

    const result = await invokeWithRuntime(
      runtime,
      "draft a reply to alex about the venue",
    );

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "from:alex subject:venue" }),
    );
    expect(runtime.useModel.mock.calls[0]?.[0]).toBe(ModelType.TEXT_LARGE);
    expect(mockCreateGmailReplyDraft).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ messageId: "msg-from-alex-subject-venue" }),
    );
    expect(result?.success).toBe(true);
  });

  it("resolves a reply draft target from a Gmail search query when messageId is absent", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        subject: "Dinner tonight",
        from: "Suran Lee",
        fromEmail: "suran@example.com",
      }),
    );
    mockCreateGmailReplyDraft.mockResolvedValue({
      messageId: "msg-from-suran",
      threadId: "thread-search",
      subject: "Re: Dinner tonight",
      to: ["suran@example.com"],
      cc: [],
      bodyText: "Sounds good to me.",
      previewLines: ["Sounds good to me."],
      sendAllowed: true,
      requiresConfirmation: true,
    });

    const result = await invoke("draft a reply to suran", {
      subaction: "draft_reply",
      query: "from:suran",
    });

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "from:suran" }),
    );
    expect(mockCreateGmailReplyDraft).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ messageId: "msg-from-suran" }),
    );
    expect(result?.success).toBe(true);
  });

  it("asks for clarification instead of drafting a reply from the first colliding Gmail search result", async () => {
    mockGetGmailSearch.mockResolvedValue({
      query: "from:suran",
      messages: [
        searchResult({
          query: "from:suran-one",
          subject: "Dinner tonight",
          from: "Suran Lee",
          fromEmail: "suran@example.com",
        }).messages[0],
        {
          ...searchResult({
            query: "from:suran-two",
            subject: "Follow-up on dinner",
            from: "Suran Lee",
            fromEmail: "suran@example.com",
          }).messages[0],
          id: "msg-from-suran-2",
          externalId: "ext-from-suran-2",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 2,
        unreadCount: 0,
        importantCount: 0,
        replyNeededCount: 0,
      },
    });

    const result = await invoke("draft a reply to suran", {
      subaction: "draft_reply",
      query: "from:suran",
    });

    expect(mockCreateGmailReplyDraft).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
    expect(result?.text).toContain("Dinner tonight");
    expect(result?.text).toContain("Follow-up on dinner");
  });

  it("asks for clarification instead of reading the first colliding Gmail search result", async () => {
    mockGetGmailSearch.mockResolvedValue({
      query: "subject:project",
      messages: [
        {
          ...searchResult({
            query: "subject:project-a",
            subject: "Project sync",
            from: "Founder Example",
            fromEmail: "founder@example.com",
          }).messages[0],
          id: "msg-project-1",
          externalId: "ext-project-1",
        },
        {
          ...searchResult({
            query: "subject:project-b",
            subject: "Project follow-up",
            from: "Founder Example",
            fromEmail: "founder@example.com",
          }).messages[0],
          id: "msg-project-2",
          externalId: "ext-project-2",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 2,
        unreadCount: 0,
        importantCount: 0,
        replyNeededCount: 0,
      },
    });

    const result = await invoke("read the project email", {
      subaction: "read",
      query: "subject:project",
    });

    expect(mockReadGmailMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
    expect(result?.text).toContain("Project sync");
    expect(result?.text).toContain("Project follow-up");
  });

  it("creates batch reply drafts", async () => {
    mockCreateGmailBatchReplyDrafts.mockResolvedValue({
      query: "investor",
      messages: [
        {
          id: "msg-4",
          externalId: "ext-4",
          threadId: "thread-4",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Investor update",
          from: "Jane Doe",
          fromEmail: "jane@example.com",
          replyTo: "jane@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Checking in",
          receivedAt: "2026-04-09T16:00:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 92,
          triageReason: "reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-4",
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      drafts: [
        {
          messageId: "msg-4",
          threadId: "thread-4",
          subject: "Re: Investor update",
          to: ["jane@example.com"],
          cc: [],
          bodyText: "Thanks for the update.",
          previewLines: ["Thanks for the update."],
          sendAllowed: true,
          requiresConfirmation: true,
        },
      ],
      source: "synced",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        sendAllowedCount: 1,
        requiresConfirmationCount: 1,
      },
    });

    const result = await invoke("draft replies for investor emails", {
      subaction: "draft_batch_replies",
      query: "investor",
    });

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Drafted 1 Gmail reply");
  });

  it("sends a confirmed reply", async () => {
    mockSendGmailReply.mockResolvedValue({ ok: true });

    const result = await invoke("send this reply", {
      subaction: "send_reply",
      messageId: "msg-5",
      bodyText: "That works for me.",
      details: {
        confirmSend: true,
      },
    });

    expect(mockSendGmailReply).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        messageId: "msg-5",
        bodyText: "That works for me.",
        confirmSend: true,
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("reuses the last drafted Gmail reply when the user says send that reply now", async () => {
    mockSendGmailReply.mockResolvedValue({ ok: true });
    const runtime = makeRuntimeWithModelResponses(
      JSON.stringify({
        subaction: "send_reply",
        shouldAct: true,
      }),
      new Error("skip reply rewrite"),
    );
    const state = {
      data: {
        actionResults: [
          {
            content: {
              type: "action_result",
              actionName: "GMAIL_ACTION",
              actionStatus: "completed",
              text: "Drafted a reply.",
              data: {
                messageId: "msg-5",
                threadId: "thread-5",
                subject: "Re: Scheduling",
                to: ["alex@example.com"],
                cc: [],
                bodyText: "That works for me.",
                previewLines: ["That works for me."],
                sendAllowed: true,
                requiresConfirmation: true,
              },
            },
          },
        ],
      },
    };

    const result = await invokeWithRuntime(runtime, "send that reply now", {
      state,
    });

    expect(mockSendGmailReply).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        messageId: "msg-5",
        bodyText: "That works for me.",
        subject: "Re: Scheduling",
        to: ["alex@example.com"],
        cc: [],
        confirmSend: true,
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("sends a new Gmail message from unquoted natural-language compose text", async () => {
    mockSendGmailMessage.mockResolvedValue({ ok: true });
    const runtime = makeRuntimeWithModelResponses(
      JSON.stringify({
        subaction: "send_message",
        shouldAct: true,
        queries: [],
        to: ["leebin605@gmail.com"],
        subject: "hello BAO",
        bodyText: "milady,we ship we win.",
      }),
      new Error("skip reply rewrite"),
    );

    const result = await invokeWithRuntime(
      runtime,
      "send an email to leebin605@gmail.com the subject should say hello BAO and the body should say milady,we ship we win.",
    );

    expect(mockSendGmailMessage).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        to: ["leebin605@gmail.com"],
        subject: "hello BAO",
        bodyText: expect.stringMatching(/^milady,we ship we win\.?$/),
        confirmSend: true,
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("accepts recipient and cc lists passed as natural string fields", async () => {
    mockSendGmailMessage.mockResolvedValue({ ok: true });

    const result = await invoke("send this email", {
      subaction: "send_message",
      details: {
        to: 'Mira <mira@example.com>; ops@example.com',
        cc: '"Ops Team" <ops@example.com>',
        subject: "hola",
        bodyText: "nos vemos manana",
        confirmSend: true,
      },
    });

    expect(mockSendGmailMessage).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        to: ["Mira <mira@example.com>", "ops@example.com"],
        cc: ['"Ops Team" <ops@example.com>'],
        subject: "hola",
        bodyText: "nos vemos manana",
        confirmSend: true,
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("asks for missing compose fields without quote-specific instructions", async () => {
    const runtime = makeRuntimeWithModelResponses(
      JSON.stringify({
        subaction: "send_message",
        shouldAct: true,
        queries: [],
        to: ["leebin605@gmail.com"],
        subject: "hello BAO",
      }),
      new Error("skip reply rewrite"),
    );

    const result = await invokeWithRuntime(
      runtime,
      "send an email to leebin605@gmail.com the subject should say hello BAO",
    );

    expect(mockSendGmailMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
    expect(result?.text).toContain("body text");
    expect(result?.text).not.toContain('with subject "X" and body "Y"');
  });

  it("stores a pending compose draft on clarification so later turns can recover it", async () => {
    const runtime = makeRuntimeWithModelResponses(
      JSON.stringify({
        subaction: "send_message",
        shouldAct: true,
        queries: [],
        to: ["shawmakesmagic@gmail.com"],
      }),
      new Error("skip reply rewrite"),
    );

    const result = await invokeWithRuntime(
      runtime,
      "send it to shawmakesmagic@gmail.com this time",
      {
        subaction: "send_message",
      },
    );

    expect(mockSendGmailMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      data: {
        gmailDraft: {
          subaction: "send_message",
          status: "pending_clarification",
          to: ["shawmakesmagic@gmail.com"],
        },
        noop: true,
      },
    });
  });

  it("reuses the active compose recipient on a later follow-up instead of asking again", async () => {
    mockSendGmailMessage.mockResolvedValue({ ok: true });
    const runtime = makeRuntimeWithModelResponses(
      JSON.stringify({
        subaction: "send_message",
        shouldAct: true,
        queries: [],
        subject: "test",
        bodyText: "test",
      }),
      new Error("skip reply rewrite"),
    );

    const state = {
      data: {
        actionResults: [
          {
            content: {
              type: "action_result",
              actionName: "GMAIL_ACTION",
              actionStatus: "completed",
              text: "I need subject and body text to compose that email.",
              data: {
                gmailDraft: {
                  subaction: "send_message",
                  status: "pending_clarification",
                  intent: "send it to shawmakesmagic@gmail.com this time",
                  to: ["shawmakesmagic@gmail.com"],
                },
              },
            },
          },
        ],
      },
    };

    const result = await invokeWithRuntime(
      runtime,
      'send an email like "test"',
      { state },
    );

    expect(mockSendGmailMessage).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        to: ["shawmakesmagic@gmail.com"],
        subject: "test",
        bodyText: "test",
      }),
    );
    expect(runtime.useModel.mock.calls[0]?.[0]).toBe(ModelType.TEXT_LARGE);
    expect(runtime.useModel.mock.calls[1]?.[0]).toBe(ModelType.TEXT_LARGE);
    expect(result?.success).toBe(true);
  });

  it("uses the last completed outbound email when the user says same as the last email", async () => {
    mockSendGmailMessage.mockResolvedValue({ ok: true });

    const state = {
      data: {
        actionResults: [
          {
            content: {
              type: "action_result",
              actionName: "GMAIL_ACTION",
              actionStatus: "completed",
              text: "sent to old@example.com.",
              data: {
                gmailDraft: {
                  subaction: "send_message",
                  status: "sent",
                  to: ["old@example.com"],
                  subject: "Quick test",
                  bodyText: "test",
                },
              },
            },
          },
          {
            content: {
              type: "action_result",
              actionName: "GMAIL_ACTION",
              actionStatus: "completed",
              text: "I need subject and body text to compose that email.",
              data: {
                gmailDraft: {
                  subaction: "send_message",
                  status: "pending_clarification",
                  to: ["shawmakesmagic@gmail.com"],
                },
              },
            },
          },
        ],
      },
    };

    const result = await invoke("same as the last email", { state });

    expect(mockSendGmailMessage).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        to: ["shawmakesmagic@gmail.com"],
        subject: "Quick test",
        bodyText: "test",
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("sends confirmed batch replies", async () => {
    mockSendGmailReplies.mockResolvedValue({ ok: true, sentCount: 2 });

    const result = await invoke("send these drafted replies", {
      subaction: "send_batch_replies",
      details: {
        confirmSend: true,
        items: [
          { messageId: "msg-1", bodyText: "Reply one" },
          { messageId: "msg-2", bodyText: "Reply two" },
        ],
      },
    });

    expect(mockSendGmailReplies).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        confirmSend: true,
        items: [
          { messageId: "msg-1", bodyText: "Reply one" },
          { messageId: "msg-2", bodyText: "Reply two" },
        ],
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("reuses the last drafted batch when the user says send all those replies", async () => {
    mockSendGmailReplies.mockResolvedValue({ ok: true, sentCount: 2 });
    const runtime = makeRuntimeWithModelResponses(
      JSON.stringify({
        subaction: "send_batch_replies",
        shouldAct: true,
      }),
      new Error("skip reply rewrite"),
    );
    const state = {
      data: {
        actionResults: [
          {
            content: {
              type: "action_result",
              actionName: "GMAIL_ACTION",
              actionStatus: "completed",
              text: "Drafted batch replies.",
              data: {
                drafts: [
                  {
                    messageId: "msg-1",
                    subject: "Re: One",
                    to: ["one@example.com"],
                    cc: [],
                    bodyText: "Reply one",
                  },
                  {
                    messageId: "msg-2",
                    subject: "Re: Two",
                    to: ["two@example.com"],
                    cc: [],
                    bodyText: "Reply two",
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const result = await invokeWithRuntime(runtime, "send all those replies", {
      state,
    });

    expect(mockSendGmailReplies).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        confirmSend: true,
        items: [
          {
            messageId: "msg-1",
            subject: "Re: One",
            to: ["one@example.com"],
            cc: [],
            bodyText: "Reply one",
          },
          {
            messageId: "msg-2",
            subject: "Re: Two",
            to: ["two@example.com"],
            cc: [],
            bodyText: "Reply two",
          },
        ],
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("asks for reconnect when Gmail send access is missing", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.basic_identity", "google.gmail.triage"],
    });

    const result = await invoke("send this reply", {
      subaction: "send_reply",
      messageId: "msg-5",
      bodyText: "That works for me.",
      details: {
        confirmSend: true,
      },
    });

    expect(result?.success).toBe(false);
    expect(result?.text).toMatch(/connect|reconnect/i);
  });
});
