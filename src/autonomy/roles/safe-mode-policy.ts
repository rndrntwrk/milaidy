/**
 * Safe-mode tool restriction policy.
 *
 * Defines which tool risk classes are allowed while safe mode is active.
 *
 * @module autonomy/roles/safe-mode-policy
 */

import type { RiskClass, ToolCallSource } from "../tools/types.js";

export type SafeModeToolClassDecision = "allow" | "deny";

export interface SafeModeToolClassRestriction {
  decision: SafeModeToolClassDecision;
  reason: string;
}

export const DEFAULT_SAFE_MODE_TOOL_CLASS_RESTRICTIONS: Record<
  RiskClass,
  SafeModeToolClassRestriction
> = {
  "read-only": {
    decision: "allow",
    reason: "read-only operations are allowed while safe mode is active",
  },
  reversible: {
    decision: "deny",
    reason:
      "reversible operations are blocked in safe mode to prevent additional side effects",
  },
  irreversible: {
    decision: "deny",
    reason:
      "irreversible operations are blocked in safe mode and require explicit recovery exit first",
  },
};

export interface SafeModeToolRestrictionInput {
  safeModeActive: boolean;
  toolName: string;
  riskClass: RiskClass | undefined;
  source: ToolCallSource;
  restrictions?: Record<RiskClass, SafeModeToolClassRestriction>;
}

export interface SafeModeToolRestrictionDecision {
  inSafeMode: boolean;
  allowed: boolean;
  reason: string;
  riskClass: RiskClass | "unknown";
  toolName: string;
  source: ToolCallSource;
}

export function evaluateSafeModeToolRestriction(
  input: SafeModeToolRestrictionInput,
): SafeModeToolRestrictionDecision {
  const riskClass = input.riskClass ?? "unknown";

  if (!input.safeModeActive) {
    return {
      inSafeMode: false,
      allowed: true,
      reason: "safe mode is not active",
      riskClass,
      toolName: input.toolName,
      source: input.source,
    };
  }

  if (!input.riskClass) {
    return {
      inSafeMode: true,
      allowed: false,
      reason:
        "Safe mode blocks tool execution when risk classification is unknown.",
      riskClass,
      toolName: input.toolName,
      source: input.source,
    };
  }

  const restrictions =
    input.restrictions ?? DEFAULT_SAFE_MODE_TOOL_CLASS_RESTRICTIONS;
  const restriction = restrictions[input.riskClass];

  if (restriction.decision === "allow") {
    return {
      inSafeMode: true,
      allowed: true,
      reason: restriction.reason,
      riskClass: input.riskClass,
      toolName: input.toolName,
      source: input.source,
    };
  }

  return {
    inSafeMode: true,
    allowed: false,
    reason: `Safe mode blocks ${input.riskClass} tools (${input.toolName}): ${restriction.reason}.`,
    riskClass: input.riskClass,
    toolName: input.toolName,
    source: input.source,
  };
}
