// @vitest-environment jsdom

import type {
  LifeOpsConnectorSide,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
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
  useGoogleLifeOpsConnector: (options?: { side?: LifeOpsConnectorSide }) =>
    mockUseGoogleLifeOpsConnector(options),
}));

import { GoogleSidebarWidget } from "./lifeops";

function buildStatus(
  side: LifeOpsConnectorSide,
  overrides: Partial<LifeOpsGoogleConnectorStatus> = {},
): LifeOpsGoogleConnectorStatus {
  return {
    provider: "google",
    side,
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
    ...overrides,
  };
}

function buildController(
  side: LifeOpsConnectorSide,
  overrides: Record<string, unknown> = {},
) {
  return {
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
    side,
    status: buildStatus(side),
    ...overrides,
  };
}

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

  it("renders owner and agent connectors and uses the preferred side for data", async () => {
    const ownerConnector = buildController("owner", {
      status: buildStatus("owner", {
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
        expiresAt: "2026-04-05T00:00:00.000Z",
        hasRefreshToken: true,
      }),
    });
    const agentConnector = buildController("agent", {
      status: buildStatus("agent", {
        connected: true,
        reason: "connected",
        identity: {
          name: "Milady Agent",
          email: "agent@example.com",
        },
        grantedCapabilities: ["google.basic_identity"],
      }),
    });
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) =>
        options?.side === "agent" ? agentConnector : ownerConnector,
    );
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

    const text = flattenText(renderer.root);
    expect(mockUseGoogleLifeOpsConnector).toHaveBeenCalledWith({
      side: "owner",
      pollIntervalMs: 15000,
    });
    expect(mockUseGoogleLifeOpsConnector).toHaveBeenCalledWith({
      side: "agent",
      pollIntervalMs: 15000,
    });
    expect(text).toContain("Owner");
    expect(text).toContain("Agent");
    expect(text).toContain("Founder Example");
    expect(text).toContain("founder@example.com");
    expect(text).toContain("Milady Agent");
    expect(text).toContain("Founder sync");
    expect(text).toContain("Project sync");
    expect(text).toContain("Reply");
    expect(text).toContain("Calendar (Owner)");
    expect(text).toContain("Inbox (Owner)");

    expect(mockClient.getLifeOpsCalendarFeed).toHaveBeenCalledWith({
      mode: "cloud_managed",
      timeZone: expect.any(String),
    });
    expect(mockClient.getLifeOpsGmailTriage).toHaveBeenCalledWith({
      mode: "cloud_managed",
      maxResults: 3,
    });
  });

  it("wires owner-side refresh and connect through the shared connector hook", async () => {
    const ownerRefresh = vi.fn();
    const ownerConnect = vi.fn();
    const ownerSelectMode = vi.fn();
    const ownerConnector = buildController("owner", {
      refresh: ownerRefresh,
      connect: ownerConnect,
      selectMode: ownerSelectMode,
    });
    const agentConnector = buildController("agent");
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) =>
        options?.side === "agent" ? agentConnector : ownerConnector,
    );

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(GoogleSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find(
          (button) =>
            button.props["aria-label"] === "Refresh Owner Google connector",
        )
        ?.props.onClick();
      renderer.root
        .findAllByType("button")
        .find(
          (button) =>
            button.props["aria-label"] === "Connect Owner Google connector",
        )
        ?.props.onClick();
    });

    expect(ownerRefresh).toHaveBeenCalledTimes(1);
    expect(ownerConnect).toHaveBeenCalledTimes(1);
    expect(ownerSelectMode).not.toHaveBeenCalled();
  });

  it("wires mode selection through the shared connector hook for the requested side", async () => {
    const ownerSelectMode = vi.fn();
    const agentSelectMode = vi.fn();
    const ownerConnector = buildController("owner", {
      selectMode: ownerSelectMode,
    });
    const agentConnector = buildController("agent", {
      selectMode: agentSelectMode,
    });
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) =>
        options?.side === "agent" ? agentConnector : ownerConnector,
    );

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(GoogleSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props["aria-label"] === "Agent Local mode")
        ?.props.onClick();
    });

    expect(ownerSelectMode).not.toHaveBeenCalled();
    expect(agentSelectMode).toHaveBeenCalledWith("local");
  });
});
