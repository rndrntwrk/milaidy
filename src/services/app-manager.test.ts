// biome-ignore-all lint/suspicious/noExplicitAny: extensive fake runtime stubs require broad casts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type Action,
  type Character,
  type Evaluator,
  elizaLogger,
  type IAgentRuntime,
  type IMessageService,
  type Memory,
  type Plugin,
  type Provider,
  type Route,
  type RuntimeEventStorage,
  type Service,
  type ServiceClass,
  type ServiceTypeName,
  type State,
} from "@elizaos/core";
import {
  PluginManagerService,
  pluginRegistry,
} from "@elizaos/plugin-plugin-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppManager } from "./app-manager";

vi.mock("./registry-client.js", () => ({
  listApps: vi.fn().mockResolvedValue([]),
  getAppInfo: vi.fn().mockResolvedValue(null),
  getPluginInfo: vi.fn().mockResolvedValue(null),
  searchApps: vi.fn().mockResolvedValue([]),
}));

  // IDatabaseAdapter methods (stubbed)
  db = {};
  async registerMemory(_memory: Memory): Promise<void> {}
  async getMemory(_messageId: string): Promise<Memory | null> {
    return null;
  }
  async getMemories() {
    return [];
  }
  async getMemoriesByRoomIds() {
    return [];
  }
  async getMemoryByContent() {
    return null;
  }
  async getMemoriesCount() {
    return 0;
  }
  async createLog() {}
  async getLogs() {
    return [];
  }
  async searchMemories() {
    return [];
  }
  async searchMemoriesByEmbedding() {
    return [];
  }
  async removeMemory() {}
  async removeAllMemories() {}
  async countMemories() {
    return 0;
  }
  async getGoals() {
    return [];
  } // If getGoals exists in IDatabaseAdapter? Wait, I didn't see it in database.ts!
  // It was removed or I missed it. IDatabaseAdapter does NOT have getGoals in the file I read.
  // So I will remove getGoals stub.

  async getRoom() {
    return null;
  }
  async createRoom() {
    return "fake-room-id" as any;
  }
  async removeRoom() {}
  async getRoomsForParticipant() {
    return [];
  }
  async getRoomsForParticipants() {
    return [];
  }
  async addParticipant() {
    return true;
  }
  async removeParticipant() {
    return true;
  }
  async getParticipantsForRoom() {
    return [];
  }
  async getParticipantsForAccount() {
    return [];
  }
  async getParticipantUserState() {
    return null;
  }
  async setParticipantUserState() {}
  async createRelationship() {
    return true;
  }
  async getRelationship() {
    return null;
  }
  async getRelationships() {
    return [];
  }
  async getAccountById() {
    return null;
  }
  async createAccount() {
    return true;
  }
  async getActorDetails() {
    return [];
  }
  // Cache methods matching declarations
  async getCache<T>(_key: string): Promise<T | undefined> {
    return undefined;
  }
  async setCache<T>(_key: string, _value: T): Promise<boolean> {
    return true;
  }
  async deleteCache(_key: string): Promise<boolean> {
    return true;
  }

  // Runtime methods
  initialize = async () => {};
  stop = async () => {};
  processActions = async () => {};
  evaluate = async () => null;
  evaluatePre = async () => ({ blocked: false, redacted: false });
  ensureConnection = async () => {};
  ensureConnections = async () => {};
  ensureParticipantInRoom = async () => {};
  ensureWorldExists = async () => {};
  ensureRoomExists = async () => {};
  composeState = async () => ({}) as State;
  useModel = async () => "fake-response";
  generateText = async () => ({}) as any;
  registerModel = () => {};
  getModel = () => undefined;
  getModelConfiguration = () => undefined;
  registerEvent = () => {};
  getEvent = () => undefined;
  emitEvent = async () => {};
  registerTaskWorker = () => {};
  getTaskWorker = () => undefined;
  dynamicPromptExecFromState = async () => null;
  addEmbeddingToMemory = async (m: Memory) => m;
  queueEmbeddingGeneration = async () => {};
  getAllMemories = async () => [];
  clearAllAgentMemories = async () => {};
  updateMemory = async () => true;
  createRunId = () => "fake-run-id" as any;
  startRun = () => "fake-run-id" as any;
  endRun = () => {};
  getCurrentRunId = () => "fake-run-id" as any;
  getEntityById = async () => null;
  createEntity = async () => true;
  getRooms = async () => [];
  registerSendHandler = () => {};
  sendMessageToTarget = async () => {};
  updateWorld = async () => {};
  redactSecrets = (t: string) => t;
  getConnection = async () => ({});
  getServiceLoadPromise = async () => ({}) as Service;
  getRegisteredServiceTypes = () => [];
  hasService = () => false;
  registerDatabaseAdapter = () => {};
  setSetting = () => {};
  getSetting = () => null;
  getConversationLength = () => 0;
  isActionPlanningEnabled = () => true;
  getLLMMode = () => "DEFAULT" as any;
  isCheckShouldRespondEnabled = () => true;
  getActionResults = () => [];
  getAllActions = () => [];
  getFilteredActions = () => [];
  isActionAllowed = () => ({ allowed: true, reason: "" });
  registerPlugin = async () => {};

  // Synchronous registration methods to match interface
  registerProvider(provider: Provider): void {
    this.providers.push(provider);
  }
  registerAction(action: Action): void {
    this.actions.push(action);
  }
  registerEvaluator(evaluator: Evaluator): void {
    this.evaluators.push(evaluator);
  }

  // Service methods matched
  getService<T extends Service>(service: ServiceTypeName | string): T | null {
    const type = service as ServiceTypeName;
    const services = this.services.get(type);
    if (services && services.length > 0) {
      return services[0] as T;
    }
    return null;
  }

  getServicesByType<T extends Service>(service: ServiceTypeName | string): T[] {
    return (this.services.get(service as ServiceTypeName) || []) as T[];
  }

  getAllServices() {
    return this.services;
  }

  async registerService(serviceClass: ServiceClass): Promise<void> {
    // Instantiate the service
    const service = new serviceClass(this);
    // Initialize if needed (though runtime usually calls initialize later)
    await service.initialize(this);

    // Add to map
    const type = service.serviceType;
    if (!this.services.has(type)) {
      this.services.set(type, []);
    }
    this.services.get(type)?.push(service);
  }

  // Missing DB methods from IDatabaseAdapter coverage (since 'any' cast on databaseAdapter property isn't enough?)
  // NO, IAgentRuntime extends IDatabaseAdapter, so FakeAgentRuntime MUST implement them.
  // I need to be careful. I added most of them.
  // getGoals was removed.
  // createGoal, removeGoal, removeAllGoals, updateGoal - are those in IDatabaseAdapter?
  // Checking database.ts again... I did NOT see 'Goal' related methods in IDatabaseAdapter interface.
  // So I should remove them.
  // Same for getActorDetails, getAccountById, createAccount ?
  // In database.ts: getAgent, getAgents, createAgent, updateAgent, deleteAgent.
  // NO getAccountById, createAccount.
  // NO getActorDetails.

  getAgent = async () => null;
  getAgents = async () => [];
  createAgent = async () => true;
  updateAgent = async () => true;
  deleteAgent = async () => true;
  ensureEmbeddingDimension = async () => {};
  getEntitiesByIds = async () => null;
  getEntitiesForRoom = async () => [];
  createEntities = async () => true;
  updateEntity = async () => {};
  getComponent = async () => null;
  getComponents = async () => [];
  createComponent = async () => true;
  updateComponent = async () => {};
  deleteComponent = async () => {};
  deleteManyMemories = async () => {};
  deleteAllMemories = async () => {};
  createWorld = async () => "fake-world-id" as any;
  getWorld = async () => null;
  removeWorld = async () => {};
  getAllWorlds = async () => [];
  getRoomsByIds = async () => null;
  createRooms = async () => [];
  deleteRoom = async () => {};
  deleteRoomsByWorldId = async () => {};
  updateRoom = async () => {};
  addParticipantsRoom = async () => true;
  updateRelationship = async () => {};
  getTasks = async () => [];
  getTask = async () => null;
  getTasksByName = async () => [];
  createTask = async () => "fake-task-id" as any;
  updateTask = async () => {};
  deleteTask = async () => {};
  getMemoriesByWorldId = async () => [];
  getPairingRequests = async () => [];
  createPairingRequest = async () => "fake-req-id" as any;
  updatePairingRequest = async () => {};
  deletePairingRequest = async () => {};
  getPairingAllowlist = async () => [];
  createPairingAllowlistEntry = async () => "fake-entry-id" as any;
  deletePairingAllowlistEntry = async () => {};
  isReady = async () => true;
  close = async () => {};
  getCachedEmbeddings = async () => [];
  log = async () => {};
  deleteLog = async () => {};
  isRoomParticipant = async () => false;
  getParticipantsForEntity = async () => [];
}

describe("AppManager Integration", () => {
  let appManager: AppManager;
  let pluginManager: PluginManagerService;
  let runtime: FakeAgentRuntime;
  let tempDir: string;

  const APP_NAME = "@elizaos/app-example";
  const APP_PLUGIN_NAME = "@elizaos/plugin-example";

  beforeEach(async () => {
    // Setup temp directory for plugins
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-test-"));
    const pluginsDir = path.join(tempDir, "plugins");
    fs.mkdirSync(pluginsDir);

    // Mock registry response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        registry: {
          [APP_NAME]: {
            git: { repo: "elizaos/app-example", v0: {}, v1: {}, v2: {} },
            npm: { repo: APP_PLUGIN_NAME, v0: null, v1: null, v2: "1.0.0" },
            supports: { v0: true, v1: false, v2: false },
            description: "An example app",
            topics: ["app"],
            stargazers_count: 10,
            language: "TypeScript",
          },
          // Add the plugin entry so uninstallPlugin can find it
          [APP_PLUGIN_NAME]: {
            git: { repo: "elizaos/plugin-example", v0: {}, v1: {}, v2: {} },
            npm: { repo: APP_PLUGIN_NAME, v0: null, v1: null, v2: "1.0.0" },
            supports: { v0: true, v1: false, v2: false },
            description: "An example plugin",
            topics: ["plugin"],
          },
        },
      }),
    });

    runtime = new FakeAgentRuntime();
    // Initialize PluginManager with real file system path
    pluginManager = new PluginManagerService(runtime, {
      pluginDirectory: pluginsDir,
    });

    process.env.MILADY_STATE_DIR = tempDir;

    appManager = new AppManager();
  });

  describe("launch", () => {
    it("throws when app not found in registry", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue(null);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      await expect(mgr.launch("@elizaos/app-nonexistent")).rejects.toThrow(
        "not found",
      );
    });

    it("installs plugin and returns viewer config when app found", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "RuneScape",
        category: "game",
        launchType: "connect",
        launchUrl: null,
        icon: null,
        capabilities: ["combat"],
        stars: 42,
        repository: "https://github.com/elizaOS/eliza-2004scape",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-2004scape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "https://2004scape.org/webclient",
          embedParams: { bot: "testbot" },
          sandbox: "allow-scripts allow-same-origin",
        },
      });

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([]);
      vi.mocked(installPlugin).mockResolvedValue({
        success: true,
        pluginName: "@elizaos/app-2004scape",
        version: "1.0.0",
        installPath: "/tmp/test",
        requiresRestart: true,
      });

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.pluginInstalled).toBe(true);
      expect(result.needsRestart).toBe(true);
      expect(result.displayName).toBe("2004scape");
      expect(result.launchType).toBe("connect");
      expect(result.launchUrl).toBeNull();
      expect(result.viewer).not.toBeNull();
      expect(result.viewer?.url).toBe(
        "https://2004scape.org/webclient?bot=testbot",
      );
      expect(result.viewer?.embedParams).toEqual({ bot: "testbot" });
      expect(vi.mocked(installPlugin)).toHaveBeenCalledWith(
        "@elizaos/app-2004scape",
        undefined,
      );
    });

    it("skips install when plugin already installed", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "RuneScape",
        category: "game",
        launchType: "connect",
        launchUrl: null,
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-2004scape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
      });

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      const mockInstall = vi.mocked(installPlugin);
      mockInstall.mockClear();
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-2004scape",
          version: "1.0.0",
          installPath: "/tmp/x",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.pluginInstalled).toBe(true);
      expect(result.needsRestart).toBe(false);
      expect(result.launchType).toBe("connect");
      expect(mockInstall).not.toHaveBeenCalled();
    });

    it("throws when plugin installation fails", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      const { getPluginInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-test",
        displayName: "Test",
        description: "",
        category: "game",
        launchType: "url",
        launchUrl: null,
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: null,
        supports: { v0: false, v1: false, v2: false },
        npm: {
          package: "@elizaos/app-test",
          v0Version: null,
          v1Version: null,
          v2Version: null,
        },
      });
      vi.mocked(getPluginInfo).mockResolvedValue({
        name: "@elizaos/app-test",
        gitRepo: "elizaos/app-test",
        gitUrl: "https://github.com/elizaos/app-test.git",
        description: "Test",
        homepage: null,
        topics: [],
        stars: 0,
        language: "TypeScript",
        npm: {
          package: "@elizaos/app-test",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        git: {
          v0Branch: null,
          v1Branch: null,
          v2Branch: "main",
        },
        supports: { v0: false, v1: false, v2: true },
      });

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([]);
      vi.mocked(installPlugin).mockResolvedValue({
        success: false,
        pluginName: "@elizaos/app-test",
        version: "",
        installPath: "",
        requiresRestart: false,
        error: "Package not found",
      });

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      await expect(mgr.launch("@elizaos/app-test")).rejects.toThrow(
        "Package not found",
      );
    });

    it("skips plugin install when app metadata has no install source", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      const { getPluginInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-test",
        displayName: "Test",
        description: "",
        category: "game",
        launchType: "url",
        launchUrl: null,
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: null,
        supports: { v0: false, v1: false, v2: false },
        npm: {
          package: "@elizaos/app-test",
          v0Version: null,
          v1Version: null,
          v2Version: null,
        },
      });
      vi.mocked(getPluginInfo).mockResolvedValue({
        name: "@elizaos/app-test",
        gitRepo: "elizaos/app-test",
        gitUrl: "https://github.com/elizaos/app-test.git",
        description: "Test",
        homepage: null,
        topics: [],
        stars: 0,
        language: "TypeScript",
        npm: {
          package: "@elizaos/app-test",
          v0Version: null,
          v1Version: null,
          v2Version: null,
        },
        git: {
          v0Branch: null,
          v1Branch: null,
          v2Branch: "main",
        },
        supports: { v0: false, v1: false, v2: false },
      });

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([]);
      vi.mocked(installPlugin).mockClear();

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-test");

      expect(result.pluginInstalled).toBe(false);
      expect(result.needsRestart).toBe(false);
      expect(result.launchType).toBe("url");
      expect(installPlugin).not.toHaveBeenCalled();
    });

    it("returns null viewer when app has no viewer config", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-babylon",
        displayName: "Babylon",
        description: "Trading",
        category: "platform",
        launchType: "url",
        launchUrl: "https://babylon.social",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-babylon",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        // no viewer field
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-babylon",
          version: "1.0.0",
          installPath: "/tmp/x",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-babylon");

      expect(result.viewer).toBeNull();
      expect(result.launchType).toBe("url");
      expect(result.launchUrl).toBe("https://babylon.social");
    });

    it("substitutes environment placeholders in launch and viewer URLs", async () => {
      process.env.TEST_VIEWER_BOT = "agent77";

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-test",
        displayName: "Test App",
        description: "Test",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:9999?bot={TEST_VIEWER_BOT}",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-test",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:9999",
          embedParams: { bot: "{TEST_VIEWER_BOT}" },
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-test",
          version: "1.0.0",
          installPath: "/tmp/x",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-test");

      expect(result.launchUrl).toBe("http://localhost:9999?bot=agent77");
      expect(result.viewer?.url).toBe("http://localhost:9999?bot=agent77");

      delete process.env.TEST_VIEWER_BOT;
    });

    it("rewrites localhost app URLs through local proxy when enabled", async () => {
      process.env.MILAIDY_PROXY_LOCAL_APP_URLS = "1";

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-agent-town",
        displayName: "Agent Town",
        description: "Agent Town",
        category: "game",
        launchType: "url",
        launchUrl: "http://localhost:5173/",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-agent-town",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:5173/ai-town/index.html",
          embedParams: { embedded: "true" },
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-agent-town",
          version: "1.0.0",
          installPath: "/tmp/app-agent-town",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-agent-town");

      expect(result.launchUrl).toBe(
        "/api/apps/local/%40elizaos%2Fapp-agent-town/",
      );
      expect(result.viewer?.url).toBe(
        "/api/apps/local/%40elizaos%2Fapp-agent-town/ai-town/index.html?embedded=true",
      );

      delete process.env.MILAIDY_PROXY_LOCAL_APP_URLS;
    });

    it("rewrites localhost app URLs by default outside test mode", async () => {
      const savedNodeEnv = process.env.NODE_ENV;
      const savedVitest = process.env.VITEST;
      const savedProxyFlag = process.env.MILAIDY_PROXY_LOCAL_APP_URLS;

      process.env.NODE_ENV = "production";
      delete process.env.VITEST;
      delete process.env.MILAIDY_PROXY_LOCAL_APP_URLS;

      try {
        const { getAppInfo } = await import("./registry-client.js");
        vi.mocked(getAppInfo).mockResolvedValue({
          name: "@elizaos/app-hyperfy",
          displayName: "Hyperfy",
          description: "Hyperfy",
          category: "game",
          launchType: "connect",
          launchUrl: "http://localhost:3003/",
          icon: null,
          capabilities: [],
          stars: 0,
          repository: "",
          latestVersion: "1.0.0",
          supports: { v0: false, v1: false, v2: true },
          npm: {
            package: "@elizaos/app-hyperfy",
            v0Version: null,
            v1Version: null,
            v2Version: "1.0.0",
          },
          viewer: {
            url: "http://localhost:3003/",
          },
        });

        const { listInstalledPlugins } = await import("./plugin-installer.js");
        vi.mocked(listInstalledPlugins).mockReturnValue([
          {
            name: "@elizaos/app-hyperfy",
            version: "1.0.0",
            installPath: "/tmp/app-hyperfy",
            installedAt: "2026-01-01",
          },
        ]);

        const { AppManager } = await import("./app-manager.js");
        const mgr = new AppManager();
        const result = await mgr.launch("@elizaos/app-hyperfy");

        expect(result.launchUrl).toBe("/api/apps/local/%40elizaos%2Fapp-hyperfy/");
        expect(result.viewer?.url).toBe(
          "/api/apps/local/%40elizaos%2Fapp-hyperfy/",
        );
      } finally {
        process.env.NODE_ENV = savedNodeEnv;
        if (savedVitest === undefined) {
          delete process.env.VITEST;
        } else {
          process.env.VITEST = savedVitest;
        }
        if (savedProxyFlag === undefined) {
          delete process.env.MILAIDY_PROXY_LOCAL_APP_URLS;
        } else {
          process.env.MILAIDY_PROXY_LOCAL_APP_URLS = savedProxyFlag;
        }
      }
    });

    it("falls back to testbot for 2004scape bot placeholder", async () => {
      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.BOT_NAME;

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "2004scape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:8880/webclient",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-2004scape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:8880/webclient",
          embedParams: { bot: "{RS_SDK_BOT_NAME}" },
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-2004scape",
          version: "1.0.0",
          installPath: "/tmp/rs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.viewer?.url).toBe(
        "http://localhost:8880/webclient?bot=testbot",
      );
    });

    it("includes hyperscape postMessage auth payload when token is configured", async () => {
      process.env.HYPERSCAPE_AUTH_TOKEN = "hs-token-123";
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-hyperscape",
        displayName: "Hyperscape",
        description: "Hyperscape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:3333",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-hyperscape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:3333",
          postMessageAuth: true,
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-hyperscape",
          version: "1.0.0",
          installPath: "/tmp/hs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-hyperscape");

      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual({
        type: "HYPERSCAPE_AUTH",
        authToken: "hs-token-123",
        sessionToken: undefined,
        agentId: undefined,
      });

      delete process.env.HYPERSCAPE_AUTH_TOKEN;
    });

    it("disables postMessage auth when hyperscape token is missing", async () => {
      delete process.env.HYPERSCAPE_AUTH_TOKEN;
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-hyperscape",
        displayName: "Hyperscape",
        description: "Hyperscape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:3333",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-hyperscape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:3333",
          postMessageAuth: true,
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-hyperscape",
          version: "1.0.0",
          installPath: "/tmp/hs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-hyperscape");

      expect(result.viewer?.postMessageAuth).toBe(false);
      expect(result.viewer?.authMessage).toBeUndefined();
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining("auth token not configured"),
      );
    });

    it("includes 2004scape postMessage auth payload with configured credentials", async () => {
      process.env.RS_SDK_BOT_NAME = "myagent";
      process.env.RS_SDK_BOT_PASSWORD = "secretpass";

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "2004scape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:8880",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-2004scape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:8880",
          postMessageAuth: true,
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-2004scape",
          version: "1.0.0",
          installPath: "/tmp/rs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual({
        type: "RS_2004SCAPE_AUTH",
        authToken: "myagent",
        sessionToken: "secretpass",
      });

      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.RS_SDK_BOT_PASSWORD;
    });

    it("uses fallback credentials for 2004scape postMessage auth", async () => {
      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.RS_SDK_BOT_PASSWORD;
      process.env.BOT_NAME = "fallbackbot";
      process.env.BOT_PASSWORD = "fallbackpass";

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "2004scape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:8880",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-2004scape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:8880",
          postMessageAuth: true,
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-2004scape",
          version: "1.0.0",
          installPath: "/tmp/rs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual({
        type: "RS_2004SCAPE_AUTH",
        authToken: "fallbackbot",
        sessionToken: "fallbackpass",
      });

      delete process.env.BOT_NAME;
      delete process.env.BOT_PASSWORD;
    });

    it("uses testbot default for 2004scape when no credentials configured", async () => {
      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.RS_SDK_BOT_PASSWORD;
      delete process.env.BOT_NAME;
      delete process.env.BOT_PASSWORD;

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "2004scape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:8880",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-2004scape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:8880",
          postMessageAuth: true,
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-2004scape",
          version: "1.0.0",
          installPath: "/tmp/rs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual({
        type: "RS_2004SCAPE_AUTH",
        authToken: "testbot",
        sessionToken: "",
      });
    });
  });

  it("launches an app directly if plugin is already installed", async () => {
    // Setup: Simulate installed plugin
    // Use hyphen in sanitized name as verified
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-example",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: APP_PLUGIN_NAME, version: "1.0.0" }),
    );

    // Act
    const result = await appManager.launch(pluginManager, APP_NAME);

    // Assert
    expect(result.pluginInstalled).toBe(true);
    expect(result.needsRestart).toBe(false);
  });

  it("installs plugin if not installed (integration - skipping actual install via mock if possible, or failing)", async () => {
    // We spy on installPlugin to verify it is called
    const installSpy = vi.spyOn(pluginManager, "installPlugin");
    installSpy.mockResolvedValue({
      success: true,
      pluginName: APP_PLUGIN_NAME,
      version: "1.0.0",
      requiresRestart: true,
      installPath: "/tmp",
    });

    const result = await appManager.launch(pluginManager, APP_NAME);

    expect(installSpy).toHaveBeenCalled();
    expect(result.pluginInstalled).toBe(true);
    expect(result.needsRestart).toBe(true);
  });

  it("stops an app by uninstalling its plugin", async () => {
    // Setup: Simulate installed plugin
    // Use hyphen in sanitized name as verified
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-example",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: APP_PLUGIN_NAME, version: "1.0.0" }),
    );

    // Act
    const result = await appManager.stop(pluginManager, APP_NAME);

    // Assert
    expect(result.success).toBe(true);
    expect(result.pluginUninstalled).toBe(true);

    // Verify file system
    expect(fs.existsSync(installedDir)).toBe(false);
  });
});

describe("Hyperscape Auto-Provisioning", () => {
  let appManager: AppManager;
  let pluginManager: PluginManagerService;
  let runtime: FakeAgentRuntime;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";
  const HYPERSCAPE_PLUGIN_NAME = "@elizaos/plugin-hyperscape";

  beforeEach(async () => {
    // Flush any cached registry from prior test suites so fresh fetch mocks
    // installed in individual tests are honoured.
    pluginRegistry.resetRegistryCache();

    // Save original env vars
    originalEnv = {
      HYPERSCAPE_CHARACTER_ID: process.env.HYPERSCAPE_CHARACTER_ID,
      HYPERSCAPE_AUTH_TOKEN: process.env.HYPERSCAPE_AUTH_TOKEN,
      HYPERSCAPE_SERVER_URL: process.env.HYPERSCAPE_SERVER_URL,
      SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
      EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY,
    };

    // Clear hyperscape env vars
    delete process.env.HYPERSCAPE_CHARACTER_ID;
    delete process.env.HYPERSCAPE_AUTH_TOKEN;
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.EVM_PRIVATE_KEY;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-hyperscape-test-"));
    const pluginsDir = path.join(tempDir, "plugins");
    fs.mkdirSync(pluginsDir);

    runtime = new FakeAgentRuntime();
    pluginManager = new PluginManagerService(runtime, {
      pluginDirectory: pluginsDir,
    });

    process.env.MILADY_STATE_DIR = tempDir;
    appManager = new AppManager();
  });

  afterEach(() => {
    // Restore original env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("throws error when hyperscape auto-provisioning fails and no credentials exist", async () => {
    // Mock registry to return hyperscape app
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("wallet-auth")) {
        // Simulate server not responding
        return Promise.reject(new Error("ECONNREFUSED"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          registry: {
            [HYPERSCAPE_APP_NAME]: {
              git: { repo: "elizaos/app-hyperscape", v0: {}, v1: {}, v2: {} },
              npm: {
                repo: HYPERSCAPE_PLUGIN_NAME,
                v0: null,
                v1: null,
                v2: "1.0.0",
              },
              supports: { v0: true, v1: false, v2: false },
              description: "Hyperscape 3D world",
              topics: ["app"],
            },
            [HYPERSCAPE_PLUGIN_NAME]: {
              git: {
                repo: "elizaos/plugin-hyperscape",
                v0: {},
                v1: {},
                v2: {},
              },
              npm: {
                repo: HYPERSCAPE_PLUGIN_NAME,
                v0: null,
                v1: null,
                v2: "1.0.0",
              },
              supports: { v0: true, v1: false, v2: false },
              description: "Hyperscape plugin",
              topics: ["plugin"],
            },
          },
        }),
      });
    });

    // Simulate plugin already installed
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-hyperscape",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" }),
    );

    // No wallet keys set, auto-provisioning will fail
    await expect(
      appManager.launch(pluginManager, HYPERSCAPE_APP_NAME),
    ).rejects.toThrow(/Hyperscape authentication required/);
  });

  it("succeeds when hyperscape credentials are pre-configured", async () => {
    // Pre-set credentials
    process.env.HYPERSCAPE_CHARACTER_ID = "test-char-id";
    process.env.HYPERSCAPE_AUTH_TOKEN = "test-auth-token";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        registry: {
          [HYPERSCAPE_APP_NAME]: {
            git: { repo: "elizaos/app-hyperscape", v0: {}, v1: {}, v2: {} },
            npm: {
              repo: HYPERSCAPE_PLUGIN_NAME,
              v0: null,
              v1: null,
              v2: "1.0.0",
            },
            supports: { v0: true, v1: false, v2: false },
            description: "Hyperscape 3D world",
            topics: ["app"],
          },
          [HYPERSCAPE_PLUGIN_NAME]: {
            git: { repo: "elizaos/plugin-hyperscape", v0: {}, v1: {}, v2: {} },
            npm: {
              repo: HYPERSCAPE_PLUGIN_NAME,
              v0: null,
              v1: null,
              v2: "1.0.0",
            },
            supports: { v0: true, v1: false, v2: false },
            description: "Hyperscape plugin",
            topics: ["plugin"],
          },
        },
      }),
    });

    // Simulate plugin already installed
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-hyperscape",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" }),
    );

    const result = await appManager.launch(pluginManager, HYPERSCAPE_APP_NAME);
    expect(result.pluginInstalled).toBe(true);
  });

  it("skips auto-provisioning when credentials already exist", async () => {
    // Pre-set credentials - auto-provisioning should be skipped
    process.env.HYPERSCAPE_CHARACTER_ID = "existing-char-id";
    process.env.HYPERSCAPE_AUTH_TOKEN = "existing-auth-token";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        registry: {
          [HYPERSCAPE_APP_NAME]: {
            git: { repo: "elizaos/app-hyperscape", v0: {}, v1: {}, v2: {} },
            npm: {
              repo: HYPERSCAPE_PLUGIN_NAME,
              v0: null,
              v1: null,
              v2: "1.0.0",
            },
            supports: { v0: true, v1: false, v2: false },
            description: "Hyperscape 3D world",
            topics: ["app"],
          },
          [HYPERSCAPE_PLUGIN_NAME]: {
            git: {
              repo: "elizaos/plugin-hyperscape",
              v0: {},
              v1: {},
              v2: {},
            },
            npm: {
              repo: HYPERSCAPE_PLUGIN_NAME,
              v0: null,
              v1: null,
              v2: "1.0.0",
            },
            supports: { v0: true, v1: false, v2: false },
            description: "Hyperscape plugin",
            topics: ["plugin"],
          },
        },
      }),
    });

    // Simulate plugin already installed
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-hyperscape",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" }),
    );

    const result = await appManager.launch(pluginManager, HYPERSCAPE_APP_NAME);
    expect(result.pluginInstalled).toBe(true);
    // Credentials should remain unchanged (auto-provisioning skipped)
    expect(process.env.HYPERSCAPE_CHARACTER_ID).toBe("existing-char-id");
    expect(process.env.HYPERSCAPE_AUTH_TOKEN).toBe("existing-auth-token");
  });
});
