// @vitest-environment jsdom
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../AppContext";
import { Header } from "./Header";

// Mock the AppContext
vi.mock("../AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("../hooks/useBugReport", () => ({
  useBugReport: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

vi.mock("./shared/AgentModeDropdown", () => ({
  AgentModeDropdown: () =>
    React.createElement("div", null, "AgentModeDropdown"),
}));

vi.mock("../navigation", () => ({
  getTabGroups: () => [
    {
      label: "Chat",
      tabs: ["chat"],
      icon: () => React.createElement("span", null, "ChatIcon"),
      description: "Chat",
    },
  ],
}));

vi.mock("./shared/LanguageDropdown", () => ({
  LanguageDropdown: () => React.createElement("div", null, "LanguageDropdown"),
}));

vi.mock("./ui/IconTooltip", () => ({
  IconTooltip: ({
    children,
  }: {
    children: React.ReactNode;
    content?: string;
    side?: string;
  }) => React.createElement("div", null, children),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => React.createElement("span", null, "WarningIcon"),
  Bug: () => React.createElement("span", null, "BugIcon"),
  CircleDollarSign: () => React.createElement("span", null, "DollarIcon"),
  Menu: () => React.createElement("span", null, "MenuIcon"),
  Monitor: () => React.createElement("span", null, "MonitorIcon"),
  Smartphone: () => React.createElement("span", null, "PhoneIcon"),
  X: () => React.createElement("span", null, "CloseIcon"),
}));

describe("Header", () => {
  it("renders agent name and shell toggle", async () => {
    // Mock the useApp hook return value
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Milady" },
      miladyCloudEnabled: false,
      miladyCloudConnected: false,
      miladyCloudCredits: null,
      miladyCloudCreditsCritical: false,
      miladyCloudCreditsLow: false,
      miladyCloudTopUpUrl: "",
      lifecycleBusy: false,
      lifecycleAction: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiShellMode: "native",
      setUiShellMode: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }
    const root = (testRenderer as ReactTestRenderer).root;

    // Check agent name
    const agentName = root.findByProps({ "data-testid": "agent-name" });
    expect(agentName.children).toContain("Milady");

    // Check shell toggle button
    const shellToggle = root.findByProps({ "data-testid": "ui-shell-toggle" });
    expect(shellToggle).toBeDefined();
  });
});
