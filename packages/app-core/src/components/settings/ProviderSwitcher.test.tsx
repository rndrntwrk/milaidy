import React from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderSwitcher } from "./ProviderSwitcher";

type MockSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  children?: React.ReactNode;
};

type MockChildrenProps = {
  children?: React.ReactNode;
};

type MockSelectItemProps = {
  value: string;
  disabled?: boolean;
  children?: React.ReactNode;
};

const mockGetConfig = vi.fn();
const mockGetOnboardingOptions = vi.fn();
const mockGetSubscriptionStatus = vi.fn();
const mockSwitchProvider = vi.fn();
const mockUseApp = vi.fn();
const mockSetActionNotice = vi.fn();

vi.mock("../../api", () => ({
  client: {
    getConfig: (...args: unknown[]) => mockGetConfig(...args),
    getOnboardingOptions: (...args: unknown[]) =>
      mockGetOnboardingOptions(...args),
    getSubscriptionStatus: (...args: unknown[]) =>
      mockGetSubscriptionStatus(...args),
    switchProvider: (...args: unknown[]) => mockSwitchProvider(...args),
    updateConfig: vi.fn(async () => ({ ok: true })),
    restartAgent: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../config", () => ({
  ConfigRenderer: () => null,
  defaultRegistry: {},
}));

vi.mock("../../config/branding", () => ({
  useBranding: () => ({}),
}));

vi.mock("../../hooks", () => ({
  useTimeout: () => ({ setTimeout }),
}));

vi.mock("../../utils", () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock("./ApiKeyConfig", () => ({
  ApiKeyConfig: () => null,
}));

vi.mock("./SubscriptionStatus", () => ({
  SubscriptionStatus: () => null,
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({ children }: MockChildrenProps) => <button>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Select: ({ value, onValueChange, children }: MockSelectProps) => (
    <select
      value={value}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
        onValueChange(e.target.value)
      }
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: MockChildrenProps) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: MockChildrenProps) => <>{children}</>,
  SelectItem: ({ value, disabled, children }: MockSelectItemProps) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
}));

function defaultProps() {
  return {
    elizaCloudEnabled: true,
    elizaCloudConnected: false,
    elizaCloudCredits: null,
    elizaCloudCreditsLow: false,
    elizaCloudCreditsCritical: false,
    elizaCloudTopUpUrl: "",
    elizaCloudUserId: null,
    elizaCloudLoginBusy: false,
    elizaCloudLoginError: null,
    cloudDisconnecting: false,
    plugins: [
      {
        id: "plugin-openai",
        name: "OpenAI",
        category: "ai-provider",
        enabled: true,
        configured: true,
        parameters: [],
      },
      {
        id: "plugin-anthropic",
        name: "Anthropic",
        category: "ai-provider",
        enabled: true,
        configured: true,
        parameters: [],
      },
    ],
    pluginSaving: new Set<string>(),
    pluginSaveSuccess: new Set<string>(),
    loadPlugins: vi.fn(async () => {}),
    handlePluginToggle: vi.fn(async () => {}),
    handlePluginConfigSave: vi.fn(),
    handleCloudLogin: vi.fn(async () => {}),
    handleCloudDisconnect: vi.fn(async () => {}),
    setState: vi.fn(),
    setTab: vi.fn(),
  };
}

function getSelect(tree: ReactTestRenderer): ReactTestInstance {
  return tree.root.find(
    (node: ReactTestInstance) =>
      node.type === "select" && node.props.value !== undefined,
  );
}

function getSelectValue(tree: ReactTestRenderer): string | undefined {
  return getSelect(tree).props.value;
}

describe("ProviderSwitcher subscription selection behavior", () => {
  beforeEach(() => {
    mockGetConfig.mockReset();
    mockGetOnboardingOptions.mockReset();
    mockGetSubscriptionStatus.mockReset();
    mockSwitchProvider.mockReset();
    mockSetActionNotice.mockReset();
    mockUseApp.mockReturnValue({
      t: (key: string) => key,
      setActionNotice: (...args: unknown[]) => mockSetActionNotice(...args),
      elizaCloudConnected: false,
      elizaCloudCredits: null,
      elizaCloudCreditsLow: false,
      elizaCloudCreditsCritical: false,
      elizaCloudUserId: null,
      elizaCloudLoginBusy: false,
      elizaCloudLoginError: null,
      elizaCloudDisconnecting: false,
      plugins: [],
      pluginSaving: new Set<string>(),
      pluginSaveSuccess: new Set<string>(),
      loadPlugins: vi.fn(async () => {}),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: vi.fn(async () => {}),
      handleCloudDisconnect: vi.fn(async () => {}),
      setState: vi.fn(),
      setTab: vi.fn(),
    });
    mockGetConfig.mockResolvedValue({
      models: {},
      cloud: {
        enabled: false,
        inferenceMode: "byok",
        services: { inference: false },
      },
      agents: {},
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockSwitchProvider.mockResolvedValue({ ok: true });
  });

  it("selects Claude Subscription without switching the runtime immediately", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({
      providers: [
        {
          provider: "anthropic-subscription",
          configured: true,
          valid: true,
          expiresAt: null,
        },
      ],
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "anthropic-subscription" },
      });
      await Promise.resolve();
    });

    expect(getSelectValue(tree)).toBe("anthropic-subscription");
    expect(mockSwitchProvider).not.toHaveBeenCalled();
  });

  it("selects disconnected ChatGPT Subscription without switching the runtime", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "openai-subscription" },
      });
      await Promise.resolve();
    });

    expect(getSelectValue(tree)).toBe("openai-subscription");
    expect(mockSwitchProvider).not.toHaveBeenCalled();
  });

  it("switches the runtime when ChatGPT Subscription is already connected", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({
      providers: [
        {
          provider: "openai-subscription",
          configured: true,
          valid: true,
          expiresAt: null,
        },
      ],
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "openai-subscription" },
      });
      await Promise.resolve();
    });

    expect(getSelectValue(tree)).toBe("openai-subscription");
    expect(mockSwitchProvider).toHaveBeenCalledWith("openai-subscription");
  });

  it("rolls the UI selection back and surfaces an error when a runtime switch fails", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({
      providers: [
        {
          provider: "openai-subscription",
          configured: true,
          valid: true,
          expiresAt: null,
        },
      ],
    });
    mockSwitchProvider.mockRejectedValueOnce(new Error("switch failed"));

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getSelectValue(tree)).toBe("__cloud__");

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "openai-subscription" },
      });
      await Promise.resolve();
    });

    expect(mockSwitchProvider).toHaveBeenCalledWith("openai-subscription");
    expect(getSelectValue(tree)).toBe("__cloud__");
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "Failed to update subscription provider: switch failed",
      "error",
      6000,
    );
  });
});
