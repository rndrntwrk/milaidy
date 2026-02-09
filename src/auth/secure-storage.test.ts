/**
 * Tests for auth/secure-storage.ts — encryption and storage backends.
 *
 * Exercises:
 *   - AES-256-GCM encryption/decryption
 *   - Encrypted payload format validation
 *   - Memory backend operations
 *   - Backend resolution and fallback
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decrypt,
  encrypt,
  isEncryptedPayload,
  resetSecureStorage,
  setSecureStorageBackend,
  type EncryptedPayload,
} from "./secure-storage.js";
import { MemoryBackend } from "./backends/memory.js";

// Mock machine ID for consistent testing
vi.mock("./key-derivation.js", () => ({
  getMachineId: () => "test-machine-id-12345",
}));

describe("encrypt/decrypt", () => {
  it("encrypts and decrypts a simple string", () => {
    const plaintext = "hello world";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts JSON data", () => {
    const data = {
      provider: "anthropic-subscription",
      credentials: {
        access: "test-access-token",
        refresh: "test-refresh-token",
        expires: Date.now() + 3600000,
      },
    };

    const plaintext = JSON.stringify(data);
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(JSON.parse(decrypted)).toEqual(data);
  });

  it("produces different ciphertext for same plaintext (random IV/salt)", () => {
    const plaintext = "same input";
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);

    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    expect(encrypted1.keyDerivation.salt).not.toBe(encrypted2.keyDerivation.salt);

    // But both decrypt to the same value
    expect(decrypt(encrypted1)).toBe(plaintext);
    expect(decrypt(encrypted2)).toBe(plaintext);
  });

  it("encrypted payload has correct structure", () => {
    const encrypted = encrypt("test");

    expect(encrypted.version).toBe(1);
    expect(encrypted.algorithm).toBe("aes-256-gcm");
    expect(typeof encrypted.iv).toBe("string");
    expect(typeof encrypted.authTag).toBe("string");
    expect(typeof encrypted.ciphertext).toBe("string");
    expect(encrypted.keyDerivation.algorithm).toBe("scrypt");
    expect(typeof encrypted.keyDerivation.salt).toBe("string");
    expect(encrypted.keyDerivation.N).toBe(2 ** 17);
    expect(encrypted.keyDerivation.r).toBe(8);
    expect(encrypted.keyDerivation.p).toBe(1);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("secret");

    // Tamper with ciphertext
    const tampered: EncryptedPayload = {
      ...encrypted,
      ciphertext: Buffer.from("tampered").toString("base64"),
    };

    expect(() => decrypt(tampered)).toThrow("Decryption failed");
  });

  it("throws on tampered auth tag", () => {
    const encrypted = encrypt("secret");

    // Tamper with auth tag
    const tampered: EncryptedPayload = {
      ...encrypted,
      authTag: Buffer.from("badtag000000000").toString("base64"),
    };

    expect(() => decrypt(tampered)).toThrow("Decryption failed");
  });

  it("throws on unsupported version", () => {
    const encrypted = encrypt("test") as Record<string, unknown>;
    encrypted.version = 2;

    expect(() => decrypt(encrypted as EncryptedPayload)).toThrow(
      "Unsupported encryption version",
    );
  });

  it("throws on unsupported algorithm", () => {
    const encrypted = encrypt("test") as Record<string, unknown>;
    encrypted.algorithm = "aes-128-cbc";

    expect(() => decrypt(encrypted as EncryptedPayload)).toThrow(
      "Unsupported algorithm",
    );
  });
});

describe("isEncryptedPayload", () => {
  it("returns true for valid encrypted payload", () => {
    const encrypted = encrypt("test");
    expect(isEncryptedPayload(encrypted)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isEncryptedPayload(null)).toBe(false);
  });

  it("returns false for plain string", () => {
    expect(isEncryptedPayload("test")).toBe(false);
  });

  it("returns false for legacy plaintext JSON", () => {
    const legacyData = {
      provider: "anthropic-subscription",
      credentials: { access: "token", refresh: "refresh", expires: 123 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(isEncryptedPayload(legacyData)).toBe(false);
  });

  it("returns false for partial payload (missing iv)", () => {
    const partial = {
      version: 1,
      algorithm: "aes-256-gcm",
      authTag: "abc",
      ciphertext: "xyz",
      keyDerivation: { algorithm: "scrypt", salt: "s", N: 1, r: 1, p: 1 },
    };
    expect(isEncryptedPayload(partial)).toBe(false);
  });
});

describe("MemoryBackend", () => {
  let backend: MemoryBackend;

  beforeEach(() => {
    backend = new MemoryBackend();
  });

  it("has correct name and availability", () => {
    expect(backend.name).toBe("memory");
    expect(backend.available).toBe(true);
  });

  it("stores and retrieves values", async () => {
    await backend.set("key1", "value1");
    expect(await backend.get("key1")).toBe("value1");
  });

  it("returns null for non-existent key", async () => {
    expect(await backend.get("nonexistent")).toBeNull();
  });

  it("deletes values", async () => {
    await backend.set("key1", "value1");
    await backend.delete("key1");
    expect(await backend.get("key1")).toBeNull();
  });

  it("lists all keys", async () => {
    await backend.set("a", "1");
    await backend.set("b", "2");
    await backend.set("c", "3");

    const keys = await backend.list();
    expect(keys).toHaveLength(3);
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
  });

  it("clear() removes all data", async () => {
    await backend.set("a", "1");
    await backend.set("b", "2");
    backend.clear();

    expect(await backend.list()).toHaveLength(0);
    expect(await backend.get("a")).toBeNull();
  });
});

describe("backend resolution", () => {
  afterEach(() => {
    resetSecureStorage();
  });

  it("setSecureStorageBackend overrides default", async () => {
    const customBackend = new MemoryBackend();
    await customBackend.set("test", "value");

    setSecureStorageBackend(customBackend);

    // Import fresh to get resolved backend
    const { getSecureStorage } = await import("./secure-storage.js");
    const storage = await getSecureStorage();

    expect(storage.name).toBe("memory");
    expect(await storage.get("test")).toBe("value");
  });
});
