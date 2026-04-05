import http from "node:http";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "../../src/services/plugin-manager-types";

const appPackageModuleMocks = vi.hoisted(() => {
  class HyperscapeServiceStub {
    static serviceType = "hyperscapeService";
  }

  return {
    importAppPlugin: vi.fn(async (packageName: string) => ({
      name: packageName,
      services: [HyperscapeServiceStub],
    })),
  };
});

const registryClientMocks = vi.hoisted(() => ({
  getPluginInfo: vi.fn(async () => null),
  getRegistryPlugins: vi.fn(async () => new Map()),
}));

vi.mock("../../src/services/app-package-modules", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/app-package-modules")
  >("../../src/services/app-package-modules");
  return {
    ...actual,
    importAppPlugin: appPackageModuleMocks.importAppPlugin,
  };
});

vi.mock("../../src/services/registry-client", () => ({
  getPluginInfo: registryClientMocks.getPluginInfo,
  getRegistryPlugins: registryClientMocks.getRegistryPlugins,
}));

import { AppManager } from "../../src/services/app-manager";

const HYPERSCAPE_APP_INFO: RegistryPluginInfo = {
  name: "@elizaos/app-hyperscape",
  gitRepo: "elizaos/app-hyperscape",
  gitUrl: "https://github.com/elizaos/app-hyperscape",
  displayName: "Hyperscape",
  description: "Hyperscape live session bridge",
  homepage: "https://hyperscape.gg",
  topics: ["game"],
  stars: 0,
  language: "TypeScript",
  kind: "app",
  category: "game",
  launchType: "connect",
  launchUrl: "{HYPERSCAPE_CLIENT_URL}",
  runtimePlugin: "@hyperscape/plugin-hyperscape",
  capabilities: ["combat"],
  viewer: {
    url: "{HYPERSCAPE_CLIENT_URL}",
    embedParams: {
      embedded: "true",
      mode: "spectator",
      surface: "agent-control",
      followEntity: "{HYPERSCAPE_CHARACTER_ID}",
    },
    postMessageAuth: true,
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
  },
  session: {
    mode: "spectate-and-steer",
    features: ["commands", "telemetry", "pause", "resume", "suggestions"],
  },
  appMeta: {
    displayName: "Hyperscape",
    category: "game",
    launchType: "connect",
    launchUrl: "{HYPERSCAPE_CLIENT_URL}",
    icon: null,
    capabilities: ["combat"],
    minPlayers: null,
    maxPlayers: null,
    runtimePlugin: "@hyperscape/plugin-hyperscape",
    viewer: {
      url: "{HYPERSCAPE_CLIENT_URL}",
      embedParams: {
        embedded: "true",
        mode: "spectator",
        surface: "agent-control",
        followEntity: "{HYPERSCAPE_CHARACTER_ID}",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      mode: "spectate-and-steer",
      features: ["commands", "telemetry", "pause", "resume", "suggestions"],
    },
  },
  npm: {
    package: "@elizaos/app-hyperscape",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  supports: { v0: false, v1: true, v2: true },
};

function buildPluginManager(
  installedPlugins: Array<{
    name: string;
    version?: string;
    installedAt?: string;
  }>,
  registryPlugin: RegistryPluginInfo | null = HYPERSCAPE_APP_INFO,
): PluginManagerLike {
  return {
    refreshRegistry: vi.fn(async () =>
      registryPlugin
        ? new Map([[registryPlugin.name, registryPlugin]])
        : new Map(),
    ),
    listInstalledPlugins: vi.fn(async () => installedPlugins),
    getRegistryPlugin: vi.fn(async () => registryPlugin),
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

type HyperscapeFixtureServer = {
  close: () => Promise<void>;
  url: string;
  walletAuthRequests: Array<{
    walletAddress?: string;
    walletType?: string;
    agentName?: string;
    agentId?: string;
  }>;
};

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<unknown | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function startHyperscapeFixtureServer(): Promise<HyperscapeFixtureServer> {
  const walletAuthRequests: Array<{
    walletAddress?: string;
    walletType?: string;
    agentName?: string;
    agentId?: string;
  }> = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(req);
    res.setHeader("Content-Type", "application/json");

    if (req.method === "POST" && url.pathname === "/api/agents/wallet-auth") {
      const requestBody =
        body && typeof body === "object"
          ? (body as {
              walletAddress?: string;
              walletType?: string;
              agentName?: string;
              agentId?: string;
            })
          : {};
      walletAuthRequests.push(requestBody);
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          authToken: "fixture-auth-token",
          characterId: "char-runtime",
          accountId: `wallet:${requestBody.walletType ?? "evm"}:${requestBody.walletAddress ?? "unknown"}`,
          agentId: requestBody.agentId ?? "runtime-agent-id",
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/mapping/runtime-agent-id"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          agentId: "runtime-agent-id",
          characterId: "char-runtime",
          accountId: "wallet:evm:0x1234567890123456789012345678901234567890",
          agentName: "Scout",
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/embedded-agents") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          agents: [
            {
              agentId: "runtime-agent-id",
              characterId: "char-runtime",
              entityId: "char-runtime",
              name: "Scout",
              state: "running",
              lastActivity: 1_710_000_000_000,
              startedAt: 1_709_999_000_000,
            },
          ],
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/runtime-agent-id/goal"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          goal: { description: "Scout the ruins" },
          goalsPaused: false,
          availableGoals: [{ description: "Scout the ruins", type: "explore" }],
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/runtime-agent-id/quick-actions"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          quickCommands: [
            { label: "Scout", command: "scan nearby ruins", available: true },
          ],
          nearbyLocations: [{ name: "Ruins" }],
          playerPosition: [12, 0, 18],
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Unhandled ${req.method} ${url.pathname}` }));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err?: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve Hyperscape fixture server address.");
  }

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
    url: `http://127.0.0.1:${address.port}`,
    walletAuthRequests,
  };
}

function createRuntimeStub(overrides?: {
  agentId?: string;
  characterName?: string;
  settings?: Record<string, string>;
  agentRecord?: unknown;
}): IAgentRuntime {
  const settings = new Map<string, string>(
    Object.entries(overrides?.settings ?? {}),
  );
  const plugins: Array<{ name: string }> = [];
  const services = new Set<string>();
  return {
    agentId: (overrides?.agentId ?? "runtime-agent-id") as IAgentRuntime["agentId"],
    character: { name: overrides?.characterName ?? "Scout" } as IAgentRuntime["character"],
    plugins,
    getAgent: vi.fn(async () => overrides?.agentRecord ?? null),
    getSetting: (key: string) => settings.get(key) ?? null,
    hasService: (serviceType: string) => services.has(serviceType),
    getServiceLoadPromise: vi.fn(async () => ({})),
    setSetting: (key: string, value: string | boolean | null) => {
      if (typeof value === "string") {
        settings.set(key, value);
      }
    },
    registerPlugin: vi.fn(async (plugin) => {
      plugins.push({ name: plugin.name });
      for (const service of plugin.services ?? []) {
        if (typeof service?.serviceType === "string") {
          services.add(service.serviceType);
        }
      }
    }),
  } as unknown as IAgentRuntime;
}

describe("AppManager", () => {
  const originalApiUrl = process.env.HYPERSCAPE_API_URL;
  const originalHyperscapeAuthToken = process.env.HYPERSCAPE_AUTH_TOKEN;
  const originalHyperscapeCharacterId = process.env.HYPERSCAPE_CHARACTER_ID;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEvmPrivateKey = process.env.EVM_PRIVATE_KEY;
  const originalSolanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;

  afterEach(() => {
    if (originalApiUrl !== undefined) {
      process.env.HYPERSCAPE_API_URL = originalApiUrl;
    } else {
      delete process.env.HYPERSCAPE_API_URL;
    }
    if (originalHyperscapeAuthToken !== undefined) {
      process.env.HYPERSCAPE_AUTH_TOKEN = originalHyperscapeAuthToken;
    } else {
      delete process.env.HYPERSCAPE_AUTH_TOKEN;
    }
    if (originalHyperscapeCharacterId !== undefined) {
      process.env.HYPERSCAPE_CHARACTER_ID = originalHyperscapeCharacterId;
    } else {
      delete process.env.HYPERSCAPE_CHARACTER_ID;
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalEvmPrivateKey !== undefined) {
      process.env.EVM_PRIVATE_KEY = originalEvmPrivateKey;
    } else {
      delete process.env.EVM_PRIVATE_KEY;
    }
    if (originalSolanaPrivateKey !== undefined) {
      process.env.SOLANA_PRIVATE_KEY = originalSolanaPrivateKey;
    } else {
      delete process.env.SOLANA_PRIVATE_KEY;
    }
    appPackageModuleMocks.importAppPlugin.mockReset();
    appPackageModuleMocks.importAppPlugin.mockImplementation(
      async (packageName: string) => ({
        name: packageName,
        services: [{ serviceType: "hyperscapeService" }],
      }),
    );
    registryClientMocks.getPluginInfo.mockReset();
    registryClientMocks.getPluginInfo.mockResolvedValue(null);
    registryClientMocks.getRegistryPlugins.mockReset();
    registryClientMocks.getRegistryPlugins.mockResolvedValue(new Map());
  });

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

  it("treats plugin-backed app packages as installed apps", async () => {
    const pluginBackedApp: RegistryPluginInfo = {
      ...HYPERSCAPE_APP_INFO,
      name: "@hyperscape/plugin-hyperscape",
      gitRepo: "hyperscape/plugin-hyperscape",
      gitUrl: "https://github.com/hyperscape/plugin-hyperscape",
      runtimePlugin: "@hyperscape/plugin-hyperscape",
      npm: {
        package: "@hyperscape/plugin-hyperscape",
        v0Version: null,
        v1Version: "1.2.3",
        v2Version: "1.2.3",
      },
    };

    const manager = new AppManager();
    const installed = await manager.listInstalled(
      buildPluginManager(
        [
          {
            name: "@hyperscape/plugin-hyperscape",
            version: "1.2.3",
            installedAt: "2026-04-05T01:30:00.000Z",
          },
        ],
        pluginBackedApp,
      ),
    );

    expect(installed).toEqual([
      expect.objectContaining({
        name: "@hyperscape/plugin-hyperscape",
        displayName: "Hyperscape",
        pluginName: "@hyperscape/plugin-hyperscape",
        version: "1.2.3",
        installedAt: "2026-04-05T01:30:00.000Z",
      }),
    ]);
  });

  it("merges local app metadata into existing registry entries for the apps catalog", async () => {
    const remoteInfo: RegistryPluginInfo = {
      ...HYPERSCAPE_APP_INFO,
      kind: undefined,
      launchType: undefined,
      launchUrl: undefined,
      viewer: undefined,
      session: undefined,
      appMeta: undefined,
      localPath: undefined,
      description: "Remote registry description",
    };
    registryClientMocks.getRegistryPlugins.mockResolvedValue(
      new Map<string, RegistryPluginInfo>([
        [HYPERSCAPE_APP_INFO.name, { ...HYPERSCAPE_APP_INFO, localPath: "/tmp/hyperscape" }],
      ]),
    );

    const manager = new AppManager();
    const pluginManager = buildPluginManager([], remoteInfo);
    (pluginManager.refreshRegistry as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map<string, RegistryPluginInfo>([[HYPERSCAPE_APP_INFO.name, remoteInfo]]),
    );

    const apps = await manager.listAvailable(pluginManager);

    expect(apps).toEqual([
      expect.objectContaining({
        name: "@elizaos/app-hyperscape",
        launchType: "connect",
        launchUrl: "http://localhost:3333",
        localPath: "/tmp/hyperscape",
        viewer: expect.objectContaining({
          url: "http://localhost:3333",
          postMessageAuth: true,
        }),
        session: expect.objectContaining({
          mode: "spectate-and-steer",
        }),
      }),
    ]);
  });

  it("resolves a live Hyperscape session at launch instead of returning a synthetic pending session", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });
      const result = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(runtime.registerPlugin).toHaveBeenCalledTimes(1);
      expect(result.viewer?.url).toBe(
        "http://localhost:3333?embedded=true&mode=spectator&surface=agent-control&followEntity=char-runtime",
      );
      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual(
        expect.objectContaining({
          type: "HYPERSCAPE_AUTH",
          authToken: "fixture-auth-token",
          agentId: "runtime-agent-id",
          characterId: "char-runtime",
          followEntity: "char-runtime",
        }),
      );
      expect(result.session).toEqual(
        expect.objectContaining({
          sessionId: "runtime-agent-id",
          status: "running",
          controls: ["pause"],
          goalLabel: "Scout the ruins",
          suggestedPrompts: ["scan nearby ruins"],
          characterId: "char-runtime",
          followEntity: "char-runtime",
        }),
      );
    } finally {
      await fixtureServer.close();
    }
  });

  it("launches Hyperscape from the bare slug when local registry lookup resolves the app package", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    registryClientMocks.getPluginInfo.mockImplementation(async (name: string) =>
      name === "hyperscape" ? HYPERSCAPE_APP_INFO : null,
    );

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });
      const pluginManager = buildPluginManager([], null);

      const result = await manager.launch(
        pluginManager,
        "hyperscape",
        undefined,
        runtime,
      );

      expect(pluginManager.getRegistryPlugin).toHaveBeenCalledWith("hyperscape");
      expect(result.displayName).toBe("Hyperscape");
      expect(result.viewer?.url).toContain("http://localhost:3333");
      expect(result.session).toEqual(
        expect.objectContaining({
          status: "running",
          characterId: "char-runtime",
        }),
      );
    } finally {
      await fixtureServer.close();
    }
  });

  it("uses hyperscape.gg as the production viewer default", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    delete process.env.HYPERSCAPE_CLIENT_URL;
    process.env.NODE_ENV = "production";

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });
      const result = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(result.launchUrl).toBe("https://hyperscape.gg");
      expect(result.viewer?.url).toContain("https://hyperscape.gg");
    } finally {
      await fixtureServer.close();
    }
  });

  it("loads the Hyperscape runtime plugin when the wrapper plugin is present without the runtime service", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    appPackageModuleMocks.importAppPlugin.mockImplementation(
      async (packageName: string) => {
        if (packageName === "@hyperscape/plugin-hyperscape") {
          return {
            name: packageName,
            services: [{ serviceType: "hyperscapeService" }],
          };
        }
        if (packageName === "@elizaos/app-hyperscape") {
          return { name: packageName };
        }
        return null;
      },
    );

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });

      await runtime.registerPlugin?.({ name: "@elizaos/app-hyperscape" } as never);

      const result = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(appPackageModuleMocks.importAppPlugin).toHaveBeenCalledWith(
        "@hyperscape/plugin-hyperscape",
      );
      expect(result.session).toEqual(
        expect.objectContaining({
          status: "running",
          characterId: "char-runtime",
        }),
      );
    } finally {
      await fixtureServer.close();
    }
  });

  it("auto-provisions a local wallet for Hyperscape launch when the runtime has none", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;

    try {
      delete process.env.HYPERSCAPE_AUTH_TOKEN;
      delete process.env.HYPERSCAPE_CHARACTER_ID;
      delete process.env.EVM_PRIVATE_KEY;
      delete process.env.SOLANA_PRIVATE_KEY;

      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
      }) as IAgentRuntime & {
        getSetting: (key: string) => string | null;
      };

      const result = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(fixtureServer.walletAuthRequests).toHaveLength(1);
      expect(fixtureServer.walletAuthRequests[0]?.walletType).toBe("evm");
      expect(fixtureServer.walletAuthRequests[0]?.walletAddress).toMatch(
        /^0x[0-9a-f]{40}$/i,
      );
      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual(
        expect.objectContaining({
          type: "HYPERSCAPE_AUTH",
          agentId: "runtime-agent-id",
          characterId: "char-runtime",
        }),
      );
    } finally {
      await fixtureServer.close();
    }
  });
});
