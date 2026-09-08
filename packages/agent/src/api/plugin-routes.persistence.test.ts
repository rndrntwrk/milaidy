import type http from "node:http";
import { expect, it, vi } from "vitest";
import type { ElizaConfig } from "../config/config.js";
import type { PluginRouteContext } from "./plugin-routes.js";

vi.mock("@elizaos/core", () => ({
  logger: { debug() {}, info() {}, warn() {}, error() {} },
}));
vi.mock("@miladyai/shared", () => ({
  isMiladySettingsDebugEnabled: () => false,
  sanitizeForSettingsDebug: (value: unknown) => value,
  settingsDebugCloudSummary: () => ({}),
}));
vi.mock("../config/config.js", () => ({
  loadElizaConfig: () => ({ env: {} }),
  saveElizaConfig: vi.fn(async () => {
    throw new Error("durable write rejected");
  }),
}));
vi.mock("./plugin-runtime-apply.js", () => ({
  applyPluginRuntimeMutation: vi.fn(async () => ({
    mode: "applied",
    requiresRestart: false,
    restartedRuntime: false,
    loadedPackages: [],
    unloadedPackages: [],
    reloadedPackages: [],
  })),
}));

it("restores a Telegram plugin config when async persistence rejects", async () => {
  const plugin = {
    id: "telegram",
    name: "Telegram",
    description: "",
    tags: [],
    enabled: false,
    configured: false,
    envKey: "TELEGRAM_BOT_TOKEN",
    category: "connector" as const,
    source: "bundled" as const,
    configKeys: ["TELEGRAM_BOT_TOKEN"],
    parameters: [
      {
        key: "TELEGRAM_BOT_TOKEN",
        type: "string",
        description: "",
        required: false,
        sensitive: true,
        currentValue: null,
        isSet: false,
      },
    ],
    validationErrors: [],
    validationWarnings: [],
  };
  const config = { env: { EXISTING: "yes" } } as unknown as ElizaConfig;
  const error = vi.fn();
  const applyPluginRuntimeMutation = (await import("./plugin-runtime-apply.js"))
    .applyPluginRuntimeMutation;
  const ctx: PluginRouteContext = {
    req: {} as http.IncomingMessage,
    res: {} as http.ServerResponse,
    method: "PUT",
    pathname: "/api/plugins/telegram",
    url: new URL("http://localhost/api/plugins/telegram"),
    state: { runtime: null, config, plugins: [plugin], broadcastWs: null },
    json: vi.fn(),
    error,
    readJsonBody: async <T extends object>() =>
      ({ config: { TELEGRAM_BOT_TOKEN: "new-token" } }) as T,
    scheduleRuntimeRestart: vi.fn(),
    restartRuntime: vi.fn(async () => false),
    BLOCKED_ENV_KEYS: new Set(),
    discoverInstalledPlugins: () => [],
    maskValue: (value) => value,
    aggregateSecrets: () => [],
    readProviderCache: () => null,
    paramKeyToCategory: () => "connector",
    buildPluginEvmDiagnosticEntry: () => plugin,
    EVM_PLUGIN_PACKAGE: "",
    applyWhatsAppQrOverride: () => {},
    applySignalQrOverride: () => {},
    signalAuthExists: () => false,
    resolvePluginConfigMutationRejections: () => [],
    requirePluginManager: () => ({}) as never,
    requireCoreManager: () => ({}) as never,
  };
  expect(
    await (await import("./plugin-routes.js")).handlePluginRoutes(ctx),
  ).toBe(true);
  expect(error).toHaveBeenCalledWith(
    ctx.res,
    "Plugin settings save failed",
    503,
  );
  expect(config).toEqual({ env: { EXISTING: "yes" } });
  expect(plugin.configured).toBe(false);
  expect(applyPluginRuntimeMutation).not.toHaveBeenCalled();
});
