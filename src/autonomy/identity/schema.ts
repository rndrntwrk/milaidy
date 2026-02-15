/**
 * Extended identity schema for the Autonomy Kernel.
 *
 * ElizaOS provides a minimal IdentityConfig (name, theme, emoji, avatar).
 * The Autonomy Kernel extends this with core values, communication style,
 * behavioral boundaries, and integrity verification.
 *
 * @module autonomy/identity/schema
 */

import { createHash } from "node:crypto";
import type { IdentityConfig } from "@elizaos/core";

/**
 * Communication style constraints for the agent.
 */
export interface CommunicationStyle {
  /** Overall tone of communication. */
  tone: "formal" | "casual" | "technical" | "empathetic";
  /** How much detail to provide. */
  verbosity: "concise" | "balanced" | "detailed";
  /** Free-text persona voice description. */
  personaVoice: string;
}

/**
 * Extended identity configuration for the Autonomy Kernel.
 * Superset of ElizaOS IdentityConfig.
 */
export interface AutonomyIdentityConfig extends IdentityConfig {
  /** Core values that govern agent behavior (immutable after initialization). */
  coreValues: string[];
  /** Communication style constraints. */
  communicationStyle: CommunicationStyle;
  /** Behavioral boundaries the agent must never cross. */
  hardBoundaries: string[];
  /** Soft preferences that can be adjusted with high-trust user requests. */
  softPreferences: Record<string, unknown>;
  /** Cryptographic hash of the identity at initialization time. */
  identityHash?: string;
  /** Version counter — incremented on any sanctioned identity change. */
  identityVersion: number;
}

/**
 * Compute a SHA-256 hash of the immutable identity fields.
 * Used for integrity verification — detects unauthorized identity changes.
 */
export function computeIdentityHash(identity: AutonomyIdentityConfig): string {
  const immutableFields = {
    name: identity.name,
    coreValues: [...identity.coreValues].sort(),
    hardBoundaries: [...identity.hardBoundaries].sort(),
    communicationStyle: identity.communicationStyle,
  };
  return createHash("sha256")
    .update(JSON.stringify(immutableFields))
    .digest("hex");
}

/**
 * Verify that an identity's hash matches its current immutable fields.
 * Returns false if the identity has been tampered with.
 */
export function verifyIdentityIntegrity(identity: AutonomyIdentityConfig): boolean {
  if (!identity.identityHash) return true; // No hash stored yet
  return computeIdentityHash(identity) === identity.identityHash;
}

/**
 * Create a default autonomy identity from a base ElizaOS IdentityConfig.
 */
export function createDefaultAutonomyIdentity(
  base?: IdentityConfig,
): AutonomyIdentityConfig {
  const identity: AutonomyIdentityConfig = {
    ...base,
    coreValues: ["helpfulness", "honesty", "safety"],
    communicationStyle: {
      tone: "casual",
      verbosity: "balanced",
      personaVoice: "",
    },
    hardBoundaries: [],
    softPreferences: {},
    identityVersion: 1,
  };
  identity.identityHash = computeIdentityHash(identity);
  return identity;
}

/**
 * Validate an autonomy identity config.
 */
export function validateAutonomyIdentity(
  identity: AutonomyIdentityConfig,
): Array<{ field: string; message: string }> {
  const issues: Array<{ field: string; message: string }> = [];

  if (!identity.coreValues || identity.coreValues.length === 0) {
    issues.push({ field: "coreValues", message: "Must have at least one core value" });
  }

  if (!identity.communicationStyle) {
    issues.push({ field: "communicationStyle", message: "Communication style is required" });
  } else {
    const validTones = ["formal", "casual", "technical", "empathetic"];
    if (!validTones.includes(identity.communicationStyle.tone)) {
      issues.push({ field: "communicationStyle.tone", message: `Must be one of: ${validTones.join(", ")}` });
    }
    const validVerbosity = ["concise", "balanced", "detailed"];
    if (!validVerbosity.includes(identity.communicationStyle.verbosity)) {
      issues.push({ field: "communicationStyle.verbosity", message: `Must be one of: ${validVerbosity.join(", ")}` });
    }
  }

  if (identity.identityVersion < 1) {
    issues.push({ field: "identityVersion", message: "Must be at least 1" });
  }

  return issues;
}
