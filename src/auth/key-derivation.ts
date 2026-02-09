/**
 * Machine-specific key derivation for credential encryption.
 *
 * Generates a stable machine identifier that:
 * - Is unique per device
 * - Does not change across reboots
 * - Cannot be easily predicted by attackers
 *
 * Uses multiple entropy sources when available.
 *
 * @module auth/key-derivation
 */

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";

const MILAIDY_HOME =
  process.env.MILAIDY_HOME ?? path.join(os.homedir(), ".milaidy");
const FALLBACK_ID_FILE = path.join(MILAIDY_HOME, ".machine-id");

/** Cached machine ID. */
let _cachedMachineId: string | null = null;

/**
 * Get or generate a stable machine identifier.
 *
 * Priority:
 * 1. node-machine-id (if installed)
 * 2. System machine ID file (/etc/machine-id on Linux, IOPlatformUUID on macOS)
 * 3. Fallback: generated and persisted locally
 */
export function getMachineId(): string {
  if (_cachedMachineId) return _cachedMachineId;

  // Try node-machine-id package first
  try {
    // Dynamic import to handle missing optional dependency
    const nmid = require("node-machine-id");
    _cachedMachineId = nmid.machineIdSync();
    logger.debug("[key-derivation] Using node-machine-id");
    return _cachedMachineId;
  } catch {
    // Package not installed, continue to fallbacks
  }

  // Try platform-specific methods
  const platformId = getPlatformMachineId();
  if (platformId) {
    _cachedMachineId = hashId(platformId);
    logger.debug("[key-derivation] Using platform machine ID");
    return _cachedMachineId;
  }

  // Fallback: generate and persist
  _cachedMachineId = getOrCreateFallbackId();
  logger.debug("[key-derivation] Using fallback machine ID");
  return _cachedMachineId;
}

/**
 * Get platform-specific machine ID.
 */
function getPlatformMachineId(): string | null {
  const platform = os.platform();

  if (platform === "linux") {
    // Try /etc/machine-id first, then /var/lib/dbus/machine-id
    for (const idPath of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      try {
        const id = fs.readFileSync(idPath, "utf8").trim();
        if (id) return id;
      } catch {
        // File doesn't exist or not readable
      }
    }
  }

  if (platform === "darwin") {
    // macOS: use IOPlatformUUID via ioreg
    try {
      const { execSync } = require("node:child_process");
      const output = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID",
        { encoding: "utf8", timeout: 5000 },
      );
      const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match?.[1]) return match[1];
    } catch {
      // Command failed
    }
  }

  if (platform === "win32") {
    // Windows: use MachineGuid from registry
    try {
      const { execSync } = require("node:child_process");
      const output = execSync(
        'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { encoding: "utf8", timeout: 5000 },
      );
      const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      if (match?.[1]) return match[1];
    } catch {
      // Command failed
    }
  }

  return null;
}

/**
 * Get or create a fallback machine ID.
 * Persisted to ~/.milaidy/.machine-id
 */
function getOrCreateFallbackId(): string {
  // Try to read existing
  try {
    const id = fs.readFileSync(FALLBACK_ID_FILE, "utf8").trim();
    if (id && id.length === 64) return id;
  } catch {
    // File doesn't exist
  }

  // Generate new ID
  const id = hashId(
    [
      randomBytes(32).toString("hex"),
      os.hostname(),
      os.platform(),
      os.arch(),
      process.env.USER ?? process.env.USERNAME ?? "",
      Date.now().toString(),
    ].join(":"),
  );

  // Persist for future use
  try {
    fs.mkdirSync(MILAIDY_HOME, { recursive: true, mode: 0o700 });
    fs.writeFileSync(FALLBACK_ID_FILE, id, { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    logger.warn(
      `[key-derivation] Failed to persist fallback machine ID: ${err}`,
    );
  }

  return id;
}

/**
 * Hash an ID to a consistent 64-character hex string.
 */
function hashId(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Reset cached machine ID (for testing).
 */
export function resetMachineId(): void {
  _cachedMachineId = null;
}
