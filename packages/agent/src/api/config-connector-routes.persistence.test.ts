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

const response = () => ({
  json: (_res: http.ServerResponse, _body: unknown, _status?: number) => {},
  error: (_res: http.ServerResponse, _message: string, _status?: number) => {},
});

describe("settings persistence commit ordering", () => {
  it("leaves config and process.env unchanged when async config save rejects", async () => {
    const key = "DISCORD_TEST_TOKEN";
    const originalEnv = process.env[key];
    delete process.env[key];
    const config = {
      ui: { theme: "light" },
      env: { vars: {} },
    } as unknown as ElizaConfig;
    const oldAuthority = process.env.ALICE_RUNTIME_AUTHORITY_MODE;
    const oldProfile = process.env.ALICE_RUNTIME_PROFILE;
    process.env.ALICE_RUNTIME_AUTHORITY_MODE = "proposer-only";
    process.env.ALICE_RUNTIME_PROFILE = "full-gated";
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
        ({ ui: { theme: "dark" }, env: { vars: { [key]: "new" } } }) as T,
      redactConfigSecrets: (value) => value,
      isBlockedObjectKey: () => false,
      stripRedactedPlaceholderValuesDeep: () => {},
      patchTouchesProviderSelection: () => false,
      BLOCKED_ENV_KEYS: new Set(),
      CONFIG_WRITE_ALLOWED_TOP_KEYS: new Set(["ui", "env"]),
      resolveMcpServersRejection: async () => null,
      resolveMcpTerminalAuthorizationRejection: () => null,
      saveElizaConfig: async () => {
        await Promise.resolve();
        throw new Error("durable write rejected");
      },
    };

    await handleConfigRoutes(ctx);
    expect(config.ui).toEqual({ theme: "light" });
    expect(process.env[key]).toBeUndefined();
    if (originalEnv === undefined) delete process.env[key];
    else process.env[key] = originalEnv;
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
