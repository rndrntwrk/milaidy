// @vitest-environment jsdom

import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "../../src/navigation";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    hasToken: vi.fn(() => false),
    getAuthStatus: vi.fn(async () => ({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    })),
    getOnboardingStatus: vi.fn(async () => ({ complete: true })),
    getStatus: vi.fn(async () => ({ state: "running" })),
    listConversations: vi.fn(async () => ({ conversations: [] })),
    createConversation: vi.fn(async () => ({
      conversation: {
        id: "conv-1",
        title: "Chat",
        roomId: "room-1",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    })),
    requestGreeting: vi.fn(async () => ({
      text: "hello",
      agentName: "Milady",
      generated: true,
    })),
    sendWsMessage: vi.fn(),
    connectWs: vi.fn(),
    onWsEvent: vi.fn(() => () => {}),
    getAgentEvents: vi.fn(async () => ({ events: [] })),
    disconnectWs: vi.fn(),
    getWalletAddresses: vi.fn(async () => null),
    getConfig: vi.fn(async () => ({})),
    getCloudStatus: vi.fn(async () => ({ enabled: false, connected: false })),
    getWorkbenchOverview: vi.fn(async () => ({
      tasks: [],
      triggers: [],
      todos: [],
    })),
    listArcade555MasteryRuns: vi.fn(async () => ({
      runs: [],
      nextCursor: null,
    })),
    saveStreamSettings: vi.fn(async () => ({ ok: true, settings: {} })),
  },
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

import { AppProvider, useApp } from "../../src/AppContext";

interface StartupSnapshot {
  tab: Tab;
  onboardingLoading: boolean;
  onboardingComplete: boolean;
}

function Probe(props: { onChange: (snapshot: StartupSnapshot) => void }) {
  const app = useApp();
  useEffect(() => {
    props.onChange({
      tab: app.tab,
      onboardingLoading: app.onboardingLoading,
      onboardingComplete: app.onboardingComplete,
    });
  }, [app.tab, app.onboardingLoading, app.onboardingComplete, props.onChange]);
  return null;
}

describe("lifo popout startup", () => {
  beforeEach(() => {
    Object.assign(document.documentElement, { setAttribute: vi.fn() });
    mockClient.hasToken.mockReturnValue(false);
    mockClient.getAuthStatus.mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: true });
    mockClient.getStatus.mockClear();
    mockClient.sendWsMessage.mockClear();
    mockClient.connectWs.mockClear();
    mockClient.onWsEvent.mockClear();
    mockClient.getAgentEvents.mockClear();
    mockClient.disconnectWs.mockClear();
    window.history.pushState({}, "", "/lifo?popout=lifo");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("boots in lifo tab and skips onboarding gates", async () => {
    let latest: StartupSnapshot | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onChange: (snapshot) => {
              latest = snapshot;
            },
          }),
        ),
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(latest?.tab).toBe("lifo");
      expect(latest?.onboardingLoading).toBe(false);
      expect(latest?.onboardingComplete).toBe(true);
    });

    expect(latest?.tab).toBe("lifo");
    expect(latest?.onboardingLoading).toBe(false);
    expect(latest?.onboardingComplete).toBe(true);
    expect(mockClient.getStatus).toHaveBeenCalled();
    expect(mockClient.connectWs).toHaveBeenCalledTimes(1);
    expect(mockClient.onWsEvent).toHaveBeenCalledTimes(6);
    expect(mockClient.getAgentEvents).toHaveBeenCalled();

    await act(async () => {
      tree?.unmount();
    });
  });
});
