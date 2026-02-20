/**
 * Enhanced Pairing Security — device binding and challenge-response.
 *
 * Improvements over basic pairing:
 * - Challenge-response for device verification
 * - Device fingerprint binding
 * - Exponential backoff on failures
 * - Session-based pairing with expiry
 * - Authorized device storage
 *
 * @module api/pairing
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";

// ---------- Configuration ----------

const MILAIDY_HOME =
  process.env.MILAIDY_HOME ?? path.join(os.homedir(), ".milaidy");
const DEVICES_FILE = path.join(MILAIDY_HOME, "authorized-devices.json");

/** Pairing code alphabet (no confusable characters: 0O1lI) */
const PAIRING_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Pairing code length. */
const CODE_LENGTH = 8;

/** Pairing session TTL in milliseconds (5 minutes). */
const SESSION_TTL_MS = 5 * 60 * 1000;

/** Maximum pairing attempts per session. */
const MAX_ATTEMPTS = 5;

/** Base backoff time in milliseconds. */
const BACKOFF_BASE_MS = 1000;

/** Maximum backoff time in milliseconds. */
const BACKOFF_MAX_MS = 30_000;

// ---------- Types ----------

export interface PairingSession {
  /** Unique session ID. */
  id: string;
  /** Pairing code (formatted). */
  code: string;
  /** Normalized code for comparison. */
  normalizedCode: string;
  /** Challenge for device binding. */
  challenge: string;
  /** Session creation timestamp. */
  createdAt: number;
  /** Session expiry timestamp. */
  expiresAt: number;
  /** Number of verification attempts. */
  attempts: number;
  /** Maximum allowed attempts. */
  maxAttempts: number;
  /** Bound device fingerprint (after successful pairing). */
  deviceFingerprint?: string;
}

export interface AuthorizedDevice {
  /** Device fingerprint. */
  fingerprint: string;
  /** Display name (user-provided or auto-generated). */
  name: string;
  /** Authorization timestamp. */
  authorizedAt: number;
  /** Last authentication timestamp. */
  lastUsed: number;
  /** IP address at authorization. */
  authorizedFromIP?: string;
  /** Whether the device is currently active. */
  active: boolean;
}

export interface PairingResult {
  success: boolean;
  token?: string;
  error?: string;
  attemptsRemaining?: number;
  retryAfter?: number;
}

export interface DeviceVerificationResult {
  valid: boolean;
  device?: AuthorizedDevice;
  error?: string;
}

// ---------- Session Management ----------

const pairingSessions = new Map<string, PairingSession>();
const failureTracking = new Map<string, { count: number; lastFailure: number }>();

/**
 * Test-only reset for module-level state.
 *
 * Pairing maintains in-memory maps for sessions and per-IP backoff tracking.
 * Unit tests expect isolation across cases; exporting an explicit reset keeps
 * production behavior unchanged while making test setup deterministic.
 */
export function __resetPairingStateForTests(): void {
  pairingSessions.clear();
  failureTracking.clear();
  _authorizedDevices = null;
}

/**
 * Generate a cryptographically secure pairing code.
 */
function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let raw = "";
  for (let i = 0; i < bytes.length; i++) {
    raw += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  // Format as XXXX-XXXX for readability
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

/**
 * Normalize a pairing code for comparison.
 */
function normalizeCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Generate a challenge for device binding.
 */
function generateChallenge(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate a session ID.
 */
function generateSessionId(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * Calculate exponential backoff for failures.
 */
function calculateBackoff(failureCount: number): number {
  const backoff = BACKOFF_BASE_MS * Math.pow(2, Math.min(failureCount - 1, 10));
  return Math.min(backoff, BACKOFF_MAX_MS);
}

/**
 * Check if IP is in backoff period.
 */
function isInBackoff(ip: string): { inBackoff: boolean; retryAfter?: number } {
  const tracking = failureTracking.get(ip);
  if (!tracking || tracking.count === 0) {
    return { inBackoff: false };
  }

  const backoffMs = calculateBackoff(tracking.count);
  const backoffEnds = tracking.lastFailure + backoffMs;
  const now = Date.now();

  if (now < backoffEnds) {
    return {
      inBackoff: true,
      retryAfter: Math.ceil((backoffEnds - now) / 1000),
    };
  }

  return { inBackoff: false };
}

/**
 * Record a pairing failure.
 */
function recordFailure(ip: string): void {
  const tracking = failureTracking.get(ip) ?? { count: 0, lastFailure: 0 };
  tracking.count++;
  tracking.lastFailure = Date.now();
  failureTracking.set(ip, tracking);
}

/**
 * Clear failure tracking for an IP.
 */
function clearFailures(ip: string): void {
  failureTracking.delete(ip);
}

/**
 * Create a new pairing session.
 */
export function createPairingSession(): PairingSession {
  const code = generateCode();
  const session: PairingSession = {
    id: generateSessionId(),
    code,
    normalizedCode: normalizeCode(code),
    challenge: generateChallenge(),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
  };

  pairingSessions.set(session.id, session);

  logger.warn(
    `[pairing] Session created: ${session.id.slice(0, 8)}... Code: ${session.code} (valid for 5 minutes)`,
  );

  return session;
}

/**
 * Get an existing pairing session.
 */
export function getPairingSession(sessionId: string): PairingSession | null {
  const session = pairingSessions.get(sessionId);
  if (!session) return null;

  // Check expiry
  if (Date.now() > session.expiresAt) {
    pairingSessions.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Verify a pairing attempt with challenge-response.
 */
export async function verifyPairing(
  sessionId: string,
  code: string,
  challengeResponse: string,
  deviceFingerprint: string,
  clientIP: string,
): Promise<PairingResult> {
  // Check backoff
  const backoff = isInBackoff(clientIP);
  if (backoff.inBackoff) {
    return {
      success: false,
      error: "Too many attempts. Please wait before trying again.",
      retryAfter: backoff.retryAfter,
    };
  }

  const session = pairingSessions.get(sessionId);

  if (!session) {
    recordFailure(clientIP);
    return { success: false, error: "Session not found or expired" };
  }

  if (Date.now() > session.expiresAt) {
    pairingSessions.delete(sessionId);
    recordFailure(clientIP);
    return { success: false, error: "Session expired" };
  }

  session.attempts++;

  if (session.attempts > session.maxAttempts) {
    pairingSessions.delete(sessionId);
    recordFailure(clientIP);
    return { success: false, error: "Maximum attempts exceeded" };
  }

  // Timing-safe code comparison
  const normalizedInput = normalizeCode(code);
  const inputBuffer = Buffer.from(normalizedInput, "utf8");
  const expectedBuffer = Buffer.from(session.normalizedCode, "utf8");

  if (
    inputBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(inputBuffer, expectedBuffer)
  ) {
    recordFailure(clientIP);
    return {
      success: false,
      error: "Invalid pairing code",
      attemptsRemaining: session.maxAttempts - session.attempts,
    };
  }

  // Verify challenge-response (HMAC-based device binding)
  const expectedResponse = crypto
    .createHmac("sha256", session.challenge)
    .update(deviceFingerprint)
    .digest("base64url");

  const responseBuffer = Buffer.from(challengeResponse, "utf8");
  const expectedResponseBuffer = Buffer.from(expectedResponse, "utf8");

  if (
    responseBuffer.length !== expectedResponseBuffer.length ||
    !crypto.timingSafeEqual(responseBuffer, expectedResponseBuffer)
  ) {
    recordFailure(clientIP);
    return {
      success: false,
      error: "Challenge verification failed",
      attemptsRemaining: session.maxAttempts - session.attempts,
    };
  }

  // Success - bind device and generate token
  session.deviceFingerprint = deviceFingerprint;

  // Generate long-lived token
  const token = crypto.randomBytes(32).toString("base64url");

  // Store authorized device
  await authorizeDevice(deviceFingerprint, {
    fingerprint: deviceFingerprint,
    name: `Device ${deviceFingerprint.slice(0, 8)}`,
    authorizedAt: Date.now(),
    lastUsed: Date.now(),
    authorizedFromIP: clientIP,
    active: true,
  });

  // Cleanup
  pairingSessions.delete(sessionId);
  clearFailures(clientIP);

  logger.info(
    `[pairing] Device authorized: ${deviceFingerprint.slice(0, 8)}... from ${clientIP}`,
  );

  return { success: true, token };
}

/**
 * Simple pairing verification (backwards compatible, no challenge-response).
 */
export function verifyPairingSimple(
  sessionId: string,
  code: string,
  clientIP: string,
): PairingResult {
  // Check backoff
  const backoff = isInBackoff(clientIP);
  if (backoff.inBackoff) {
    return {
      success: false,
      error: "Too many attempts. Please wait before trying again.",
      retryAfter: backoff.retryAfter,
    };
  }

  const session = pairingSessions.get(sessionId);

  if (!session) {
    recordFailure(clientIP);
    return { success: false, error: "Session not found or expired" };
  }

  if (Date.now() > session.expiresAt) {
    pairingSessions.delete(sessionId);
    recordFailure(clientIP);
    return { success: false, error: "Session expired" };
  }

  session.attempts++;

  if (session.attempts > session.maxAttempts) {
    pairingSessions.delete(sessionId);
    recordFailure(clientIP);
    return { success: false, error: "Maximum attempts exceeded" };
  }

  // Timing-safe code comparison
  const normalizedInput = normalizeCode(code);
  const inputBuffer = Buffer.from(normalizedInput, "utf8");
  const expectedBuffer = Buffer.from(session.normalizedCode, "utf8");

  if (
    inputBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(inputBuffer, expectedBuffer)
  ) {
    recordFailure(clientIP);
    return {
      success: false,
      error: "Invalid pairing code",
      attemptsRemaining: session.maxAttempts - session.attempts,
    };
  }

  // Success - generate token (using configured API token)
  const token = process.env.MILAIDY_API_TOKEN?.trim();
  if (!token) {
    return { success: false, error: "Pairing not configured" };
  }

  // Cleanup
  pairingSessions.delete(sessionId);
  clearFailures(clientIP);

  logger.info(`[pairing] Simple pairing successful from ${clientIP}`);

  return { success: true, token };
}

// ---------- Device Storage ----------

let _authorizedDevices: Map<string, AuthorizedDevice> | null = null;

/**
 * Load authorized devices from disk.
 */
function loadAuthorizedDevices(): Map<string, AuthorizedDevice> {
  if (_authorizedDevices) return _authorizedDevices;

  _authorizedDevices = new Map();

  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const data = fs.readFileSync(DEVICES_FILE, "utf8");
      const parsed = JSON.parse(data) as AuthorizedDevice[];
      for (const device of parsed) {
        _authorizedDevices.set(device.fingerprint, device);
      }
    }
  } catch (err) {
    logger.warn(
      `[pairing] Failed to load authorized devices: ${err instanceof Error ? err.message : err}`,
    );
  }

  return _authorizedDevices;
}

/**
 * Save authorized devices to disk.
 */
function saveAuthorizedDevices(): void {
  const devices = loadAuthorizedDevices();
  const data = Array.from(devices.values());

  try {
    const dir = path.dirname(DEVICES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch (err) {
    logger.error(
      `[pairing] Failed to save authorized devices: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Authorize a device.
 */
export async function authorizeDevice(
  fingerprint: string,
  device: AuthorizedDevice,
): Promise<void> {
  const devices = loadAuthorizedDevices();
  devices.set(fingerprint, device);
  saveAuthorizedDevices();
}

/**
 * Check if a device is authorized.
 */
export function isDeviceAuthorized(fingerprint: string): DeviceVerificationResult {
  const devices = loadAuthorizedDevices();
  const device = devices.get(fingerprint);

  if (!device) {
    return { valid: false, error: "Device not authorized" };
  }

  if (!device.active) {
    return { valid: false, error: "Device deactivated" };
  }

  // Update last used timestamp
  device.lastUsed = Date.now();
  saveAuthorizedDevices();

  return { valid: true, device };
}

/**
 * List all authorized devices.
 */
export function listAuthorizedDevices(): AuthorizedDevice[] {
  const devices = loadAuthorizedDevices();
  return Array.from(devices.values());
}

/**
 * Revoke device authorization.
 */
export function revokeDevice(fingerprint: string): boolean {
  const devices = loadAuthorizedDevices();
  const device = devices.get(fingerprint);

  if (!device) return false;

  device.active = false;
  saveAuthorizedDevices();

  logger.info(`[pairing] Device revoked: ${fingerprint.slice(0, 8)}...`);
  return true;
}

/**
 * Delete device authorization completely.
 */
export function deleteDevice(fingerprint: string): boolean {
  const devices = loadAuthorizedDevices();
  const deleted = devices.delete(fingerprint);

  if (deleted) {
    saveAuthorizedDevices();
    logger.info(`[pairing] Device deleted: ${fingerprint.slice(0, 8)}...`);
  }

  return deleted;
}

// ---------- Cleanup ----------

/**
 * Cleanup expired sessions (call periodically).
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, session] of pairingSessions) {
    if (now > session.expiresAt) {
      pairingSessions.delete(id);
      cleaned++;
    }
  }

  // Also cleanup old failure tracking (older than 1 hour)
  const oldThreshold = now - 60 * 60 * 1000;
  for (const [ip, tracking] of failureTracking) {
    if (tracking.lastFailure < oldThreshold) {
      failureTracking.delete(ip);
    }
  }

  return cleaned;
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000).unref();
