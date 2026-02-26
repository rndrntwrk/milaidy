import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "./plugin-manager-types";
import type { RegistryAppInfo } from "./registry-client";
import { AppManager } from "./app-manager";

const mockRegistryGetAppInfo = vi.hoisted(() => vi.fn());
const mockRegistryGetPluginInfo = vi.hoisted(() => vi.fn());
const mockRegistryGetPlugins = vi.hoisted(() => vi.fn());
const mockListInstalledPlugins = vi.hoisted(() => vi.fn(() => []));

vi.mock("./registry-client.js", () => ({
  getAppInfo: mockRegistryGetAppInfo,
  getPluginInfo: mockRegistryGetPluginInfo,
  getRegistryPlugins: mockRegistryGetPlugins,
}));

vi.mock("./plugin-installer.js", () => ({
  listInstalledPlugins: mockListInstalledPlugins,
}));

const BASE_APP_PLUGIN: RegistryPluginInfo = {
  name: "@elizaos/app-hyperscape",
  gitRepo: "elizaos/app-hyperscape",
  gitUrl: "https://github.com/elizaos/app-hyperscape",
  description: "Hyperscape app",
  topics: [],
  stars: 1,
  language: "TypeScript",
  kind: "app",
  npm: {
    package: "@elizaos/app-hyperscape",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  supports: { v0: false, v1: true, v2: true },
};

const APP_INFO: RegistryAppInfo = {
  name: "@elizaos/app-hyperscape",
  displayName: "Hyperscape",
  description: "AI RPG",
  category: "game",
  launchType: "connect",
  launchUrl: "http://localhost:3333",
  icon: null,
  capabilities: ["exploration", "social-chat"],
  stars: 1,
  repository: "https://github.com/elizaos/app-hyperscape",
  latestVersion: "1.0.0",
  supports: { v0: false, v1: true, v2: true },
  npm: {
    package: "@elizaos/app-hyperscape",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  viewer: {
    url: "http://localhost:3333",
    postMessageAuth: true,
  },
};

function createPluginManager(
  overrides: Partial<PluginManagerLike> = {},
): PluginManagerLike {
  return {
    refreshRegistry: vi.fn(async () => new Map()),
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(async () => null),
    searchRegistry: vi.fn(async () => []),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      version: "1.0.0",
      installPath: "/tmp/plugin",
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
      ejectedPath: "/tmp/plugin",
      requiresRestart: false,
    })),
    syncPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      ejectedPath: "/tmp/plugin",
      requiresRestart: false,
    })),
    reinjectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      removedPath: "/tmp/plugin",
      requiresRestart: false,
    })),
    ...overrides,
  };
}

describe("AppManager metadata fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistryGetAppInfo.mockResolvedValue(null);
    mockRegistryGetPluginInfo.mockResolvedValue(null);
    mockRegistryGetPlugins.mockResolvedValue(new Map());
  });

  it("merges local registry apps into listAvailable", async () => {
    const appManager = new AppManager();
    const pluginManager = createPluginManager({
      refreshRegistry: vi.fn(async () => new Map<string, RegistryPluginInfo>()),
    });
    mockRegistryGetPlugins.mockResolvedValue(
      new Map<string, RegistryPluginInfo>([[BASE_APP_PLUGIN.name, BASE_APP_PLUGIN]]),
    );

    const apps = await appManager.listAvailable(pluginManager);

    expect(apps.some((app) => app.name === BASE_APP_PLUGIN.name)).toBe(true);
  });

  it("fills viewer metadata from registry app info", async () => {
    const appManager = new AppManager();
    const pluginManager = createPluginManager({
      getRegistryPlugin: vi.fn(async () => ({ ...BASE_APP_PLUGIN })),
    });
    mockRegistryGetAppInfo.mockResolvedValue(APP_INFO);

    const info = await appManager.getInfo(pluginManager, APP_INFO.name);

    expect(info).not.toBeNull();
    expect(info?.launchUrl).toBe(APP_INFO.launchUrl);
    expect(info?.viewer?.url).toBe(APP_INFO.viewer?.url);
    expect(info?.displayName).toBe(APP_INFO.displayName);
  });

  it("returns synthesized plugin info when plugin-manager has no app", async () => {
    const appManager = new AppManager();
    const pluginManager = createPluginManager({
      getRegistryPlugin: vi.fn(async () => null),
    });
    mockRegistryGetAppInfo.mockResolvedValue(APP_INFO);

    const info = await appManager.getInfo(pluginManager, APP_INFO.name);

    expect(info).not.toBeNull();
    expect(info?.name).toBe(APP_INFO.name);
    expect(info?.npm.package).toBe(APP_INFO.npm.package);
    expect(info?.viewer?.url).toBe(APP_INFO.viewer?.url);
  });
});
