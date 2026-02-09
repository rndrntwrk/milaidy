/**
 * Tests for auth/migration.ts — credential migration utilities.
 *
 * Exercises:
 *   - Detecting legacy credentials
 *   - Migration from plaintext to encrypted
 *   - Backup creation
 *   - Idempotent migration
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProvidersPendingMigration,
  migrateCredentials,
  needsMigration,
} from "./migration.js";
import { resetSecureStorage, setSecureStorageBackend } from "./secure-storage.js";
import { MemoryBackend } from "./backends/memory.js";
import type { StoredCredentials } from "./types.js";

// Mock machine ID
vi.mock("./key-derivation.js", () => ({
  getMachineId: () => "test-machine-id-12345",
}));

// Test directory
const TEST_DIR = path.join(os.tmpdir(), `milaidy-migration-test-${Date.now()}`);
const AUTH_DIR = path.join(TEST_DIR, "auth");
const BACKUP_DIR = path.join(TEST_DIR, "auth-backup");

// Mock MILAIDY_HOME
const originalEnv = process.env.MILAIDY_HOME;

beforeEach(() => {
  process.env.MILAIDY_HOME = TEST_DIR;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  resetSecureStorage();
});

afterEach(() => {
  // Cleanup test directory
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  // Restore env
  if (originalEnv) {
    process.env.MILAIDY_HOME = originalEnv;
  } else {
    delete process.env.MILAIDY_HOME;
  }
});

function writeLegacyCredentials(provider: string, credentials: Partial<StoredCredentials>): void {
  const data: StoredCredentials = {
    provider: provider as any,
    credentials: {
      access: "test-access-token",
      refresh: "test-refresh-token",
      expires: Date.now() + 3600000,
      ...(credentials.credentials ?? {}),
    } as any,
    createdAt: credentials.createdAt ?? Date.now(),
    updatedAt: credentials.updatedAt ?? Date.now(),
  };

  const filePath = path.join(AUTH_DIR, `${provider}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

describe("needsMigration", () => {
  it("returns false when no legacy credentials exist", () => {
    expect(needsMigration()).toBe(false);
  });

  it("returns true when anthropic credentials exist", () => {
    writeLegacyCredentials("anthropic-subscription", {});
    expect(needsMigration()).toBe(true);
  });

  it("returns true when openai credentials exist", () => {
    writeLegacyCredentials("openai-codex", {});
    expect(needsMigration()).toBe(true);
  });
});

describe("getProvidersPendingMigration", () => {
  it("returns empty array when no legacy credentials exist", () => {
    expect(getProvidersPendingMigration()).toEqual([]);
  });

  it("returns list of providers needing migration", () => {
    writeLegacyCredentials("anthropic-subscription", {});
    writeLegacyCredentials("openai-codex", {});

    const pending = getProvidersPendingMigration();
    expect(pending).toHaveLength(2);
    expect(pending).toContain("anthropic-subscription");
    expect(pending).toContain("openai-codex");
  });
});

describe("migrateCredentials", () => {
  let memoryBackend: MemoryBackend;

  beforeEach(() => {
    memoryBackend = new MemoryBackend();
    setSecureStorageBackend(memoryBackend);
  });

  it("skips when no legacy credentials exist", async () => {
    const result = await migrateCredentials();

    expect(result.skipped).toHaveLength(2);
    expect(result.migrated).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.alreadyMigrated).toHaveLength(0);
  });

  it("migrates anthropic credentials to secure storage", async () => {
    writeLegacyCredentials("anthropic-subscription", {
      credentials: {
        access: "my-access-token",
        refresh: "my-refresh-token",
        expires: Date.now() + 7200000,
      } as any,
    });

    const result = await migrateCredentials();

    expect(result.migrated).toContain("anthropic-subscription");
    expect(result.skipped).toContain("openai-codex");

    // Verify stored in secure backend
    const stored = await memoryBackend.get("credentials:anthropic-subscription");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.credentials.access).toBe("my-access-token");
  });

  it("creates backup of legacy file", async () => {
    writeLegacyCredentials("anthropic-subscription", {});

    await migrateCredentials();

    // Check backup was created
    const backupFiles = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [];
    expect(backupFiles.length).toBeGreaterThan(0);
    expect(backupFiles.some((f) => f.startsWith("anthropic-subscription-"))).toBe(true);
  });

  it("deletes legacy file after successful migration", async () => {
    writeLegacyCredentials("anthropic-subscription", {});
    const legacyPath = path.join(AUTH_DIR, "anthropic-subscription.json");

    expect(fs.existsSync(legacyPath)).toBe(true);
    await migrateCredentials();
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it("reports already migrated credentials", async () => {
    // Pre-populate secure storage
    await memoryBackend.set(
      "credentials:anthropic-subscription",
      JSON.stringify({ provider: "anthropic-subscription", credentials: {} }),
    );

    const result = await migrateCredentials();

    expect(result.alreadyMigrated).toContain("anthropic-subscription");
    expect(result.migrated).not.toContain("anthropic-subscription");
  });

  it("handles invalid legacy JSON gracefully", async () => {
    // Write invalid JSON
    const legacyPath = path.join(AUTH_DIR, "anthropic-subscription.json");
    fs.writeFileSync(legacyPath, "not valid json {{{", { mode: 0o600 });

    const result = await migrateCredentials();

    expect(result.failed.some((f) => f.provider === "anthropic-subscription")).toBe(true);
  });
});
