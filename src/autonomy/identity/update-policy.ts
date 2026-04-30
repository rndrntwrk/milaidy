/**
 * Identity update governance policy.
 *
 * Defines sanctioned identity mutation paths and approval requirements.
 *
 * @module autonomy/identity/update-policy
 */

import type { AutonomyIdentityConfig } from "./schema.js";

export type IdentityUpdateSource = "system" | "api" | "cli";
export type IdentityUpdateRisk = "low" | "high";

export interface IdentityUpdateContext {
  actor?: string;
  source?: IdentityUpdateSource;
  approvedBy?: string;
  reason?: string;
}

export interface IdentityUpdatePolicyDecision {
  allowed: boolean;
  source: IdentityUpdateSource;
  actor: string;
  approvedBy?: string;
  reason?: string;
  risk: IdentityUpdateRisk;
  approvalRequired: boolean;
  changedFields: string[];
  violations: string[];
}

const DIRECT_MUTATION_BLOCKLIST = new Set(["identityVersion", "identityHash"]);
const APPROVAL_REQUIRED_FIELDS = new Set(["name", "coreValues", "hardBoundaries"]);
const NON_PERSON_ACTORS = new Set([
  "",
  "anonymous",
  "unknown",
  "bypass",
  "non-autonomy",
]);

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeActor(
  input: string | undefined,
  source: IdentityUpdateSource,
): string {
  const actor = normalizeOptionalText(input);
  if (actor) return actor;
  return source === "system" ? "system" : "unknown";
}

function valuesDiffer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * Return normalized changed-field paths for an identity update payload.
 */
export function identityChangedFields(
  current: AutonomyIdentityConfig,
  update: Partial<AutonomyIdentityConfig>,
): string[] {
  const changed = new Set<string>();
  const updateRecord = update as Record<string, unknown>;
  const currentRecord = current as Record<string, unknown>;

  for (const key of Object.keys(updateRecord)) {
    const nextValue = updateRecord[key];

    if (key === "communicationStyle") {
      const nextStyle =
        nextValue && typeof nextValue === "object"
          ? (nextValue as Record<string, unknown>)
          : {};
      const currentStyle =
        current.communicationStyle && typeof current.communicationStyle === "object"
          ? (current.communicationStyle as Record<string, unknown>)
          : {};
      for (const styleKey of Object.keys(nextStyle)) {
        if (valuesDiffer(nextStyle[styleKey], currentStyle[styleKey])) {
          changed.add(`communicationStyle.${styleKey}`);
        }
      }
      continue;
    }

    if (key === "softPreferences") {
      const nextPrefs =
        nextValue && typeof nextValue === "object"
          ? (nextValue as Record<string, unknown>)
          : {};
      const currentPrefs =
        current.softPreferences && typeof current.softPreferences === "object"
          ? (current.softPreferences as Record<string, unknown>)
          : {};
      for (const prefKey of Object.keys(nextPrefs)) {
        if (valuesDiffer(nextPrefs[prefKey], currentPrefs[prefKey])) {
          changed.add(`softPreferences.${prefKey}`);
        }
      }
      continue;
    }

    if (valuesDiffer(nextValue, currentRecord[key])) {
      changed.add(key);
    }
  }

  return Array.from(changed).sort();
}

/**
 * Evaluate sanctioned-update policy and approval requirements for identity mutation.
 */
export function evaluateIdentityUpdatePolicy(
  current: AutonomyIdentityConfig,
  update: Partial<AutonomyIdentityConfig>,
  context: IdentityUpdateContext = {},
): IdentityUpdatePolicyDecision {
  const source = context.source ?? "system";
  const actor = normalizeActor(context.actor, source);
  const approvedBy = normalizeOptionalText(context.approvedBy);
  const reason = normalizeOptionalText(context.reason);
  const changedFields = identityChangedFields(current, update);
  const violations: string[] = [];

  for (const blockedField of DIRECT_MUTATION_BLOCKLIST) {
    if (Object.prototype.hasOwnProperty.call(update, blockedField)) {
      violations.push(
        `${blockedField} is kernel-managed and cannot be set directly`,
      );
    }
  }

  if (changedFields.length === 0) {
    violations.push("at least one identity field must change");
  }

  if (source !== "system" && NON_PERSON_ACTORS.has(actor)) {
    violations.push(
      "a named actor is required for API/CLI identity updates",
    );
  }

  const highRisk = changedFields.some((field) =>
    APPROVAL_REQUIRED_FIELDS.has(field),
  );
  const approvalRequired = source !== "system" && highRisk;

  if (approvalRequired) {
    if (!approvedBy || NON_PERSON_ACTORS.has(approvedBy)) {
      violations.push(
        "approvedBy is required when modifying name/coreValues/hardBoundaries",
      );
    } else if (approvedBy === actor) {
      violations.push("approvedBy must be different from actor");
    }

    if (!reason) {
      violations.push(
        "reason is required when modifying name/coreValues/hardBoundaries",
      );
    }
  }

  return {
    allowed: violations.length === 0,
    source,
    actor,
    ...(approvedBy ? { approvedBy } : {}),
    ...(reason ? { reason } : {}),
    risk: highRisk ? "high" : "low",
    approvalRequired,
    changedFields,
    violations,
  };
}
