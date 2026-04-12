import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckSenderPrivateAccess,
  mockResolveCanonicalOwnerIdForMessage,
  mockGetGoogleConnectorStatus,
  mockGetCalendarFeed,
  mockGetNextCalendarEventContext,
  mockCreateCalendarEvent,
  mockUpdateCalendarEvent,
  mockDeleteCalendarEvent,
  mockUseModel,
  MockLifeOpsServiceError,
} = vi.hoisted(() => ({
  mockCheckSenderPrivateAccess: vi.fn(),
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
  mockGetCalendarFeed: vi.fn(),
  mockGetNextCalendarEventContext: vi.fn(),
  mockCreateCalendarEvent: vi.fn(),
  mockUpdateCalendarEvent: vi.fn(),
  mockDeleteCalendarEvent: vi.fn(),
  mockUseModel: vi.fn(),
  MockLifeOpsServiceError: class extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "LifeOpsServiceError";
      this.status = status;
    }
  },
}));

vi.mock("@miladyai/shared/eliza-core-roles", () => ({
  checkSenderPrivateAccess: mockCheckSenderPrivateAccess,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    getGoogleConnectorStatus = mockGetGoogleConnectorStatus;
    getCalendarFeed = mockGetCalendarFeed;
    getNextCalendarEventContext = mockGetNextCalendarEventContext;
    createCalendarEvent = mockCreateCalendarEvent;
    updateCalendarEvent = mockUpdateCalendarEvent;
    deleteCalendarEvent = mockDeleteCalendarEvent;
  },
  LifeOpsServiceError: MockLifeOpsServiceError,
}));

import { calendarAction } from "./calendar";

const runtime = {
  agentId: "agent-1",
  useModel: mockUseModel,
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
} as never;

function getRuntime() {
  return runtime;
}

const stubRuntime = {
  agentId: "agent-1",
  useModel: () => {
    throw new Error("useModel not available in stub");
  },
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
} as never;

function msg(text: string, source = "client_chat") {
  return {
    entityId: "owner-1",
    content: { source, text },
  } as never;
}

function invoke(
  intent: string,
  extra: Record<string, unknown> = {},
  callback?: Parameters<NonNullable<typeof calendarAction.handler>>[4],
) {
  const { subaction, title, query, details } = extra;
  return calendarAction.handler?.(
    getRuntime(),
    msg(intent),
    {} as never,
    {
      parameters: {
        subaction,
        intent,
        title,
        query,
        details,
      },
    } as never,
    callback,
  );
}

describe("calendarAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue(null);
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
        "google.calendar.read",
        "google.calendar.write",
      ],
    });
    mockUseModel.mockResolvedValue(
      "<response><query1></query1><query2></query2><query3></query3></response>",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's feed", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-1",
          externalId: "ext-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Team sync",
          description: "",
          location: "Zoom",
          status: "confirmed",
          startAt: "2026-04-09T17:00:00.000Z",
          endAt: "2026-04-09T17:30:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: "https://meet.example.com/room",
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-04-10T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("what's on my calendar today");

    expect(mockGetCalendarFeed).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
    });
    expect(result?.text).toContain("Events today");
    expect(result?.text).toContain("Team sync");
  });

  it("repairs a bad requested subaction with an LLM calendar plan", async () => {
    mockUseModel.mockResolvedValue(
      '{"subaction":"search_events","queries":["dentist appointment"]}',
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-dentist",
          externalId: "ext-dentist",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment",
          description: "Routine cleaning",
          location: "Market Street Dental",
          status: "confirmed",
          startAt: "2026-04-12T17:00:00.000Z",
          endAt: "2026-04-12T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("what am i doing about the dentist", {
      subaction: "feed",
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
    expect(result?.text).toContain("matching calendar event");
    expect(result?.text).toContain("Dentist appointment");
  });

  it("replies instead of acting when the calendar planner marks a vague request as reply-only", async () => {
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        subaction: null,
        shouldAct: false,
        response:
          "What do you want to do on your calendar — check your schedule, find an event, or create one?",
        queries: [],
      }),
    );

    const result = await invoke("can you help me with my calendar?");

    expect(mockGetCalendarFeed).not.toHaveBeenCalled();
    expect(mockGetNextCalendarEventContext).not.toHaveBeenCalled();
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
    expect(mockUpdateCalendarEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: "What do you want to do on your calendar — check your schedule, find an event, or create one?",
      data: expect.objectContaining({
        noop: true,
      }),
    });
  });

  it("noops with a natural reply when calendar is invoked for a reminder request", async () => {
    const result = await calendarAction.handler?.(
      stubRuntime,
      msg("please set a reminder for friday 8pm pst to hug my wife"),
      {} as never,
      {
        parameters: {},
      } as never,
    );

    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: "That sounds like a reminder or todo rather than a calendar event. Tell me the reminder and when it should happen.",
      data: expect.objectContaining({
        noop: true,
      }),
    });
  });

  it("still executes an explicit calendar subaction even if the planner says reply-only", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-04-10T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("calendar today", { subaction: "feed" });

    expect(mockGetCalendarFeed).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });

  it("parses TOON response with || delimited queries from LLM plan", async () => {
    mockUseModel.mockResolvedValue(
      "subaction: search_events\nqueries: dentist || cleaning\ntitle:\ntripLocation:",
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-dentist-toon",
          externalId: "ext-dentist-toon",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist cleaning",
          description: "Routine cleaning",
          location: "Market Street Dental",
          status: "confirmed",
          startAt: "2026-04-12T17:00:00.000Z",
          endAt: "2026-04-12T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("when is my dentist cleaning", {
      subaction: "feed",
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
    expect(result?.text).toContain("Dentist cleaning");
  });

  it("uses timezone-aware tomorrow windows and replies through the action callback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T22:53:00-07:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-10T07:00:00.000Z",
      timeMax: "2026-04-11T07:00:00.000Z",
      syncedAt: "2026-04-10T05:53:00.000Z",
    });
    const callback = vi.fn().mockResolvedValue([]);

    const result = await invoke(
      "can you tell me what's on my schedule tomorrow",
      {
        details: {
          timeZone: "America/Los_Angeles",
        },
      },
      callback as never,
    );

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Los_Angeles",
        timeMin: "2026-04-10T07:00:00.000Z",
        timeMax: "2026-04-11T07:00:00.000Z",
      }),
    );
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "No events tomorrow.",
        source: "action",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: "No events tomorrow.",
    });
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });

  it("resolves weekday-only requests like 'on monday' to the correct local day window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T22:19:00-06:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-13T06:00:00.000Z",
      timeMax: "2026-04-14T06:00:00.000Z",
      syncedAt: "2026-04-12T04:19:00.000Z",
    });

    const result = await invoke(
      "hey eliza, what do i have going on on monday?",
      {
        details: {
          timeZone: "America/Denver",
        },
      },
    );

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Denver",
        timeMin: "2026-04-13T06:00:00.000Z",
        timeMax: "2026-04-14T06:00:00.000Z",
      }),
    );
    expect(result).toMatchObject({
      success: true,
    });
    expect(result?.text).toMatch(/No events on monday/i);
  });

  it("uses an LLM-planned window for non-English schedule questions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T22:19:00-06:00"));
    mockUseModel.mockResolvedValue(
      [
        "subaction: feed",
        "queries:",
        "title:",
        "tripLocation:",
        "timeMin: 2026-04-13T06:00:00.000Z",
        "timeMax: 2026-04-14T06:00:00.000Z",
        "windowLabel: el lunes",
      ].join("\n"),
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-13T06:00:00.000Z",
      timeMax: "2026-04-14T06:00:00.000Z",
      syncedAt: "2026-04-12T04:19:00.000Z",
    });

    const result = await invoke("que tengo el lunes?", {
      details: {
        timeZone: "America/Denver",
      },
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Denver",
        timeMin: "2026-04-13T06:00:00.000Z",
        timeMax: "2026-04-14T06:00:00.000Z",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("No events el lunes.");
  });

  it("resolves 'this weekend' to a weekend window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T22:19:00-06:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-11T06:00:00.000Z",
      timeMax: "2026-04-13T06:00:00.000Z",
      syncedAt: "2026-04-12T04:19:00.000Z",
    });

    const result = await invoke("what do i have this weekend?", {
      details: {
        timeZone: "America/Denver",
      },
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Denver",
        timeMin: "2026-04-11T06:00:00.000Z",
        timeMax: "2026-04-13T06:00:00.000Z",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("this weekend");
  });

  it("keeps 'this weekend' bounded to the remaining weekend on sunday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T10:00:00-06:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-12T06:00:00.000Z",
      timeMax: "2026-04-13T06:00:00.000Z",
      syncedAt: "2026-04-12T16:00:00.000Z",
    });

    const result = await invoke("what do i have this weekend?", {
      details: {
        timeZone: "America/Denver",
      },
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Denver",
        timeMin: "2026-04-12T06:00:00.000Z",
        timeMax: "2026-04-13T06:00:00.000Z",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("this weekend");
  });

  it("resolves 'tonight' to an evening-only window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T22:19:00-06:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-12T04:19:00.000Z",
      timeMax: "2026-04-12T06:00:00.000Z",
      syncedAt: "2026-04-12T04:19:00.000Z",
    });

    const result = await invoke("what do i have tonight?", {
      details: {
        timeZone: "America/Denver",
      },
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Denver",
        timeMin: "2026-04-12T04:19:00.000Z",
        timeMax: "2026-04-12T06:00:00.000Z",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("tonight");
  });

  it("resolves 'next month' to the next calendar month boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T22:19:00-06:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-05-01T06:00:00.000Z",
      timeMax: "2026-06-01T06:00:00.000Z",
      syncedAt: "2026-04-12T04:19:00.000Z",
    });

    const result = await invoke("what do i have next month?", {
      details: {
        timeZone: "America/Denver",
      },
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Denver",
        timeMin: "2026-05-01T06:00:00.000Z",
        timeMax: "2026-06-01T06:00:00.000Z",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("next month");
  });

  it("uses message text when intent param is omitted", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-04-10T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("what's on my calendar today"),
      {} as never,
      { parameters: {} } as never,
    );

    expect(mockGetCalendarFeed).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
    expect(result?.text).toContain("today");
  });

  it("allows owner access from discord", async () => {
    const valid = await calendarAction.validate?.(
      stubRuntime,
      msg("what flights do i have this week", "discord"),
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

    const valid = await calendarAction.validate?.(
      stubRuntime,
      {
        entityId: "mod-1",
        content: { source: "discord", text: "what's on my calendar today" },
      } as never,
      {} as never,
    );

    expect(valid).toBe(false);
  });

  it("validates a weak follow-up when recent messages carry calendar context", async () => {
    const valid = await calendarAction.validate?.(
      stubRuntime,
      msg("what about next week?"),
      {
        values: {
          recentMessages: [
            "user: what flights do i have this week?",
            "assistant: checking your calendar for flights this week",
            "user: what about next week?",
          ].join("\n"),
        },
      } as never,
    );

    expect(valid).toBe(true);
  });

  it("validates localized calendar follow-ups when recent context carries translated calendar terms", async () => {
    const valid = await calendarAction.validate?.(
      stubRuntime,
      msg("y la proxima semana?"),
      {
        values: {
          preferredLanguage: "es",
          recentMessages: [
            "user: que vuelos tengo esta semana?",
            "assistant: revisando tu calendario para esta semana",
          ].join("\n"),
        },
      } as never,
    );

    expect(valid).toBe(true);
  });

  it("does not validate a generic time question without calendar context", async () => {
    const valid = await calendarAction.validate?.(
      stubRuntime,
      msg("what time is it?"),
      {
        values: {
          recentMessages: [
            "user: hello there",
            "assistant: hi",
            "user: how are you?",
          ].join("\n"),
        },
      } as never,
    );

    expect(valid).toBe(false);
  });

  it("does not validate reminder-style requests that belong to LifeOps", async () => {
    const valid = await calendarAction.validate?.(
      stubRuntime,
      msg("please set a reminder for friday 8pm pst to hug my wife"),
      {} as never,
    );

    expect(valid).toBe(false);
  });

  it("validates availability-style timing questions with the expanded keyword set", async () => {
    const valid = await calendarAction.validate?.(
      stubRuntime,
      msg("am i free later this week or busy earlier next year?"),
      {} as never,
    );

    expect(valid).toBe(true);
  });

  it("only uses the most recent 12 messages for calendar validation context", async () => {
    const recentMessages = [
      "user: check my flight to denver",
      ...Array.from(
        { length: 12 },
        (_, index) => `user: generic message ${index + 1}`,
      ),
    ].join("\n");

    const valid = await calendarAction.validate?.(
      stubRuntime,
      msg("what about next week?"),
      {
        values: {
          recentMessages,
        },
      } as never,
    );

    expect(valid).toBe(false);
  });

  it("returns the next event context", async () => {
    mockGetNextCalendarEventContext.mockResolvedValue({
      event: {
        id: "evt-2",
        externalId: "ext-2",
        agentId: "agent-1",
        provider: "google",
        side: "owner",
        calendarId: "primary",
        title: "Product review",
        description: "",
        location: "Conference room",
        status: "confirmed",
        startAt: "2026-04-09T20:00:00.000Z",
        endAt: "2026-04-09T21:00:00.000Z",
        isAllDay: false,
        timezone: "UTC",
        htmlLink: null,
        conferenceLink: null,
        organizer: null,
        attendees: [],
        metadata: {},
        syncedAt: "2026-04-09T18:00:00.000Z",
        updatedAt: "2026-04-09T18:00:00.000Z",
      },
      startsAt: "2026-04-09T20:00:00.000Z",
      startsInMinutes: 30,
      attendeeCount: 0,
      attendeeNames: [],
      location: "Conference room",
      conferenceLink: null,
      preparationChecklist: ["review notes"],
      linkedMailState: "cache",
      linkedMailError: null,
      linkedMail: [],
    });

    const result = await invoke("what's my next meeting", {
      subaction: "next_event",
    });

    expect(mockGetNextCalendarEventContext).toHaveBeenCalledTimes(1);
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Next event: Product review");
    expect(result?.text).toContain("review notes");
  });

  it("searches calendar events by keyword", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-1",
          externalId: "ext-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment",
          description: "cavity filling consult",
          location: "Main St Dental",
          status: "confirmed",
          startAt: "2026-04-12T18:00:00.000Z",
          endAt: "2026-04-12T19:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-2",
          externalId: "ext-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Workout",
          description: "",
          location: "Gym",
          status: "confirmed",
          startAt: "2026-04-10T18:00:00.000Z",
          endAt: "2026-04-10T19:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("find my dentist appointment", {
      subaction: "search_events",
      query: "dentist",
    });

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Dentist appointment");
    expect(result?.text).not.toContain("Workout");
  });

  it("extracts multiple search queries from recent conversation when query params are missing", async () => {
    mockUseModel.mockResolvedValue(
      "<response><query1>april 12</query1><query2>dentist</query2><query3>april 12</query3></response>",
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-dentist",
          externalId: "ext-dentist",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment",
          description: "cavity filling consult",
          location: "Main St Dental",
          status: "confirmed",
          startAt: "2026-04-12T18:00:00.000Z",
          endAt: "2026-04-12T19:00:00.000Z",
          isAllDay: false,
          timezone: "America/Los_Angeles",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-other-day",
          externalId: "ext-other-day",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Workout",
          description: "",
          location: "Gym",
          status: "confirmed",
          startAt: "2026-04-13T18:00:00.000Z",
          endAt: "2026-04-13T19:00:00.000Z",
          isAllDay: false,
          timezone: "America/Los_Angeles",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("what event do i have on april 12"),
      {
        values: {
          recentMessages:
            "user: hey eliza can you tell me what event i have on april 12\nassistant: checking your calendar for april 12th",
        },
        data: {},
      } as never,
      {
        parameters: {
          subaction: "search_events",
        },
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Dentist appointment");
    expect(result?.text).not.toContain("Workout");
    expect(result?.data).toMatchObject({
      query: "april 12",
    });
    expect(result?.data?.queries).toEqual(
      expect.arrayContaining(["april 12", "dentist"]),
    );
  });

  it("recovers a flight search from recent conversation on confirmation turns", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-stay",
          externalId: "ext-stay",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Stay at Fairfield by Marriott Inn & Suites Boulder",
          description: "",
          location: "Boulder",
          status: "confirmed",
          startAt: "2026-04-09T00:00:00.000Z",
          endAt: "2026-04-10T00:00:00.000Z",
          isAllDay: true,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-flight",
          externalId: "ext-flight",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to Denver (WN 3677)",
          description: "",
          location: "San Francisco SFO",
          status: "confirmed",
          startAt: "2026-04-11T21:25:00.000Z",
          endAt: "2026-04-12T00:05:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-04-16T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("yes"),
      {
        values: {
          recentMessages:
            "user: do i have any flights this week\nassistant: want me to look for flight events in your calendar?\nuser: yes",
        },
        data: {},
      } as never,
      {
        parameters: {},
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Flight to Denver");
    expect(result?.text).not.toContain("Fairfield");
  });

  it("recovers travel search context from a vague follow-up about next week", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-hotel",
          externalId: "ext-hotel",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Stay at Fairfield by Marriott Inn & Suites Boulder",
          description: "",
          location: "Boulder",
          status: "confirmed",
          startAt: "2026-04-17T00:00:00.000Z",
          endAt: "2026-04-18T00:00:00.000Z",
          isAllDay: true,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-return",
          externalId: "ext-return",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to San Francisco (WN 2287)",
          description: "return to SFO",
          location: "Denver DEN",
          status: "confirmed",
          startAt: "2026-04-18T20:10:00.000Z",
          endAt: "2026-04-18T22:55:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-16T07:00:00.000Z",
      timeMax: "2026-04-23T07:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("yeah, probably next week?"),
      {
        values: {
          recentMessages:
            "user: when do i fly back from denver?\nassistant: i don’t see a return flight in your calendar. do you have one scheduled?\nuser: yeah, probably next week?",
        },
        data: {},
      } as never,
      {
        parameters: {},
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Flight to San Francisco");
    expect(result?.text).not.toContain("Fairfield");
  });

  it("combines recent calendar context with a 'what about next week' refinement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T22:53:00-07:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-return",
          externalId: "ext-return",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to San Francisco (WN 2287)",
          description: "return to SFO",
          location: "Denver DEN",
          status: "confirmed",
          startAt: "2026-04-18T20:10:00.000Z",
          endAt: "2026-04-18T22:55:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-16T07:00:00.000Z",
      timeMax: "2026-04-23T07:00:00.000Z",
      syncedAt: "2026-04-10T05:53:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("what about next week?"),
      {
        values: {
          recentMessages:
            'user: do i have any flights this week?\nassistant: Found 1 calendar event for "flight" this week:\n- **Flight to Denver (WN 3677)** (Apr 11, 2:25 PM)\nuser: what about next week?',
        },
        data: {},
      } as never,
      {
        parameters: {
          details: {
            timeZone: "America/Los_Angeles",
          },
        },
      } as never,
    );

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Los_Angeles",
        timeMin: "2026-04-16T07:00:00.000Z",
        timeMax: "2026-04-23T07:00:00.000Z",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Flight to San Francisco");
    expect(result?.text).not.toContain("Flight to Denver");
    expect(result?.data).toMatchObject({
      query: "flight",
    });
  });

  it("keeps schedule questions in feed mode instead of inferring create_event", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T22:53:00-07:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "2026-04-10T07:00:00.000Z",
      timeMax: "2026-04-11T07:00:00.000Z",
      syncedAt: "2026-04-10T05:53:00.000Z",
    });

    const result = await invoke("what's on my schedule tomorrow?");

    expect(result?.success).toBe(true);
    expect(mockGetCalendarFeed).toHaveBeenCalledTimes(1);
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });

  it("finds the return flight when the user asks when they fly back from Denver", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-outbound",
          externalId: "ext-outbound",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to Denver (WN 3677)",
          description: "",
          location: "San Francisco SFO",
          status: "confirmed",
          startAt: "2026-04-11T21:25:00.000Z",
          endAt: "2026-04-12T00:05:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-return",
          externalId: "ext-return",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to San Francisco (WN 2287)",
          description: "return to SFO",
          location: "Denver DEN",
          status: "confirmed",
          startAt: "2026-04-18T20:10:00.000Z",
          endAt: "2026-04-18T22:55:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("when do i fly back from denver?");

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Flight to San Francisco");
    expect(result?.text).not.toContain("Flight to Denver");
  });

  it("builds a trip itinerary for while-you-are-in-Denver questions", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-outbound",
          externalId: "ext-outbound",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to Denver (WN 3677)",
          description: "",
          location: "San Francisco SFO",
          status: "confirmed",
          startAt: "2026-04-10T21:25:00.000Z",
          endAt: "2026-04-11T00:05:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-hike",
          externalId: "ext-hike",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Rocky Mountain National Park day hike",
          description: "",
          location: "Estes Park",
          status: "confirmed",
          startAt: "2026-04-12T14:00:00.000Z",
          endAt: "2026-04-12T23:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-meetup",
          externalId: "ext-meetup",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Meetup: Denver Tech Coffee",
          description: "",
          location: "Denver",
          status: "confirmed",
          startAt: "2026-04-14T15:00:00.000Z",
          endAt: "2026-04-14T16:30:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-return",
          externalId: "ext-return",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight home (WN 2589)",
          description: "",
          location: "Denver DEN",
          status: "confirmed",
          startAt: "2026-04-17T19:45:00.000Z",
          endAt: "2026-04-17T22:30:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-unrelated",
          externalId: "ext-unrelated",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment",
          description: "",
          location: "San Francisco",
          status: "confirmed",
          startAt: "2026-04-20T18:00:00.000Z",
          endAt: "2026-04-20T19:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-06-08T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke(
      "hey eliza can you tell me what events i have coming up while i'm in denver?",
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("while you're in denver");
    expect(result?.text).toContain("Flight to Denver");
    expect(result?.text).toContain("Rocky Mountain National Park day hike");
    expect(result?.text).toContain("Denver Tech Coffee");
    expect(result?.text).toContain("Flight home");
    expect(result?.text).not.toContain("Dentist appointment");
    expect(result?.text).not.toContain('Found 1 calendar event for "denver"');
  });

  it("prefers the current return-flight question over an older flights-this-week search", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-outbound",
          externalId: "ext-outbound",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to Denver (WN 3677)",
          description: "",
          location: "San Francisco SFO",
          status: "confirmed",
          startAt: "2026-04-11T21:25:00.000Z",
          endAt: "2026-04-12T00:05:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-return",
          externalId: "ext-return",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to San Francisco (WN 2287)",
          description: "return to SFO",
          location: "Denver DEN",
          status: "confirmed",
          startAt: "2026-04-18T20:10:00.000Z",
          endAt: "2026-04-18T22:55:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("when do i fly back from denver?"),
      {
        values: {
          recentMessages:
            "user: do i have any flights this week?\nassistant: checking your calendar for flights this week",
        },
        data: {},
      } as never,
      {
        parameters: {},
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Flight to San Francisco");
    expect(result?.text).not.toContain("Flight to Denver");
  });

  it("searches both next week and the week after for ambiguous return-flight requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T22:53:00-07:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "synced",
      timeMin: "2026-04-16T07:00:00.000Z",
      timeMax: "2026-04-30T07:00:00.000Z",
      syncedAt: "2026-04-10T05:53:00.000Z",
    });

    await invoke("try to find my return flight next week or the week after", {
      details: {
        timeZone: "America/Los_Angeles",
      },
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Los_Angeles",
        timeMin: "2026-04-16T07:00:00.000Z",
        timeMax: "2026-04-30T07:00:00.000Z",
      }),
    );
  });

  it("ignores schema-shaped garbage in query params and falls back to the itinerary intent", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-return",
          externalId: "ext-return",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to San Francisco (WN 2287)",
          description: "return to SFO",
          location: "Denver DEN",
          status: "confirmed",
          startAt: "2026-04-18T20:10:00.000Z",
          endAt: "2026-04-18T22:55:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("when do i fly back from denver?"),
      {} as never,
      {
        parameters: {
          subaction: "search_events",
          query:
            "actions.; query?:string - keyword query for search_events. match against titles, descriptions, locations, and attendees.; details?:object - structured calendar arguments. supported keys include mode, side, calendarid, timemin, timemax, timezone, forcesync, windowdays, label, description, location, startat, endat, durationminutes, windowpreset, and attendees",
        },
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Flight to San Francisco");
    expect(result?.text).not.toContain("keyword query for search_events");
    expect(result?.text).not.toContain("supported keys include");
  });

  it("ignores narrative calendar query params and falls back to the inferred search query", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-flight",
          externalId: "ext-flight",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to Denver (WN 3677)",
          description: "",
          location: "San Francisco SFO",
          status: "confirmed",
          startAt: "2026-04-11T21:25:00.000Z",
          endAt: "2026-04-12T00:05:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-dentist",
          externalId: "ext-dentist",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment",
          description: "",
          location: "Main St Dental",
          status: "confirmed",
          startAt: "2026-04-12T18:00:00.000Z",
          endAt: "2026-04-12T19:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg(
        "can you search my calendar and tell me if i have any flights to denver?",
      ),
      {} as never,
      {
        parameters: {
          subaction: "search_events",
          query:
            "can you search my calendar and tell me if i have any flights to denver?",
        },
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Flight to Denver");
    expect(result?.text).not.toContain("Dentist appointment");
    expect(result?.data).toMatchObject({
      query: "flight denver",
    });
  });

  it("does not claim a weak generic overlap is a direct named calendar match", async () => {
    mockUseModel.mockImplementation(
      async (_model, input: { prompt?: string }) => {
        if (
          input.prompt?.includes(
            "Decide which candidate calendar events directly match the user's request.",
          )
        ) {
          return "matchIds:";
        }
        return "<response><query1></query1><query2></query2><query3></query3></response>";
      },
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-flight",
          externalId: "ext-flight",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to San Francisco (WN 2589)",
          description: "flight with early boarding and lounge access",
          location: "Denver DEN",
          status: "confirmed",
          startAt: "2026-04-17T19:45:00.000Z",
          endAt: "2026-04-17T22:10:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-13T00:00:00.000Z",
      timeMax: "2026-04-20T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("so what events do i have with medicinal mindfulness this week?"),
      {} as never,
      {
        parameters: {
          subaction: "search_events",
          query: "with medicinal mindfulness",
        },
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain(
      'No calendar events matched "with medicinal mindfulness" this week.',
    );
    expect(result?.text).not.toContain("Flight to San Francisco");
  });

  it("uses LLM grounding to keep the direct named event instead of a weak flight overlap", async () => {
    mockUseModel.mockImplementation(
      async (_model, input: { prompt?: string }) => {
        if (
          input.prompt?.includes(
            "Decide which candidate calendar events directly match the user's request.",
          )
        ) {
          return "matchIds: evt-mm";
        }
        return "<response><query1></query1><query2></query2><query3></query3></response>";
      },
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-flight",
          externalId: "ext-flight",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to San Francisco (WN 2589)",
          description: "flight with early boarding and lounge access",
          location: "Denver DEN",
          status: "confirmed",
          startAt: "2026-04-17T19:45:00.000Z",
          endAt: "2026-04-17T22:10:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-mm",
          externalId: "ext-mm",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Weekly sync",
          description: "Check-in with the Medicinal Mindfulness team",
          location: "Zoom",
          status: "confirmed",
          startAt: "2026-04-16T18:00:00.000Z",
          endAt: "2026-04-16T18:30:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-13T00:00:00.000Z",
      timeMax: "2026-04-20T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("so what events do i have with medicinal mindfulness this week?"),
      {} as never,
      {
        parameters: {
          subaction: "search_events",
          query: "with medicinal mindfulness",
        },
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Weekly sync");
    expect(result?.text).not.toContain("Flight to San Francisco");
  });

  it("falls back to an LLM-extracted calendar query when a non-English params.query is just the echoed request", async () => {
    mockUseModel.mockResolvedValue(
      '{"subaction":"search_events","queries":["flight denver"]}',
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-flight",
          externalId: "ext-flight",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to Denver (WN 3677)",
          description: "",
          location: "San Francisco SFO",
          status: "confirmed",
          startAt: "2026-04-11T21:25:00.000Z",
          endAt: "2026-04-12T00:05:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-dentist",
          externalId: "ext-dentist",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment",
          description: "",
          location: "Main St Dental",
          status: "confirmed",
          startAt: "2026-04-12T18:00:00.000Z",
          endAt: "2026-04-12T19:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const request =
      "puedes buscar en mi calendario y decirme si tengo un vuelo a denver";
    const result = await calendarAction.handler?.(
      getRuntime(),
      msg(request),
      {} as never,
      {
        parameters: {
          subaction: "search_events",
          query: request,
        },
      } as never,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Flight to Denver");
    expect(result?.text).not.toContain("Dentist appointment");
    expect(result?.data).toMatchObject({
      query: "flight denver",
    });
  });

  it("only emits one grounded callback payload for a calendar answer", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-1",
          externalId: "ext-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to Denver (WN 3677)",
          description: "",
          location: "San Francisco SFO",
          status: "confirmed",
          startAt: "2026-04-11T21:25:00.000Z",
          endAt: "2026-04-12T00:05:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-04-10T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });
    const callback = vi.fn().mockResolvedValue([]);

    const result = await invoke(
      "do i have any flights this week",
      {},
      callback as never,
    );

    expect(result?.success).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: result?.text,
        source: "action",
      }),
    );
  });

  it("routes a non-English create request through the calendar LLM plan", async () => {
    mockUseModel.mockImplementation(async (_modelType, params) => {
      const prompt = String(params?.prompt ?? "");
      if (prompt.includes("Plan the calendar action for this request.")) {
        return '{"subaction":"create_event","title":"Cita con el dentista"}';
      }
      if (
        prompt.includes(
          "Extract calendar event creation fields from the request.",
        )
      ) {
        return "<response><title>Cita con el dentista</title><startAt>2026-04-10T22:00:00.000Z</startAt><endAt>2026-04-10T23:00:00.000Z</endAt><location>Main St Dental</location></response>";
      }
      return "<response></response>";
    });
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-spanish-create",
      externalId: "ext-spanish-create",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Cita con el dentista",
      description: "",
      location: "Main St Dental",
      status: "confirmed",
      startAt: "2026-04-10T22:00:00.000Z",
      endAt: "2026-04-10T23:00:00.000Z",
      isAllDay: false,
      timezone: "UTC",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-09T16:00:00.000Z",
      updatedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke(
      "mañana agrega una cita con el dentista a las 3pm",
    );

    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        title: "Cita con el dentista",
        location: "Main St Dental",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Created calendar event");
  });

  it("creates events when calendar write is granted", async () => {
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-3",
      externalId: "ext-3",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Dentist appointment",
      description: "",
      location: "Main St Dental",
      status: "confirmed",
      startAt: "2026-04-10T22:00:00.000Z",
      endAt: "2026-04-10T23:00:00.000Z",
      isAllDay: false,
      timezone: "UTC",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-09T16:00:00.000Z",
      updatedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("create a dentist appointment tomorrow", {
      subaction: "create_event",
      title: "Dentist appointment",
      details: {
        startAt: "2026-04-10T22:00:00.000Z",
        endAt: "2026-04-10T23:00:00.000Z",
        location: "Main St Dental",
      },
    });

    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        title: "Dentist appointment",
        location: "Main St Dental",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Created calendar event");
  });

  it("infers missing create-event title and timing fields from the intent", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
      ],
    });
    mockUseModel.mockResolvedValue(
      "<response><title>Dentist appointment</title><windowPreset>tomorrow_afternoon</windowPreset><durationMinutes>60</durationMinutes><location>Main St Dental</location></response>",
    );
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-4",
      externalId: "ext-4",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Dentist appointment",
      description: "",
      location: "Main St Dental",
      status: "confirmed",
      startAt: "2026-04-10T22:00:00.000Z",
      endAt: "2026-04-10T23:00:00.000Z",
      isAllDay: false,
      timezone: "UTC",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-09T16:00:00.000Z",
      updatedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke(
      "create a dentist appointment tomorrow afternoon",
      {
        subaction: "create_event",
        details: {},
      },
    );

    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Dentist appointment",
        location: "Main St Dental",
        windowPreset: "tomorrow_afternoon",
        durationMinutes: 60,
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("includes the full recent conversation in create-event extraction prompts", async () => {
    const recentMessages = [
      "user: first context line about lunch with Mira",
      "assistant: noted",
      "user: second context line about keeping it in Silver Lake",
      "assistant: noted",
      "user: third context line",
      "assistant: noted",
      "user: fourth context line",
      "assistant: noted",
      "user: fifth context line",
      "assistant: noted",
      "user: sixth context line",
      "assistant: noted",
      "user: seventh context line",
      "assistant: noted",
      "user: eighth context line",
      "assistant: noted",
      "user: ninth context line",
      "assistant: noted",
      "user: tenth context line",
      "assistant: noted",
    ].join("\n");
    mockUseModel.mockImplementation(
      async (_model, input: { prompt?: string }) => {
        if (
          input.prompt?.includes(
            "Extract calendar event creation fields from the request.",
          )
        ) {
          expect(input.prompt).toContain(
            "first context line about lunch with Mira",
          );
          expect(input.prompt).toContain("tenth context line");
          return "<response><title>Lunch with Mira</title><startAt>2026-04-11T19:00:00.000Z</startAt></response>";
        }
        return '{"subaction":"create_event","title":"Lunch with Mira"}';
      },
    );
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-full-convo",
      externalId: "ext-full-convo",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Lunch with Mira",
      description: "",
      location: "",
      status: "confirmed",
      startAt: "2026-04-11T19:00:00.000Z",
      endAt: "2026-04-11T20:00:00.000Z",
      isAllDay: false,
      timezone: "UTC",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
    });

    const result = await calendarAction.handler?.(
      getRuntime(),
      msg("make that lunch tomorrow at noon"),
      {
        values: {
          recentMessages,
        },
      } as never,
      {
        parameters: {
          subaction: "create_event",
          intent: "make that lunch tomorrow at noon",
        },
      } as never,
    );

    expect(result?.success).toBe(true);
  });

  it("includes the next two weeks of calendar context and timezone in create-event extraction prompts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T22:53:00-06:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-context-1",
          externalId: "ext-context-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Design review",
          description: "",
          location: "Studio",
          status: "confirmed",
          startAt: "2026-04-10T16:00:00.000Z",
          endAt: "2026-04-10T17:00:00.000Z",
          isAllDay: false,
          timezone: "America/Denver",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T06:00:00.000Z",
      timeMax: "2026-04-23T06:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });
    mockUseModel.mockImplementation(
      async (_model, input: { prompt?: string }) => {
        const prompt = String(input.prompt ?? "");
        if (
          prompt.includes(
            "Extract calendar event creation fields from the request.",
          )
        ) {
          expect(prompt).toContain(
            "Calendar timezone for scheduling: America/Denver",
          );
          expect(prompt).toContain("<calendar_context>");
          expect(prompt).toContain(
            "Context window: 2026-04-09T06:00:00.000Z to 2026-04-23T06:00:00.000Z",
          );
          expect(prompt).toContain("Design review");
          return "<response><title>Lunch with Mira</title><startAt>2026-04-10T19:00:00.000Z</startAt></response>";
        }
        return '{"subaction":"create_event","title":"Lunch with Mira"}';
      },
    );
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-context-create",
      externalId: "ext-context-create",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Lunch with Mira",
      description: "",
      location: "",
      status: "confirmed",
      startAt: "2026-04-10T19:00:00.000Z",
      endAt: "2026-04-10T20:00:00.000Z",
      isAllDay: false,
      timezone: "America/Denver",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-09T16:00:00.000Z",
      updatedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("make that lunch friday", {
      subaction: "create_event",
      details: {
        timeZone: "America/Denver",
      },
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        timeZone: "America/Denver",
        timeMin: "2026-04-09T06:00:00.000Z",
        timeMax: "2026-04-23T06:00:00.000Z",
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("uses the resolved request timezone when create-event context loading fails", async () => {
    mockGetCalendarFeed.mockRejectedValue(
      new Error("calendar context offline"),
    );
    mockUseModel.mockImplementation(
      async (_model, input: { prompt?: string }) => {
        const prompt = String(input.prompt ?? "");
        if (
          prompt.includes(
            "Extract calendar event creation fields from the request.",
          )
        ) {
          expect(prompt).toContain("Current timezone: America/New_York");
          expect(prompt).toContain(
            "Calendar timezone for scheduling: America/New_York",
          );
          expect(prompt).toContain("(calendar context unavailable)");
          return "<response><title>Lunch with Mira</title><startAt>2026-04-10T16:00:00.000Z</startAt></response>";
        }
        return '{"subaction":"create_event","title":"Lunch with Mira"}';
      },
    );
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-timezone-fallback",
      externalId: "ext-timezone-fallback",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Lunch with Mira",
      description: "",
      location: "",
      status: "confirmed",
      startAt: "2026-04-10T16:00:00.000Z",
      endAt: "2026-04-10T17:00:00.000Z",
      isAllDay: false,
      timezone: "America/New_York",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-09T16:00:00.000Z",
      updatedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("make that lunch friday", {
      subaction: "create_event",
      details: {
        timeZone: "America/New_York",
      },
    });

    expect(mockGetCalendarFeed).toHaveBeenCalled();
    expect(result?.success).toBe(true);
  });

  it("suggests a likely time when the day is clear but no exact time was given", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T09:00:00-06:00"));
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-guess-1",
          externalId: "ext-guess-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Team sync",
          description: "",
          location: "Zoom",
          status: "confirmed",
          startAt: "2026-04-10T16:00:00.000Z",
          endAt: "2026-04-10T17:00:00.000Z",
          isAllDay: false,
          timezone: "America/Denver",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T06:00:00.000Z",
      timeMax: "2026-04-23T06:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });
    mockUseModel.mockImplementation(
      async (_model, input: { prompt?: string }) => {
        if (
          String(input.prompt ?? "").includes(
            "Extract calendar event creation fields from the request.",
          )
        ) {
          return "<response><title>give my wife a hug</title></response>";
        }
        return '{"subaction":"create_event","title":"give my wife a hug"}';
      },
    );

    const result = await invoke("create give my wife a hug friday", {
      subaction: "create_event",
      title: "give my wife a hug",
      details: {
        timeZone: "America/Denver",
      },
    });

    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
    });
    expect(result?.text).toContain(
      'i can tentatively put "give my wife a hug"',
    );
    expect(result?.text).toContain("Apr 10, 7:00 PM MDT");
  });

  it("retries create-event extraction once with the failure reason and repaired fields", async () => {
    mockUseModel.mockImplementation(
      async (_modelType, params: { prompt?: string }) => {
        const prompt = String(params?.prompt ?? "");
        if (
          prompt.includes(
            "The previous create attempt failed. Repair the extraction so the next create attempt succeeds.",
          )
        ) {
          expect(prompt).toContain("endAt must be later than startAt");
          return "<response><endAt>2026-04-10T23:00:00.000Z</endAt></response>";
        }
        if (
          prompt.includes(
            "Extract calendar event creation fields from the request.",
          )
        ) {
          return "<response><title>Dentist appointment</title><startAt>2026-04-10T22:00:00.000Z</startAt><endAt>2026-04-10T21:00:00.000Z</endAt><location>Main St Dental</location></response>";
        }
        return '{"subaction":"create_event","title":"Dentist appointment"}';
      },
    );
    mockCreateCalendarEvent
      .mockRejectedValueOnce(
        new MockLifeOpsServiceError(400, "endAt must be later than startAt"),
      )
      .mockResolvedValueOnce({
        id: "evt-repaired-create",
        externalId: "ext-repaired-create",
        agentId: "agent-1",
        provider: "google",
        side: "owner",
        calendarId: "primary",
        title: "Dentist appointment",
        description: "",
        location: "Main St Dental",
        status: "confirmed",
        startAt: "2026-04-10T22:00:00.000Z",
        endAt: "2026-04-10T23:00:00.000Z",
        isAllDay: false,
        timezone: "UTC",
        htmlLink: null,
        conferenceLink: null,
        organizer: null,
        attendees: [],
        metadata: {},
        syncedAt: "2026-04-09T16:00:00.000Z",
        updatedAt: "2026-04-09T16:00:00.000Z",
      });

    const result = await invoke("create a dentist appointment tomorrow", {
      subaction: "create_event",
      details: {},
    });

    expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(2);
    expect(mockCreateCalendarEvent).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        title: "Dentist appointment",
        startAt: "2026-04-10T22:00:00.000Z",
        endAt: "2026-04-10T21:00:00.000Z",
      }),
    );
    expect(mockCreateCalendarEvent).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        title: "Dentist appointment",
        startAt: "2026-04-10T22:00:00.000Z",
        endAt: "2026-04-10T23:00:00.000Z",
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("repairs non-positive extracted durations for prep-style events", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
      ],
    });
    mockUseModel.mockResolvedValue(
      "<response><title>Get ready for flight</title><startAt>2026-04-10T19:00:00.000Z</startAt><durationMinutes>0</durationMinutes></response>",
    );
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-6",
      externalId: "ext-6",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Get ready for flight",
      description: "",
      location: "",
      status: "confirmed",
      startAt: "2026-04-10T19:00:00.000Z",
      endAt: "2026-04-10T19:15:00.000Z",
      isAllDay: false,
      timezone: "UTC",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
    });

    const result = await invoke(
      "i want an event to get ready for flight tomorrow at noon",
      {
        subaction: "create_event",
        details: {},
      },
    );

    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Get ready for flight",
        startAt: "2026-04-10T19:00:00.000Z",
        durationMinutes: 15,
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Created calendar event");
  });

  it("normalizes lowercase detail aliases for create-event fields", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
      ],
    });
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-5",
      externalId: "ext-5",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Coffee with Mira",
      description: "Talk through next week.",
      location: "Cafe",
      status: "confirmed",
      startAt: "2026-04-05T21:00:00.000Z",
      endAt: "2026-04-05T22:30:00.000Z",
      isAllDay: false,
      timezone: "America/Los_Angeles",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-09T16:00:00.000Z",
      updatedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("create coffee with mira", {
      subaction: "create_event",
      details: {
        title: "Coffee with Mira",
        startat: "2026-04-05T21:00:00.000Z",
        endat: "2026-04-05T22:30:00.000Z",
        timezone: "America/Los_Angeles",
        calendarid: "primary",
        location: "Cafe",
        description: "Talk through next week.",
      },
    });

    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        title: "Coffee with Mira",
        calendarId: "primary",
        startAt: "2026-04-05T21:00:00.000Z",
        endAt: "2026-04-05T22:30:00.000Z",
        timeZone: "America/Los_Angeles",
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("formats create confirmations in the event timezone instead of the host timezone", async () => {
    mockCreateCalendarEvent.mockResolvedValue({
      id: "evt-hug",
      externalId: "ext-hug",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "give my wife a hug",
      description: "",
      location: "",
      status: "confirmed",
      startAt: "2026-04-18T02:00:00.000Z",
      endAt: "2026-04-18T02:15:00.000Z",
      isAllDay: false,
      timezone: "America/Denver",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-09T16:00:00.000Z",
      updatedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("create give my wife a hug tomorrow at 8pm", {
      subaction: "create_event",
      title: "give my wife a hug",
      details: {
        startAt: "2026-04-17T20:00:00",
        endAt: "2026-04-17T20:15:00",
        timeZone: "America/Denver",
      },
    });

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("give my wife a hug");
    expect(result?.text).toContain("Apr 17, 8:00 PM MDT");
    expect(result?.text).not.toContain("2:00:00 AM");
  });

  it("turns raw calendar datetime validator errors into a natural reply", async () => {
    mockCreateCalendarEvent.mockRejectedValue(
      new MockLifeOpsServiceError(
        400,
        `DateTime "2026-04-18T03:00:00.000Z" has a UTC 'Z' suffix but timeZone "America/Los_Angeles" was also provided.`,
      ),
    );

    const result = await calendarAction.handler?.(
      stubRuntime,
      msg("create hug my wife friday at 8pm pacific"),
      {} as never,
      {
        parameters: {
          subaction: "create_event",
          details: {
            title: "hug my wife",
            startAt: "2026-04-18T03:00:00.000Z",
            endAt: "2026-04-18T03:15:00.000Z",
            timeZone: "America/Los_Angeles",
          },
        },
      } as never,
    );

    expect(result).toMatchObject({
      success: false,
      text: `I couldn't pin down the event time from "create hug my wife friday at 8pm pacific". Tell me the date and time again in plain language, like "Friday at 8 pm Pacific."`,
    });
  });

  it("inherits the matched event timezone for updates and grounds the LLM on the target event", async () => {
    mockUseModel.mockImplementation(
      async (_modelType, params: { prompt?: string }) => {
        const prompt = String(params?.prompt ?? "");
        if (
          prompt.includes(
            "Extract calendar event update fields from the request.",
          )
        ) {
          expect(prompt).toContain("Current timezone: Asia/Tokyo");
          expect(prompt).toContain("Tokyo dinner");
          return "<response><startAt>2026-04-12T20:00:00</startAt></response>";
        }
        return "<response></response>";
      },
    );
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-tokyo-dinner",
          externalId: "ext-tokyo-dinner",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Tokyo dinner",
          description: "Dinner near Shibuya",
          location: "Shibuya",
          status: "confirmed",
          startAt: "2026-04-12T10:00:00.000Z",
          endAt: "2026-04-12T11:30:00.000Z",
          isAllDay: false,
          timezone: "Asia/Tokyo",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });
    mockUpdateCalendarEvent.mockResolvedValue({
      id: "evt-tokyo-dinner",
      externalId: "ext-tokyo-dinner",
      agentId: "agent-1",
      provider: "google",
      side: "owner",
      calendarId: "primary",
      title: "Tokyo dinner",
      description: "Dinner near Shibuya",
      location: "Shibuya",
      status: "confirmed",
      startAt: "2026-04-12T11:00:00.000Z",
      endAt: "2026-04-12T12:30:00.000Z",
      isAllDay: false,
      timezone: "Asia/Tokyo",
      htmlLink: null,
      conferenceLink: null,
      organizer: null,
      attendees: [],
      metadata: {},
      syncedAt: "2026-04-09T16:00:00.000Z",
      updatedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("move tokyo dinner to 8pm", {
      subaction: "update_event",
      title: "Tokyo dinner",
      details: {},
    });

    expect(mockUpdateCalendarEvent).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        eventId: "ext-tokyo-dinner",
        calendarId: "primary",
        startAt: "2026-04-12T20:00:00",
        timeZone: "Asia/Tokyo",
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("asks for clarification instead of updating the first colliding title match", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-dentist-1",
          externalId: "ext-dentist-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment",
          description: "",
          location: "Main St",
          status: "confirmed",
          startAt: "2026-04-12T17:00:00.000Z",
          endAt: "2026-04-12T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-dentist-2",
          externalId: "ext-dentist-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment follow-up",
          description: "",
          location: "Main St",
          status: "confirmed",
          startAt: "2026-04-13T17:00:00.000Z",
          endAt: "2026-04-13T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("move dentist appointment to 8pm", {
      subaction: "update_event",
      title: "Dentist appointment",
      details: {},
    });

    expect(mockUpdateCalendarEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
    expect(result?.text).toContain("multiple events");
    expect(result?.text).toContain("Dentist appointment");
  });

  it("asks for clarification instead of deleting the first colliding title match", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-flight-1",
          externalId: "ext-flight-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to LA",
          description: "",
          location: "JFK",
          status: "confirmed",
          startAt: "2026-04-12T17:00:00.000Z",
          endAt: "2026-04-12T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-flight-2",
          externalId: "ext-flight-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to LA return",
          description: "",
          location: "LAX",
          status: "confirmed",
          startAt: "2026-04-15T17:00:00.000Z",
          endAt: "2026-04-15T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("delete flight to la", {
      subaction: "delete_event",
      title: "Flight to LA",
      details: {},
    });

    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
    expect(result?.text).toContain("multiple events");
    expect(result?.text).toContain("Flight to LA");
  });

  it("does not leak raw delete errors when a delete-all request partially fails", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-dentist-1",
          externalId: "ext-dentist-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment",
          description: "",
          location: "Main St",
          status: "confirmed",
          startAt: "2026-04-12T17:00:00.000Z",
          endAt: "2026-04-12T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-dentist-2",
          externalId: "ext-dentist-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Dentist appointment copy",
          description: "",
          location: "Main St",
          status: "confirmed",
          startAt: "2026-04-13T17:00:00.000Z",
          endAt: "2026-04-13T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });
    mockUseModel.mockImplementation(async (_model, input) => {
      const prompt =
        input && typeof input === "object" && "prompt" in input
          ? String((input as { prompt?: unknown }).prompt ?? "")
          : "";
      return prompt.includes(
        "Write the assistant's user-facing reply for a calendar interaction.",
      )
        ? prompt
        : "<response><query1></query1><query2></query2><query3></query3></response>";
    });
    mockDeleteCalendarEvent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Google API error: 500 backendError"));

    const result = await invoke("delete all dentist appointments", {
      subaction: "delete_event",
      title: "Dentist appointment",
      details: {},
    });

    expect(mockDeleteCalendarEvent).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ success: false });
    expect(result?.text).toContain("Deleted 1 matching event");
    expect(result?.text).not.toContain('"error"');
    expect(result?.text).not.toContain("Google API error");
    expect(result?.text).not.toContain("backendError");
  });

  it("does not treat a title like 'All Hands' as consent to delete every match", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-all-hands-1",
          externalId: "ext-all-hands-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "All Hands meeting",
          description: "",
          location: "HQ",
          status: "confirmed",
          startAt: "2026-04-14T17:00:00.000Z",
          endAt: "2026-04-14T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-all-hands-2",
          externalId: "ext-all-hands-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "All Hands meeting",
          description: "",
          location: "Remote",
          status: "confirmed",
          startAt: "2026-04-21T17:00:00.000Z",
          endAt: "2026-04-21T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("delete all hands meeting", {
      subaction: "delete_event",
      title: "All Hands meeting",
      details: {},
    });

    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
    expect(result?.text).toContain("multiple events");
    expect(result?.text).toContain("All Hands meeting");
  });

  it("does not treat 'delete both' as consent to delete more than two matches", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-flight-1",
          externalId: "ext-flight-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to LA",
          description: "",
          location: "",
          status: "confirmed",
          startAt: "2026-04-15T17:00:00.000Z",
          endAt: "2026-04-15T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-flight-2",
          externalId: "ext-flight-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to LA",
          description: "",
          location: "",
          status: "confirmed",
          startAt: "2026-04-16T17:00:00.000Z",
          endAt: "2026-04-16T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-flight-3",
          externalId: "ext-flight-3",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to LA",
          description: "",
          location: "",
          status: "confirmed",
          startAt: "2026-04-17T17:00:00.000Z",
          endAt: "2026-04-17T18:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("delete both flight to la", {
      subaction: "delete_event",
      title: "Flight to LA",
      details: {},
    });

    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
    expect(result?.text).toContain("multiple events");
    expect(result?.text).toContain("Flight to LA");
  });

  it("routes to next_event when the intent is clearly next-event", async () => {
    mockGetNextCalendarEventContext.mockResolvedValue({
      event: {
        id: "evt-next",
        externalId: "ext-next",
        agentId: "agent-1",
        provider: "google",
        side: "owner",
        calendarId: "primary",
        title: "Design review",
        description: "",
        location: "Studio",
        status: "confirmed",
        startAt: "2026-04-09T20:00:00.000Z",
        endAt: "2026-04-09T21:00:00.000Z",
        isAllDay: false,
        timezone: "UTC",
        htmlLink: null,
        conferenceLink: null,
        organizer: null,
        attendees: [],
        metadata: {},
        syncedAt: "2026-04-09T18:00:00.000Z",
        updatedAt: "2026-04-09T18:00:00.000Z",
      },
      startsAt: "2026-04-09T20:00:00.000Z",
      startsInMinutes: 30,
      attendeeCount: 0,
      attendeeNames: [],
      location: "Studio",
      conferenceLink: null,
      preparationChecklist: [],
      linkedMailState: "cache",
      linkedMailError: null,
      linkedMail: [],
    });

    const result = await invoke("what's my next meeting");

    expect(mockGetNextCalendarEventContext).toHaveBeenCalledTimes(1);
    expect(mockGetCalendarFeed).not.toHaveBeenCalled();
    expect(result?.text).toContain("Next event");
  });

  it("repairs a bad requested subaction to trip_window for travel-window questions", async () => {
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "evt-outbound",
          externalId: "ext-outbound",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Flight to Denver (WN 3677)",
          description: "",
          location: "San Francisco SFO",
          status: "confirmed",
          startAt: "2026-04-10T21:25:00.000Z",
          endAt: "2026-04-11T00:05:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
        {
          id: "evt-stay",
          externalId: "ext-stay",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Stay at Fairfield by Marriott Inn & Suites Boulder",
          description: "",
          location: "Boulder",
          status: "confirmed",
          startAt: "2026-04-11T00:00:00.000Z",
          endAt: "2026-04-12T00:00:00.000Z",
          isAllDay: true,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-09T00:00:00.000Z",
      timeMax: "2026-05-09T00:00:00.000Z",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("what's on my calendar while i'm in boulder?", {
      subaction: "feed",
    });

    expect(mockGetCalendarFeed).toHaveBeenCalledTimes(1);
    expect(result?.text).toContain("while you're in boulder");
    expect(result?.text).toContain("Stay at Fairfield");
  });

  it("asks for reconnect when write access is missing", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.basic_identity", "google.calendar.read"],
    });

    const result = await invoke("create a meeting tomorrow", {
      subaction: "create_event",
      title: "Meeting",
    });

    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
    });
    expect(result?.text).toContain("write access is not granted");
  });
});
