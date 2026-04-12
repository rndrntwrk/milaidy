import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPluginInfo } from "./registry-client-types.js";

/**
 * registry-client tests using real filesystem operations for caching.
 *
 * The network fetch and local-scan modules are still mocked because they
 * depend on external services (GitHub registry) and workspace directory
 * structures that are impractical to set up in a unit test.
 */

const fetchFromNetworkMock = vi.fn();
const applyLocalWorkspaceAppsMock = vi.fn();
const applyNodeModulePluginsMock = vi.fn();
const mergeCustomEndpointsMock = vi.fn();
const loadElizaConfigMock = vi.fn();

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: loadElizaConfigMock,
  saveElizaConfig: vi.fn(),
}));

vi.mock("./registry-client-network.js", () => ({
  fetchFromNetwork: fetchFromNetworkMock,
}));

vi.mock("./registry-client-local.js", () => ({
  applyLocalWorkspaceApps: applyLocalWorkspaceAppsMock,
  applyNodeModulePlugins: applyNodeModulePluginsMock,
}));

vi.mock("./registry-client-endpoints.js", () => ({
  mergeCustomEndpoints: mergeCustomEndpointsMock,
  normaliseEndpointUrl: (url: string) => url.replace(/\/+$/, ""),
  parseRegistryEndpointUrl: (url: string) => new URL(url),
  isDefaultEndpoint: (url: string, defaultUrl: string) =>
    url.replace(/\/+$/, "") === defaultUrl.replace(/\/+$/, ""),
}));

function createPluginInfo(
  name: string,
  options: {
    displayName?: string;
    gitRepo?: string;
  } = {},
): RegistryPluginInfo {
  return {
    name,
    gitRepo:
      options.gitRepo ??
      `elizaos-plugins/${name.split("/").at(-1) ?? "plugin"}`,
    gitUrl: `https://github.com/${options.gitRepo ?? `elizaos-plugins/${name.split("/").at(-1) ?? "plugin"}`}.git`,
    description: "",
    homepage: null,
    topics: [],
    stars: 0,
    language: "TypeScript",
    npm: {
      package: name,
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    git: {
      v0Branch: null,
      v1Branch: null,
      v2Branch: "main",
    },
    supports: {
      v0: false,
      v1: false,
      v2: true,
    },
    kind: "app",
    appMeta: {
      displayName: options.displayName ?? name,
      category: "game",
      launchType: "url",
      launchUrl: null,
      icon: null,
      capabilities: [],
      minPlayers: null,
      maxPlayers: null,
    },
  };
}

let tmpStateDir: string;

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}

describe("registry-client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Use a real temp dir for the state/cache
    tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-registry-test-"));

    process.env.MILADY_STATE_DIR = tmpStateDir;
    delete process.env.ELIZA_STATE_DIR;
    delete process.env.MILADY_NAMESPACE;
    delete process.env.ELIZA_NAMESPACE;

    fetchFromNetworkMock.mockResolvedValue(new Map());
    applyLocalWorkspaceAppsMock.mockResolvedValue(undefined);
    applyNodeModulePluginsMock.mockResolvedValue(undefined);
    mergeCustomEndpointsMock.mockResolvedValue(undefined);
    loadElizaConfigMock.mockReturnValue({});
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpStateDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    delete process.env.MILADY_STATE_DIR;
  });

  it("stores the registry cache under the Milady state dir", async () => {
    fetchFromNetworkMock.mockResolvedValue(
      new Map([
        [
          "@elizaos/app-2004scape",
          createPluginInfo("@elizaos/app-2004scape", {
            displayName: "2004scape",
          }),
        ],
      ]),
    );

    const { getRegistryPlugins } = await import("./registry-client.js");
    const plugins = await getRegistryPlugins();

    expect(plugins.has("@elizaos/app-2004scape")).toBe(true);

    // Verify the cache file was actually written to the real filesystem
    const cachePath = path.join(tmpStateDir, "cache", "registry.json");
    await waitFor(() => fs.existsSync(cachePath));
    expect(fs.existsSync(cachePath)).toBe(true);
    const cacheContent = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    expect(cacheContent.plugins).toBeDefined();
  });

  it("falls back to local discovery when the network registry is unavailable", async () => {
    fetchFromNetworkMock.mockRejectedValue(new Error("timed out"));
    applyLocalWorkspaceAppsMock.mockImplementation(
      async (plugins: Map<string, RegistryPluginInfo>) => {
        plugins.set(
          "@miladyai/app-local-only",
          createPluginInfo("@miladyai/app-local-only", {
            displayName: "Local Only",
          }),
        );
      },
    );

    const { getRegistryPlugins } = await import("./registry-client.js");
    const plugins = await getRegistryPlugins();

    expect(plugins.has("@miladyai/app-local-only")).toBe(true);
    expect(mergeCustomEndpointsMock).toHaveBeenCalled();
  });

  it("filters removed apps from cache, local discovery, and custom endpoint merges", async () => {
    // Pre-seed a cache file on the real filesystem
    const cacheDir = path.join(tmpStateDir, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, "registry.json"),
      JSON.stringify({
        fetchedAt: Date.now(),
        plugins: [
          [
            "@elizaos/app-agent-town",
            createPluginInfo("@elizaos/app-agent-town", {
              displayName: "Agent Town",
              gitRepo: "Agent-Town/agent-town",
            }),
          ],
          [
            "@elizaos/app-2004scape",
            createPluginInfo("@elizaos/app-2004scape", {
              displayName: "2004scape",
            }),
          ],
        ],
      }),
      "utf-8",
    );

    applyLocalWorkspaceAppsMock.mockImplementation(
      async (plugins: Map<string, RegistryPluginInfo>) => {
        plugins.set(
          "@elizaos/app-dungeons",
          createPluginInfo("@elizaos/app-dungeons", {
            displayName: "Dungeons",
            gitRepo: "lalalune/dungeons",
          }),
        );
        plugins.set(
          "@elizaos/app-babylon",
          createPluginInfo("@elizaos/app-babylon", {
            displayName: "Babylon",
          }),
        );
      },
    );

    mergeCustomEndpointsMock.mockImplementation(
      async (plugins: Map<string, RegistryPluginInfo>) => {
        plugins.set(
          "@elizaos/app-dungeons-and-daemons",
          createPluginInfo("@elizaos/app-dungeons-and-daemons", {
            displayName: "Dungeons and Daemons",
            gitRepo: "lalalune/dungeons-and-daemons",
          }),
        );
      },
    );

    const { getRegistryPlugins } = await import("./registry-client.js");
    const plugins = await getRegistryPlugins();

    expect([...plugins.keys()].sort()).toEqual([
      "@elizaos/app-2004scape",
      "@elizaos/app-babylon",
    ]);

    // Verify the updated cache was written back to disk
    const cachePath = path.join(tmpStateDir, "cache", "registry.json");
    await waitFor(() => {
      const cachePayload = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as {
        plugins: Array<[string, RegistryPluginInfo]>;
      };
      return !cachePayload.plugins.some(([name]) => name === "@elizaos/app-agent-town");
    });
    const cachePayload = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as {
      plugins: Array<[string, RegistryPluginInfo]>;
    };
    expect(cachePayload.plugins.map(([name]) => name)).toEqual([
      "@elizaos/app-2004scape",
    ]);
  });
});
