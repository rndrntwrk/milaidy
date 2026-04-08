// @vitest-environment jsdom

import type React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClient,
  mockUseApp,
  mockOpenExternalUrl,
} = vi.hoisted(() => ({
  mockClient: {
    submitAnthropicSetupToken: vi.fn(async () => ({ success: true })),
    startAnthropicLogin: vi.fn(async () => ({
      authUrl: "https://claude.example.com/login",
    })),
    exchangeAnthropicCode: vi.fn(async () => ({ success: true })),
    startOpenAILogin: vi.fn(async () => ({
      authUrl: "https://chatgpt.example.com/login",
    })),
    exchangeOpenAICode: vi.fn(async () => ({ success: true })),
    deleteSubscription: vi.fn(async () => ({ success: true })),
    restartAgent: vi.fn(async () => ({ ok: true })),
  },
  mockUseApp: vi.fn(),
  mockOpenExternalUrl: vi.fn(async () => {}),
}));

vi.mock("../../api", () => ({
  client: mockClient,
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../hooks", () => ({
  useTimeout: () => ({ setTimeout }),
}));

vi.mock("../../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

import { SubscriptionStatus } from "./SubscriptionStatus";

function t(
  key: string,
  params?: Record<string, string | number | undefined>,
): string {
  const translations: Record<string, string> = {
    "onboarding.setupToken": "Setup token",
    "onboarding.oauthLogin": "OAuth login",
    "onboarding.loginWithAnthropic": "Log in with Claude",
    "onboarding.loginWithOpenAI": "Log in with OpenAI",
    "onboarding.completeLogin": "Complete login",
    "onboarding.connect": "Connect",
    "onboarding.startOver": "Start over",
    "onboarding.connecting": "Connecting",
    "subscriptionstatus.ChatGPTSubscriptionTitle": "ChatGPT Subscription",
    "subscriptionstatus.ClaudeSubscriptionTitle": "Claude Subscription",
    "subscriptionstatus.CodexAllAccess": "Codex can be used everywhere.",
    "subscriptionstatus.RequiresChatGPTPlu": "Requires ChatGPT Plus or Pro.",
    "subscriptionstatus.RequiresClaudePro": "Requires Claude subscription.",
    "subscriptionstatus.AfterLoggingInYo":
      "After logging in, paste the callback URL from",
    "subscriptionstatus.localhost1455": "localhost:1455",
    "subscriptionstatus.CopyTheEntireU": "and copy the entire URL.",
    "subscriptionstatus.httpLocalhost145":
      "http://localhost:1455/auth/callback?code=...",
    "subscriptionstatus.ExpectedCallbackUrl":
      "Expected a localhost:1455/auth/callback URL.",
    "subscriptionstatus.ExchangeFailedError": "Exchange failed: {{message}}",
    "subscriptionstatus.SaveToken": "Save token",
    "subscriptionstatus.SavingAmpRestart": "Saving and restarting…",
    "subscriptionstatus.skAntOat01": "sk-ant-oat01-...",
    "subscriptionstatus.FailedToSaveTokenError":
      "Failed to save token: {{message}}",
    "apikeyconfig.saved": "Saved",
    "apikeyconfig.saving": "Saving",
    "subscriptionstatus.ClaudeTosWarningShort":
      "Claude subscription powers task agents only.",
    "onboarding.setupTokenInstructions":
      "Run claude setup-token and paste the result.",
  };
  const template = translations[key] ?? key;
  if (!params) {
    return template;
  }
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.replace(`{{${name}}}`, String(value ?? "")),
    template,
  );
}

function renderSubscriptionStatus(
  overrides: Partial<React.ComponentProps<typeof SubscriptionStatus>> = {},
) {
  const props: React.ComponentProps<typeof SubscriptionStatus> = {
    resolvedSelectedId: "openai-subscription",
    subscriptionStatus: [],
    anthropicConnected: false,
    setAnthropicConnected: vi.fn(),
    openaiConnected: false,
    setOpenaiConnected: vi.fn(),
    handleSelectSubscription: vi.fn(async () => {}),
    loadSubscriptionStatus: vi.fn(async () => {}),
    ...overrides,
  };

  return {
    ...render(<SubscriptionStatus {...props} />),
    props,
  };
}

describe("SubscriptionStatus", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({ t });
    mockClient.submitAnthropicSetupToken.mockClear();
    mockClient.startAnthropicLogin.mockClear();
    mockClient.exchangeAnthropicCode.mockClear();
    mockClient.startOpenAILogin.mockClear();
    mockClient.exchangeOpenAICode.mockClear();
    mockClient.deleteSubscription.mockClear();
    mockClient.restartAgent.mockClear();
    mockOpenExternalUrl.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("trims Claude setup tokens before persisting them in settings", async () => {
    const handleSelectSubscription = vi.fn(async () => {});
    const loadSubscriptionStatus = vi.fn(async () => {});

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
      handleSelectSubscription,
      loadSubscriptionStatus,
    });

    fireEvent.change(screen.getByLabelText("Setup token"), {
      target: { value: "  sk-ant-oat01-test-token  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    await waitFor(() => {
      expect(mockClient.submitAnthropicSetupToken).toHaveBeenCalledWith(
        "sk-ant-oat01-test-token",
      );
    });
    expect(handleSelectSubscription).toHaveBeenCalledWith(
      "anthropic-subscription",
    );
    expect(loadSubscriptionStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.restartAgent).toHaveBeenCalledTimes(1);
  });

  it("blocks invalid OpenAI callback URLs before calling exchange", async () => {
    renderSubscriptionStatus();

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByPlaceholderText(
      "http://localhost:1455/auth/callback?code=...",
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "http://localhost:1455/auth/callback?code=...",
      ),
      {
        target: { value: "https://example.com/auth/callback?code=oops" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    expect(mockClient.exchangeOpenAICode).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Expected a localhost:1455/auth/callback URL."),
    ).toBeTruthy();
  });

  it("shows the actual OpenAI exchange error instead of a generic network failure", async () => {
    mockClient.exchangeOpenAICode.mockRejectedValueOnce(
      new Error("exchange broke"),
    );

    renderSubscriptionStatus();

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByPlaceholderText(
      "http://localhost:1455/auth/callback?code=...",
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "http://localhost:1455/auth/callback?code=...",
      ),
      {
        target: { value: "localhost:1455/auth/callback?code=openai-code" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    expect(mockClient.exchangeOpenAICode).toHaveBeenCalledWith(
      "http://localhost:1455/auth/callback?code=openai-code",
    );
    expect(
      await screen.findByText("Exchange failed: exchange broke"),
    ).toBeTruthy();
  });
});
