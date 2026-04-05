import { describe, expect, it, vi } from "vitest";
import { AppManager } from "../../src/services/app-manager";
import type { PluginManagerLike } from "../../src/services/plugin-manager-types";

function buildPluginManager(
  installedPlugins: Array<{
    name: string;
    version?: string;
    installedAt?: string;
  }>,
): PluginManagerLike {
  return {
    refreshRegistry: vi.fn(async () => new Map()),
    listInstalledPlugins: vi.fn(async () => installedPlugins),
    getRegistryPlugin: vi.fn(async () => null),
    searchRegistry: vi.fn(async () => []),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      version: "1.0.0",
      installPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      ejectedPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    syncPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      ejectedPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    reinjectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      removedPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
  };
}

describe("AppManager.listInstalled", () => {
  it("preserves the recorded install timestamp when plugin manager provides one", async () => {
    const manager = new AppManager();
    const installed = await manager.listInstalled(
      buildPluginManager([
        {
          name: "@elizaos/app-hyperscape",
          version: "1.2.3",
          installedAt: "2026-04-04T12:34:56.000Z",
        },
      ]),
    );

    expect(installed).toEqual([
      expect.objectContaining({
        name: "@elizaos/app-hyperscape",
        version: "1.2.3",
        installedAt: "2026-04-04T12:34:56.000Z",
      }),
    ]);
  });

  it("returns an empty install timestamp when none is recorded", async () => {
    const manager = new AppManager();
    const installed = await manager.listInstalled(
      buildPluginManager([
        {
          name: "@elizaos/app-hyperscape",
          version: "1.2.3",
        },
      ]),
    );

    expect(installed[0]?.installedAt).toBe("");
  });
});
