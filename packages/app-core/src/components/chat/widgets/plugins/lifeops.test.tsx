// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockUseGoogleLifeOpsConnector } = vi.hoisted(() => ({
  mockClient: {
    getLifeOpsCalendarFeed: vi.fn(),
    getLifeOpsGmailTriage: vi.fn(),
  },
  mockUseGoogleLifeOpsConnector: vi.fn(),
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

vi.mock("../../../../api", () => ({
  client: mockClient,
}));

vi.mock("../../../../hooks", () => ({
  useGoogleLifeOpsConnector: () => mockUseGoogleLifeOpsConnector(),
}));

import { GoogleSidebarWidget } from "./lifeops";

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

describe("GoogleSidebarWidget", () => {
  beforeEach(() => {
    mockClient.getLifeOpsCalendarFeed.mockReset();
    mockClient.getLifeOpsGmailTriage.mockReset();
    mockUseGoogleLifeOpsConnector.mockReset();
  });

  it("renders connected managed Google status, calendar, and inbox data", async () => {
    mockUseGoogleLifeOpsConnector.mockReturnValue({
      activeMode: "cloud_managed",
      actionPending: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      error: null,
      loading: false,
      modeOptions: ["cloud_managed", "local"],
      refresh: vi.fn(),
      selectMode: vi.fn(),
      selectedMode: "cloud_managed",
      status: {
        provider: "google",
        mode: "cloud_managed",
        defaultMode: "cloud_managed",
        availableModes: ["cloud_managed"],
        executionTarget: "cloud",
        sourceOfTruth: "cloud_connection",
        configured: true,
        connected: true,
        reason: "connected",
        preferredByAgent: true,
        cloudConnectionId: "managed-connection",
        identity: {
          name: "Founder Example",
          email: "founder@example.com",
        },
        grantedCapabilities: [
          "google.basic_identity",
          "google.calendar.read",
          "google.gmail.triage",
        ],
        grantedScopes: [],
        expiresAt: "2026-04-05T00:00:00.000Z",
        hasRefreshToken: true,
        grant: null,
      },
    });
    mockClient.getLifeOpsCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "event-1",
          agentId: "agent-1",
          provider: "google",
          calendarId: "primary",
          externalId: "external-event-1",
          title: "Founder sync",
          description: "",
          location: "HQ",
          status: "confirmed",
          startAt: "2026-04-04T18:00:00.000Z",
          endAt: "2026-04-04T18:30:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-04T17:00:00.000Z",
          updatedAt: "2026-04-04T17:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-04T00:00:00.000Z",
      timeMax: "2026-04-05T00:00:00.000Z",
      syncedAt: "2026-04-04T17:00:00.000Z",
    });
    mockClient.getLifeOpsGmailTriage.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          externalId: "gmail-1",
          agentId: "agent-1",
          provider: "google",
          threadId: "thread-1",
          subject: "Project sync",
          from: "Founder Example <founder@example.com>",
          fromEmail: "founder@example.com",
          replyTo: "founder@example.com",
          to: ["founder@example.com"],
          cc: [],
          snippet: "Can we review the product plan today?",
          receivedAt: "2026-04-04T17:30:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 95,
          triageReason: "direct reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: null,
          metadata: {},
          syncedAt: "2026-04-04T17:32:00.000Z",
          updatedAt: "2026-04-04T17:32:00.000Z",
        },
      ],
      source: "synced",
      syncedAt: "2026-04-04T17:32:00.000Z",
      summary: {
        unreadCount: 1,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(GoogleSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    expect(renderer).toBeDefined();
    const root = renderer.root;
    const text = flattenText(root);
    expect(text).toContain("Founder Example");
    expect(text).toContain("founder@example.com");
    expect(text).toContain("Founder sync");
    expect(text).toContain("Project sync");
    expect(text).toContain("Reply");

    expect(mockClient.getLifeOpsCalendarFeed).toHaveBeenCalledWith({
      mode: "cloud_managed",
      timeZone: expect.any(String),
    });
    expect(mockClient.getLifeOpsGmailTriage).toHaveBeenCalledWith({
      mode: "cloud_managed",
      maxResults: 3,
    });
  });

  it("wires refresh and connect through the shared connector hook", async () => {
    const refresh = vi.fn();
    const connect = vi.fn();
    const selectMode = vi.fn();

    mockUseGoogleLifeOpsConnector.mockReturnValue({
      activeMode: "cloud_managed",
      actionPending: false,
      connect,
      disconnect: vi.fn(),
      error: null,
      loading: false,
      modeOptions: ["cloud_managed", "local"],
      refresh,
      selectMode,
      selectedMode: "cloud_managed",
      status: {
        provider: "google",
        mode: "cloud_managed",
        defaultMode: "cloud_managed",
        availableModes: ["cloud_managed", "local"],
        executionTarget: "cloud",
        sourceOfTruth: "cloud_connection",
        configured: true,
        connected: false,
        reason: "disconnected",
        preferredByAgent: false,
        cloudConnectionId: null,
        identity: null,
        grantedCapabilities: [],
        grantedScopes: [],
        expiresAt: null,
        hasRefreshToken: false,
        grant: null,
      },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(GoogleSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    const buttons = renderer.root.findAllByType("button");
    const refreshButton = buttons[0];
    const connectButton = buttons.find(
      (button) => flattenText(button) === "Connect",
    );

    await act(async () => {
      refreshButton?.props.onClick();
      connectButton?.props.onClick();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(selectMode).not.toHaveBeenCalled();
  });

  it("wires mode selection through the shared connector hook", async () => {
    const selectMode = vi.fn();
    mockUseGoogleLifeOpsConnector.mockReturnValue({
      activeMode: "cloud_managed",
      actionPending: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      error: null,
      loading: false,
      modeOptions: ["cloud_managed", "local"],
      refresh: vi.fn(),
      selectMode,
      selectedMode: "cloud_managed",
      status: {
        provider: "google",
        mode: "cloud_managed",
        defaultMode: "cloud_managed",
        availableModes: ["cloud_managed", "local"],
        executionTarget: "cloud",
        sourceOfTruth: "cloud_connection",
        configured: true,
        connected: false,
        reason: "disconnected",
        preferredByAgent: false,
        cloudConnectionId: null,
        identity: null,
        grantedCapabilities: [],
        grantedScopes: [],
        expiresAt: null,
        hasRefreshToken: false,
        grant: null,
      },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(GoogleSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    const localButton = renderer.root
      .findAllByType("button")
      .find((button) => flattenText(button) === "Local");
    expect(localButton).toBeDefined();

    await act(async () => {
      localButton?.props.onClick();
    });

    expect(selectMode).toHaveBeenCalledWith("local");
  });
});
