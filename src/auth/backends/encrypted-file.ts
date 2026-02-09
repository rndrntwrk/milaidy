/**
 * Encrypted File Storage Backend — AES-256-GCM encrypted files.
 *
 * Used as fallback when system keychain is not available.
 * Each credential is stored in a separate .enc file.
 *
 * @module auth/backends/encrypted-file
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";
import type { EncryptedPayload, SecureStorageBackend } from "../secure-storage.js";
import { decrypt, encrypt, isEncryptedPayload } from "../secure-storage.js";

const MILAIDY_HOME =
  process.env.MILAIDY_HOME ?? path.join(os.homedir(), ".milaidy");
const SECURE_DIR = path.join(MILAIDY_HOME, "secure");
const ENC_EXTENSION = ".enc";

export class EncryptedFileBackend implements SecureStorageBackend {
  readonly name = "encrypted-file";
  private _available: boolean;

  constructor() {
    this._available = this.checkAvailability();
  }

  get available(): boolean {
    return this._available;
  }

  private checkAvailability(): boolean {
    try {
      // Ensure directory exists with secure permissions
      if (!fs.existsSync(SECURE_DIR)) {
        fs.mkdirSync(SECURE_DIR, { recursive: true, mode: 0o700 });
      }

      // Verify we can write to it
      const testFile = path.join(SECURE_DIR, `.test-${Date.now()}`);
      fs.writeFileSync(testFile, "test", { mode: 0o600 });
      fs.unlinkSync(testFile);

      return true;
    } catch (err) {
      logger.warn(
        `[encrypted-file] Backend not available: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  private keyToPath(key: string): string {
    // Sanitize key to prevent path traversal
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(SECURE_DIR, `${safeKey}${ENC_EXTENSION}`);
  }

  async get(key: string): Promise<string | null> {
    const filePath = this.keyToPath(key);

    try {
      const data = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(data);

      if (isEncryptedPayload(parsed)) {
        return decrypt(parsed);
      }

      // Legacy plaintext format — return as-is for migration
      logger.warn(`[encrypted-file] Found legacy plaintext for key: ${key}`);
      return data;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      logger.error(
        `[encrypted-file] Failed to read ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const filePath = this.keyToPath(key);

    try {
      // Ensure directory exists
      if (!fs.existsSync(SECURE_DIR)) {
        fs.mkdirSync(SECURE_DIR, { recursive: true, mode: 0o700 });
      }

      const encrypted = encrypt(value);
      fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
    } catch (err) {
      throw new Error(
        `Failed to write encrypted file: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.keyToPath(key);

    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async list(): Promise<string[]> {
    try {
      const files = fs.readdirSync(SECURE_DIR);
      return files
        .filter((f) => f.endsWith(ENC_EXTENSION))
        .map((f) => f.slice(0, -ENC_EXTENSION.length));
    } catch {
      return [];
    }
  }
}
