import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";

const BASE_APP_PLUGIN: RegistryPluginInfo = {
  name: HYPERSCAPE_APP_NAME,
  gitRepo: "elizaos/app-hyperscape",
  gitUrl: "https://github.com/elizaos/app-hyperscape",
  description: "Hyperscape app",
  topics: [],
  stars: 1,
  language: "TypeScript",
  kind: "app",
  npm: {
    package: HYPERSCAPE_APP_NAME,
    v0Version: null,
    v1Version: null,
    v2Version: null,
  },
  supports: { v0: false, v1: true, v2: true },
};

const APP_INFO: RegistryAppInfo = {
  name: HYPERSCAPE_APP_NAME,
  displayName: "Hyperscape",
  description: "AI RPG",
  category: "game",
  launchType: "connect",
  launchUrl: "https://hyperscape.gg/",
  icon: null,
  capabilities: ["exploration"],
  stars: 1,
  repository: "https://github.com/elizaos/app-hyperscape",
  latestVersion: "1.0.0",
  supports: { v0: false, v1: true, v2: true },
  npm: {
    package: HYPERSCAPE_APP_NAME,
    v0Version: null,
    v1Version: null,
    v2Version: null,
  },
  viewer: {
    url: "https://hyperscape.gg/",
    embedParams: {
      embedded: "true",
      mode: "spectator",
      quality: "medium",
    },
    postMessageAuth: true,
  },
};

function createPluginManager(
  overrides: Partial<PluginManagerLike> = {},
): PluginManagerLike {
  return {
    refreshRegistry: vi.fn(async () => new Map()),
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(async () => ({ ...BASE_APP_PLUGIN })),
    searchRegistry: vi.fn(async () => []),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: HYPERSCAPE_APP_NAME,
      version: "1.0.0",
      installPath: "/tmp/plugin",
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: HYPERSCAPE_APP_NAME,
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: HYPERSCAPE_APP_NAME,
      ejectedPath: "/tmp/plugin",
      requiresRestart: false,
    })),
    syncPlugin: vi.fn(async () => ({
      success: true,
      pluginName: HYPERSCAPE_APP_NAME,
      ejectedPath: "/tmp/plugin",
      requiresRestart: false,
    })),
    reinjectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: HYPERSCAPE_APP_NAME,
      removedPath: "/tmp/plugin",
      requiresRestart: false,
    })),
    ...overrides,
  };
}

describe("AppManager hyperscape auto-provisioning resilience", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    envSnapshot = {
      NODE_ENV: process.env.NODE_ENV,
      VITEST: process.env.VITEST,
      VITEST_WORKER_ID: process.env.VITEST_WORKER_ID,
      JEST_WORKER_ID: process.env.JEST_WORKER_ID,
      EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY,
      HYPERSCAPE_SERVER_URL: process.env.HYPERSCAPE_SERVER_URL,
      HYPERSCAPE_CHARACTER_ID: process.env.HYPERSCAPE_CHARACTER_ID,
      HYPERSCAPE_AUTH_TOKEN: process.env.HYPERSCAPE_AUTH_TOKEN,
    };

    process.env.NODE_ENV = "production";
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    process.env.EVM_PRIVATE_KEY =
      "0x59c6995e998f97a5a0044966f094538b292f0a1f0d7f5f9e3f98e8a7f8b80d0b";
    process.env.HYPERSCAPE_SERVER_URL = "wss://hyperscape.example/ws";
    delete process.env.HYPERSCAPE_CHARACTER_ID;
    delete process.env.HYPERSCAPE_AUTH_TOKEN;

    mockRegistryGetAppInfo.mockResolvedValue(APP_INFO);
    mockRegistryGetPluginInfo.mockResolvedValue(null);
    mockRegistryGetPlugins.mockResolvedValue(
      new Map<string, RegistryPluginInfo>([[HYPERSCAPE_APP_NAME, BASE_APP_PLUGIN]]),
    );
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.restoreAllMocks();
  });

  it("fails fast when fallback returns only characterId and no auth token", async () => {
    const appManager = new AppManager();
    const pluginManager = createPluginManager();
    let walletAuthCalls = 0;
    let fallbackCalls = 0;

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/agents/wallet-auth")) {
        walletAuthCalls += 1;
        throw new Error("This operation was aborted");
      }
      if (url.includes("/api/embedded-agents")) {
        fallbackCalls += 1;
        return new Response(
          JSON.stringify({
            success: true,
            agents: [{ characterId: "fallback-char-1", state: "running" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    }) as typeof global.fetch;

    await expect(
      appManager.launch(pluginManager, HYPERSCAPE_APP_NAME),
    ).rejects.toThrow(/HYPERSCAPE_AUTH_TOKEN is missing/);

    expect(walletAuthCalls).toBe(3);
    expect(fallbackCalls).toBe(1);
    expect(process.env.HYPERSCAPE_CHARACTER_ID).toBe("fallback-char-1");
    expect(process.env.HYPERSCAPE_AUTH_TOKEN).toBeUndefined();
  });
});
