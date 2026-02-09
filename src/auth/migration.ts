/**
 * Credential Migration — migrate from plaintext to encrypted storage.
 *
 * Handles automatic migration of legacy plaintext credentials to the
 * new secure storage system during startup.
 *
 * Migration is:
 * - Automatic: runs on first access after upgrade
 * - Non-destructive: keeps backups of legacy files
 * - Idempotent: safe to run multiple times
 *
 * @module auth/migration
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";
import { getSecureStorage } from "./secure-storage.js";
import type { StoredCredentials, SubscriptionProvider } from "./types.js";

/** Get the Milaidy home directory (reads env var each time for testability). */
function getMilaidyHome(): string {
  return process.env.MILAIDY_HOME ?? path.join(os.homedir(), ".milaidy");
}

/** Get the legacy auth directory path. */
function getLegacyAuthDir(): string {
  return path.join(getMilaidyHome(), "auth");
}

/** Get the backup directory path. */
function getBackupDir(): string {
  return path.join(getMilaidyHome(), "auth-backup");
}

/** List of known subscription providers. */
const PROVIDERS: SubscriptionProvider[] = [
  "anthropic-subscription",
  "openai-codex",
];

export interface MigrationResult {
  /** Providers successfully migrated. */
  migrated: SubscriptionProvider[];
  /** Providers that failed migration. */
  failed: Array<{ provider: SubscriptionProvider; error: string }>;
  /** Providers skipped (no legacy data). */
  skipped: SubscriptionProvider[];
  /** Providers already migrated. */
  alreadyMigrated: SubscriptionProvider[];
}

/**
 * Check if a legacy plaintext credential file exists.
 */
function hasLegacyCredentials(provider: SubscriptionProvider): boolean {
  const legacyPath = path.join(getLegacyAuthDir(), `${provider}.json`);
  return fs.existsSync(legacyPath);
}

/**
 * Read legacy plaintext credentials.
 */
function readLegacyCredentials(
  provider: SubscriptionProvider,
): StoredCredentials | null {
  const legacyPath = path.join(getLegacyAuthDir(), `${provider}.json`);

  try {
    const data = fs.readFileSync(legacyPath, "utf8");
    const parsed = JSON.parse(data);

    // Validate structure
    if (
      parsed.provider === provider &&
      parsed.credentials &&
      typeof parsed.credentials.access === "string"
    ) {
      return parsed as StoredCredentials;
    }

    logger.warn(`[migration] Invalid legacy format for ${provider}`);
    return null;
  } catch (err) {
    logger.error(
      `[migration] Failed to read legacy ${provider}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/**
 * Backup a legacy credentials file before migration.
 */
function backupLegacyFile(provider: SubscriptionProvider): boolean {
  const legacyPath = path.join(getLegacyAuthDir(), `${provider}.json`);
  const backupPath = path.join(
    getBackupDir(),
    `${provider}-${Date.now()}.json.bak`,
  );

  try {
    // Create backup directory
    if (!fs.existsSync(getBackupDir())) {
      fs.mkdirSync(getBackupDir(), { recursive: true, mode: 0o700 });
    }

    // Copy to backup
    fs.copyFileSync(legacyPath, backupPath);
    fs.chmodSync(backupPath, 0o600);

    logger.debug(`[migration] Backed up ${provider} to ${backupPath}`);
    return true;
  } catch (err) {
    logger.error(
      `[migration] Failed to backup ${provider}: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

/**
 * Delete legacy credentials file after successful migration.
 */
function deleteLegacyFile(provider: SubscriptionProvider): void {
  const legacyPath = path.join(getLegacyAuthDir(), `${provider}.json`);

  try {
    fs.unlinkSync(legacyPath);
    logger.debug(`[migration] Deleted legacy file for ${provider}`);
  } catch (err) {
    // Non-fatal - backup still exists
    logger.warn(
      `[migration] Failed to delete legacy ${provider}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Migrate a single provider's credentials to secure storage.
 */
async function migrateProvider(
  provider: SubscriptionProvider,
): Promise<{ success: boolean; error?: string }> {
  // Read legacy credentials
  const credentials = readLegacyCredentials(provider);
  if (!credentials) {
    return { success: false, error: "Failed to read legacy credentials" };
  }

  // Backup before migration
  if (!backupLegacyFile(provider)) {
    return { success: false, error: "Failed to create backup" };
  }

  // Get secure storage backend
  const storage = await getSecureStorage();

  try {
    // Store encrypted
    await storage.set(
      `credentials:${provider}`,
      JSON.stringify(credentials),
    );

    // Delete legacy file
    deleteLegacyFile(provider);

    logger.info(
      `[migration] Successfully migrated ${provider} to ${storage.name} backend`,
    );
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Migrate all legacy credentials to secure storage.
 *
 * Call this during startup to automatically upgrade credentials.
 */
export async function migrateCredentials(): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: [],
    failed: [],
    skipped: [],
    alreadyMigrated: [],
  };

  const storage = await getSecureStorage();

  for (const provider of PROVIDERS) {
    // Check if already migrated
    const existingKey = `credentials:${provider}`;
    const existing = await storage.get(existingKey);

    if (existing) {
      result.alreadyMigrated.push(provider);
      continue;
    }

    // Check if legacy credentials exist
    if (!hasLegacyCredentials(provider)) {
      result.skipped.push(provider);
      continue;
    }

    // Migrate
    const migrationResult = await migrateProvider(provider);

    if (migrationResult.success) {
      result.migrated.push(provider);
    } else {
      result.failed.push({
        provider,
        error: migrationResult.error ?? "Unknown error",
      });
    }
  }

  // Log summary
  if (result.migrated.length > 0) {
    logger.info(
      `[migration] Migrated ${result.migrated.length} credential(s) to secure storage`,
    );
  }

  if (result.failed.length > 0) {
    logger.warn(
      `[migration] Failed to migrate ${result.failed.length} credential(s)`,
    );
    for (const { provider, error } of result.failed) {
      logger.warn(`[migration]   - ${provider}: ${error}`);
    }
  }

  return result;
}

/**
 * Check if migration is needed.
 */
export function needsMigration(): boolean {
  return PROVIDERS.some(hasLegacyCredentials);
}

/**
 * Get list of providers that need migration.
 */
export function getProvidersPendingMigration(): SubscriptionProvider[] {
  return PROVIDERS.filter(hasLegacyCredentials);
}
