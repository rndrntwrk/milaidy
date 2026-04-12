// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDiscoverGatewayEndpoints,
  mockIsDesktopPlatform,
  mockUseApp,
} = vi.hoisted(() => ({
  mockDiscoverGatewayEndpoints: vi.fn(async () => []),
  mockIsDesktopPlatform: vi.fn(() => false),
  mockUseApp: vi.fn(),
}));

vi.mock("../../api", () => ({
  client: {
    getCloudCompatAgents: vi.fn(),
    createCloudCompatAgent: vi.fn(),
    provisionCloudCompatAgent: vi.fn(),
    getCloudCompatAgent: vi.fn(),
    getCloudCompatJobStatus: vi.fn(),
    setBaseUrl: vi.fn(),
  },
}));

vi.mock("../../bridge/gateway-discovery", () => ({
  discoverGatewayEndpoints: (...args: unknown[]) =>
    mockDiscoverGatewayEndpoints(...args),
  gatewayEndpointToApiBase: vi.fn(),
}));

vi.mock("../../platform/init", () => ({
  isDesktopPlatform: () => mockIsDesktopPlatform(),
}));

vi.mock("../../state", () => ({
  addAgentProfile: vi.fn(),
  savePersistedActiveServer: vi.fn(),
  useApp: () => mockUseApp(),
}));

import {
  DeploymentStep,
  shouldShowLocalDeploymentOption,
} from "./DeploymentStep";

function baseAppContext() {
  return {
    setState: vi.fn(),
    handleOnboardingNext: vi.fn(),
    elizaCloudConnected: false,
    elizaCloudLoginBusy: false,
    handleCloudLogin: vi.fn(async () => undefined),
    startupCoordinator: {
      dispatch: vi.fn(),
    },
    t: (key: string, values?: { defaultValue?: string }) =>
      values?.defaultValue ?? key,
  };
}

describe("shouldShowLocalDeploymentOption", () => {
  it("shows the local option on desktop builds", () => {
    expect(
      shouldShowLocalDeploymentOption({
        isDesktop: true,
        isDevelopment: false,
      }),
    ).toBe(true);
  });

  it("shows the local option during development even without Electrobun", () => {
    expect(
      shouldShowLocalDeploymentOption({
        isDesktop: false,
        isDevelopment: true,
      }),
    ).toBe(true);
  });

  it("keeps the local option hidden for production web", () => {
    expect(
      shouldShowLocalDeploymentOption({
        isDesktop: false,
        isDevelopment: false,
      }),
    ).toBe(false);
  });
});

describe("DeploymentStep", () => {
  beforeEach(() => {
    mockDiscoverGatewayEndpoints.mockReset();
    mockDiscoverGatewayEndpoints.mockResolvedValue([]);
    mockIsDesktopPlatform.mockReset();
    mockIsDesktopPlatform.mockReturnValue(false);
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue(baseAppContext());
  });

  it("renders the local agent action in development web mode", () => {
    render(<DeploymentStep />);

    expect(
      screen.getByRole("button", { name: /create local agent/i }),
    ).toBeTruthy();
    expect(screen.getByText("New local agent")).toBeTruthy();
  });
});
