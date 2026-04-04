// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockClient, mockSetActionNotice } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    completeLifeOpsOccurrence: vi.fn(),
    createLifeOpsGmailReplyDraft: vi.fn(),
    disconnectGoogleLifeOpsConnector: vi.fn(),
    getLifeOpsCalendarFeed: vi.fn(),
    getLifeOpsGmailTriage: vi.fn(),
    getGoogleLifeOpsConnectorStatus: vi.fn(),
    getLifeOpsOverview: vi.fn(),
    getLifeOpsNextCalendarEventContext: vi.fn(),
    listWorkbenchTodos: vi.fn(),
    sendLifeOpsGmailReply: vi.fn(),
    skipLifeOpsOccurrence: vi.fn(),
    snoozeLifeOpsOccurrence: vi.fn(),
    startGoogleLifeOpsConnector: vi.fn(),
  },
  mockSetActionNotice: vi.fn(),
}));

vi.mock("@miladyai/ui", () => ({
  Badge: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("span", props, children),
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("button", { type: "button", ...props }, children),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../api", () => ({
  client: mockClient,
}));

const mockOpenExternalUrl = vi.fn();

vi.mock("../../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

import { TasksEventsPanel } from "./TasksEventsPanel";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }
      return flattenText(child);
    })
    .join(" ");
}

describe("TasksEventsPanel", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockClient.completeLifeOpsOccurrence.mockReset();
    mockClient.createLifeOpsGmailReplyDraft.mockReset();
    mockClient.disconnectGoogleLifeOpsConnector.mockReset();
    mockClient.getLifeOpsCalendarFeed.mockReset();
    mockClient.getLifeOpsGmailTriage.mockReset();
    mockClient.getGoogleLifeOpsConnectorStatus.mockReset();
    mockClient.getLifeOpsOverview.mockReset();
    mockClient.getLifeOpsNextCalendarEventContext.mockReset();
    mockClient.listWorkbenchTodos.mockReset();
    mockClient.sendLifeOpsGmailReply.mockReset();
    mockClient.skipLifeOpsOccurrence.mockReset();
    mockClient.snoozeLifeOpsOccurrence.mockReset();
    mockClient.startGoogleLifeOpsConnector.mockReset();
    mockSetActionNotice.mockReset();
    mockOpenExternalUrl.mockReset();
    const workbench = {
      todos: [],
      lifeops: {
        occurrences: [
          {
            id: "occ-visible",
            agentId: "agent-1",
            definitionId: "def-1",
            occurrenceKey: "slot:today:current",
            scheduledAt: new Date(Date.now() - 5 * 60_000).toISOString(),
            dueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            relevanceStartAt: new Date(Date.now() - 15 * 60_000).toISOString(),
            relevanceEndAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            windowName: "Current",
            state: "visible",
            snoozedUntil: null,
            completionPayload: null,
            derivedTarget: null,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            definitionKind: "routine",
            definitionStatus: "active",
            title: "Current slot check-in",
            description: "Keep the day moving.",
            priority: 2,
            timezone: "UTC",
            source: "manual",
            goalId: "goal-1",
          },
        ],
        goals: [
          {
            id: "goal-1",
            agentId: "agent-1",
            title: "Stay on top of life ops",
            description: "",
            cadence: null,
            supportStrategy: {},
            successCriteria: {},
            status: "active",
            reviewState: "idle",
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        reminders: [
          {
            ownerType: "occurrence",
            ownerId: "occ-visible",
            occurrenceId: "occ-visible",
            definitionId: "def-1",
            eventId: null,
            title: "Current slot check-in",
            channel: "in_app",
            stepIndex: 0,
            stepLabel: "In-app reminder",
            scheduledFor: new Date(Date.now() - 60_000).toISOString(),
            dueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            state: "visible",
            htmlLink: null,
            eventStartAt: null,
          },
        ],
        summary: {
          activeOccurrenceCount: 1,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeReminderCount: 1,
          activeGoalCount: 1,
        },
      },
    };
    mockUseApp.mockReturnValue({
      ptySessions: [
        {
          sessionId: "active-1",
          agentType: "codex",
          label: "Worker 1",
          originalTask: "Investigate failing tests",
          workdir: "/tmp/worker-1",
          status: "tool_running",
          decisionCount: 0,
          autoResolvedCount: 0,
          toolDescription: "bun test",
          lastActivity: "Running bun test",
        },
        {
          sessionId: "done-1",
          agentType: "codex",
          label: "Finished worker",
          originalTask: "Already done",
          workdir: "/tmp/worker-done",
          status: "completed",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
      ],
      setActionNotice: mockSetActionNotice,
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
      workbench,
    });
    mockClient.listWorkbenchTodos.mockResolvedValue({
      todos: [
        {
          id: "todo-open",
          name: "Write release notes",
          description: "Summarize the widget bar change",
          priority: 1,
          isUrgent: true,
          isCompleted: false,
          type: "task",
        },
        {
          id: "todo-done",
          name: "Ship patch",
          description: "Already done",
          priority: null,
          isUrgent: false,
          isCompleted: true,
          type: "task",
        },
      ],
    });
    mockClient.getLifeOpsOverview.mockResolvedValue(workbench.lifeops);
    mockClient.getLifeOpsCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "event-1",
          externalId: "google-event-1",
          agentId: "agent-1",
          provider: "google",
          calendarId: "primary",
          title: "Design review",
          description: "Discuss the next milestone.",
          location: "Studio",
          status: "confirmed",
          startAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          endAt: new Date(Date.now() + 90 * 60_000).toISOString(),
          isAllDay: false,
          timezone: "UTC",
          htmlLink: "https://calendar.google.com/event?eid=1",
          conferenceLink: "https://meet.google.com/example",
          organizer: {
            email: "agent@example.com",
          },
          attendees: [
            {
              email: "friend@example.com",
              displayName: "Friend",
              responseStatus: "accepted",
              self: false,
              organizer: false,
              optional: false,
            },
          ],
          metadata: {},
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      source: "synced",
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      syncedAt: new Date().toISOString(),
    });
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue({
      provider: "google",
      mode: "local",
      defaultMode: "local",
      availableModes: ["local"],
      configured: true,
      connected: true,
      reason: "connected",
      identity: {
        email: "agent@example.com",
      },
      grantedCapabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.gmail.triage",
      ],
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.metadata",
      ],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      hasRefreshToken: true,
      grant: {
        id: "grant-1",
        agentId: "agent-1",
        provider: "google",
        identity: { email: "agent@example.com" },
        grantedScopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/gmail.metadata",
        ],
        capabilities: [
          "google.basic_identity",
          "google.calendar.read",
          "google.gmail.triage",
        ],
        tokenRef: "agent-1/local.json",
        mode: "local",
        metadata: {},
        lastRefreshAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    mockClient.getLifeOpsNextCalendarEventContext.mockResolvedValue({
      event: {
        id: "event-1",
        externalId: "google-event-1",
        agentId: "agent-1",
        provider: "google",
        calendarId: "primary",
        title: "Design review",
        description: "Discuss the next milestone.",
        location: "Studio",
        status: "confirmed",
        startAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        endAt: new Date(Date.now() + 90 * 60_000).toISOString(),
        isAllDay: false,
        timezone: "UTC",
        htmlLink: "https://calendar.google.com/event?eid=1",
        conferenceLink: "https://meet.google.com/example",
        organizer: { email: "agent@example.com" },
        attendees: [
          {
            email: "friend@example.com",
            displayName: "Friend",
            responseStatus: "accepted",
            self: false,
            organizer: false,
            optional: false,
          },
        ],
        metadata: {},
        syncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      startsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      startsInMinutes: 30,
      attendeeCount: 1,
      attendeeNames: ["Friend"],
      location: "Studio",
      conferenceLink: "https://meet.google.com/example",
      preparationChecklist: [
        "Confirm route or access for Studio",
        "Read the event description and agenda notes",
      ],
      linkedMailState: "cache",
      linkedMailError: null,
      linkedMail: [
        {
          id: "mail-1",
          subject: "Design review agenda",
          from: "Friend",
          receivedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
          snippet: "Here is the latest agenda.",
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-1",
        },
      ],
    });
    mockClient.getLifeOpsGmailTriage.mockResolvedValue({
      messages: [
        {
          id: "mail-1",
          externalId: "gmail-message-1",
          agentId: "agent-1",
          provider: "google",
          threadId: "thread-1",
          subject: "Design review agenda",
          from: "Friend",
          fromEmail: "friend@example.com",
          replyTo: "friend@example.com",
          to: ["agent@example.com"],
          cc: [],
          snippet: "Here is the latest agenda.",
          receivedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 90,
          triageReason: "important label, likely needs reply",
          labels: ["INBOX", "UNREAD", "IMPORTANT"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-1",
          metadata: {},
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      source: "synced",
      syncedAt: new Date().toISOString(),
      summary: {
        unreadCount: 1,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
    });
    mockClient.completeLifeOpsOccurrence.mockResolvedValue({
      occurrence: {
        id: "occ-visible",
        state: "completed",
      },
    });
    mockClient.skipLifeOpsOccurrence.mockResolvedValue({
      occurrence: {
        id: "occ-visible",
        state: "skipped",
      },
    });
    mockClient.snoozeLifeOpsOccurrence.mockResolvedValue({
      occurrence: {
        id: "occ-visible",
        state: "snoozed",
      },
    });
    mockClient.startGoogleLifeOpsConnector.mockResolvedValue({
      provider: "google",
      mode: "local",
      requestedCapabilities: ["google.basic_identity", "google.calendar.read"],
      redirectUri:
        "http://127.0.0.1:2138/api/lifeops/connectors/google/callback",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
    });
    mockClient.disconnectGoogleLifeOpsConnector.mockResolvedValue({
      provider: "google",
      mode: "local",
      defaultMode: "local",
      availableModes: ["local"],
      configured: true,
      connected: false,
      reason: "disconnected",
      identity: null,
      grantedCapabilities: [],
      grantedScopes: [],
      expiresAt: null,
      hasRefreshToken: false,
      grant: null,
    });
  });

  it("shows open todos, ongoing orchestrator sessions, and recent events", async () => {
    const clearEvents = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents,
          events: [
            {
              id: "evt-1",
              timestamp: Date.now(),
              eventType: "task_registered",
              summary: "Task started: Worker 1",
            },
          ],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = flattenText(tree.root).toLowerCase();
    const normalizedText = text.replace(/\s+/g, " ").trim();
    expect(mockClient.listWorkbenchTodos.mock.calls.length).toBeGreaterThan(0);
    expect(mockClient.getLifeOpsCalendarFeed.mock.calls.length).toBeGreaterThan(
      0,
    );
    expect(mockClient.getLifeOpsGmailTriage.mock.calls.length).toBeGreaterThan(
      0,
    );
    expect(mockClient.getLifeOpsOverview.mock.calls.length).toBeGreaterThan(0);
    expect(
      mockClient.getLifeOpsNextCalendarEventContext.mock.calls.length,
    ).toBeGreaterThan(0);
    expect(
      mockClient.getGoogleLifeOpsConnectorStatus.mock.calls.length,
    ).toBeGreaterThan(0);
    expect(normalizedText).toContain("google");
    expect(normalizedText).toContain("connected as agent@example.com");
    expect(normalizedText).toContain("next up: design review");
    expect(normalizedText).toContain("design review");
    expect(normalizedText).toContain("mail: design review agenda");
    expect(normalizedText).toContain("important new mail");
    expect(normalizedText).toContain("current slot check-in");
    expect(normalizedText).toContain("in-app reminder");
    expect(normalizedText).toContain("write release notes");
    expect(normalizedText).not.toContain("ship patch");
    expect(normalizedText).toContain("worker 1");
    expect(normalizedText).not.toContain("finished worker");
    expect(normalizedText).toContain("task started: worker 1");
  });

  it("shows next-event mail linking errors when Gmail context sync fails", async () => {
    mockClient.getLifeOpsNextCalendarEventContext.mockResolvedValue({
      event: {
        id: "event-error",
        externalId: "google-event-error",
        agentId: "agent-1",
        provider: "google",
        calendarId: "primary",
        title: "Inbox zero sync",
        description: "",
        location: "",
        status: "confirmed",
        startAt: new Date(Date.now() + 45 * 60_000).toISOString(),
        endAt: new Date(Date.now() + 75 * 60_000).toISOString(),
        isAllDay: false,
        timezone: "UTC",
        htmlLink: null,
        conferenceLink: null,
        organizer: null,
        attendees: [],
        metadata: {},
        syncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      startsAt: new Date(Date.now() + 45 * 60_000).toISOString(),
      startsInMinutes: 45,
      attendeeCount: 0,
      attendeeNames: [],
      location: null,
      conferenceLink: null,
      preparationChecklist: [],
      linkedMailState: "error",
      linkedMailError:
        "Google Workspace policy blocked the request: Access blocked by admin policy.",
      linkedMail: [],
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = flattenText(tree.root)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toContain("next up: inbox zero sync");
    expect(text).toContain("mail linking unavailable:");
    expect(text).toContain("admin policy");
  });

  it("surfaces Google connector load failures instead of hiding them", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockRejectedValueOnce(
      new Error("Connector status unavailable"),
    );

    await act(async () => {
      TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "Connector status unavailable",
      "error",
      4800,
    );
  });

  it("surfaces calendar load failures instead of quietly clearing the feed", async () => {
    mockClient.getLifeOpsCalendarFeed.mockRejectedValueOnce(
      new Error("Calendar sync failed"),
    );

    await act(async () => {
      TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "Calendar sync failed",
      "error",
      4800,
    );
  });

  it("runs life-ops occurrence actions from the panel", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const doneButton = tree.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Done"));
    expect(doneButton).toBeDefined();

    await act(async () => {
      doneButton?.props.onClick();
      await Promise.resolve();
    });

    expect(mockClient.completeLifeOpsOccurrence).toHaveBeenCalledWith(
      "occ-visible",
      {},
    );
  });

  it("starts Google OAuth from the life-ops card", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue({
      provider: "google",
      mode: "local",
      defaultMode: "local",
      availableModes: ["local"],
      configured: true,
      connected: false,
      reason: "disconnected",
      identity: null,
      grantedCapabilities: [],
      grantedScopes: [],
      expiresAt: null,
      hasRefreshToken: false,
      grant: null,
    });
    mockClient.getLifeOpsCalendarFeed.mockResolvedValueOnce({
      calendarId: "primary",
      events: [],
      source: "cache",
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      syncedAt: null,
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const connectButton = tree.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Connect"));
    expect(connectButton).toBeDefined();

    await act(async () => {
      connectButton?.props.onClick();
      await Promise.resolve();
    });

    expect(mockClient.startGoogleLifeOpsConnector).toHaveBeenCalledWith({
      capabilities: ["google.calendar.read"],
    });
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?state=test",
    );
  });

  it("opens calendar events from the life-ops panel", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const openButton = tree.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Open"));
    expect(openButton).toBeDefined();

    await act(async () => {
      openButton?.props.onClick();
      await Promise.resolve();
    });

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://calendar.google.com/event?eid=1",
    );
  });

  it("requests Gmail send re-consent from the Google card", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const enableSendButton = tree.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Enable Send"));
    expect(enableSendButton).toBeDefined();

    await act(async () => {
      enableSendButton?.props.onClick();
      await Promise.resolve();
    });

    expect(mockClient.startGoogleLifeOpsConnector).toHaveBeenCalledWith({
      capabilities: ["google.gmail.send"],
    });
  });
});
