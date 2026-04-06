import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyIntent } from "./life";

const {
  mockCheckSenderRole,
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
  mockGetCalendarFeed,
  mockGetNextCalendarEventContext,
  mockGetGmailTriage,
  mockGetGoogleConnectorStatus,
} = vi.hoisted(() => ({
  mockCheckSenderRole: vi.fn(),
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
  mockGetCalendarFeed: vi.fn(),
  mockGetNextCalendarEventContext: vi.fn(),
  mockGetGmailTriage: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
}));

vi.mock("@miladyai/plugin-roles", () => ({ checkSenderRole: mockCheckSenderRole }));

vi.mock("../lifeops/service.js", () => ({
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
    getCalendarFeed = mockGetCalendarFeed;
    getNextCalendarEventContext = mockGetNextCalendarEventContext;
    getGmailTriage = mockGetGmailTriage;
    getGoogleConnectorStatus = mockGetGoogleConnectorStatus;
  },
}));

import { lifeAction } from "./life";

const runtime = { agentId: "agent-1" } as never;

function msg(text: string) {
  return { entityId: "owner-1", content: { source: "client_chat", text } } as never;
}

function invoke(intent: string, extra: Record<string, unknown> = {}) {
  const { action, title, target, details, ...rest } = extra;
  return lifeAction.handler?.(runtime, msg(intent), {} as never, {
    parameters: { action, intent, title, target, details, ...rest },
  } as never);
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
    ["I brushed my teeth", "complete_occurrence"],
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
    ["I want to call my mom every week", "create_goal"],
    ["my goal is to stay healthy", "create_goal"],
    ["brush teeth twice a day", "create_definition"],
    ["remind me to take vitamins every morning", "create_definition"],
    ["add a daily workout habit", "create_definition"],
  ] as const)('"%s" → %s', (input, expected) => {
    expect(classifyIntent(input)).toBe(expected);
  });
});

// ── Action handler tests ──────────────────────────────

describe("lifeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCheckSenderRole.mockResolvedValue({
      entityId: "owner-1", role: "OWNER", isOwner: true, isAdmin: true, canManageRoles: true,
    });
  });

  // ── Access control ────────────────────────────────

  it("rejects non-admin callers", async () => {
    mockCheckSenderRole.mockResolvedValue({ entityId: "u1", role: "USER", isOwner: false, isAdmin: false, canManageRoles: false });
    const valid = await lifeAction.validate?.(runtime, msg("test"), {} as never);
    expect(valid).toBe(false);
  });

  it("allows agent self-access", async () => {
    const valid = await lifeAction.validate?.(
      runtime, { entityId: "agent-1", content: { source: "autonomy", text: "self" } } as never, {} as never,
    );
    expect(valid).toBe(true);
  });

  it("requires intent parameter", async () => {
    const result = await lifeAction.handler?.(runtime, msg("test"), {} as never, { parameters: {} } as never);
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("intent") });
  });

  // ── create_definition ─────────────────────────────

  it("creates a daily habit", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: { id: "d1", title: "Brush teeth", cadence: { kind: "daily", windows: ["morning", "night"] } },
      reminderPlan: null,
    });
    const result = await invoke("brush teeth twice a day", {
      action: "create",
      title: "Brush teeth",
      details: { cadence: { kind: "daily", windows: ["morning", "night"] }, kind: "habit" },
    });
    expect(mockCreateDefinition).toHaveBeenCalledWith(expect.objectContaining({ title: "Brush teeth", kind: "habit" }));
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("Brush teeth") });
  });

  it("requires title for create", async () => {
    const result = await invoke("create a new habit", { action: "create", details: { cadence: { kind: "daily", windows: ["morning"] } } });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("name") });
  });

  it("requires cadence for create", async () => {
    const result = await invoke("create a new habit", { action: "create", title: "X" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("schedule") });
  });

  // ── create_goal ───────────────────────────────────

  it("creates a goal", async () => {
    mockCreateGoal.mockResolvedValue({ goal: { id: "g1", title: "Call Mom weekly" }, links: [] });
    const result = await invoke("I want to call my mom every week", {
      action: "create_goal",
      title: "Call Mom weekly",
      details: { supportStrategy: { approach: "weekly_nudge" } },
    });
    expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({ title: "Call Mom weekly" }));
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("Call Mom weekly") });
  });

  it("requires title for create_goal", async () => {
    const result = await invoke("I want to achieve a life goal");
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("name") });
  });

  // ── update_definition ─────────────────────────────

  it("updates a definition by target name", async () => {
    mockListDefinitions.mockResolvedValue([{ definition: { id: "d1", title: "Stretch", domain: "user_lifeops" } }]);
    mockListGoals.mockResolvedValue([]);
    mockUpdateDefinition.mockResolvedValue({ definition: { id: "d1", title: "Morning stretch" } });
    const result = await invoke("change stretching to mornings only", { action: "update", target: "Stretch", title: "Morning stretch" });
    expect(mockUpdateDefinition).toHaveBeenCalledWith("d1", expect.objectContaining({ title: "Morning stretch" }));
    expect(result).toMatchObject({ success: true });
  });

  it("returns error when update target not found", async () => {
    mockListDefinitions.mockResolvedValue([]);
    const result = await invoke("update something", { action: "update", target: "Ghost" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("could not find") });
  });

  // ── delete_definition ─────────────────────────────

  it("deletes a definition", async () => {
    mockListDefinitions.mockResolvedValue([{ definition: { id: "d1", title: "Workout", domain: "user_lifeops" } }]);
    mockDeleteDefinition.mockResolvedValue(undefined);
    const result = await invoke("delete the workout routine", { action: "delete", target: "Workout" });
    expect(mockDeleteDefinition).toHaveBeenCalledWith("d1");
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("Workout") });
  });

  // ── delete_goal ───────────────────────────────────

  it("deletes a goal", async () => {
    mockListGoals.mockResolvedValue([{ goal: { id: "g1", title: "Stay fit", domain: "user_lifeops" }, links: [] }]);
    mockDeleteGoal.mockResolvedValue(undefined);
    const result = await invoke("delete the stay fit goal", { action: "delete_goal", target: "Stay fit" });
    expect(mockDeleteGoal).toHaveBeenCalledWith("g1");
    expect(result).toMatchObject({ success: true });
  });

  // ── complete_occurrence ───────────────────────────

  it("completes an occurrence", async () => {
    mockGetOverview.mockResolvedValue({
      owner: { occurrences: [{ id: "o1", title: "Brush teeth", state: "visible", domain: "user_lifeops" }] },
      agentOps: { occurrences: [] },
    });
    mockCompleteOccurrence.mockResolvedValue({ id: "o1", title: "Brush teeth", state: "completed" });
    const result = await invoke("I brushed my teeth", { action: "complete", target: "Brush teeth" });
    expect(mockCompleteOccurrence).toHaveBeenCalledWith("o1", { note: undefined });
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("done") });
  });

  it("completes with a note", async () => {
    mockGetOverview.mockResolvedValue({
      owner: { occurrences: [{ id: "o1", title: "Workout", state: "visible", domain: "user_lifeops" }] },
      agentOps: { occurrences: [] },
    });
    mockCompleteOccurrence.mockResolvedValue({ id: "o1", title: "Workout", state: "completed" });
    const result = await invoke("finished my pushups", { action: "complete", target: "Workout", details: { note: "Did 20 reps" } });
    expect(mockCompleteOccurrence).toHaveBeenCalledWith("o1", { note: "Did 20 reps" });
    expect(result).toMatchObject({ success: true });
  });

  // ── skip_occurrence ───────────────────────────────

  it("skips an occurrence", async () => {
    mockGetOverview.mockResolvedValue({
      owner: { occurrences: [{ id: "o2", title: "Meditate", state: "visible", domain: "user_lifeops" }] },
      agentOps: { occurrences: [] },
    });
    mockSkipOccurrence.mockResolvedValue({ id: "o2", title: "Meditate", state: "skipped" });
    const result = await invoke("skip meditation today", { action: "skip", target: "Meditate" });
    expect(mockSkipOccurrence).toHaveBeenCalledWith("o2");
    expect(result).toMatchObject({ success: true });
  });

  // ── snooze_occurrence ─────────────────────────────

  it("snoozes with preset", async () => {
    mockGetOverview.mockResolvedValue({
      owner: { occurrences: [{ id: "o3", title: "Brush teeth", state: "visible", domain: "user_lifeops" }] },
      agentOps: { occurrences: [] },
    });
    mockSnoozeOccurrence.mockResolvedValue({ id: "o3", title: "Brush teeth", state: "snoozed" });
    const result = await invoke("snooze brushing for 30 minutes", { action: "snooze", target: "Brush teeth", details: { preset: "30m" } });
    expect(mockSnoozeOccurrence).toHaveBeenCalledWith("o3", { preset: "30m", minutes: undefined });
    expect(result).toMatchObject({ success: true });
  });

  it("snoozes with custom minutes", async () => {
    mockGetOverview.mockResolvedValue({
      owner: { occurrences: [{ id: "o3", title: "Workout", state: "visible", domain: "user_lifeops" }] },
      agentOps: { occurrences: [] },
    });
    mockSnoozeOccurrence.mockResolvedValue({ id: "o3", title: "Workout", state: "snoozed" });
    const result = await invoke("postpone workout", { action: "snooze", target: "Workout", details: { minutes: 45 } });
    expect(mockSnoozeOccurrence).toHaveBeenCalledWith("o3", { preset: undefined, minutes: 45 });
    expect(result).toMatchObject({ success: true });
  });

  // ── review_goal ───────────────────────────────────

  it("reviews a goal", async () => {
    mockListGoals.mockResolvedValue([{ goal: { id: "g1", title: "Stay healthy", domain: "user_lifeops" }, links: [] }]);
    mockReviewGoal.mockResolvedValue({
      goal: { id: "g1", title: "Stay healthy" },
      summary: { explanation: "On track — completed 3 items this week." },
    });
    const result = await invoke("how am I doing on stay healthy", { action: "review", target: "Stay healthy" });
    expect(mockReviewGoal).toHaveBeenCalledWith("g1");
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("On track") });
  });

  // ── capture_phone ─────────────────────────────────

  it("captures phone with consent", async () => {
    mockCapturePhoneConsent.mockResolvedValue({ phoneNumber: "+15551234567", policies: [] });
    const result = await invoke("my phone number is 555-123-4567, text me", {
      action: "phone",
      details: { phoneNumber: "+15551234567", allowSms: true, allowVoice: false },
    });
    expect(mockCapturePhoneConsent).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "+15551234567" }));
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("+15551234567") });
  });

  it("rejects capture without phone number", async () => {
    const result = await invoke("text me reminders", { action: "phone" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("phone number") });
  });

  // ── configure_escalation ──────────────────────────

  it("configures escalation steps", async () => {
    mockListDefinitions.mockResolvedValue([{ definition: { id: "d1", title: "Brush teeth", domain: "user_lifeops" } }]);
    mockUpdateDefinition.mockResolvedValue({ definition: { id: "d1", title: "Brush teeth" } });
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
    expect(mockUpdateDefinition).toHaveBeenCalledWith("d1", expect.objectContaining({
      reminderPlan: expect.objectContaining({ steps: expect.arrayContaining([expect.objectContaining({ channel: "sms" })]) }),
    }));
    expect(result).toMatchObject({ success: true });
  });

  // ── Calendar queries ──────────────────────────────

  it("returns today's calendar", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({ connected: true, grantedCapabilities: ["google.calendar.read"] });
    mockGetCalendarFeed.mockResolvedValue({
      calendarId: "primary", events: [{ title: "Standup", startAt: new Date().toISOString(), endAt: new Date(Date.now() + 3_600_000).toISOString(), isAllDay: false, location: null, attendees: [], conferenceLink: null }],
      source: "cache", timeMin: "", timeMax: "", syncedAt: null,
    });
    const result = await invoke("what's on my calendar today", { action: "calendar" });
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("Standup") });
  });

  it("returns next event context", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({ connected: true, grantedCapabilities: ["google.calendar.read"] });
    mockGetNextCalendarEventContext.mockResolvedValue({
      event: { title: "Design review", startAt: new Date().toISOString(), endAt: new Date(Date.now() + 3_600_000).toISOString(), isAllDay: false },
      startsAt: new Date().toISOString(), startsInMinutes: 30, attendeeCount: 0, attendeeNames: [],
      location: null, conferenceLink: null, preparationChecklist: [], linkedMailState: "unavailable", linkedMailError: null, linkedMail: [],
    });
    const result = await invoke("what's my next meeting", { action: "next_event" });
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("Design review") });
  });

  it("rejects calendar when not connected", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({ connected: false, grantedCapabilities: [] });
    const result = await invoke("what's on my calendar", { action: "calendar" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("not connected") });
  });

  // ── Email queries ─────────────────────────────────

  it("returns email triage", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({ connected: true, grantedCapabilities: ["google.gmail.triage"] });
    mockGetGmailTriage.mockResolvedValue({
      messages: [{ id: "m1", subject: "Project update", from: "alice@co.com", fromEmail: "alice@co.com", isImportant: true, likelyReplyNeeded: false, receivedAt: new Date().toISOString(), snippet: "Status update" }],
      source: "cache", syncedAt: null, summary: { unreadCount: 2, importantNewCount: 1, likelyReplyNeededCount: 0 },
    });
    const result = await invoke("any important emails", { action: "email" });
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("Project update") });
  });

  it("rejects email when Gmail not connected", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({ connected: true, grantedCapabilities: ["google.calendar.read"] });
    const result = await invoke("check my inbox", { action: "email" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("Gmail is not connected") });
  });

  // ── Overview ──────────────────────────────────────

  it("returns overview", async () => {
    mockGetOverview.mockResolvedValue({
      owner: {
        summary: { activeOccurrenceCount: 2, overdueOccurrenceCount: 0, snoozedOccurrenceCount: 0, activeGoalCount: 1, activeReminderCount: 0 },
        occurrences: [{ title: "Brush teeth", state: "visible" }], goals: [{ title: "Stay healthy", status: "active" }], reminders: [],
      },
      agentOps: { summary: { activeOccurrenceCount: 0, overdueOccurrenceCount: 0, snoozedOccurrenceCount: 0, activeGoalCount: 0, activeReminderCount: 0 }, occurrences: [], goals: [], reminders: [] },
    });
    const result = await invoke("give me an overview", { action: "overview" });
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("Brush teeth") });
  });

  // ── Title matching ────────────────────────────────

  it("matches by partial title (case-insensitive)", async () => {
    mockListDefinitions.mockResolvedValue([{ definition: { id: "d1", title: "Morning Brush Teeth", domain: "user_lifeops" } }]);
    mockDeleteDefinition.mockResolvedValue(undefined);
    const result = await invoke("delete brush teeth", { action: "delete", target: "brush teeth" });
    expect(mockDeleteDefinition).toHaveBeenCalledWith("d1");
    expect(result).toMatchObject({ success: true });
  });
});
