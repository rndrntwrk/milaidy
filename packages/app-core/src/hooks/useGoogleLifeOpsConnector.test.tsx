// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockOpenExternalUrl } = vi.hoisted(() => ({
  mockClient: {
    disconnectGoogleLifeOpsConnector: vi.fn(),
    getGoogleLifeOpsConnectorStatus: vi.fn(),
    selectGoogleLifeOpsConnectorMode: vi.fn(),
    startGoogleLifeOpsConnector: vi.fn(),
  },
  mockOpenExternalUrl: vi.fn(async () => {}),
}));

vi.mock("../api", () => ({
  client: mockClient,
}));

vi.mock("../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

import type {
  LifeOpsConnectorMode,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
import { useGoogleLifeOpsConnector } from "./useGoogleLifeOpsConnector";

function buildStatus(
  overrides: Partial<LifeOpsGoogleConnectorStatus> = {},
): LifeOpsGoogleConnectorStatus {
  return {
    provider: "google",
    mode: "cloud_managed",
    defaultMode: "cloud_managed",
    availableModes: ["cloud_managed"],
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

describe("useGoogleLifeOpsConnector", () => {
  beforeEach(() => {
    mockClient.disconnectGoogleLifeOpsConnector.mockReset();
    mockClient.getGoogleLifeOpsConnectorStatus.mockReset();
    mockClient.selectGoogleLifeOpsConnectorMode.mockReset();
    mockClient.startGoogleLifeOpsConnector.mockReset();
    mockOpenExternalUrl.mockReset();
  });

  it("keeps managed and local modes visible for setup", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus({
        availableModes: ["cloud_managed"],
      }),
    );

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({ pollIntervalMs: 60_000 }),
    );

    await waitFor(() => expect(result.current.status).not.toBeNull());

    expect(result.current.modeOptions).toEqual(["cloud_managed", "local"]);
  });

  it("previews local mode when it is not yet available to persist", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus
      .mockResolvedValueOnce(
        buildStatus({
          mode: "cloud_managed",
          availableModes: ["cloud_managed"],
        }),
      )
      .mockResolvedValueOnce(
        buildStatus({
          mode: "local",
          availableModes: ["cloud_managed"],
          executionTarget: "local",
          sourceOfTruth: "local_storage",
          configured: false,
          connected: false,
          reason: "config_missing",
        }),
      );

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({ pollIntervalMs: 60_000 }),
    );

    await waitFor(() =>
      expect(result.current.status?.mode).toBe("cloud_managed"),
    );

    await act(async () => {
      await result.current.selectMode("local");
    });

    expect(mockClient.selectGoogleLifeOpsConnectorMode).not.toHaveBeenCalled();
    expect(mockClient.getGoogleLifeOpsConnectorStatus).toHaveBeenNthCalledWith(
      2,
      "local",
    );
    expect(result.current.activeMode).toBe("local");
    expect(result.current.status?.reason).toBe("config_missing");
  });

  it("persists an available mode change and starts auth for the selected mode", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus({
        availableModes: ["cloud_managed", "local"],
      }),
    );
    mockClient.selectGoogleLifeOpsConnectorMode.mockResolvedValue(
      buildStatus({
        mode: "local",
        availableModes: ["cloud_managed", "local"],
        executionTarget: "local",
        sourceOfTruth: "local_storage",
        configured: true,
      }),
    );
    mockClient.startGoogleLifeOpsConnector.mockResolvedValue({
      provider: "google",
      mode: "local" as LifeOpsConnectorMode,
      requestedCapabilities: ["google.basic_identity"],
      redirectUri:
        "http://127.0.0.1:3000/api/lifeops/connectors/google/callback",
      authUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=desktop-client",
    });

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({ pollIntervalMs: 60_000 }),
    );

    await waitFor(() => expect(result.current.status).not.toBeNull());

    await act(async () => {
      await result.current.selectMode("local");
    });

    expect(mockClient.selectGoogleLifeOpsConnectorMode).toHaveBeenCalledWith({
      mode: "local",
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(mockClient.startGoogleLifeOpsConnector).toHaveBeenCalledWith({
      mode: "local",
    });
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=desktop-client",
    );
  });
});
