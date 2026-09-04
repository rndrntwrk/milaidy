import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRefreshAnthropicToken = vi.hoisted(() => vi.fn());
const mockCodexStateRead = vi.hoisted(() => vi.fn());
const mockCodexStateWrite = vi.hoisted(() => vi.fn());
const mockCodexStateDelete = vi.hoisted(() => vi.fn());
const mockSetCodexAuthPersistHook = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../anthropic.js", () => ({
  refreshAnthropicToken: mockRefreshAnthropicToken,
}));

vi.mock("@elizaos/core", () => ({
  logger: mockLogger,
}));

vi.mock("../alice-openai-codex-store.js", () => ({
  createAliceOpenAiCodexCredentialStoreFromEnvironment: () => ({
    read: mockCodexStateRead,
    write: mockCodexStateWrite,
    delete: mockCodexStateDelete,
  }),
}));

vi.mock("@elizaos/plugin-codex-cli", () => ({
  setCodexAuthPersistHook: mockSetCodexAuthPersistHook,
}));

let tmpHome: string;
const originalEnv = { ...process.env };

function writeExpiredClaudeBlob(): void {
  const claudeDir = path.join(tmpHome, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "expired-access-token",
        refreshToken: "revoked-refresh-token",
        expiresAt: Date.now() - 60_000,
      },
    }),
    "utf-8",
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "milady-claude-refresh-"));
  vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  process.env = { ...originalEnv };
  delete process.env.ELIZA_HOME;
  delete process.env.MILADY_STATE_DIR;
  delete process.env.MILADY_CONFIG_PATH;
  writeExpiredClaudeBlob();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpHome, { recursive: true, force: true });
  process.env = { ...originalEnv };
});

describe("applySubscriptionCredentials", () => {
  it("caches invalid_grant Claude Code refresh failures and downgrades them to info", async () => {
    mockRefreshAnthropicToken.mockRejectedValue(
      new Error(
        'Anthropic token refresh failed: {"error":"invalid_grant","error_description":"Refresh token not found or invalid"}',
      ),
    );

    const { applySubscriptionCredentials } = await import("../credentials.js");

    await applySubscriptionCredentials();
    await applySubscriptionCredentials();

    expect(mockRefreshAnthropicToken).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        "Claude Code OAuth refresh token from credentials file is invalid or revoked",
      ),
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("restores the selected Codex provider with D1-only account credentials", async () => {
    fs.rmSync(path.join(tmpHome, ".claude"), { recursive: true, force: true });
    process.env.CODEX_AUTH_PATH = path.join(tmpHome, ".codex", "auth.json");
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(
      JSON.stringify({
        exp,
        "https://api.openai.com/auth": { chatgpt_account_id: "account-test" },
      }),
    ).toString("base64url");
    mockCodexStateRead.mockResolvedValue({
      access: `header.${payload}.signature`,
      refresh: "refresh-token-for-cold-start-test",
      expires: exp * 1000,
    });
    const config: {
      agents?: {
        defaults?: {
          subscriptionProvider?: string;
          model?: { primary?: string };
        };
      };
    } = {};

    const { applySubscriptionCredentials } = await import("../credentials.js");
    await applySubscriptionCredentials(config);

    expect(config.agents?.defaults).toMatchObject({
      subscriptionProvider: "openai-codex",
      model: { primary: "codex-cli" },
    });
    expect(mockSetCodexAuthPersistHook).toHaveBeenCalledTimes(1);
  });

  it("disconnects Codex from its local, runtime-cache, and durable credential surfaces", async () => {
    fs.rmSync(path.join(tmpHome, ".claude"), { recursive: true, force: true });
    process.env.CODEX_AUTH_PATH = path.join(tmpHome, ".codex", "auth.json");
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    const credentials = {
      access: `header.${payload}.signature`,
      refresh: "refresh-token-for-delete-test",
      expires: exp * 1000,
    };
    const {
      applySubscriptionCredentials,
      deleteOpenAiCodexCredentials,
      loadCredentials,
      saveCredentials,
    } = await import("../credentials.js");
    saveCredentials("openai-codex", credentials);
    await applySubscriptionCredentials();

    await deleteOpenAiCodexCredentials();

    expect(loadCredentials("openai-codex")).toBeNull();
    expect(fs.existsSync(process.env.CODEX_AUTH_PATH)).toBe(false);
    expect(mockSetCodexAuthPersistHook).toHaveBeenLastCalledWith(undefined);
    expect(mockCodexStateDelete).toHaveBeenCalledTimes(1);
  });
});
