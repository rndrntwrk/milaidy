/**
 * Regression tests for `getSubscriptionStatus()`.
 *
 * Uses real filesystem temp directories for credential files.
 * Only child_process is mocked to prevent macOS keychain access.
 *
 * Guards against the Promise-truthy bug that shipped briefly in
 * PR #1757: `importClaudeCodeOAuthToken()` was promoted to async
 * but `getSubscriptionStatus()` (sync export behind
 * `GET /api/subscription/status`) kept calling it without `await`.
 * A Promise object is always truthy, so every user appeared to have
 * a valid Anthropic subscription configured regardless of reality.
 *
 * The fix: `getSubscriptionStatus()` stays synchronous and checks
 * the Claude Code OAuth blob directly via the sync
 * `readClaudeCodeOAuthBlob()` helper.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process.execSync so the macOS keychain lookup in
// readClaudeCodeOAuthBlob() cannot leak into negative test cases on
// dev machines that happen to have Claude Code installed.
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => {
    throw new Error("keychain disabled in test");
  }),
}));

// Silence the logger import side effects
vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getSubscriptionStatus } from "../credentials";

let tmpHome: string;
let tmpState: string;
const origEnv = { ...process.env };

function writeClaudeBlob(blob: {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}) {
  const dir = path.join(tmpHome, ".claude");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".credentials.json"),
    JSON.stringify({ claudeAiOauth: blob }),
    { encoding: "utf-8", mode: 0o600 },
  );
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "milady-cred-test-"));
  tmpState = fs.mkdtempSync(path.join(os.tmpdir(), "milady-state-test-"));
  vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  process.env.ELIZA_HOME = path.join(tmpHome, ".eliza");
  process.env.MILADY_STATE_DIR = tmpState;
  process.env.MILADY_CONFIG_PATH = path.join(tmpState, "milady.json");
  process.env.ELIZA_CONFIG_PATH = undefined as unknown as string;
  delete process.env.ELIZA_CONFIG_PATH;
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpState, { recursive: true, force: true });
  process.env = { ...origEnv };
});

describe("getSubscriptionStatus", () => {
  it("is synchronous -- returns an array, not a Promise", () => {
    const result = getSubscriptionStatus();
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown as { then?: unknown }).then).toBeUndefined();
  });

  it("reports anthropic-subscription as NOT configured when no Claude blob or setup token exists", () => {
    const result = getSubscriptionStatus();
    const anthropic = result.find(
      (r) => r.provider === "anthropic-subscription",
    );
    expect(anthropic).toBeDefined();
    expect(anthropic?.configured).toBe(false);
    expect(anthropic?.valid).toBe(false);
    expect(anthropic?.expiresAt).toBeNull();
  });

  it("reports anthropic-subscription as configured and valid when a fresh Claude Code blob exists", () => {
    const futureExpiry = Date.now() + 60 * 60 * 1000; // +1h
    writeClaudeBlob({
      accessToken: "sk-ant-oat01-test-token",
      refreshToken: "sk-ant-ort01-refresh",
      expiresAt: futureExpiry,
    });

    const anthropic = getSubscriptionStatus().find(
      (r) => r.provider === "anthropic-subscription",
    );
    expect(anthropic?.configured).toBe(true);
    expect(anthropic?.valid).toBe(true);
    expect(anthropic?.expiresAt).toBe(futureExpiry);
  });

  it("reports anthropic-subscription as configured but NOT valid when the Claude blob is expired", () => {
    const pastExpiry = Date.now() - 60 * 1000; // -1m
    writeClaudeBlob({
      accessToken: "sk-ant-oat01-expired",
      refreshToken: "sk-ant-ort01-refresh",
      expiresAt: pastExpiry,
    });

    const anthropic = getSubscriptionStatus().find(
      (r) => r.provider === "anthropic-subscription",
    );
    expect(anthropic?.configured).toBe(true);
    expect(anthropic?.valid).toBe(false);
    expect(anthropic?.expiresAt).toBe(pastExpiry);
  });

  it("falls back to the configured anthropic setup token when no Claude blob exists", () => {
    fs.writeFileSync(
      path.join(tmpState, "milady.json"),
      JSON.stringify({
        env: { __anthropicSubscriptionToken: "sk-ant-setup-token" },
      }),
      "utf-8",
    );
    const anthropic = getSubscriptionStatus().find(
      (r) => r.provider === "anthropic-subscription",
    );
    expect(anthropic?.configured).toBe(true);
    expect(anthropic?.expiresAt).toBeNull();
  });

  it("treats a Claude blob with null expiresAt (older format) as valid", () => {
    const dir = path.join(tmpHome, ".claude");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "sk-ant-oat01-legacy",
          refreshToken: "sk-ant-ort01-refresh",
          // no expiresAt
        },
      }),
      "utf-8",
    );
    const anthropic = getSubscriptionStatus().find(
      (r) => r.provider === "anthropic-subscription",
    );
    expect(anthropic?.configured).toBe(true);
    expect(anthropic?.valid).toBe(true);
    expect(anthropic?.expiresAt).toBeNull();
  });

  it("reports openai-codex as NOT configured when no codex auth.json exists", () => {
    const codex = getSubscriptionStatus().find(
      (r) => r.provider === "openai-codex",
    );
    expect(codex?.configured).toBe(false);
    expect(codex?.valid).toBe(false);
  });
});
