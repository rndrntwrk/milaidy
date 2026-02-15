/**
 * Tool contract types for the Autonomy Kernel.
 *
 * Defines the shape of tool contracts, risk classification,
 * validation results, and proposed tool calls.
 *
 * @module autonomy/tools/types
 */

import type { z } from "zod";
import type { PluginPermission } from "../../plugins/permissions.js";

// ---------- Risk Classification ----------

/**
 * Risk classification for a tool action.
 * - read-only: no side effects (e.g. image analysis)
 * - reversible: side effects that can be undone (e.g. generating media)
 * - irreversible: side effects that cannot be undone (e.g. shell commands)
 */
export type RiskClass = "read-only" | "reversible" | "irreversible";

// ---------- Side Effects ----------

/**
 * Describes a side effect that a tool may produce.
 */
export interface SideEffect {
  /** Human-readable description of the side effect. */
  description: string;
  /** The resource affected (e.g. "filesystem", "network", "process"). */
  resource: string;
  /** Whether this side effect can be reversed. */
  reversible: boolean;
}

// ---------- Tool Contract ----------

/**
 * A tool contract declares the schema, permissions, risk, and metadata
 * for a single tool that the agent can invoke.
 */
export interface ToolContract<TParams = unknown> {
  /** Unique tool name (matches ElizaOS action name, e.g. "RUN_IN_TERMINAL"). */
  name: string;
  /** Human-readable description of what the tool does. */
  description: string;
  /** Semver version of this contract. */
  version: string;
  /** Risk classification for this tool. */
  riskClass: RiskClass;
  /** Zod schema for validating tool parameters. */
  paramsSchema: z.ZodType<TParams>;
  /** Permissions required to execute this tool. */
  requiredPermissions: PluginPermission[];
  /** Known side effects of executing this tool. */
  sideEffects: SideEffect[];
  /** Whether this tool requires explicit user approval before execution. */
  requiresApproval: boolean;
  /** Default execution timeout in milliseconds. */
  timeoutMs: number;
  /** Optional tags for filtering (e.g. "media", "system"). */
  tags?: string[];
}

// ---------- Validation ----------

/**
 * Error codes for tool parameter validation failures.
 */
export type ToolValidationErrorCode =
  | "missing_field"
  | "type_mismatch"
  | "invalid_value"
  | "out_of_range"
  | "unknown_field";

/**
 * A single validation error for a tool parameter.
 */
export interface ToolValidationError {
  /** The field path that caused the error. */
  field: string;
  /** Machine-readable error code. */
  code: ToolValidationErrorCode;
  /** Human-readable error message. */
  message: string;
  /** Severity: error blocks execution, warning is advisory. */
  severity: "error" | "warning";
}

/**
 * Result of validating a proposed tool call against its contract.
 */
export interface ToolValidationResult {
  /** Whether the parameters are valid. */
  valid: boolean;
  /** Validation errors (empty if valid). */
  errors: ToolValidationError[];
  /** Coerced/validated parameters (undefined if invalid). */
  validatedParams: unknown | undefined;
  /** Risk classification from the tool contract. */
  riskClass: RiskClass | undefined;
  /** Whether this tool requires explicit approval. */
  requiresApproval: boolean;
}

// ---------- Proposed Tool Call ----------

/**
 * Source of a tool call request.
 */
export type ToolCallSource = "llm" | "user" | "system" | "plugin";

/**
 * A proposed tool call before validation and execution.
 */
export interface ProposedToolCall {
  /** The tool name to invoke. */
  tool: string;
  /** The parameters to pass. */
  params: Record<string, unknown>;
  /** Where this call originated. */
  source: ToolCallSource;
  /** Unique request identifier for tracing. */
  requestId: string;
}

// ---------- Registry Interface ----------

/**
 * Interface for the tool registry (for dependency injection).
 */
export interface ToolRegistryInterface {
  register(contract: ToolContract): void;
  get(name: string): ToolContract | undefined;
  getAll(): ToolContract[];
  getByRiskClass(riskClass: RiskClass): ToolContract[];
  getByTag(tag: string): ToolContract[];
  has(name: string): boolean;
  unregister(name: string): boolean;
}

// ---------- Schema Validator Interface ----------

/**
 * Interface for the schema validator (for dependency injection).
 */
export interface SchemaValidatorInterface {
  validate(call: ProposedToolCall): ToolValidationResult;
}
