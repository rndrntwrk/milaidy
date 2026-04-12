// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOnboardingStatusMock, mockUseApp } = vi.hoisted(() => ({
  getOnboardingStatusMock: vi.fn().mockRejectedValue(new Error("not mocked")),
  mockUseApp: vi.fn(),
}));

vi.mock("../../api", () => ({
  client: {
    getOnboardingStatus: getOnboardingStatusMock,
  },
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("./StartupFailureView", () => ({
  StartupFailureView: () => <div>Error view</div>,
}));

vi.mock("./PairingView", () => ({
  PairingView: () => <div>Pairing view</div>,
}));

vi.mock("../onboarding/OnboardingWizard", () => ({
  OnboardingWizard: () => <div>Onboarding wizard</div>,
}));

import { StartupShell } from "./StartupShell";

describe("StartupShell", () => {
  beforeEach(() => {
    getOnboardingStatusMock.mockReset();
    getOnboardingStatusMock.mockRejectedValue(new Error("not mocked"));
    mockUseApp.mockReset();
    vi.restoreAllMocks();
  });

  function mockApp(overrides?: Record<string, unknown>) {
    const dispatch = vi.fn();
    mockUseApp.mockReturnValue({
      startupCoordinator: {
        phase: "splash",
        state: { phase: "splash", loaded: true },
        dispatch,
      },
      startupError: null,
      retryStartup: vi.fn(),
      setState: vi.fn(),
      t: (_key: string, values?: Record<string, unknown>) =>
        (values?.defaultValue as string | undefined) ?? _key,
      ...overrides,
    });
    return { dispatch };
  }

  it("renders the splash progress bar and auto-continues when loaded", async () => {
    const { dispatch } = mockApp();
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("startupshell.Starting");
    expect(dispatch).toHaveBeenCalledWith({ type: "SPLASH_CONTINUE" });
  });

  it("delegates onboarding-required to the onboarding wizard", async () => {
    mockApp({
      startupCoordinator: {
        phase: "onboarding-required",
        state: {
          phase: "onboarding-required",
          serverReachable: false,
        },
        dispatch: vi.fn(),
      },
    });
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    expect(JSON.stringify(tree?.toJSON())).toContain("Onboarding wizard");
  });

  it("delegates pairing-required to the pairing view", async () => {
    mockApp({
      startupCoordinator: {
        phase: "pairing-required",
        state: { phase: "pairing-required" },
        dispatch: vi.fn(),
      },
    });
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    expect(JSON.stringify(tree?.toJSON())).toContain("Pairing view");
  });

  it("delegates the error phase to the error view", async () => {
    mockApp({
      startupCoordinator: {
        phase: "error",
        state: {
          phase: "error",
          reason: "unknown",
          message: "boom",
        },
        dispatch: vi.fn(),
      },
      startupError: {
        reason: "unknown",
        message: "boom",
        phase: "starting-backend",
      },
    });
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    expect(JSON.stringify(tree?.toJSON())).toContain("Error view");
  });

  it("returns null once startup reaches ready", async () => {
    mockApp({
      startupCoordinator: {
        phase: "ready",
        state: { phase: "ready" },
        dispatch: vi.fn(),
      },
    });
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    expect(tree?.toJSON()).toBeNull();
  });
});
