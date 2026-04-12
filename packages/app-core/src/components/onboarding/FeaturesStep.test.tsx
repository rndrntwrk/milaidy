// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

import { FeaturesStep } from "./FeaturesStep";

function baseAppContext() {
  return {
    elizaCloudConnected: false,
    onboardingServerTarget: "" as const,
    onboardingFeatureTelegram: false,
    onboardingFeatureDiscord: false,
    onboardingFeaturePhone: false,
    onboardingFeatureCrypto: false,
    onboardingFeatureBrowser: false,
    onboardingFeatureOAuthPending: null,
    setState: vi.fn(),
    handleOnboardingNext: vi.fn(),
    t: (key: string, values?: { defaultValue?: string }) =>
      values?.defaultValue ?? key,
  };
}

describe("FeaturesStep", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue(baseAppContext());
  });

  afterEach(() => {
    cleanup();
  });

  it("shows only the supported managed connectors when cloud is available", () => {
    mockUseApp.mockReturnValue({
      ...baseAppContext(),
      elizaCloudConnected: true,
    });

    render(<FeaturesStep />);

    expect(screen.getByText("Telegram")).toBeTruthy();
    expect(screen.getByText("Discord")).toBeTruthy();
    expect(screen.queryByText("Phone")).toBeNull();
  });

  it("still shows local capabilities when cloud connectors are unavailable", () => {
    render(<FeaturesStep />);

    expect(screen.getAllByText("Crypto Wallet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Browser").length).toBeGreaterThan(0);
    expect(screen.queryByText("Telegram")).toBeNull();
    expect(screen.queryByText("Discord")).toBeNull();
  });
});
