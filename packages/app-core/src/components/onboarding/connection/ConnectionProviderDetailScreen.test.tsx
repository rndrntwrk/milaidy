// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClient,
  mockUseApp,
  mockUseBranding,
  mockOpenExternalUrl,
  mockGetProviderLogo,
} = vi.hoisted(() => ({
  mockClient: {
    startAnthropicLogin: vi.fn(async () => ({
      authUrl: "https://claude.example.com/login",
    })),
    exchangeAnthropicCode: vi.fn(async () => ({ success: true })),
    submitAnthropicSetupToken: vi.fn(async () => ({ success: true })),
    startOpenAILogin: vi.fn(async () => ({
      authUrl: "https://chatgpt.example.com/login",
    })),
    exchangeOpenAICode: vi.fn(async () => ({ success: true })),
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

vi.mock("../../../providers", async () => {
  const actual = await vi.importActual<typeof import("../../../providers")>(
    "../../../providers",
  );
  return {
    ...actual,
    getProviderLogo: (...args: unknown[]) => mockGetProviderLogo(...args),
  };
});

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
    "onboarding.configureAiLater": "Set up later",
    "onboarding.continueLimitedSetup": "Continue with limited setup",
    "onboarding.confirm": "Confirm",
    "onboarding.connectAccount": "Connect account",
    "onboarding.connect": "Connect",
    "onboarding.connecting": "Connecting",
    "onboarding.login": "Login",
    "onboarding.loginWithAnthropic": "Log in with Claude",
    "onboarding.loginWithOpenAI": "Log in with OpenAI",
    "onboarding.requiresClaudeSub": "Requires Claude subscription",
    "onboarding.requiresChatGPTSub": "Requires ChatGPT subscription",
    "onboarding.pasteAuthCode": "Paste auth code",
    "onboarding.authCodeInstructions": "Paste the full auth code here.",
    "onboarding.exchangeFailedWithMessage": "Exchange failed: {{message}}",
    "onboarding.failedToStartLogin": "Failed to start login: {{message}}",
    "onboarding.almostThere": "Almost there",
    "onboarding.redirectInstructions": "Paste the callback from",
    "onboarding.copyEntireUrl": "and copy the entire URL.",
    "onboarding.redirectUrl": "Redirect URL",
    "onboarding.redirectUrlPlaceholder":
      "http://localhost:1455/auth/callback?code=...",
    "onboarding.completeLogin": "Complete login",
    "onboarding.startOver": "Start over",
    "onboarding.openLoginPageInBrowser": "Open login page in browser",
    "onboarding.openLoginPageInBrowserDesc":
      "Open the login page in your browser to continue.",
    "onboarding.reportIssue": "Report issue",
    "onboarding.saveClaudeSubscription": "Save Claude subscription",
    "onboarding.useExistingKey": "Use an existing key.",
    "onboarding.getOneHere": "Get one here",
    "onboarding.freeCredits": "Free credits included.",
    "onboarding.selectModel": "Select model",
    "subscriptionstatus.FailedToSaveSetupToken": "Failed to save setup token",
    "subscriptionstatus.FailedToSaveTokenError": "Failed to save token",
    "subscriptionstatus.ExpectedCallbackUrl":
      "Expected a localhost:1455/auth/callback URL.",
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
    mockClient.startAnthropicLogin.mockClear();
    mockClient.exchangeAnthropicCode.mockClear();
    mockClient.submitAnthropicSetupToken.mockClear();
    mockClient.startOpenAILogin.mockClear();
    mockClient.exchangeOpenAICode.mockClear();
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

  it("trims Claude tokens and lets the user continue with limited setup after saving", async () => {
    const dispatch = vi.fn();
    const handleOnboardingNext = vi.fn(async () => {});
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
        onboardingApiKey: "  sk-ant-oat01-test-token  ",
        handleOnboardingNext,
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
      await screen.findByRole("button", { name: "Continue with limited setup" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add another provider" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with limited setup" }),
    );

    expect(handleOnboardingNext).toHaveBeenCalledWith({
      omitRuntimeProvider: true,
    });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "clearProvider" });
  });

  it("lets the user go back to the provider picker after Claude subscription connects", async () => {
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

    await screen.findByRole("button", { name: "Add another provider" });
    fireEvent.click(screen.getByRole("button", { name: "Add another provider" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "clearProvider" });
  });

  it("shows Claude save errors and keeps limited-setup actions hidden until save succeeds", async () => {
    mockClient.submitAnthropicSetupToken.mockRejectedValueOnce(
      new Error("save failed"),
    );
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

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Save Claude subscription" }),
    );

    expect(await screen.findByText("Failed to save token")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Continue with limited setup" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add another provider" }),
    ).toBeNull();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save Claude subscription" }),
      ).toBeTruthy();
    });
  });

  it("lets the user defer Claude setup from the token tab", async () => {
    const handleOnboardingNext = vi.fn(async () => {});
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
        onboardingApiKey: "",
        handleOnboardingNext,
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Set up later" }));

    expect(handleOnboardingNext).toHaveBeenCalledWith();
    expect(mockClient.submitAnthropicSetupToken).not.toHaveBeenCalled();
  });

  it("trims Claude OAuth auth codes before exchange", async () => {
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
        onboardingSubscriptionTab: "oauth",
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Log in with Claude" }));
    await screen.findByLabelText("Paste auth code");
    fireEvent.change(screen.getByLabelText("Paste auth code"), {
      target: { value: "  anthro-code-123  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(mockClient.exchangeAnthropicCode).toHaveBeenCalledWith(
      "anthro-code-123",
    );
  });

  it("normalizes OpenAI callback URLs before exchange", async () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "openai-subscription",
        onboardingOptions: {
          providers: [
            {
              id: "openai-subscription",
              name: "ChatGPT Subscription",
              description: "Plus/Pro subscription",
            },
          ],
          openrouterModels: [],
          piAiModels: [],
          piAiDefaultModel: "",
        },
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByLabelText("Redirect URL");
    fireEvent.change(screen.getByLabelText("Redirect URL"), {
      target: {
        value: "  localhost:1455/auth/callback?code=openai-auth-code  ",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    expect(mockClient.exchangeOpenAICode).toHaveBeenCalledWith(
      "http://localhost:1455/auth/callback?code=openai-auth-code",
    );
  });

  it("rejects invalid OpenAI callback URLs before calling exchange", async () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "openai-subscription",
        onboardingOptions: {
          providers: [
            {
              id: "openai-subscription",
              name: "ChatGPT Subscription",
              description: "Plus/Pro subscription",
            },
          ],
          openrouterModels: [],
          piAiModels: [],
          piAiDefaultModel: "",
        },
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByLabelText("Redirect URL");
    fireEvent.change(screen.getByLabelText("Redirect URL"), {
      target: { value: "https://example.com/auth/callback?code=oops" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    expect(mockClient.exchangeOpenAICode).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Expected a localhost:1455/auth/callback URL."),
    ).toBeTruthy();
  });
});
