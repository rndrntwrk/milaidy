// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginInfo } from "../api";

const mockGetPlugins = vi.fn();
const mockSwitchProvider = vi.fn();
const mockUpdatePlugin = vi.fn();
const mockTriggerRestart = vi.fn();

vi.mock("../api", () => ({
  client: {
    getPlugins: (...args: unknown[]) => mockGetPlugins(...args),
    switchProvider: (...args: unknown[]) => mockSwitchProvider(...args),
    updatePlugin: (...args: unknown[]) => mockUpdatePlugin(...args),
  },
}));

vi.mock("../utils", () => ({
  confirmDesktopAction: vi.fn(),
}));

import { usePluginsSkillsState } from "./usePluginsSkillsState";

const openAiPlugin: PluginInfo = {
  id: "plugin-openai",
  name: "OpenAI",
  category: "ai-provider",
  enabled: true,
  configured: true,
  parameters: [],
};

describe("usePluginsSkillsState.handlePluginConfigSave", () => {
  beforeEach(() => {
    mockGetPlugins.mockReset();
    mockSwitchProvider.mockReset();
    mockUpdatePlugin.mockReset();
    mockTriggerRestart.mockReset();

    mockGetPlugins.mockResolvedValue({
      plugins: [openAiPlugin],
    });
    mockSwitchProvider.mockResolvedValue({
      success: true,
      provider: "openai",
      restarting: true,
    });
    mockUpdatePlugin.mockResolvedValue({ ok: true });
  });

  it("normalizes ai provider plugin ids before requesting a provider switch", async () => {
    const setActionNotice = vi.fn();
    const setPendingRestart = vi.fn();
    const setPendingRestartReasons = vi.fn();
    const showRestartBanner = vi.fn();
    const { result } = renderHook(() =>
      usePluginsSkillsState({
        setActionNotice,
        setPendingRestart,
        setPendingRestartReasons,
        showRestartBanner,
        triggerRestart: (...args: unknown[]) => mockTriggerRestart(...args),
      }),
    );

    act(() => {
      result.current.setPlugins([openAiPlugin]);
    });

    await act(async () => {
      await result.current.handlePluginConfigSave("plugin-openai", {
        apiKey: "sk-openai-test",
      });
    });

    expect(mockUpdatePlugin).toHaveBeenCalledWith("plugin-openai", {
      config: { apiKey: "sk-openai-test" },
    });
    expect(mockSwitchProvider).toHaveBeenCalledWith("openai", "sk-openai-test");
  });

  it("marks plugin toggles as pending restart immediately", async () => {
    const setActionNotice = vi.fn();
    const setPendingRestart = vi.fn();
    const setPendingRestartReasons = vi.fn();
    const showRestartBanner = vi.fn();
    const discordPlugin: PluginInfo = {
      id: "discord",
      name: "Discord",
      category: "connector",
      enabled: false,
      configured: true,
      parameters: [],
    };
    const { result } = renderHook(() =>
      usePluginsSkillsState({
        setActionNotice,
        setPendingRestart,
        setPendingRestartReasons,
        showRestartBanner,
        triggerRestart: (...args: unknown[]) => mockTriggerRestart(...args),
      }),
    );

    act(() => {
      result.current.setPlugins([discordPlugin]);
    });

    await act(async () => {
      await result.current.handlePluginToggle("discord", true);
    });

    expect(mockUpdatePlugin).toHaveBeenCalledWith("discord", {
      enabled: true,
    });
    expect(setPendingRestart).toHaveBeenCalledWith(true);
    expect(setPendingRestartReasons).toHaveBeenCalledTimes(1);
    expect(
      setPendingRestartReasons.mock.calls[0]?.[0](["other change"]),
    ).toEqual(["other change", "Plugin toggle: discord"]);
    expect(showRestartBanner).toHaveBeenCalledTimes(1);
    expect(mockTriggerRestart).toHaveBeenCalledTimes(1);
  });
});
