import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckSenderPrivateAccess,
  mockGetGoogleConnectorStatus,
  mockGetGmailTriage,
  mockGetGmailNeedsResponse,
  mockGetGmailSearch,
  mockCreateGmailReplyDraft,
  mockCreateGmailBatchReplyDrafts,
  mockSendGmailReply,
  mockSendGmailReplies,
} = vi.hoisted(() => ({
  mockCheckSenderPrivateAccess: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
  mockGetGmailTriage: vi.fn(),
  mockGetGmailNeedsResponse: vi.fn(),
  mockGetGmailSearch: vi.fn(),
  mockCreateGmailReplyDraft: vi.fn(),
  mockCreateGmailBatchReplyDrafts: vi.fn(),
  mockSendGmailReply: vi.fn(),
  mockSendGmailReplies: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderPrivateAccess: mockCheckSenderPrivateAccess,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    getGoogleConnectorStatus = mockGetGoogleConnectorStatus;
    getGmailTriage = mockGetGmailTriage;
    getGmailNeedsResponse = mockGetGmailNeedsResponse;
    getGmailSearch = mockGetGmailSearch;
    createGmailReplyDraft = mockCreateGmailReplyDraft;
    createGmailBatchReplyDrafts = mockCreateGmailBatchReplyDrafts;
    sendGmailReply = mockSendGmailReply;
    sendGmailReplies = mockSendGmailReplies;
  },
  LifeOpsServiceError: class extends Error {},
}));

import { gmailAction } from "./gmail";

const runtime = { agentId: "agent-1" } as never;

function msg(text: string, source = "client_chat") {
  return {
    entityId: "owner-1",
    content: { source, text },
  } as never;
}

function invoke(intent: string, extra: Record<string, unknown> = {}) {
  const { subaction, query, messageId, bodyText, details } = extra;
  return gmailAction.handler?.(runtime, msg(intent), {} as never, {
    parameters: {
      subaction,
      intent,
      query,
      messageId,
      bodyText,
      details,
    },
  } as never);
}

describe("gmailAction", () => {
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
    expect(result?.text).toContain("reply needed");
  });

  it("uses message text when intent param is omitted", async () => {
    mockGetGmailNeedsResponse.mockResolvedValue({
      messages: [],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 0,
        unreadCount: 0,
        importantCount: 0,
      },
    });

    const result = await gmailAction.handler?.(
      runtime,
      msg("what emails need a reply"),
      {} as never,
      { parameters: {} } as never,
    );

    expect(mockGetGmailNeedsResponse).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });

  it("allows owner access from discord", async () => {
    const valid = await gmailAction.validate?.(
      runtime,
      msg("what emails need a reply", "discord"),
      {} as never,
    );
    expect(valid).toBe(true);
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
      runtime,
      { entityId: "mod-1", content: { source: "discord", text: "what emails need a reply" } } as never,
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

  it("searches gmail", async () => {
    mockGetGmailSearch.mockResolvedValue({
      query: "oneblade",
      messages: [
        {
          id: "msg-2",
          externalId: "ext-2",
          threadId: "thread-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "OneBlade receipt",
          from: "Amazon",
          fromEmail: "orders@amazon.com",
          replyTo: "orders@amazon.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Your Philips OneBlade order shipped",
          receivedAt: "2026-04-08T16:00:00.000Z",
          isUnread: false,
          isImportant: false,
          likelyReplyNeeded: false,
          triageScore: 20,
          triageReason: "search hit",
          labels: ["INBOX"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-2",
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
    });

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
      details: {
        tone: "warm",
        includeQuotedOriginal: true,
      },
    });

    expect(mockCreateGmailReplyDraft).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        messageId: "msg-3",
        tone: "warm",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Drafted reply");
  });

  it("creates batch reply drafts", async () => {
    mockCreateGmailBatchReplyDrafts.mockResolvedValue({
      query: "investor",
      messages: [],
      drafts: [
        {
          messageId: "msg-4",
          threadId: "thread-4",
          subject: "Re: Investor update",
          to: ["investor@example.com"],
          cc: [],
          bodyText: "Thanks for the follow-up.",
          previewLines: ["Thanks for the follow-up."],
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
    expect(result?.text).toContain("reply sent");
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
    expect(result?.text).toContain("Sent 2 Gmail replies");
  });

  it("asks for reconnect when Gmail send access is missing", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.basic_identity", "google.gmail.triage"],
    });

    const result = await invoke("send this reply", {
      subaction: "send_reply",
      messageId: "msg-6",
      bodyText: "Thanks!",
    });

    expect(mockSendGmailReply).not.toHaveBeenCalled();
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("send access is not granted");
  });
});
