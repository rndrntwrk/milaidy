import { ModelType } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyIntent } from "./life";

const {
  mockCheckSenderPrivateAccess,
  mockResolveCanonicalOwnerIdForMessage,
  mockListDefinitions,
  mockListGoals,
  mockGetOverview,
  mockCreateDefinition,
  mockUpdateDefinition,
  mockDeleteDefinition,
  mockCreateGoal,
  mockUpdateGoal,
  mockDeleteGoal,
  mockReviewGoal,
  mockCompleteOccurrence,
  mockSkipOccurrence,
  mockSnoozeOccurrence,
  mockCapturePhoneConsent,
  mockSetReminderPreference,
  mockGetCalendarFeed,
  mockGetNextCalendarEventContext,
  mockGetGmailTriage,
  mockGetGoogleConnectorStatus,
  mockUseModel,
} = vi.hoisted(() => ({
  mockCheckSenderPrivateAccess: vi.fn(),
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  mockListDefinitions: vi.fn(),
  mockListGoals: vi.fn(),
  mockGetOverview: vi.fn(),
  mockCreateDefinition: vi.fn(),
  mockUpdateDefinition: vi.fn(),
  mockDeleteDefinition: vi.fn(),
  mockCreateGoal: vi.fn(),
  mockUpdateGoal: vi.fn(),
  mockDeleteGoal: vi.fn(),
  mockReviewGoal: vi.fn(),
  mockCompleteOccurrence: vi.fn(),
  mockSkipOccurrence: vi.fn(),
  mockSnoozeOccurrence: vi.fn(),
  mockCapturePhoneConsent: vi.fn(),
  mockSetReminderPreference: vi.fn(),
  mockGetCalendarFeed: vi.fn(),
  mockGetNextCalendarEventContext: vi.fn(),
  mockGetGmailTriage: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
  mockUseModel: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderPrivateAccess: mockCheckSenderPrivateAccess,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsServiceError: class LifeOpsServiceError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "LifeOpsServiceError";
    }
  },
  LifeOpsService: class {
    listDefinitions = mockListDefinitions;
    listGoals = mockListGoals;
    getOverview = mockGetOverview;
    createDefinition = mockCreateDefinition;
    updateDefinition = mockUpdateDefinition;
    deleteDefinition = mockDeleteDefinition;
    createGoal = mockCreateGoal;
    updateGoal = mockUpdateGoal;
    deleteGoal = mockDeleteGoal;
    reviewGoal = mockReviewGoal;
    completeOccurrence = mockCompleteOccurrence;
    skipOccurrence = mockSkipOccurrence;
    snoozeOccurrence = mockSnoozeOccurrence;
    capturePhoneConsent = mockCapturePhoneConsent;
    setReminderPreference = mockSetReminderPreference;
    getCalendarFeed = mockGetCalendarFeed;
    getNextCalendarEventContext = mockGetNextCalendarEventContext;
    getGmailTriage = mockGetGmailTriage;
    getGoogleConnectorStatus = mockGetGoogleConnectorStatus;
  },
}));

import { lifeAction } from "./life";

const runtime = { agentId: "agent-1", useModel: mockUseModel } as never;

function msg(text: string, source = "client_chat") {
  return { entityId: "owner-1", content: { source, text } } as never;
}

function invoke(intent: string, extra: Record<string, unknown> = {}) {
  const { action, title, target, details, ...rest } = extra;
  return lifeAction.handler?.(
    runtime,
    msg(intent),
    {} as never,
    {
      parameters: { action, intent, title, target, details, ...rest },
    } as never,
  );
}

// ── Intent classifier unit tests ──────────────────────

describe("classifyIntent", () => {
  it.each([
    ["what's on my calendar today", "query_calendar_today"],
    ["show me today's schedule", "query_calendar_today"],
    ["calendar for tomorrow", "query_calendar_today"],
    ["what events this week", "query_calendar_today"],
    ["what's my next meeting", "query_calendar_next"],
    ["upcoming event", "query_calendar_next"],
    ["any important emails", "query_email"],
    ["check my inbox", "query_email"],
    ["show me my gmail", "query_email"],
    ["give me an overview", "query_overview"],
    ["what's active right now", "query_overview"],
    ["life ops summary", "query_overview"],
    ["what's still left for today", "query_overview"],
    ["what do i still need to do today", "query_overview"],
    ["anything else do i need to get done today", "query_overview"],
    ["mark workout done", "complete_occurrence"],
    ["finished my pushups", "complete_occurrence"],
    ["did my stretches", "complete_occurrence"],
    ["skip brushing tonight", "skip_occurrence"],
    ["pass on yoga today", "skip_occurrence"],
    ["not today", "skip_occurrence"],
    ["snooze that for 30 minutes", "snooze_occurrence"],
    ["remind me later", "snooze_occurrence"],
    ["postpone the workout", "snooze_occurrence"],
    ["push back the reminder", "snooze_occurrence"],
    ["delete the brushing habit", "delete_definition"],
    ["remove my workout routine", "delete_definition"],
    ["cancel the stretching reminder", "delete_definition"],
    ["delete the stay healthy goal", "delete_goal"],
    ["remove my fitness goal", "delete_goal"],
    ["my phone number is 555-1234", "capture_phone"],
    ["stop reminding me", "set_reminder_preference"],
    ["remind me less about water", "set_reminder_preference"],
    ["send me more reminders for workout", "set_reminder_preference"],
    ["resume reminders", "set_reminder_preference"],
    ["text me if I miss it", "configure_escalation"],
    ["call me before the event", "capture_phone"],
    ["set up SMS escalation", "configure_escalation"],
    ["text me if I ignore the reminder", "configure_escalation"],
    ["notify me by SMS if I miss it", "configure_escalation"],
    ["how am I doing on stay healthy", "review_goal"],
    ["review my fitness goal progress", "review_goal"],
    ["check on my calling mom goal", "review_goal"],
    ["change brushing to twice a day", "update_definition"],
    ["edit my workout schedule", "update_definition"],
    ["modify the stretching routine", "update_definition"],
    ["update my fitness goal", "update_goal"],
    ["adjust my calling mom goal", "update_goal"],
    ["I want to call my mom every week", "create_definition"],
    ["my goal is to stay healthy", "create_goal"],
    ["brush teeth twice a day", "create_definition"],
    ["remind me to take vitamins every morning", "create_definition"],
    ["set an alarm for 7 am", "create_definition"],
    ["add a daily workout habit", "create_definition"],
  ] as const)('"%s" → %s', (input, expected) => {
    expect(classifyIntent(input)).toBe(expected);
  });
});

describe("classifyIntent edge cases", () => {
  it.each([
    // ── Ambiguous / overlapping keywords ──────────────
    ["can you schedule a workout for me", "create_definition"], // "schedule a workout" is a creation request
    ["I completed the goal review", "review_goal"], // ambiguous — "review" checked before "completed"; LLM should use action param to disambiguate
    ["delete everything", "delete_definition"], // generic delete → definition
    ["remind me to call mom", "create_definition"], // "remind me" without "later"/"again" = create, not snooze
    ["stop the workout reminder", "delete_definition"], // "stop" maps to delete

    // ── Typos and informal language ──────────────────
    ["im done with pushups", "complete_occurrence"], // "done" triggers complete
    ["nah skip it", "skip_occurrence"], // "skip" triggers skip
    ["lemme snooze that", "snooze_occurrence"], // "snooze" triggers snooze
    ["whats on the calendar", "query_calendar_today"], // missing apostrophe
    ["any emails i need to look at", "query_email"], // casual phrasing

    // ── Short/terse inputs ───────────────────────────
    ["done", "complete_occurrence"],
    ["skip", "skip_occurrence"],
    ["snooze", "snooze_occurrence"],
    ["calendar", "query_calendar_today"],
    ["email", "query_email"],
    ["overview", "query_overview"],
    ["what's still left for today?", "query_overview"],
    ["what do i still need to do today?", "query_overview"],
    ["delete it", "delete_definition"],

    // ── Longer conversational inputs ─────────────────
    [
      "hey can you help me set up a daily routine where I brush my teeth every morning and every night",
      "create_definition",
    ],
    [
      "I've been meaning to work out more regularly, maybe three times a week",
      "create_definition",
    ],
    [
      "I really want to make it a goal to read more books this year",
      "create_goal",
    ],
    [
      "actually I already did that one can you mark it complete",
      "complete_occurrence",
    ],
    [
      "could you push that back about an hour, I'm in the middle of something",
      "snooze_occurrence",
    ],
    ["what meetings do I have coming up soon", "query_calendar_next"],
    ["is there anything urgent in my inbox I should know about", "query_email"],

    // ── Mixed signals (action param should resolve these, but classifier does best-effort) ──
    ["update the schedule for tomorrow", "update_definition"], // "update" wins over "schedule"
    ["change my email preferences", "update_definition"], // "change" wins over "email"
    ["review the calendar event", "review_goal"], // "review" wins (checked before calendar)
    ["edit my goal to call mom", "update_goal"], // "edit" + "goal"

    // ── BRD acceptance criteria phrases ──────────────
    ["I need help brushing my teeth twice a day", "create_definition"],
    ["Add one push-up and sit-up every day", "create_definition"],
    [
      "Actually create a habit named Workout that happens every afternoon, blocks X until I complete it, and then unlocks it for 60 minutes.",
      "create_definition",
    ],
    [
      "I want to call my mom every week. Help me actually do it.",
      "create_definition",
    ],
    ["What's on my calendar today?", "query_calendar_today"],
    ["Do I have anything important I need to respond to?", "query_email"],
    [
      "Text me if I ignore this, and call me if it's right before the event",
      "configure_escalation",
    ],
    ["Please remind me less about brushing", "set_reminder_preference"],
    ["Pause reminders for vitamins", "set_reminder_preference"],
  ] as const)('edge: "%s" → %s', (input, expected) => {
    expect(classifyIntent(input)).toBe(expected);
  });
});

// ── Action handler tests ──────────────────────────────

describe("lifeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseModel.mockResolvedValue("{}");
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
    mockListDefinitions.mockResolvedValue([]);
    mockListGoals.mockResolvedValue([]);
    mockSetReminderPreference.mockResolvedValue({
      definitionId: null,
      definitionTitle: null,
      global: {
        intensity: "normal",
        source: "default",
        updatedAt: null,
        note: null,
      },
      definition: null,
      effective: {
        intensity: "normal",
        source: "default",
        updatedAt: null,
        note: null,
      },
    });
  });

  it("suppresses post-action continuation because LIFE returns the grounded reply directly", () => {
    expect(lifeAction.suppressPostActionContinuation).toBe(true);
  });

  // ── Access control ────────────────────────────────

  it("rejects non-admin callers", async () => {
    mockCheckSenderPrivateAccess.mockResolvedValue({
      entityId: "u1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
      hasPrivateAccess: false,
      accessRole: null,
      accessSource: null,
    });
    const valid = await lifeAction.validate?.(
      runtime,
      msg("test"),
      {} as never,
    );
    expect(valid).toBe(false);
  });

  it("allows agent self-access", async () => {
    const valid = await lifeAction.validate?.(
      runtime,
      {
        entityId: "agent-1",
        content: { source: "autonomy", text: "self" },
      } as never,
      {} as never,
    );
    expect(valid).toBe(true);
  });

  it("allows owner access from discord", async () => {
    const valid = await lifeAction.validate?.(
      runtime,
      msg("what's on my calendar today", "discord"),
      {} as never,
    );
    expect(valid).toBe(true);
  });

  it("allows explicitly granted users from discord", async () => {
    mockCheckSenderPrivateAccess.mockResolvedValue({
      entityId: "teammate-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
      hasPrivateAccess: true,
      accessRole: "USER",
      accessSource: "manual",
    });

    const valid = await lifeAction.validate?.(
      runtime,
      {
        entityId: "teammate-1",
        content: { source: "discord", text: "what's due today" },
      } as never,
      {} as never,
    );

    expect(valid).toBe(true);
  });

  it("requires intent parameter when message text is also empty", async () => {
    const result = await lifeAction.handler?.(
      runtime,
      msg(""),
      {} as never,
      { parameters: {} } as never,
    );
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("want"),
    });
  });

  it("falls back to message text when intent param is missing", async () => {
    // With no intent param but message text "test", handler uses message text as intent
    // "test" classifies as create_definition and now fails on missing cadence first.
    const result = await lifeAction.handler?.(
      runtime,
      msg("test"),
      {} as never,
      { parameters: {} } as never,
    );
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("When"),
    });
  });

  it("prefers LLM operation extraction over the regex fallback for broad status questions", async () => {
    mockUseModel.mockResolvedValue(
      '{"operation":"query_overview","confidence":0.91}',
    );
    mockGetOverview.mockResolvedValue({
      owner: {
        summary: {
          activeOccurrenceCount: 1,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeGoalCount: 0,
          activeReminderCount: 0,
        },
        occurrences: [],
        goals: [],
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
      },
    });

    const result = await invoke(
      "zoom out and tell me what i'm juggling right now",
    );

    expect(mockUseModel).toHaveBeenCalled();
    expect(mockGetOverview).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });

  it("falls back to the regex classifier when the LLM confidence is too low", async () => {
    mockUseModel.mockResolvedValue(
      '{"operation":"query_overview","confidence":0.49}',
    );

    const result = await invoke("remind me to take vitamins every morning");

    expect(mockGetOverview).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Confirm and I'll save it"),
    });
  });

  // ── create_definition ─────────────────────────────

  it("creates a daily habit", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d1",
        title: "Brush teeth",
        cadence: { kind: "daily", windows: ["morning", "night"] },
      },
      reminderPlan: null,
    });
    const result = await invoke("brush teeth twice a day", {
      action: "create",
      title: "Brush teeth",
      details: {
        cadence: { kind: "daily", windows: ["morning", "night"] },
        kind: "habit",
        confirmed: true,
      },
    });
    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Brush teeth", kind: "habit" }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Brush teeth"),
    });
  });

  it("creates a one-off alarm immediately when the request is explicit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T03:35:00.000Z"));
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockImplementation(async (request) => ({
      definition: {
        id: "d-alarm",
        title: request.title,
        cadence: request.cadence,
      },
      reminderPlan: null,
    }));

    try {
      const result = await invoke("set an alarm for 7 am");

      expect(mockCreateDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Alarm"),
          cadence: expect.objectContaining({
            kind: "once",
          }),
        }),
      );
      const createdRequest = mockCreateDefinition.mock.calls[0]?.[0];
      const dueAt = new Date(createdRequest.cadence.dueAt);
      expect(Number.isNaN(dueAt.getTime())).toBe(false);
      expect(dueAt.getTime()).toBeGreaterThan(Date.now());
      expect(dueAt.getTime()).toBeLessThan(Date.now() + 30 * 60 * 60 * 1000);
      expect(result).toMatchObject({
        success: true,
        text: expect.stringContaining('Saved "Alarm'),
      });
      expect(String(result?.text ?? "")).not.toContain(
        "Confirm and I'll save it",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses LLM-extracted alarm context from the recent six messages and saves native metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T03:35:00.000Z"));
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        requestKind: "alarm",
        title: "Alarm",
        description: null,
        cadenceKind: "once",
        windows: null,
        weekdays: null,
        timeOfDay: "07:00",
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: null,
      }),
    );
    mockCreateDefinition.mockImplementation(async (request) => ({
      definition: {
        id: "d-alarm-llm",
        title: request.title,
        cadence: request.cadence,
      },
      reminderPlan: null,
    }));

    try {
      const result = await lifeAction.handler?.(
        runtime,
        msg("7 am"),
        {
          recentMessagesData: [
            { content: { text: "not that" } },
            { content: { text: "set an alarm for 7 am" } },
          ],
        } as never,
        { parameters: { action: "create" } } as never,
      );

      expect(mockCreateDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Alarm",
          cadence: expect.objectContaining({ kind: "once" }),
          metadata: expect.objectContaining({
            nativeAppleReminder: expect.objectContaining({
              kind: "alarm",
              provider: "apple_reminders",
              source: "llm",
            }),
          }),
        }),
      );
      expect(result).toMatchObject({
        success: true,
        text: expect.stringContaining('Saved "Alarm"'),
      });
      expect(String(result?.text ?? "")).not.toContain(
        "Confirm and I'll save it",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates a one-off reminder with native metadata from LLM extraction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T03:35:00.000Z"));
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        requestKind: "reminder",
        title: "Call mom",
        description: null,
        cadenceKind: "once",
        windows: null,
        weekdays: null,
        timeOfDay: "09:00",
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: null,
      }),
    );
    mockCreateDefinition.mockImplementation(async (request) => ({
      definition: {
        id: "d-reminder-llm",
        title: request.title,
        cadence: request.cadence,
      },
      reminderPlan: null,
    }));

    try {
      const result = await invoke(
        "set a reminder for tomorrow at 9am to call mom",
        {
          action: "create",
        },
      );

      expect(mockCreateDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          cadence: expect.objectContaining({ kind: "once" }),
          metadata: expect.objectContaining({
            nativeAppleReminder: expect.objectContaining({
              kind: "reminder",
              provider: "apple_reminders",
              source: "llm",
            }),
          }),
        }),
      );
      expect(result).toMatchObject({
        success: true,
        text: expect.stringContaining('Saved "'),
      });
      expect(String(result?.text ?? "")).not.toContain(
        "Confirm and I'll save it",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses LLM-extracted clock times for natural-language create requests", async () => {
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        title: "Call mom",
        description: null,
        cadenceKind: "daily",
        windows: null,
        weekdays: null,
        timeOfDay: "15:00",
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: 30,
      }),
    );
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-llm-time",
        title: "Call mom",
        cadence: {
          kind: "times_per_day",
          slots: [{ label: "3pm", minuteOfDay: 15 * 60 }],
        },
      },
      reminderPlan: null,
    });

    const result = await invoke("call my mom every day at 3pm", {
      action: "create",
      details: { confirmed: true },
    });

    const createRequest = mockCreateDefinition.mock.calls[0]?.[0] as {
      cadence?: {
        kind?: string;
        slots?: Array<{ minuteOfDay?: number; durationMinutes?: number }>;
      };
      title?: string;
    };
    expect(createRequest?.title?.toLowerCase()).toContain("call");
    expect(createRequest?.cadence?.kind).toBe("times_per_day");
    expect(createRequest?.cadence?.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minuteOfDay: 15 * 60,
          durationMinutes: 30,
        }),
      ]),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("preserves exact weekly clock times using a custom window policy", async () => {
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        title: "Call mom",
        description: null,
        cadenceKind: "weekly",
        windows: null,
        weekdays: [0],
        timeOfDay: "15:00",
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: 30,
      }),
    );
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-llm-weekly-time",
        title: "Call mom",
        cadence: {
          kind: "weekly",
          weekdays: [0],
          windows: ["custom"],
        },
      },
      reminderPlan: null,
    });

    const result = await invoke("call my mom every Sunday at 3pm", {
      action: "create",
      details: { confirmed: true },
    });

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        cadence: expect.objectContaining({
          kind: "weekly",
          weekdays: [0],
          windows: ["custom"],
        }),
        windowPolicy: expect.objectContaining({
          windows: expect.arrayContaining([
            expect.objectContaining({
              name: "custom",
              startMinute: 15 * 60,
              endMinute: 15 * 60 + 1,
            }),
          ]),
        }),
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("parses cadence from planner intents that contain narrow unicode spaces around times", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-unicode-time",
        title: "Brush teeth",
        cadence: {
          kind: "times_per_day",
          slots: [
            { label: "Morning", minuteOfDay: 8 * 60 },
            { label: "Night", minuteOfDay: 21 * 60 },
          ],
        },
      },
      reminderPlan: null,
    });

    const result = await invoke("Yes, save that brushing routine.", {
      action: "create",
      intent: "brush teeth at 8 am and 9 pm every day",
      title: "Brush teeth",
      details: { confirmed: true },
    });

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Brush teeth",
        cadence: expect.objectContaining({
          kind: "times_per_day",
          slots: expect.arrayContaining([
            expect.objectContaining({ minuteOfDay: 8 * 60 }),
            expect.objectContaining({ minuteOfDay: 21 * 60 }),
          ]),
        }),
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("normalizes planner cadence details that use type+times shape", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-structured-cadence",
        title: "Brush teeth",
        cadence: {
          kind: "times_per_day",
          slots: [
            { label: "8am", minuteOfDay: 8 * 60 },
            { label: "9pm", minuteOfDay: 21 * 60 },
          ],
        },
      },
      reminderPlan: null,
    });

    const result = await invoke(
      "Help me brush my teeth at 8 am and 9 pm every day.",
      {
        action: "create",
        title: "Brush teeth",
        details: {
          confirmed: true,
          kind: "habit",
          cadence: {
            type: "daily",
            times: ["08:00", "21:00"],
          },
        },
      },
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        cadence: expect.objectContaining({
          kind: "times_per_day",
          slots: expect.arrayContaining([
            expect.objectContaining({ minuteOfDay: 8 * 60 }),
            expect.objectContaining({ minuteOfDay: 21 * 60 }),
          ]),
        }),
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("previews an ambiguous recurring habit request instead of saving immediately", async () => {
    mockListGoals.mockResolvedValue([]);

    const result = await invoke(
      "I want to work out every day. 10 pushups and 10 situps.",
    );

    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Confirm and I'll save it"),
      data: expect.objectContaining({
        deferred: true,
        lifeDraft: expect.objectContaining({
          operation: "create_definition",
          request: expect.objectContaining({
            title: "10 Pushups + 10 Situps",
          }),
        }),
      }),
    });
  });

  it("lets the create planner reply instead of fabricating a vague todo", async () => {
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        mode: "respond",
        response: "What do you want the todo to be, and when should it happen?",
      }),
    );

    const result = await invoke(
      "lol yeah. can you help me add a todo for my life?",
      { action: "create" },
    );

    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: "What do you want the todo to be, and when should it happen?",
    });
  });

  it("lets the LLM keep a vague todo request in reply-only mode", async () => {
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockImplementation(async (model, input) => {
      const prompt = String((input as { prompt?: string })?.prompt ?? "");
      if (prompt.includes("Plan the LifeOps response")) {
        expect(model).toBe(ModelType.TEXT_LARGE);
        return JSON.stringify({
          operation: "create_definition",
          confidence: 0.88,
          shouldAct: false,
          missing: ["title", "schedule"],
        });
      }
      return "{}";
    });

    const result = await invoke(
      "lol yeah. can you help me add a todo for my life?",
    );

    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("todo"),
      data: expect.objectContaining({
        noop: true,
        suggestedOperation: "create_definition",
      }),
    });
  });

  it("uses the create planner to derive a title from the full raw turn", async () => {
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        mode: "create",
        response: null,
        title: "20 Situps",
        description: null,
        cadenceKind: "times_per_day",
        windows: ["morning", "night"],
        weekdays: null,
        timeOfDay: null,
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: null,
      }),
    );

    const result = await invoke(
      "lol yeah. i want to do 20 situps every morning and night",
      { action: "create" },
    );

    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Confirm and I'll save it"),
      data: expect.objectContaining({
        deferred: true,
        lifeDraft: expect.objectContaining({
          request: expect.objectContaining({
            title: "20 Situps",
          }),
        }),
      }),
    });
    expect(String(result?.text ?? "")).not.toContain("Lol Yeah");
  });

  it("ignores chat language augmentation when deriving LifeOps preview titles", async () => {
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        mode: "create",
        response: null,
        title: "20 Situps + 20 Pushups",
        description: null,
        cadenceKind: "times_per_day",
        windows: ["morning", "night"],
        weekdays: null,
        timeOfDay: null,
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: null,
      }),
    );

    const result = await invoke(
      "i want to do 20 situps and pushups every morning and night\n\n[Language instruction: Reply in natural English unless the user explicitly requests another language.]",
      { action: "create" },
    );

    const draftTitle = (
      result as {
        data?: {
          lifeDraft?: {
            request?: {
              title?: string;
            };
          };
        };
      }
    )?.data?.lifeDraft?.request?.title;

    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Confirm and I'll save it"),
      data: expect.objectContaining({
        deferred: true,
        lifeDraft: expect.objectContaining({
          request: expect.objectContaining({
            cadence: expect.objectContaining({ kind: "times_per_day" }),
          }),
        }),
      }),
    });
    expect(draftTitle).toBe("20 Situps + 20 Pushups");
    expect(String(result?.text ?? "")).not.toContain("Language Instruction");
  });

  it("executes a previewed create request when the user confirms on the next turn", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-follow-up",
        title: "10 Pushups + 10 Situps",
        cadence: { kind: "daily", windows: ["morning"] },
      },
      reminderPlan: null,
    });

    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "yes" },
      } as never,
      {
        data: {
          actionResults: [
            {
              success: true,
              data: {
                lifeDraft: {
                  intent:
                    "I want to work out every day. 10 pushups and 10 situps.",
                  operation: "create_definition",
                  request: {
                    cadence: { kind: "daily", windows: ["morning"] },
                    kind: "habit",
                    title: "10 Pushups + 10 Situps",
                  },
                },
              },
              text: 'I can save this as a habit named "10 Pushups + 10 Situps" that happens daily in morning. Confirm and I\'ll save it, or tell me what to change.',
            },
          ],
        },
      } as never,
      { parameters: { action: "create" } } as never,
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "10 Pushups + 10 Situps",
        cadence: expect.objectContaining({ kind: "daily" }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Saved"),
    });
  });

  it("reuses a preview draft from recent action-result memories on the next turn", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-follow-up-memory",
        title: "Brush teeth",
        cadence: { kind: "daily", windows: ["morning", "night"] },
      },
      reminderPlan: null,
    });

    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: { source: "telegram", text: "yes, save that routine" },
      } as never,
      {
        data: {
          actionResults: [
            {
              content: {
                type: "action_result",
                actionName: "LIFE",
                actionStatus: "completed",
                text: 'I can save this as a habit named "Brush teeth" that happens daily in morning, night. Confirm and I\'ll save it, or tell me what to change.',
                data: {
                  actionName: "LIFE",
                  lifeDraft: {
                    intent: "Help me brush my teeth every morning and night.",
                    operation: "create_definition",
                    request: {
                      cadence: { kind: "daily", windows: ["morning", "night"] },
                      kind: "habit",
                      title: "Brush teeth",
                    },
                  },
                },
              },
            },
          ],
        },
      } as never,
      { parameters: { action: "create" } } as never,
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Brush teeth",
        cadence: expect.objectContaining({
          kind: "daily",
          windows: ["morning", "night"],
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Saved"),
    });
  });

  it("reuses a preview draft when the planner echoes the same confirmation into intent", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-follow-up-echoed-intent",
        title: "Brush teeth",
        cadence: { kind: "daily", windows: ["morning", "night"] },
      },
      reminderPlan: null,
    });

    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: {
          source: "telegram",
          text: "Yes, save that brushing routine.",
        },
      } as never,
      {
        data: {
          actionResults: [
            {
              content: {
                type: "action_result",
                actionName: "LIFE",
                actionStatus: "completed",
                text: 'I can save this as a habit named "Brush teeth" that happens daily in morning, night. Confirm and I\'ll save it, or tell me what to change.',
                data: {
                  actionName: "LIFE",
                  lifeDraft: {
                    intent: "Help me brush my teeth every morning and night.",
                    operation: "create_definition",
                    request: {
                      cadence: { kind: "daily", windows: ["morning", "night"] },
                      kind: "habit",
                      title: "Brush teeth",
                    },
                  },
                },
              },
            },
          ],
        },
      } as never,
      {
        parameters: {
          action: "create",
          intent: "Yes, save that brushing routine.",
          title: "Brush Teeth",
        },
      } as never,
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Brush teeth",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Saved"),
    });
  });

  it("treats common confirmation phrases like 'perfect' as draft approval", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-follow-up-perfect",
        title: "Brush teeth",
        cadence: { kind: "daily", windows: ["morning", "night"] },
      },
      reminderPlan: null,
    });

    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: { source: "telegram", text: "perfect" },
      } as never,
      {
        data: {
          actionResults: [
            {
              success: true,
              data: {
                lifeDraft: {
                  createdAt: Date.now(),
                  intent: "Help me brush my teeth every morning and night.",
                  operation: "create_definition",
                  request: {
                    cadence: { kind: "daily", windows: ["morning", "night"] },
                    kind: "habit",
                    title: "Brush teeth",
                  },
                },
              },
            },
          ],
        },
      } as never,
      { parameters: { action: "create" } } as never,
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Brush teeth" }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Saved"),
    });
  });

  it("updates a deferred create preview when the user says what to change", async () => {
    mockListGoals.mockResolvedValue([]);
    mockUseModel.mockResolvedValue(
      JSON.stringify({
        mode: "create",
        response: null,
        title: "20 Situps + 20 Pushups",
        description: null,
        cadenceKind: "times_per_day",
        windows: ["morning", "night"],
        weekdays: null,
        timeOfDay: null,
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: null,
      }),
    );

    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "uhh how about 20 situps + 20 pushups",
        },
      } as never,
      {
        data: {
          actionResults: [
            {
              success: true,
              data: {
                lifeDraft: {
                  createdAt: Date.now(),
                  intent:
                    "i want to do 20 situps and pushups every morning and night",
                  operation: "create_definition",
                  request: {
                    cadence: {
                      kind: "times_per_day",
                      slots: [
                        {
                          key: "morning",
                          label: "Morning",
                          minuteOfDay: 8 * 60,
                          durationMinutes: 5,
                        },
                        {
                          key: "night",
                          label: "Night",
                          minuteOfDay: 21 * 60,
                          durationMinutes: 5,
                        },
                      ],
                    },
                    kind: "habit",
                    title: "20 Situps + Pushups",
                  },
                },
              },
            },
          ],
        },
      } as never,
      { parameters: { action: "create" } } as never,
    );

    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining(
        'I can save this as a habit named "20 Situps + 20 Pushups"',
      ),
      data: expect.objectContaining({
        deferred: true,
        lifeDraft: expect.objectContaining({
          intent: "uhh how about 20 situps + 20 pushups",
          request: expect.objectContaining({
            title: "20 Situps + 20 Pushups",
            cadence: expect.objectContaining({ kind: "times_per_day" }),
          }),
        }),
      }),
    });
  });

  it("warns instead of reusing an expired draft after five minutes", async () => {
    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: { source: "telegram", text: "yes" },
      } as never,
      {
        data: {
          actionResults: [
            {
              success: true,
              data: {
                lifeDraft: {
                  createdAt: Date.now() - 6 * 60 * 1000,
                  intent: "Help me brush my teeth every morning and night.",
                  operation: "create_definition",
                  request: {
                    cadence: { kind: "daily", windows: ["morning", "night"] },
                    kind: "habit",
                    title: "Brush teeth",
                  },
                },
              },
            },
          ],
        },
      } as never,
      { parameters: { action: "create" } } as never,
    );

    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("expired"),
    });
  });

  it("warns instead of reusing a stale draft after too many turns", async () => {
    const draftMessage = {
      content: {
        text: 'I can save this as "Brush teeth". Confirm and I\'ll save it.',
        data: {
          lifeDraft: {
            createdAt: Date.now(),
            intent: "Help me brush my teeth every morning and night.",
            operation: "create_definition",
            request: {
              cadence: { kind: "daily", windows: ["morning", "night"] },
              kind: "habit",
              title: "Brush teeth",
            },
          },
        },
      },
    };

    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: { source: "telegram", text: "yes" },
      } as never,
      {
        recentMessagesData: [
          draftMessage,
          { content: { text: "maybe later" } },
          { content: { text: "check my inbox too" } },
          { content: { text: "thanks" } },
        ],
      } as never,
      { parameters: { action: "create" } } as never,
    );

    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("expired"),
    });
  });

  it("reuses a preview draft from provider-backed action history in real composeState shape", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-provider-state",
        title: "Brush teeth",
        cadence: { kind: "daily", windows: ["morning", "night"] },
      },
      reminderPlan: null,
    });

    const providerDraftMemory = {
      content: {
        type: "action_result",
        actionName: "LIFE",
        actionStatus: "completed",
        text: 'I can save this as a habit named "Brush teeth" that happens daily in morning, night. Confirm and I\'ll save it, or tell me what to change.',
        data: {
          actionName: "LIFE",
          lifeDraft: {
            intent: "Help me brush my teeth every morning and night.",
            operation: "create_definition",
            request: {
              cadence: { kind: "daily", windows: ["morning", "night"] },
              kind: "habit",
              title: "Brush teeth",
            },
          },
        },
      },
    };

    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: {
          source: "telegram",
          text: "Yes, save that brushing routine.",
        },
      } as never,
      {
        data: {
          providers: {
            ACTION_STATE: {
              data: {
                recentActionMemories: [providerDraftMemory],
              },
            },
          },
        },
      } as never,
      { parameters: { action: "create" } } as never,
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Brush teeth",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Saved"),
    });
  });

  it("does not reuse an older preview draft after a create action already succeeded", async () => {
    mockListGoals.mockResolvedValue([]);

    const result = await lifeAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        content: {
          source: "telegram",
          text: "Yes, that's the schedule. Save it.",
        },
      } as never,
      {
        data: {
          actionResults: [
            {
              content: {
                type: "action_result",
                actionName: "LIFE",
                actionStatus: "completed",
                text: 'I can save this as a habit named "Brush teeth" that happens daily in morning, night. Confirm and I\'ll save it, or tell me what to change.',
                data: {
                  actionName: "LIFE",
                  lifeDraft: {
                    intent: "Help me brush my teeth every morning and night.",
                    operation: "create_definition",
                    request: {
                      cadence: { kind: "daily", windows: ["morning", "night"] },
                      kind: "habit",
                      title: "Brush teeth",
                    },
                  },
                },
              },
            },
            {
              content: {
                type: "action_result",
                actionName: "LIFE",
                actionStatus: "completed",
                text: 'Saved "Brush teeth" as daily in morning, night.',
                data: {
                  actionName: "LIFE",
                  definition: {
                    id: "d-saved",
                    title: "Brush teeth",
                    cadence: { kind: "daily", windows: ["morning", "night"] },
                  },
                  reminderPlan: null,
                },
              },
            },
          ],
        },
      } as never,
      { parameters: { action: "create" } } as never,
    );

    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("When"),
    });
  });

  it("updates the global reminder preference from natural language", async () => {
    mockSetReminderPreference.mockResolvedValue({
      definitionId: null,
      definitionTitle: null,
      global: {
        intensity: "minimal",
        source: "global_policy",
        updatedAt: "2026-04-06T12:00:00.000Z",
        note: "remind me less",
      },
      definition: null,
      effective: {
        intensity: "minimal",
        source: "global_policy",
        updatedAt: "2026-04-06T12:00:00.000Z",
        note: "remind me less",
      },
    });

    const result = await invoke("remind me less", {
      action: "reminder_preference",
    });

    expect(mockSetReminderPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        intensity: "minimal",
        definitionId: null,
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Global LifeOps reminders"),
    });
  });

  it("updates a specific routine reminder preference from natural language", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: {
          id: "def-water",
          title: "Drink water",
          domain: "user_lifeops",
        },
      },
    ]);
    mockSetReminderPreference.mockResolvedValue({
      definitionId: "def-water",
      definitionTitle: "Drink water",
      global: {
        intensity: "normal",
        source: "default",
        updatedAt: null,
        note: null,
      },
      definition: {
        intensity: "high_priority_only",
        source: "definition_metadata",
        updatedAt: "2026-04-06T12:00:00.000Z",
        note: "stop reminding me about water",
      },
      effective: {
        intensity: "high_priority_only",
        source: "definition_metadata",
        updatedAt: "2026-04-06T12:00:00.000Z",
        note: "stop reminding me about water",
      },
    });

    const result = await invoke("stop reminding me about water", {
      action: "reminder_preference",
    });

    expect(mockSetReminderPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        intensity: "high_priority_only",
        definitionId: "def-water",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: 'Reminder intensity for "Drink water" is now high priority only.',
    });
  });

  it("seeds brushing when the user only gives the intent", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-seed",
        title: "Brush teeth",
        cadence: { kind: "times_per_day", slots: [] },
      },
      reminderPlan: { id: "rp-1" },
    });

    const result = await invoke(
      "help me brush my teeth twice a day, morning and night",
      {
        action: "create",
        details: { confirmed: true },
      },
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Brush teeth",
        kind: "habit",
        cadence: expect.objectContaining({
          kind: "times_per_day",
          slots: expect.arrayContaining([
            expect.objectContaining({
              minuteOfDay: 8 * 60,
              label: "Morning",
            }),
            expect.objectContaining({
              minuteOfDay: 21 * 60,
              label: "Night",
            }),
          ]),
        }),
        reminderPlan: expect.objectContaining({
          steps: [expect.objectContaining({ channel: "in_app" })],
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Brush teeth"),
    });
  });

  it("seeds water reminders as interval cadence", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-water",
        title: "Drink water",
        cadence: {
          kind: "interval",
          everyMinutes: 180,
          windows: ["morning", "afternoon", "evening"],
        },
      },
      reminderPlan: { id: "rp-water" },
    });

    const result = await invoke("remind me to drink water throughout the day", {
      action: "create",
      details: { confirmed: true },
    });

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Drink water",
        cadence: expect.objectContaining({
          kind: "interval",
          everyMinutes: 180,
          maxOccurrencesPerDay: 4,
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Drink water"),
    });
  });

  it("uses explicit clock times for multi-slot brushing seeds", async () => {
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-brush-clock",
        title: "Brush teeth",
        cadence: { kind: "times_per_day", slots: [] },
      },
      reminderPlan: { id: "rp-brush-clock" },
    });

    const result = await invoke("brush teeth at 8am and 10:30pm", {
      action: "create",
      title: "Brush teeth",
      details: { confirmed: true },
    });

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Brush teeth",
        cadence: expect.objectContaining({
          kind: "times_per_day",
          slots: expect.arrayContaining([
            expect.objectContaining({ minuteOfDay: 8 * 60, label: "8am" }),
            expect.objectContaining({
              minuteOfDay: 22 * 60 + 30,
              label: "10:30pm",
            }),
          ]),
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Brush teeth"),
    });
  });

  it("seeds blocker-aware workout access with a fixed unlock duration", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-workout",
        title: "Workout",
        cadence: { kind: "daily", windows: ["afternoon"] },
      },
      reminderPlan: { id: "rp-workout" },
    });

    const result = await invoke(
      "add a workout habit and block X, Hacker News, Instagram, and Google News until I work out, then unlock them for 90 minutes",
      {
        action: "create",
        title: "Workout",
        details: {
          cadence: { kind: "daily", windows: ["afternoon"] },
          confirmed: true,
        },
      },
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Workout",
        websiteAccess: expect.objectContaining({
          unlockMode: "fixed_duration",
          unlockDurationMinutes: 90,
          websites: expect.arrayContaining([
            "x.com",
            "twitter.com",
            "news.ycombinator.com",
            "instagram.com",
            "news.google.com",
          ]),
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Workout"),
    });
  });

  it("seeds manual earned-access brushing when the user says unlock until I say done", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-brush-manual",
        title: "Brush teeth",
        cadence: { kind: "daily", windows: ["morning", "night"] },
      },
      reminderPlan: { id: "rp-brush-manual" },
    });

    const result = await invoke(
      "help me brush my teeth morning and night and unlock X until I say done",
      { action: "create", details: { confirmed: true } },
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Brush teeth",
        websiteAccess: expect.objectContaining({
          unlockMode: "until_manual_lock",
          websites: expect.arrayContaining(["x.com", "twitter.com"]),
        }),
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("seeds vitamins against the requested meal window", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-vitamins",
        title: "Take vitamins",
        cadence: { kind: "daily", windows: ["afternoon"] },
      },
      reminderPlan: { id: "rp-vitamins" },
    });

    const result = await invoke("remind me to take vitamins with lunch", {
      action: "create",
      details: { confirmed: true },
    });

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Take vitamins",
        cadence: expect.objectContaining({
          kind: "daily",
          windows: ["afternoon"],
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Take vitamins"),
    });
  });

  it("seeds shave as a weekly cadence when the user asks for twice a week", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "d-shave",
        title: "Shave",
        cadence: { kind: "weekly", weekdays: [1, 4], windows: ["morning"] },
      },
      reminderPlan: { id: "rp-shave" },
    });

    const result = await invoke("remind me to shave twice a week", {
      action: "create",
      details: { confirmed: true },
    });

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Shave",
        cadence: expect.objectContaining({
          kind: "weekly",
          weekdays: [1, 4],
          windows: ["morning"],
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Shave"),
    });
  });

  it("requires title for create", async () => {
    const result = await invoke("create a new habit", {
      action: "create",
      details: {
        cadence: { kind: "daily", windows: ["morning"] },
        confirmed: true,
      },
    });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("call"),
    });
  });

  it("requires cadence for create", async () => {
    const result = await invoke("create a new habit", {
      action: "create",
      title: "X",
    });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("When"),
    });
  });

  // ── create_goal ───────────────────────────────────

  it("creates a goal", async () => {
    mockCreateGoal.mockResolvedValue({
      goal: { id: "g1", title: "Call Mom weekly" },
      links: [],
    });
    const result = await invoke(
      "Actually create a goal called Call Mom weekly",
      {
        action: "create_goal",
        title: "Call Mom weekly",
        details: {
          supportStrategy: { approach: "weekly_nudge" },
          confirmed: true,
        },
      },
    );
    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Call Mom weekly" }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Call Mom weekly"),
    });
  });

  it("requires title for create_goal", async () => {
    const result = await invoke("I want to achieve a life goal");
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("achieve"),
    });
  });

  // ── update_definition ─────────────────────────────

  it("updates a definition by target name", async () => {
    mockListDefinitions.mockResolvedValue([
      { definition: { id: "d1", title: "Stretch", domain: "user_lifeops" } },
    ]);
    mockListGoals.mockResolvedValue([]);
    mockUpdateDefinition.mockResolvedValue({
      definition: { id: "d1", title: "Morning stretch" },
    });
    const result = await invoke("change stretching to mornings only", {
      action: "update",
      target: "Stretch",
      title: "Morning stretch",
    });
    expect(mockUpdateDefinition).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ title: "Morning stretch" }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("renders updated definition replies through the natural reply generator", async () => {
    mockListDefinitions.mockResolvedValue([
      { definition: { id: "d1", title: "Stretch", domain: "user_lifeops" } },
    ]);
    mockListGoals.mockResolvedValue([]);
    mockUpdateDefinition.mockResolvedValue({
      definition: { id: "d1", title: "Morning stretch" },
    });
    mockUseModel.mockImplementation(async (_model, input) => {
      const prompt =
        typeof input === "object" && input && "prompt" in input
          ? String((input as { prompt?: unknown }).prompt ?? "")
          : "";
      if (prompt.includes("Scenario: updated_definition")) {
        return "Morning stretch is set for mornings now.";
      }
      return "{}";
    });

    const result = await invoke("change stretching to mornings only", {
      action: "update",
      target: "Stretch",
      title: "Morning stretch",
    });

    expect(result).toMatchObject({
      success: true,
      text: "Morning stretch is set for mornings now.",
    });
    const replyPrompt = mockUseModel.mock.calls.at(-1)?.[1];
    expect(replyPrompt).toMatchObject({
      prompt: expect.stringContaining("Scenario: updated_definition"),
    });
  });

  it("returns error when update target not found", async () => {
    mockListDefinitions.mockResolvedValue([]);
    const result = await invoke("update something", {
      action: "update",
      target: "Ghost",
    });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("could not find"),
    });
  });

  it("falls back to LLM extraction when no explicit detail changes are provided", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: {
          id: "d1",
          title: "Workout",
          domain: "user_lifeops",
          cadence: { kind: "daily", windows: ["morning"] },
          windowPolicy: {
            timezone: "UTC",
            windows: [
              {
                name: "morning",
                label: "Morning",
                startMinute: 360,
                endMinute: 720,
              },
            ],
          },
        },
      },
    ]);
    mockUseModel.mockResolvedValue('{"timeOfDay":"06:00"}');
    mockUpdateDefinition.mockResolvedValue({
      definition: { id: "d1", title: "Workout" },
    });

    const result = await invoke("change my workout to 6am", {
      action: "update",
      target: "Workout",
    });
    expect(result).toMatchObject({ success: true });
    expect(mockUpdateDefinition).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({
        cadence: expect.objectContaining({ kind: "times_per_day" }),
      }),
    );
  });

  it("skips LLM extraction when explicit detail changes exist", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: {
          id: "d1",
          title: "Workout",
          domain: "user_lifeops",
          cadence: { kind: "daily", windows: ["morning"] },
          windowPolicy: null,
        },
      },
    ]);
    mockUpdateDefinition.mockResolvedValue({
      definition: { id: "d1", title: "Workout" },
    });

    const result = await invoke("update workout priority", {
      action: "update",
      target: "Workout",
      details: { priority: 3 },
    });
    expect(result).toMatchObject({ success: true });
    // We still generate the final user-facing reply, but should skip the
    // update-field extraction prompt when explicit details already exist.
    expect(mockUseModel).toHaveBeenCalledTimes(1);
    expect(mockUseModel.mock.calls[0]?.[1]).toMatchObject({
      prompt: expect.stringContaining("Scenario: updated_definition"),
    });
    expect(String(mockUseModel.mock.calls[0]?.[1]?.prompt ?? "")).not.toContain(
      "Extract ONLY the fields they want to change.",
    );
  });

  it("asks for clarification when update extraction finds no actionable changes", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: {
          id: "d1",
          title: "Workout",
          domain: "user_lifeops",
          cadence: { kind: "daily", windows: ["morning"] },
          windowPolicy: null,
        },
      },
    ]);
    mockUseModel.mockResolvedValue("sorry I can't do that");

    const result = await invoke("change workout to something", {
      action: "update",
      target: "Workout",
    });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("Tell me what to change"),
    });
    expect(mockUpdateDefinition).not.toHaveBeenCalled();
  });

  // ── delete_definition ─────────────────────────────

  it("deletes a definition", async () => {
    mockListDefinitions.mockResolvedValue([
      { definition: { id: "d1", title: "Workout", domain: "user_lifeops" } },
    ]);
    mockDeleteDefinition.mockResolvedValue(undefined);
    const result = await invoke("delete the workout routine", {
      action: "delete",
      target: "Workout",
    });
    expect(mockDeleteDefinition).toHaveBeenCalledWith("d1");
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Workout"),
    });
  });

  // ── delete_goal ───────────────────────────────────

  it("deletes a goal", async () => {
    mockListGoals.mockResolvedValue([
      {
        goal: { id: "g1", title: "Stay fit", domain: "user_lifeops" },
        links: [],
      },
    ]);
    mockDeleteGoal.mockResolvedValue(undefined);
    const result = await invoke("delete the stay fit goal", {
      action: "delete_goal",
      target: "Stay fit",
    });
    expect(mockDeleteGoal).toHaveBeenCalledWith("g1");
    expect(result).toMatchObject({ success: true });
  });

  // ── complete_occurrence ───────────────────────────

  it("completes an occurrence", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o1",
            title: "Brush teeth",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    mockCompleteOccurrence.mockResolvedValue({
      id: "o1",
      title: "Brush teeth",
      state: "completed",
    });
    const result = await invoke("I brushed my teeth", {
      action: "complete",
      target: "Brush teeth",
    });
    expect(mockCompleteOccurrence).toHaveBeenCalledWith("o1", {
      note: undefined,
    });
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("done"),
    });
  });

  it("completes a seeded routine when the model only sends the intent", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o-seed",
            title: "Brush teeth",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    mockCompleteOccurrence.mockResolvedValue({
      id: "o-seed",
      title: "Brush teeth",
      state: "completed",
    });

    const result = await invoke("I brushed my teeth", { action: "complete" });

    expect(mockCompleteOccurrence).toHaveBeenCalledWith("o-seed", {
      note: undefined,
    });
    expect(result).toMatchObject({ success: true });
  });

  it("completes with a note", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o1",
            title: "Workout",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    mockCompleteOccurrence.mockResolvedValue({
      id: "o1",
      title: "Workout",
      state: "completed",
    });
    const result = await invoke("finished my pushups", {
      action: "complete",
      target: "Workout",
      details: { note: "Did 20 reps" },
    });
    expect(mockCompleteOccurrence).toHaveBeenCalledWith("o1", {
      note: "Did 20 reps",
    });
    expect(result).toMatchObject({ success: true });
  });

  it("recovers missing completion targets into a create preview when the intent is clearly a new habit", async () => {
    mockGetOverview.mockResolvedValue({
      owner: { occurrences: [] },
      agentOps: { occurrences: [] },
    });
    mockListGoals.mockResolvedValue([]);

    const result = await invoke(
      "Actually create a habit named Workout that happens every afternoon, blocks X, Instagram, and Hacker News until I complete it, and then unlocks them for 60 minutes. Do not just give advice.",
      { action: "complete" },
    );

    expect(mockCompleteOccurrence).not.toHaveBeenCalled();
    expect(mockCreateDefinition).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Confirm and I'll save it"),
      data: expect.objectContaining({
        deferred: true,
        lifeDraft: expect.objectContaining({
          request: expect.objectContaining({
            title: "Workout",
            cadence: expect.objectContaining({
              kind: "daily",
              windows: ["afternoon"],
            }),
            websiteAccess: expect.objectContaining({
              unlockMode: "fixed_duration",
              unlockDurationMinutes: 60,
              websites: expect.arrayContaining([
                "x.com",
                "twitter.com",
                "instagram.com",
                "news.ycombinator.com",
              ]),
            }),
          }),
        }),
      }),
    });
  });

  // ── occurrence disambiguation ─────────────────────

  it("returns disambiguation list when multiple occurrences match by substring", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o1",
            title: "Morning stretch",
            state: "visible",
            domain: "user_lifeops",
          },
          {
            id: "o2",
            title: "Evening stretch",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    const result = await invoke("done with stretch", {
      action: "complete",
      target: "stretch",
    });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("Multiple items match"),
    });
    const text = (result as { text: string }).text;
    expect(text).toContain("Morning stretch");
    expect(text).toContain("Evening stretch");
    expect(mockCompleteOccurrence).not.toHaveBeenCalled();
  });

  it("resolves to the exact-match occurrence when one exists among substring matches", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o1",
            title: "stretch",
            state: "visible",
            domain: "user_lifeops",
          },
          {
            id: "o2",
            title: "Morning stretch",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    mockCompleteOccurrence.mockResolvedValue({
      id: "o1",
      title: "stretch",
      state: "completed",
    });
    const result = await invoke("done with stretch", {
      action: "complete",
      target: "stretch",
    });
    expect(result).toMatchObject({ success: true });
    expect(mockCompleteOccurrence).toHaveBeenCalledWith("o1", {
      note: undefined,
    });
  });

  it("resolves to the startsWith occurrence when no exact match exists", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o1",
            title: "Brush teeth morning",
            state: "visible",
            domain: "user_lifeops",
          },
          {
            id: "o2",
            title: "Quick brush teeth",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    mockCompleteOccurrence.mockResolvedValue({
      id: "o1",
      title: "Brush teeth morning",
      state: "completed",
    });
    const result = await invoke("done brushing", {
      action: "complete",
      target: "Brush teeth",
    });
    expect(result).toMatchObject({ success: true });
    expect(mockCompleteOccurrence).toHaveBeenCalledWith("o1", {
      note: undefined,
    });
  });

  it("does not silently pick the first startsWith match when multiple prefixes match", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o1",
            title: "Brush teeth",
            state: "visible",
            domain: "user_lifeops",
          },
          {
            id: "o2",
            title: "Brush hair",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });

    const result = await invoke("done brushing", {
      action: "complete",
      target: "brush",
    });

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("Multiple items match"),
    });
    expect(mockCompleteOccurrence).not.toHaveBeenCalled();
  });

  it("shows disambiguation for skip_occurrence too", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o1",
            title: "Morning yoga",
            state: "visible",
            domain: "user_lifeops",
          },
          {
            id: "o2",
            title: "Evening yoga",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    const result = await invoke("skip yoga", {
      action: "skip",
      target: "yoga",
    });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("Multiple items match"),
    });
    expect(mockSkipOccurrence).not.toHaveBeenCalled();
  });

  it("shows disambiguation for snooze_occurrence too", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o1",
            title: "Morning yoga",
            state: "visible",
            domain: "user_lifeops",
          },
          {
            id: "o2",
            title: "Evening yoga",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    const result = await invoke("snooze yoga", {
      action: "snooze",
      target: "yoga",
    });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("Multiple items match"),
    });
    expect(mockSnoozeOccurrence).not.toHaveBeenCalled();
  });

  // ── skip_occurrence ───────────────────────────────

  it("skips an occurrence", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o2",
            title: "Meditate",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    mockSkipOccurrence.mockResolvedValue({
      id: "o2",
      title: "Meditate",
      state: "skipped",
    });
    const result = await invoke("skip meditation today", {
      action: "skip",
      target: "Meditate",
    });
    expect(mockSkipOccurrence).toHaveBeenCalledWith("o2");
    expect(result).toMatchObject({ success: true });
  });

  // ── snooze_occurrence ─────────────────────────────

  it("snoozes with preset", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o3",
            title: "Brush teeth",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    mockSnoozeOccurrence.mockResolvedValue({
      id: "o3",
      title: "Brush teeth",
      state: "snoozed",
    });
    const result = await invoke("snooze brushing for 30 minutes", {
      action: "snooze",
      target: "Brush teeth",
      details: { preset: "30m" },
    });
    expect(mockSnoozeOccurrence).toHaveBeenCalledWith("o3", {
      preset: "30m",
      minutes: undefined,
    });
    expect(result).toMatchObject({ success: true });
  });

  it("snoozes with custom minutes", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [
          {
            id: "o3",
            title: "Workout",
            state: "visible",
            domain: "user_lifeops",
          },
        ],
      },
      agentOps: { occurrences: [] },
    });
    mockSnoozeOccurrence.mockResolvedValue({
      id: "o3",
      title: "Workout",
      state: "snoozed",
    });
    const result = await invoke("postpone workout", {
      action: "snooze",
      target: "Workout",
      details: { minutes: 45 },
    });
    expect(mockSnoozeOccurrence).toHaveBeenCalledWith("o3", {
      preset: undefined,
      minutes: 45,
    });
    expect(result).toMatchObject({ success: true });
  });

  // ── review_goal ───────────────────────────────────

  it("reviews a goal", async () => {
    mockListGoals.mockResolvedValue([
      {
        goal: { id: "g1", title: "Stay healthy", domain: "user_lifeops" },
        links: [],
      },
    ]);
    mockReviewGoal.mockResolvedValue({
      goal: { id: "g1", title: "Stay healthy" },
      summary: { explanation: "On track — completed 3 items this week." },
    });
    const result = await invoke("how am I doing on stay healthy", {
      action: "review",
      target: "Stay healthy",
    });
    expect(mockReviewGoal).toHaveBeenCalledWith("g1");
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("On track"),
    });
  });

  // ── capture_phone ─────────────────────────────────

  it("captures phone with consent", async () => {
    mockCapturePhoneConsent.mockResolvedValue({
      phoneNumber: "+15551234567",
      policies: [],
    });
    const result = await invoke("my phone number is 555-123-4567, text me", {
      action: "phone",
      details: {
        phoneNumber: "+15551234567",
        allowSms: true,
        allowVoice: false,
      },
    });
    expect(mockCapturePhoneConsent).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: "+15551234567" }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("+15551234567"),
    });
  });

  it("rejects capture without phone number", async () => {
    const result = await invoke("text me reminders", { action: "phone" });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("phone number"),
    });
  });

  // ── configure_escalation ──────────────────────────

  it("configures escalation steps", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: { id: "d1", title: "Brush teeth", domain: "user_lifeops" },
      },
    ]);
    mockUpdateDefinition.mockResolvedValue({
      definition: { id: "d1", title: "Brush teeth" },
    });
    const result = await invoke("set up SMS escalation for brushing", {
      action: "escalation",
      target: "Brush teeth",
      details: {
        steps: [
          { channel: "in_app", offsetMinutes: 0, label: "In-app" },
          { channel: "sms", offsetMinutes: 15, label: "SMS" },
        ],
      },
    });
    expect(mockUpdateDefinition).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({
        reminderPlan: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ channel: "sms" }),
          ]),
        }),
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  // ── Calendar queries ──────────────────────────────

  it("returns today's calendar", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.calendar.read"],
    });
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
    const result = await invoke("what's on my calendar today", {
      action: "calendar",
    });
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Standup"),
    });
  });

  it("uses message text when life params are omitted", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.calendar.read"],
    });
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: "",
      timeMax: "",
      syncedAt: null,
    });
    const result = await lifeAction.handler?.(
      runtime,
      msg("what's on my calendar today"),
      {} as never,
      { parameters: {} } as never,
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("today"),
    });
  });

  it("returns next event context", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.calendar.read"],
    });
    mockGetNextCalendarEventContext.mockResolvedValue({
      event: {
        title: "Design review",
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 3_600_000).toISOString(),
        isAllDay: false,
      },
      startsAt: new Date().toISOString(),
      startsInMinutes: 30,
      attendeeCount: 0,
      attendeeNames: [],
      location: null,
      conferenceLink: null,
      preparationChecklist: [],
      linkedMailState: "unavailable",
      linkedMailError: null,
      linkedMail: [],
    });
    const result = await invoke("what's my next meeting", {
      action: "next_event",
    });
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Design review"),
    });
  });

  it("rejects calendar when not connected", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: false,
      grantedCapabilities: [],
    });
    const result = await invoke("what's on my calendar", {
      action: "calendar",
    });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("not connected"),
    });
  });

  // ── Email queries ─────────────────────────────────

  it("returns email triage", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.gmail.triage"],
    });
    mockGetGmailTriage.mockResolvedValue({
      messages: [
        {
          id: "m1",
          subject: "Project update",
          from: "alice@co.com",
          fromEmail: "alice@co.com",
          isImportant: true,
          likelyReplyNeeded: false,
          receivedAt: new Date().toISOString(),
          snippet: "Status update",
        },
      ],
      source: "cache",
      syncedAt: null,
      summary: {
        unreadCount: 2,
        importantNewCount: 1,
        likelyReplyNeededCount: 0,
      },
    });
    const result = await invoke("any important emails", { action: "email" });
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Project update"),
    });
  });

  it("rejects email when Gmail not connected", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.calendar.read"],
    });
    const result = await invoke("check my inbox", { action: "email" });
    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("Reconnect Google"),
    });
  });

  // ── Overview ──────────────────────────────────────

  it("returns overview", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        summary: {
          activeOccurrenceCount: 2,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeGoalCount: 1,
          activeReminderCount: 0,
        },
        occurrences: [{ title: "Brush teeth", state: "visible" }],
        goals: [{ title: "Stay healthy", status: "active" }],
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
    const result = await invoke("give me an overview", { action: "overview" });
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Brush teeth"),
    });
  });

  // ── Title matching ────────────────────────────────

  it("matches by partial title (case-insensitive)", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: {
          id: "d1",
          title: "Morning Brush Teeth",
          domain: "user_lifeops",
        },
      },
    ]);
    mockDeleteDefinition.mockResolvedValue(undefined);
    const result = await invoke("delete brush teeth", {
      action: "delete",
      target: "brush teeth",
    });
    expect(mockDeleteDefinition).toHaveBeenCalledWith("d1");
    expect(result).toMatchObject({ success: true });
  });

  // ── Fallback: intent-only (no action param) ───────

  it("falls back to regex classifier when action param is omitted", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        summary: {
          activeOccurrenceCount: 1,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeGoalCount: 0,
          activeReminderCount: 0,
        },
        occurrences: [{ title: "Read", state: "visible" }],
        goals: [],
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
    // No action param — classifier should route "overview" to query_overview
    const result = await invoke("show me my overview");
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("1 active items"),
    });
  });

  it("answers remaining-today queries from the current day-scoped LifeOps state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T10:00:00Z"));
    try {
      mockGetOverview.mockResolvedValue({
        owner: {
          summary: {
            activeOccurrenceCount: 2,
            overdueOccurrenceCount: 0,
            snoozedOccurrenceCount: 0,
            activeGoalCount: 0,
            activeReminderCount: 0,
          },
          occurrences: [
            {
              title: "Pay rent",
              state: "visible",
              dueAt: "2026-04-12T18:00:00Z",
              scheduledAt: "2026-04-12T18:00:00Z",
              snoozedUntil: null,
              relevanceStartAt: "2026-04-12T14:00:00Z",
              timezone: "UTC",
            },
            {
              title: "Call dentist tomorrow",
              state: "pending",
              dueAt: "2026-04-13T15:00:00Z",
              scheduledAt: "2026-04-13T15:00:00Z",
              snoozedUntil: null,
              relevanceStartAt: "2026-04-13T11:00:00Z",
              timezone: "UTC",
            },
          ],
          goals: [],
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
      const result = await invoke("what's still left for today?");
      expect(result).toMatchObject({
        success: true,
        text: "You have 1 LifeOps task left for today: Pay rent.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats follow-up 'anything else' phrasing as the same day-scoped leftover query", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T10:00:00Z"));
    try {
      mockGetOverview.mockResolvedValue({
        owner: {
          summary: {
            activeOccurrenceCount: 1,
            overdueOccurrenceCount: 0,
            snoozedOccurrenceCount: 0,
            activeGoalCount: 0,
            activeReminderCount: 0,
          },
          occurrences: [
            {
              title: "Pay rent",
              state: "visible",
              dueAt: "2026-04-12T18:00:00Z",
              scheduledAt: "2026-04-12T18:00:00Z",
              snoozedUntil: null,
              relevanceStartAt: "2026-04-12T14:00:00Z",
              timezone: "UTC",
            },
          ],
          goals: [],
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
      const result = await invoke(
        "anything else in my life ops list i need to get done today?",
      );
      expect(result).toMatchObject({
        success: true,
        text: "You have 1 LifeOps task left for today: Pay rent.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("action param takes precedence over intent keywords", async () => {
    // Intent says "calendar" but action says "overview"
    mockGetOverview.mockResolvedValue({
      owner: {
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
    const result = await invoke("what's on my calendar", {
      action: "overview",
    });
    // Should run overview (from action param), not calendar (from intent text)
    expect(mockGetOverview).toHaveBeenCalled();
    expect(mockGetGoogleConnectorStatus).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });
});
