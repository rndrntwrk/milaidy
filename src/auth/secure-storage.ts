/**
 * Secure Storage Layer — encrypted credential storage with multiple backends.
 *
 * Provides a unified interface for storing sensitive credentials using:
 * - System keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
 * - AES-256-GCM encrypted files (fallback when keychain unavailable)
 * - In-memory storage (testing only)
 *
 * @module auth/secure-storage
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { logger } from "@elizaos/core";
import { getCredentialPassphraseCandidates } from "./key-derivation.js";

// ---------- Types ----------

export interface SecureStorageBackend {
  /** Unique name for this backend. */
  readonly name: string;
  /** Whether this backend is available on the current system. */
  readonly available: boolean;

  /** Retrieve a value by key. Returns null if not found. */
  get(key: string): Promise<string | null>;
  /** Store a value by key. */
  set(key: string, value: string): Promise<void>;
  /** Delete a value by key. */
  delete(key: string): Promise<void>;
  /** List all keys. */
  list(): Promise<string[]>;
}

export interface EncryptedPayload {
  /** Payload format version. */
  version: 1;
  /** Encryption algorithm used. */
  algorithm: "aes-256-gcm";
  /** Initialization vector (base64). */
  iv: string;
  /** GCM authentication tag (base64). */
  authTag: string;
  /** Encrypted data (base64). */
  ciphertext: string;
  /** Key derivation parameters. */
  keyDerivation: {
    algorithm: "scrypt";
    /** Salt for key derivation (base64). */
    salt: string;
    /** CPU/memory cost factor (N). */
    N: number;
    /** Block size (r). */
    r: number;
    /** Parallelization factor (p). */
    p: number;
  };
}

// ---------- Key Derivation ----------

/** Default scrypt parameters (OWASP 2024 recommendations). */
const SCRYPT_PARAMS = {
  N: 2 ** 17, // 128 MiB memory cost
  r: 8, // block size
  p: 1, // parallelization
  maxmem: 256 * 1024 * 1024, // max memory for scrypt
} as const;

/**
 * Derive an encryption key from the selected credential passphrase material.
 */
function deriveKey(salt: Buffer, passphrase: string): Buffer {
  return scryptSync(passphrase, salt, 32, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
}

// ---------- Encryption Functions ----------

/**
 * Encrypt plaintext using AES-256-GCM with machine-derived key.
 */
export function encrypt(plaintext: string): EncryptedPayload {
  const salt = randomBytes(32);
  const passphrases = getCredentialPassphraseCandidates();
  if (passphrases.length === 0) {
    throw new Error("No credential passphrase candidates available");
  }
  const key = deriveKey(salt, passphrases[0]);
  const iv = randomBytes(12); // 96-bit IV for GCM mode

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64"),
    keyDerivation: {
      algorithm: "scrypt",
      salt: salt.toString("base64"),
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
    },
  };
}

/**
 * Decrypt an encrypted payload using machine-derived key.
 * @throws Error if decryption fails (wrong key, corrupted data, tampered).
 */
export function decrypt(payload: EncryptedPayload): string {
  if (payload.version !== 1) {
    throw new Error(`Unsupported encryption version: ${payload.version}`);
  }

  if (payload.algorithm !== "aes-256-gcm") {
    throw new Error(`Unsupported algorithm: ${payload.algorithm}`);
  }

  const salt = Buffer.from(payload.keyDerivation.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const passphrases = getCredentialPassphraseCandidates();
  if (passphrases.length === 0) {
    throw new Error("Decryption failed: no key candidates available");
  }

  for (let i = 0; i < passphrases.length; i += 1) {
    const key = deriveKey(salt, passphrases[i]);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    try {
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      if (i > 0) {
        logger.debug(
          `[secure-storage] Decrypted payload with fallback key candidate #${i + 1}`,
        );
      }
      return plaintext;
    } catch {
      // Try next passphrase candidate.
    }
  }

  throw new Error("Decryption failed: authentication failed");
}

/**
 * Check if a payload is an encrypted format (vs legacy plaintext).
 */
export function isEncryptedPayload(data: unknown): data is EncryptedPayload {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    obj.version === 1 &&
    obj.algorithm === "aes-256-gcm" &&
    typeof obj.iv === "string" &&
    typeof obj.authTag === "string" &&
    typeof obj.ciphertext === "string" &&
    typeof obj.keyDerivation === "object"
  );
}

// ---------- Backend Resolution ----------

let _resolvedBackend: SecureStorageBackend | null = null;

/**
 * Get the best available storage backend.
 * Priority: Keychain > Encrypted File > Memory (test only).
 */
export async function getSecureStorage(): Promise<SecureStorageBackend> {
  if (_resolvedBackend) return _resolvedBackend;

  // Try keychain first (most secure)
  try {
    const { KeychainBackend } = await import("./backends/keychain.js");
    const keychain = new KeychainBackend();
    if (keychain.available) {
      logger.debug("[secure-storage] Using keychain backend");
      _resolvedBackend = keychain;
      return keychain;
    }
  } catch {
    logger.debug("[secure-storage] Keychain backend not available");
  }

  // Fallback to encrypted file
  try {
    const { EncryptedFileBackend } = await import("./backends/encrypted-file.js");
    const encryptedFile = new EncryptedFileBackend();
    if (encryptedFile.available) {
      logger.debug("[secure-storage] Using encrypted file backend");
      _resolvedBackend = encryptedFile;
      return encryptedFile;
    }
  } catch (err) {
    logger.warn(
      `[secure-storage] Encrypted file backend failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  // Last resort: memory backend (should only happen in tests)
  logger.warn(
    "[secure-storage] No persistent backend available, using in-memory storage",
  );
  const { MemoryBackend } = await import("./backends/memory.js");
  _resolvedBackend = new MemoryBackend();
  return _resolvedBackend;
}

/**
 * Reset the resolved backend (for testing).
 */
export function resetSecureStorage(): void {
  _resolvedBackend = null;
}

/**
 * Force a specific backend (for testing).
 */
export function setSecureStorageBackend(backend: SecureStorageBackend): void {
  _resolvedBackend = backend;
}
