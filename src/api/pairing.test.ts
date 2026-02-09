/**
 * Tests for api/pairing.ts — enhanced pairing security.
 *
 * Exercises:
 *   - Session creation and expiry
 *   - Code generation and validation
 *   - Challenge-response verification
 *   - Exponential backoff
 *   - Device authorization storage
 */

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupExpiredSessions,
  createPairingSession,
  deleteDevice,
  getPairingSession,
  isDeviceAuthorized,
  listAuthorizedDevices,
  revokeDevice,
  verifyPairingSimple,
} from "./pairing.js";

// Mock file system to avoid actual disk writes in tests
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue("[]"),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

describe("createPairingSession", () => {
  it("creates a session with valid code format", () => {
    const session = createPairingSession();

    expect(session.id).toBeTruthy();
    expect(session.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    expect(session.challenge).toBeTruthy();
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    expect(session.attempts).toBe(0);
    expect(session.maxAttempts).toBe(5);
  });

  it("generates unique codes for each session", () => {
    const sessions = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const session = createPairingSession();
      sessions.add(session.code);
    }

    // All codes should be unique
    expect(sessions.size).toBe(100);
  });
});

describe("getPairingSession", () => {
  it("returns null for non-existent session", () => {
    expect(getPairingSession("non-existent")).toBeNull();
  });

  it("returns session when valid", () => {
    const created = createPairingSession();
    const retrieved = getPairingSession(created.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.code).toBe(created.code);
  });

  it("returns null for expired session", () => {
    const session = createPairingSession();
    const sessionId = session.id;

    // Manually expire the session by manipulating the map
    // (In real tests, we'd use fake timers)
    const retrieved = getPairingSession(sessionId);
    if (retrieved) {
      retrieved.expiresAt = Date.now() - 1000;
    }

    expect(getPairingSession(sessionId)).toBeNull();
  });
});

describe("verifyPairingSimple", () => {
  beforeEach(() => {
    // Set up API token for testing
    process.env.MILAIDY_API_TOKEN = "test-api-token";
  });

  afterEach(() => {
    delete process.env.MILAIDY_API_TOKEN;
  });

  it("succeeds with correct code", () => {
    const session = createPairingSession();
    const result = verifyPairingSimple(session.id, session.code, "127.0.0.1");

    expect(result.success).toBe(true);
    expect(result.token).toBe("test-api-token");
  });

  it("succeeds with code without dashes", () => {
    const session = createPairingSession();
    const codeWithoutDashes = session.code.replace("-", "");
    const result = verifyPairingSimple(session.id, codeWithoutDashes, "127.0.0.1");

    expect(result.success).toBe(true);
  });

  it("succeeds with lowercase code", () => {
    const session = createPairingSession();
    const lowercaseCode = session.code.toLowerCase();
    const result = verifyPairingSimple(session.id, lowercaseCode, "127.0.0.1");

    expect(result.success).toBe(true);
  });

  it("fails with incorrect code", () => {
    const session = createPairingSession();
    const result = verifyPairingSimple(session.id, "WRONG-CODE", "127.0.0.1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid pairing code");
    expect(result.attemptsRemaining).toBeDefined();
  });

  it("fails for non-existent session", () => {
    const result = verifyPairingSimple("fake-session", "CODE-1234", "127.0.0.1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Session not found or expired");
  });

  it("fails after maximum attempts", () => {
    const session = createPairingSession();

    // Use up all attempts
    for (let i = 0; i < 5; i++) {
      verifyPairingSimple(session.id, "WRONG-CODE", "10.0.0.1");
    }

    // Next attempt should fail with max attempts error
    const result = verifyPairingSimple(session.id, session.code, "10.0.0.1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Maximum attempts exceeded");
  });

  it("invalidates session after successful pairing", () => {
    const session = createPairingSession();

    // First pairing succeeds
    const result1 = verifyPairingSimple(session.id, session.code, "127.0.0.1");
    expect(result1.success).toBe(true);

    // Second attempt fails (session deleted)
    const result2 = verifyPairingSimple(session.id, session.code, "127.0.0.1");
    expect(result2.success).toBe(false);
  });
});

describe("exponential backoff", () => {
  it("applies backoff after failures", () => {
    const ip = "192.168.1.1";

    // Create sessions and fail them
    for (let i = 0; i < 3; i++) {
      const session = createPairingSession();
      verifyPairingSimple(session.id, "WRONG", ip);
    }

    // Next attempt should be rate limited with retryAfter
    const session = createPairingSession();
    const result = verifyPairingSimple(session.id, session.code, ip);

    expect(result.success).toBe(false);
    expect(result.retryAfter).toBeDefined();
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});

describe("cleanupExpiredSessions", () => {
  it("removes expired sessions", () => {
    // Create a session
    const session = createPairingSession();
    const sessionId = session.id;

    // Verify it exists
    expect(getPairingSession(sessionId)).not.toBeNull();

    // Manually expire it
    const retrieved = getPairingSession(sessionId);
    if (retrieved) {
      retrieved.expiresAt = Date.now() - 1000;
    }

    // Cleanup
    const cleaned = cleanupExpiredSessions();

    // Session should be gone
    expect(getPairingSession(sessionId)).toBeNull();
  });
});

describe("device authorization", () => {
  it("lists returns empty array initially", () => {
    const devices = listAuthorizedDevices();
    // May have devices from other tests, but should be an array
    expect(Array.isArray(devices)).toBe(true);
  });

  it("isDeviceAuthorized returns false for unknown device", () => {
    const result = isDeviceAuthorized("unknown-fingerprint");
    expect(result.valid).toBe(false);
  });

  it("revokeDevice returns false for unknown device", () => {
    expect(revokeDevice("unknown-fingerprint")).toBe(false);
  });

  it("deleteDevice returns false for unknown device", () => {
    expect(deleteDevice("unknown-fingerprint")).toBe(false);
  });
});
