// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findButtonByText } from "../../../../../test/helpers/react-test";

const { mockUseGoogleLifeOpsConnector, mockClientGetBaseUrl } = vi.hoisted(
  () => ({
    mockUseGoogleLifeOpsConnector: vi.fn(),
    mockClientGetBaseUrl: vi.fn(),
  }),
);

vi.mock("../../hooks", () => ({
  useGoogleLifeOpsConnector: () => mockUseGoogleLifeOpsConnector(),
}));

vi.mock("../../api", () => ({
  client: {
    getBaseUrl: () => mockClientGetBaseUrl(),
  },
}));

vi.mock("../../state", () => ({
  useApp: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      typeof vars?.defaultValue === "string" ? vars.defaultValue : key,
  }),
}));

vi.mock("@miladyai/ui", () => {
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    Badge: passthrough,
    Button: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("button", { type: "button", ...props }, children),
    Card: passthrough,
    CardContent: passthrough,
    CardHeader: passthrough,
    CardTitle: passthrough,
  };
});

vi.mock("lucide-react", () => ({
  CalendarDays: () => React.createElement("span", null, "calendar"),
  Mail: () => React.createElement("span", null, "mail"),
  Plug2: () => React.createElement("span", null, "plug"),
  RefreshCw: () => React.createElement("span", null, "refresh"),
  ShieldCheck: () => React.createElement("span", null, "shield"),
}));

import { LifeOpsSettingsSection } from "./LifeOpsSettingsSection";

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

describe("LifeOpsSettingsSection", () => {
  beforeEach(() => {
    mockClientGetBaseUrl.mockReset();
    mockUseGoogleLifeOpsConnector.mockReset();
    mockClientGetBaseUrl.mockReturnValue("http://127.0.0.1:3000");
  });

  it("renders advanced local setup instructions with the loopback callback", () => {
    mockUseGoogleLifeOpsConnector.mockReturnValue({
      activeMode: "local",
      actionPending: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      error: null,
      loading: false,
      modeOptions: ["cloud_managed", "local"],
      refresh: vi.fn(),
      selectMode: vi.fn(),
      selectedMode: "local",
      status: {
        provider: "google",
        mode: "local",
        defaultMode: "cloud_managed",
        availableModes: ["cloud_managed"],
        executionTarget: "local",
        sourceOfTruth: "local_storage",
        configured: false,
        connected: false,
        reason: "config_missing",
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
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(LifeOpsSettingsSection),
      );
    });
    const text = flattenText(renderer.root);

    expect(text).toContain("Local desktop OAuth");
    expect(text).toContain("MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID");
    expect(text).toContain(
      "http://127.0.0.1:3000/api/lifeops/connectors/google/callback",
    );
  });

  it("wires refresh, connect, and mode selection actions", async () => {
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
        React.createElement(LifeOpsSettingsSection),
      );
    });

    await act(async () => {
      findButtonByText(renderer.root, "Refresh").props.onClick();
      findButtonByText(renderer.root, "Connect").props.onClick();
      findButtonByText(renderer.root, "Local").props.onClick();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(selectMode).toHaveBeenCalledWith("local");
  });
});
