import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ElizaConfig } from "../config/config.js";
import { type ConfigRouteContext, handleConfigRoutes } from "./config-routes";
import {
  type ConnectorRouteContext,
  handleConnectorRoutes,
} from "./connector-routes";

vi.mock("@elizaos/core", () => ({ logger: { debug: () => {}, warn: () => {} } }));
vi.mock("@miladyai/shared", () => ({
  isMiladySettingsDebugEnabled: () => false,
  sanitizeForSettingsDebug: (value: unknown) => value,
  settingsDebugCloudSummary: () => ({}),
}));
vi.mock("../config/config.js", () => ({
  saveElizaConfig: () => {
    throw new Error("test must inject config persistence");
  },
}));
vi.mock("./provider-switch-config.js", () => ({
  applyCanonicalOnboardingConfig: () => {
    throw new Error("connector settings must not switch providers");
  },
}));
vi.mock("../contracts/service-routing.js", () => {
  const rejectRoutingChange = () => {
    throw new Error("connector settings must not change service routing");
  };
  return {
    normalizeDeploymentTargetConfig: rejectRoutingChange,
    normalizeLinkedAccountsConfig: rejectRoutingChange,
    normalizeServiceRoutingConfig: rejectRoutingChange,
  };
});

const response = () => ({
  json: (_res: http.ServerResponse, _body: unknown, _status?: number) => {},
  error: (_res: http.ServerResponse, _message: string, _status?: number) => {},
});

describe("settings persistence commit ordering", () => {
  it("applies Stream and native owner bot settings only after config persistence succeeds", async () => {
    const key = "STREAM555_AGENT_API_KEY";
    const envUpdates = {
      [key]: "new",
      ELIZA_LIFEOPS_PASSIVE_CONNECTORS: "false",
      ELIZA_DISCORD_OWNER_USER_IDS_JSON: '["123456789012345678"]',
      ELIZA_TELEGRAM_STANDALONE_BOT: "false",
      CHANNEL_IDS: "123456789012345679",
    };
    const originalEnv = Object.fromEntries(
      Object.keys(envUpdates).map((name) => [name, process.env[name]]),
    );
    for (const name of Object.keys(envUpdates)) delete process.env[name];
    const adminEntityId = "11111111-2222-4333-8444-555555555555";
    const config = {
      ui: { theme: "light" },
      env: { vars: {} },
      agents: { defaults: { model: { primary: "openai-codex/gpt-5.4" } } },
    } as unknown as ElizaConfig;
    const oldAuthority = process.env.ALICE_RUNTIME_AUTHORITY_MODE;
    const oldProfile = process.env.ALICE_RUNTIME_PROFILE;
    process.env.ALICE_RUNTIME_AUTHORITY_MODE = "proposer-only";
    process.env.ALICE_RUNTIME_PROFILE = "full-gated";
    let saveAttempted = false;
    const ctx: ConfigRouteContext = {
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "PUT",
      pathname: "/api/config",
      url: new URL("http://localhost/api/config"),
      config,
      json: response().json,
      error: response().error,
      readJsonBody: async <T extends object>() =>
        ({
          ui: { theme: "dark" },
          env: { vars: envUpdates },
          agents: { defaults: { adminEntityId } },
        }) as T,
      redactConfigSecrets: (value) => value,
      isBlockedObjectKey: () => false,
      stripRedactedPlaceholderValuesDeep: () => {},
      patchTouchesProviderSelection: () => false,
      BLOCKED_ENV_KEYS: new Set(),
      CONFIG_WRITE_ALLOWED_TOP_KEYS: new Set(["ui", "env", "agents"]),
      resolveMcpServersRejection: async () => null,
      resolveMcpTerminalAuthorizationRejection: () => null,
      saveElizaConfig: async () => {
        saveAttempted = true;
        await Promise.resolve();
        throw new Error("durable write rejected");
      },
    };

    await handleConfigRoutes(ctx);
    expect(saveAttempted).toBe(true);
    expect(config.ui).toEqual({ theme: "light" });
    expect(config.agents?.defaults?.adminEntityId).toBeUndefined();
    for (const name of Object.keys(envUpdates))
      expect(process.env[name]).toBeUndefined();
    ctx.saveElizaConfig = async (candidate) => {
      expect(candidate.env?.vars).toEqual(envUpdates);
      expect(candidate.agents?.defaults).toEqual({
        model: { primary: "openai-codex/gpt-5.4" },
        adminEntityId,
      });
      for (const name of Object.keys(envUpdates))
        expect(process.env[name]).toBeUndefined();
    };
    await handleConfigRoutes(ctx);
    expect(config.ui).toEqual({ theme: "dark" });
    expect(config.agents?.defaults?.adminEntityId).toBe(adminEntityId);
    for (const [name, value] of Object.entries(envUpdates))
      expect(process.env[name]).toBe(value);
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (oldAuthority === undefined)
      delete process.env.ALICE_RUNTIME_AUTHORITY_MODE;
    else process.env.ALICE_RUNTIME_AUTHORITY_MODE = oldAuthority;
    if (oldProfile === undefined) delete process.env.ALICE_RUNTIME_PROFILE;
    else process.env.ALICE_RUNTIME_PROFILE = oldProfile;
  });

  it("rejects Alice vault and authority settings before persistence", async () => {
    const errors: unknown[] = [];
    const config = {} as ElizaConfig;
    const oldAuthority = process.env.ALICE_RUNTIME_AUTHORITY_MODE;
    const oldProfile = process.env.ALICE_RUNTIME_PROFILE;
    process.env.ALICE_RUNTIME_AUTHORITY_MODE = "proposer-only";
    process.env.ALICE_RUNTIME_PROFILE = "full-gated";
    const payloads = ["ELIZA_VAULT_PASSPHRASE", "ALICE_RUNTIME_AUTHORITY_MODE"];
    const ctx: ConfigRouteContext = {
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "PUT",
      pathname: "/api/config",
      url: new URL("http://localhost/api/config"),
      config,
      json: response().json,
      error: (_res, message, status) => errors.push({ message, status }),
      readJsonBody: async <T extends object>() =>
        ({ [payloads[errors.length]]: "x" }) as T,
      redactConfigSecrets: (value) => value,
      isBlockedObjectKey: () => false,
      stripRedactedPlaceholderValuesDeep: () => {},
      patchTouchesProviderSelection: () => false,
      BLOCKED_ENV_KEYS: new Set(),
      CONFIG_WRITE_ALLOWED_TOP_KEYS: new Set(["env"]),
      resolveMcpServersRejection: async () => null,
      resolveMcpTerminalAuthorizationRejection: () => null,
      saveElizaConfig: async () => {
        throw new Error("must not save");
      },
    };
    await handleConfigRoutes(ctx);
    await handleConfigRoutes(ctx);
    expect(errors).toEqual(
      payloads.map((key) => ({
        message: `Unsupported Alice setting: ${key}`,
        status: 400,
      })),
    );
    ctx.readJsonBody = async <T extends object>() =>
      ({ env: { vars: { ELIZA_AUTH_DISABLED: "1" } } }) as T;
    await handleConfigRoutes(ctx);
    expect(errors.at(-1)).toEqual({
      message:
        "Unsupported Alice environment setting: env.vars.ELIZA_AUTH_DISABLED",
      status: 400,
    });
    expect(config).toEqual({});
    if (oldAuthority === undefined)
      delete process.env.ALICE_RUNTIME_AUTHORITY_MODE;
    else process.env.ALICE_RUNTIME_AUTHORITY_MODE = oldAuthority;
    if (oldProfile === undefined) delete process.env.ALICE_RUNTIME_PROFILE;
    else process.env.ALICE_RUNTIME_PROFILE = oldProfile;
  });

  it("commits connector state only after the awaited save succeeds", async () => {
    const config = { connectors: {} } as ElizaConfig;
    let persisted: ElizaConfig | undefined;
    let saveFinished = false;
    const ctx: ConnectorRouteContext = {
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "POST",
      pathname: "/api/connectors",
      state: { config },
      json: response().json,
      error: response().error,
      readJsonBody: async <T extends object>() =>
        ({ name: "telegram", config: { enabled: true } }) as T,
      saveElizaConfig: async (candidate) => {
        expect(config.connectors).toEqual({});
        await Promise.resolve();
        persisted = candidate;
        saveFinished = true;
      },
      redactConfigSecrets: (value) => value,
      isBlockedObjectKey: () => false,
      cloneWithoutBlockedObjectKeys: <T>(value: T) => value,
    };

    await handleConnectorRoutes(ctx);
    expect(saveFinished).toBe(true);
    expect(persisted?.connectors).toEqual({ telegram: { enabled: true } });
    expect(config.connectors).toEqual({ telegram: { enabled: true } });
    expect(ctx.state.config.connectors).toEqual({
      telegram: { enabled: true },
    });
  });
});
