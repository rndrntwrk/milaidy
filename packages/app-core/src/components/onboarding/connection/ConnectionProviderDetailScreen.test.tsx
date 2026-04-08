// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClient,
  mockUseApp,
  mockUseBranding,
  mockOpenExternalUrl,
  mockGetProviderLogo,
} = vi.hoisted(() => ({
  mockClient: {
    submitAnthropicSetupToken: vi.fn(async () => ({ success: true })),
  },
  mockUseApp: vi.fn(),
  mockUseBranding: vi.fn(() => ({})),
  mockOpenExternalUrl: vi.fn(async () => {}),
  mockGetProviderLogo: vi.fn(() => "logo://provider"),
}));

vi.mock("../../../api", () => ({
  client: mockClient,
}));

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../../config", () => ({
  useBranding: () => mockUseBranding(),
}));

vi.mock("../../../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

vi.mock("../../../providers", () => ({
  getProviderLogo: (...args: unknown[]) => mockGetProviderLogo(...args),
  requiresAdditionalRuntimeProvider: (value: unknown) =>
    value === "anthropic-subscription",
}));

vi.mock("./useAdvanceOnboardingWhenElizaCloudOAuthConnected", () => ({
  useAdvanceOnboardingWhenElizaCloudOAuthConnected: () => undefined,
}));

import { ConnectionProviderDetailScreen } from "./ConnectionProviderDetailScreen";

function t(key: string): string {
  const translations: Record<string, string> = {
    "onboarding.apiKey": "API Key",
    "onboarding.enterApiKey": "Enter API key",
    "onboarding.back": "Back",
    "onboarding.addAnotherProvider": "Add another provider",
    "onboarding.connected": "Connected",
    "onboarding.continueLimitedSetup": "Continue with limited setup",
    "onboarding.confirm": "Confirm",
    "onboarding.connectAccount": "Connect account",
    "onboarding.connecting": "Connecting",
    "onboarding.login": "Login",
    "onboarding.openLoginPageInBrowser": "Open login page in browser",
    "onboarding.openLoginPageInBrowserDesc":
      "Open the login page in your browser to continue.",
    "onboarding.reportIssue": "Report issue",
    "onboarding.saveClaudeSubscription": "Save Claude subscription",
    "onboarding.useExistingKey": "Use an existing key.",
    "onboarding.getOneHere": "Get one here",
    "onboarding.freeCredits": "Free credits included.",
    "onboarding.selectModel": "Select model",
    "subscriptionstatus.ClaudeTosWarningShort":
      "Powers task agents only (Claude Code CLI). For the main agent runtime, connect Eliza Cloud or a direct API key.",
  };

  return translations[key] ?? key;
}

function createState(overrides: Record<string, unknown> = {}) {
  return {
    onboardingOptions: {
      providers: [
        { id: "openai", name: "OpenAI", description: "GPT API" },
        {
          id: "elizacloud",
          name: "Eliza Cloud",
          description: "LLMs, RPCs & more included",
        },
      ],
      openrouterModels: [],
      piAiModels: [],
      piAiDefaultModel: "",
    },
    onboardingProvider: "openai",
    onboardingSubscriptionTab: "token",
    onboardingCloudApiKey: "",
    onboardingApiKey: "",
    onboardingPrimaryModel: "",
    onboardingElizaCloudTab: "login",
    onboardingOpenRouterModel: "",
    elizaCloudConnected: false,
    elizaCloudLoginBusy: false,
    elizaCloudLoginError: "",
    handleCloudLogin: vi.fn(),
    handleOnboardingNext: vi.fn(async () => {}),
    setState: vi.fn(),
    t,
    ...overrides,
  };
}

describe("ConnectionProviderDetailScreen", () => {
  beforeEach(() => {
    mockClient.submitAnthropicSetupToken.mockClear();
    mockUseApp.mockReset();
    mockUseBranding.mockImplementation(() => ({}));
    mockOpenExternalUrl.mockReset();
    mockGetProviderLogo.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders labeled API key entry and confirmation affordances", () => {
    mockUseApp.mockReturnValue(createState());

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    expect(screen.getByText("OpenAI")).toBeTruthy();
    const apiKeyInput = screen.getByLabelText("API Key");
    expect(apiKeyInput).toBeTruthy();
    expect(apiKeyInput.className).toContain("bg-[var(--onboarding-input-bg)]");
    expect(apiKeyInput.className).not.toContain("-webkit-text-stroke");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    const backButton = screen.getByRole("button", { name: "Back" });
    expect(backButton.className).toContain("min-h-[44px]");
    expect(backButton.className).toContain(
      "hover:bg-[var(--onboarding-secondary-hover-bg)]",
    );
    expect(backButton.className).not.toContain("bg-bg-accent");
  });

  it("renders an actionable browser-login recovery control for Eliza Cloud", () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "elizacloud",
        elizaCloudLoginError:
          "Open this link to log in: https://example.com/login",
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open login page in browser" }),
    );

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://example.com/login",
    );
  });

  it("shows report-issue action for non-link cloud login errors", async () => {
    mockUseBranding.mockImplementation(() => ({
      bugReportUrl: "https://example.invalid",
    }));
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "elizacloud",
        elizaCloudLoginError: "Login failed unexpectedly",
      }),
    );

    const { getByRole } = render(
      <ConnectionProviderDetailScreen dispatch={vi.fn()} />,
    );

    const reportIssueButton = getByRole("button", { name: "Report issue" });

    expect(reportIssueButton).toBeDefined();

    fireEvent.click(reportIssueButton);
    expect(mockOpenExternalUrl).toHaveBeenCalledWith("https://example.invalid");
  });

  it("uses the compact success banner for the Eliza Cloud connected state", () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "elizacloud",
        onboardingElizaCloudTab: "login",
        elizaCloudConnected: true,
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-onboarding-status-layout")).toBe(
      "compact",
    );
    const content = banner.querySelector("[data-onboarding-status-content]");
    expect(content?.textContent).toContain("Connected");
  });

  it("exposes openrouter model choices as a radiogroup", () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "openrouter",
        onboardingApiKey: "sk-test-12345678901234567890",
        onboardingOpenRouterModel: "mixtral",
        onboardingOptions: {
          providers: [
            {
              id: "openrouter",
              name: "OpenRouter",
              description: "Many models",
            },
          ],
          openrouterModels: [
            { id: "mixtral", name: "Mixtral", description: "Fast model" },
            {
              id: "sonnet",
              name: "Claude Sonnet",
              description: "Balanced model",
            },
          ],
          piAiModels: [],
          piAiDefaultModel: "",
        },
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    expect(
      screen.getByRole("radiogroup", { name: "Select model" }),
    ).toBeTruthy();
    const selectedModel = screen.getByRole("radio", { name: /Mixtral/i });
    expect(selectedModel).toBeTruthy();
    expect(selectedModel.getAttribute("aria-checked")).toBe("true");
  });

  it("offers add-another-provider and limited-setup actions after Claude subscription connects", async () => {
    const dispatch = vi.fn();
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "anthropic-subscription",
        onboardingOptions: {
          providers: [
            {
              id: "anthropic-subscription",
              name: "Claude Subscription",
              description: "Task agents only",
            },
          ],
          openrouterModels: [],
          piAiModels: [],
          piAiDefaultModel: "",
        },
        onboardingSubscriptionTab: "token",
        onboardingApiKey: "sk-ant-oat01-test-token",
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={dispatch} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Save Claude subscription" }),
    );

    expect(mockClient.submitAnthropicSetupToken).toHaveBeenCalledWith(
      "sk-ant-oat01-test-token",
    );
    expect(
      await screen.findByRole("button", { name: "Add another provider" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add another provider" }));

    expect(
      screen.getByRole("button", { name: "Continue with limited setup" }),
    ).toBeTruthy();
    expect(dispatch).toHaveBeenCalledWith({ type: "clearProvider" });
  });
});
