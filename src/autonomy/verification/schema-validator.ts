/**
 * Schema Validator — validates proposed tool calls against their contracts.
 *
 * Uses Zod safeParse to validate parameters and maps ZodIssues
 * to typed ToolValidationError objects.
 *
 * @module autonomy/verification/schema-validator
 */

import type { z } from "zod";
import type {
  ProposedToolCall,
  SchemaValidatorInterface,
  ToolRegistryInterface,
  ToolValidationError,
  ToolValidationErrorCode,
  ToolValidationResult,
} from "../tools/types.js";

/**
 * Map Zod issue codes to our ToolValidationErrorCode.
 */
function mapZodCode(zodCode: string): ToolValidationErrorCode {
  switch (zodCode) {
    case "invalid_type":
      return "type_mismatch";
    case "too_small":
    case "too_big":
      return "out_of_range";
    case "unrecognized_keys":
      return "unknown_field";
    case "invalid_enum_value":
    case "invalid_literal":
    case "custom":
      return "invalid_value";
    default:
      return "invalid_value";
  }
}

/**
 * Convert a Zod issue path to a dotted field string.
 */
function issuePath(path: PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path.map(String).join(".");
}

/**
 * Detect if a Zod issue represents a missing/required field.
 * Zod 4 reports missing required fields as invalid_type with
 * "received undefined" in the message (no separate `received` property).
 */
function isMissingField(issue: z.core.$ZodIssue): boolean {
  if (issue.code !== "invalid_type") return false;
  // Zod 4: check the `received` property if present
  if ("received" in issue) {
    return (issue as Record<string, unknown>).received === "undefined";
  }
  // Zod 4 fallback: check the message for "received undefined"
  return issue.message.includes("received undefined");
}

/**
 * Schema validator that validates ProposedToolCall params against
 * the Zod schema in the tool's contract.
 */
export class SchemaValidator implements SchemaValidatorInterface {
  constructor(private registry: ToolRegistryInterface) {}

  /**
   * Validate a proposed tool call against its registered contract.
   *
   * - If the tool is not registered, returns an error result.
   * - Runs Zod safeParse and maps issues to ToolValidationError[].
   * - On success, returns the coerced/validated params.
   */
  validate(call: ProposedToolCall): ToolValidationResult {
    const contract = this.registry.get(call.tool);

    if (!contract) {
      return {
        valid: false,
        errors: [
          {
            field: "(tool)",
            code: "invalid_value",
            message: `Unknown tool: "${call.tool}"`,
            severity: "error",
          },
        ],
        validatedParams: undefined,
        riskClass: undefined,
        requiresApproval: false,
      };
    }

    const result = contract.paramsSchema.safeParse(call.params);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        validatedParams: result.data,
        riskClass: contract.riskClass,
        requiresApproval: contract.requiresApproval,
      };
    }

    const errors: ToolValidationError[] = result.error.issues.map(
      (issue: z.core.$ZodIssue) => ({
        field: issuePath(issue.path),
        code: isMissingField(issue) ? "missing_field" : mapZodCode(issue.code),
        message: issue.message,
        severity: "error" as const,
      }),
    );

    return {
      valid: false,
      errors,
      validatedParams: undefined,
      riskClass: contract.riskClass,
      requiresApproval: contract.requiresApproval,
    };
  }
}
