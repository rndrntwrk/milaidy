// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOnboardingStatusMock, useAppMock } = vi.hoisted(() => ({
  getOnboardingStatusMock: vi.fn(),
  useAppMock: vi.fn(),
}));

vi.mock("../../api", () => ({
  client: {
    getOnboardingStatus: getOnboardingStatusMock,
  },
}));

vi.mock("../../state", () => ({
  useApp: useAppMock,
}));

vi.mock("../onboarding/OnboardingWizard", () => ({
  OnboardingWizard: () => React.createElement("div", { "data-testid": "OnboardingWizard" }),
}));

vi.mock("./PairingView", () => ({
  PairingView: () => React.createElement("div", { "data-testid": "PairingView" }),
}));

vi.mock("./StartupFailureView", () => ({
  StartupFailureView: () =>
    React.createElement("div", { "data-testid": "StartupFailureView" }),
}));

import { StartupShell } from "./StartupShell";

describe("StartupShell", () => {
  beforeEach(() => {
    getOnboardingStatusMock.mockReset();
    useAppMock.mockReset();
  });

  it("skips onboarding when the fallback server check reports a cloud-provisioned container", async () => {
    const dispatch = vi.fn();
    const setState = vi.fn();

    getOnboardingStatusMock.mockResolvedValue({
      complete: true,
      cloudProvisioned: true,
    });
    useAppMock.mockReturnValue({
      startupCoordinator: {
        phase: "onboarding-required",
        state: {
          phase: "onboarding-required",
          serverReachable: false,
        },
        dispatch,
      },
      startupError: null,
      retryStartup: vi.fn(),
      setState,
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    });

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(StartupShell));
      await Promise.resolve();
    });

    if (!renderer) {
      throw new Error("StartupShell did not render");
    }

    expect(
      renderer.root.findByProps({ "data-testid": "OnboardingWizard" }),
    ).toBeTruthy();
    expect(getOnboardingStatusMock).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledWith("onboardingComplete", true);
    expect(dispatch).toHaveBeenCalledWith({ type: "ONBOARDING_COMPLETE" });
  });

  it("does not re-check the server when onboarding is already server-backed", async () => {
    useAppMock.mockReturnValue({
      startupCoordinator: {
        phase: "onboarding-required",
        state: {
          phase: "onboarding-required",
          serverReachable: true,
        },
        dispatch: vi.fn(),
      },
      startupError: null,
      retryStartup: vi.fn(),
      setState: vi.fn(),
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    });

    await act(async () => {
      TestRenderer.create(React.createElement(StartupShell));
      await Promise.resolve();
    });

    expect(getOnboardingStatusMock).not.toHaveBeenCalled();
  });
});
