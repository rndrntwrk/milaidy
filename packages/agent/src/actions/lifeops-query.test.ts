import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckSenderRole,
  mockGetOverview,
  mockGetCalendarFeed,
  mockGetNextCalendarEventContext,
  mockGetGmailTriage,
  mockGetGoogleConnectorStatus,
} = vi.hoisted(() => ({
  mockCheckSenderRole: vi.fn(),
  mockGetOverview: vi.fn(),
  mockGetCalendarFeed: vi.fn(),
  mockGetNextCalendarEventContext: vi.fn(),
  mockGetGmailTriage: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
}));

vi.mock("@miladyai/plugin-roles", () => ({
  checkSenderRole: mockCheckSenderRole,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    getOverview = mockGetOverview;
    getCalendarFeed = mockGetCalendarFeed;
    getNextCalendarEventContext = mockGetNextCalendarEventContext;
    getGmailTriage = mockGetGmailTriage;
    getGoogleConnectorStatus = mockGetGoogleConnectorStatus;
  },
}));

import { queryLifeOpsAction } from "./lifeops-query";

function adminRole() {
  return {
    entityId: "owner-1",
    role: "OWNER",
    isOwner: true,
    isAdmin: true,
    canManageRoles: true,
  };
}

function googleConnected(capabilities: string[]) {
  return {
    provider: "google",
    connected: true,
    grantedCapabilities: capabilities,
  };
}

function googleDisconnected() {
  return {
    provider: "google",
    connected: false,
    grantedCapabilities: [],
  };
}

function chatMessage(text: string) {
  return {
    entityId: "owner-1",
    content: { source: "client_chat", text },
  } as never;
}

const runtime = { agentId: "agent-1" } as never;

describe("queryLifeOpsAction", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockGetOverview.mockReset();
    mockGetCalendarFeed.mockReset();
    mockGetNextCalendarEventContext.mockReset();
    mockGetGmailTriage.mockReset();
    mockGetGoogleConnectorStatus.mockReset();
    mockCheckSenderRole.mockResolvedValue(adminRole());
  });

  it("rejects non-admin callers during validation", async () => {
    mockCheckSenderRole.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const valid = await queryLifeOpsAction.validate?.(
      runtime,
      chatMessage("what's on my calendar?"),
      {} as never,
    );

    expect(valid).toBe(false);
  });

  it("returns calendar events for today", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue(
      googleConnected(["google.calendar.read"]),
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          title: "Standup",
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 3_600_000).toISOString(),
          isAllDay: false,
          location: null,
          attendees: [],
          conferenceLink: null,
        },
      ],
      source: "cache",
      timeMin: "",
      timeMax: "",
      syncedAt: null,
    });

    const result = await queryLifeOpsAction.handler?.(
      runtime,
      chatMessage("what's on my calendar today?"),
      {} as never,
      {
        parameters: {
          operation: "calendar_today",
        },
      } as never,
    );

    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Standup"),
    });
  });

  it("returns not connected when Google is not set up", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue(googleDisconnected());

    const result = await queryLifeOpsAction.handler?.(
      runtime,
      chatMessage("what's on my calendar?"),
      {} as never,
      {
        parameters: { operation: "calendar_today" },
      } as never,
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("not connected"),
    });
  });

  it("returns email triage summary", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue(
      googleConnected(["google.gmail.triage"]),
    );
    mockGetGmailTriage.mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          subject: "Project update",
          from: "alice@example.com",
          fromEmail: "alice@example.com",
          isImportant: true,
          likelyReplyNeeded: true,
          receivedAt: new Date().toISOString(),
          snippet: "Here is the latest status...",
        },
      ],
      source: "cache",
      syncedAt: null,
      summary: {
        unreadCount: 3,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
    });

    const result = await queryLifeOpsAction.handler?.(
      runtime,
      chatMessage("any important emails?"),
      {} as never,
      {
        parameters: { operation: "email_triage" },
      } as never,
    );

    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Project update"),
    });
    expect((result as { text: string }).text).toContain("important");
    expect((result as { text: string }).text).toContain("reply needed");
  });

  it("returns life ops overview", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        summary: {
          activeOccurrenceCount: 2,
          overdueOccurrenceCount: 1,
          snoozedOccurrenceCount: 0,
          activeGoalCount: 1,
          activeReminderCount: 1,
        },
        occurrences: [
          { title: "Brush teeth", state: "visible" },
          { title: "Exercise", state: "pending" },
        ],
        goals: [
          { title: "Stay healthy", status: "active" },
        ],
        reminders: [],
      },
      agentOps: {
        summary: {
          activeOccurrenceCount: 0,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeGoalCount: 0,
          activeReminderCount: 0,
        },
        occurrences: [],
        goals: [],
        reminders: [],
      },
    });

    const result = await queryLifeOpsAction.handler?.(
      runtime,
      chatMessage("give me a life ops overview"),
      {} as never,
      {
        parameters: { operation: "overview" },
      } as never,
    );

    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("2 active items"),
    });
    expect((result as { text: string }).text).toContain("Brush teeth");
    expect((result as { text: string }).text).toContain("Stay healthy");
  });

  it("returns next event context with linked emails", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue(
      googleConnected(["google.calendar.read"]),
    );
    const eventStart = new Date(Date.now() + 30 * 60_000);
    mockGetNextCalendarEventContext.mockResolvedValue({
      event: {
        title: "Design review",
        startAt: eventStart.toISOString(),
        endAt: new Date(eventStart.getTime() + 3_600_000).toISOString(),
        isAllDay: false,
        location: "Room 42",
        attendees: [
          { displayName: "Bob", email: "bob@co.com" },
        ],
        conferenceLink: "https://meet.google.com/abc",
      },
      startsAt: eventStart.toISOString(),
      startsInMinutes: 30,
      attendeeCount: 1,
      attendeeNames: ["Bob"],
      location: "Room 42",
      conferenceLink: "https://meet.google.com/abc",
      preparationChecklist: ["Review mockups"],
      linkedMailState: "synced",
      linkedMailError: null,
      linkedMail: [
        {
          id: "m1",
          subject: "Mockup v3",
          from: "bob@co.com",
          receivedAt: new Date().toISOString(),
          snippet: "Here are the latest designs",
          htmlLink: "https://mail.google.com/1",
        },
      ],
    });

    const result = await queryLifeOpsAction.handler?.(
      runtime,
      chatMessage("what's my next meeting?"),
      {} as never,
      {
        parameters: { operation: "calendar_next" },
      } as never,
    );

    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Design review"),
    });
    const text = (result as { text: string }).text;
    expect(text).toContain("Room 42");
    expect(text).toContain("Bob");
    expect(text).toContain("Review mockups");
    expect(text).toContain("Mockup v3");
  });

  it("requires an operation parameter", async () => {
    const result = await queryLifeOpsAction.handler?.(
      runtime,
      chatMessage("tell me stuff"),
      {} as never,
      {
        parameters: {},
      } as never,
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("requires an operation"),
    });
  });
});
