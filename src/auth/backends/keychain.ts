/**
 * System Keychain Storage Backend — native OS credential storage.
 *
 * Uses the `keytar` package for cross-platform keychain access:
 * - macOS: Keychain Access
 * - Linux: libsecret (GNOME Keyring, KWallet)
 * - Windows: Credential Manager
 *
 * This is the most secure backend as credentials are:
 * - Encrypted by the OS
 * - Protected by user authentication
 * - Not accessible by other users/processes
 *
 * @module auth/backends/keychain
 */

import { logger } from "@elizaos/core";
import type { SecureStorageBackend } from "../secure-storage.js";

const SERVICE_NAME = "milaidy";

// keytar types for dynamic import
interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

export class KeychainBackend implements SecureStorageBackend {
  readonly name = "keychain";
  private _available: boolean;
  private _keytar: KeytarModule | null = null;

  constructor() {
    this._available = this.checkAvailability();
  }

  get available(): boolean {
    return this._available;
  }

  private checkAvailability(): boolean {
    try {
      // Try to require keytar (native module, may not be installed)
      this._keytar = require("keytar");
      return true;
    } catch {
      logger.debug("[keychain] keytar not available (optional dependency)");
      return false;
    }
  }

  private getKeytar(): KeytarModule {
    if (!this._keytar) {
      throw new Error("Keychain backend not available");
    }
    return this._keytar;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.getKeytar().getPassword(SERVICE_NAME, key);
    } catch (err) {
      logger.error(
        `[keychain] Failed to get ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.getKeytar().setPassword(SERVICE_NAME, key, value);
    } catch (err) {
      throw new Error(
        `Failed to set keychain value: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.getKeytar().deletePassword(SERVICE_NAME, key);
    } catch (err) {
      // Ignore errors when deleting (may not exist)
      logger.debug(
        `[keychain] Delete ${key} (may not exist): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async list(): Promise<string[]> {
    try {
      const credentials = await this.getKeytar().findCredentials(SERVICE_NAME);
      return credentials.map((c) => c.account);
    } catch (err) {
      logger.error(
        `[keychain] Failed to list credentials: ${err instanceof Error ? err.message : err}`,
      );
      return [];
    }
  }
}
