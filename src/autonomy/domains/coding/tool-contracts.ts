/**
 * Tool contracts for the coding domain.
 *
 * Defines 6 tool contracts for software engineering tasks:
 * READ_FILE, WRITE_FILE, RUN_TESTS, SHELL_EXEC, CODE_ANALYSIS, GIT_OPERATION.
 *
 * @module autonomy/domains/coding/tool-contracts
 */

import { z } from "zod";
import type { ToolContract, ToolRegistryInterface } from "../../tools/types.js";

// ---------- READ_FILE ----------

export const ReadFileParams = z
  .object({
    path: z.string().min(1, "Path must not be empty"),
    encoding: z.enum(["utf-8", "binary"]).optional(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();

export type ReadFileParams = z.infer<typeof ReadFileParams>;

export const READ_FILE: ToolContract<ReadFileParams> = {
  name: "READ_FILE",
  description: "Read file contents from the workspace",
  version: "1.0.0",
  riskClass: "read-only",
  paramsSchema: ReadFileParams,
  requiredPermissions: ["fs:read:workspace"],
  sideEffects: [],
  requiresApproval: false,
  timeoutMs: 10_000,
  tags: ["coding"],
};

// ---------- WRITE_FILE ----------

export const WriteFileParams = z
  .object({
    path: z.string().min(1, "Path must not be empty"),
    content: z.string(),
    createDirectories: z.boolean().optional(),
  })
  .strict();

export type WriteFileParams = z.infer<typeof WriteFileParams>;

export const WRITE_FILE: ToolContract<WriteFileParams> = {
  name: "WRITE_FILE",
  description: "Write content to a file in the workspace",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: WriteFileParams,
  requiredPermissions: ["fs:write:workspace"],
  sideEffects: [
    {
      description: "Creates or overwrites a file in the workspace",
      resource: "filesystem",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 10_000,
  tags: ["coding"],
};

// ---------- RUN_TESTS ----------

export const RunTestsParams = z
  .object({
    command: z.string().min(1, "Test command must not be empty"),
    testPattern: z.string().optional(),
    watch: z.boolean().optional(),
    coverage: z.boolean().optional(),
  })
  .strict();

export type RunTestsParams = z.infer<typeof RunTestsParams>;

export const RUN_TESTS: ToolContract<RunTestsParams> = {
  name: "RUN_TESTS",
  description: "Execute test suite in a child process",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: RunTestsParams,
  requiredPermissions: ["process:spawn"],
  sideEffects: [
    {
      description: "Spawns a child process to run tests",
      resource: "process",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 120_000,
  tags: ["coding", "testing"],
};

// ---------- SHELL_EXEC ----------

export const ShellExecParams = z
  .object({
    command: z.string().min(1, "Command must not be empty"),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

export type ShellExecParams = z.infer<typeof ShellExecParams>;

export const SHELL_EXEC: ToolContract<ShellExecParams> = {
  name: "SHELL_EXEC",
  description: "Execute an arbitrary shell command on the host system",
  version: "1.0.0",
  riskClass: "irreversible",
  paramsSchema: ShellExecParams,
  requiredPermissions: ["process:shell"],
  sideEffects: [
    {
      description: "Executes arbitrary shell commands on the host system",
      resource: "process",
      reversible: false,
    },
  ],
  requiresApproval: true,
  timeoutMs: 60_000,
  tags: ["coding"],
};

// ---------- CODE_ANALYSIS ----------

export const CodeAnalysisParams = z
  .object({
    path: z.string().min(1, "Path must not be empty"),
    analysisType: z
      .enum(["lint", "typecheck", "complexity", "dependencies"])
      .optional(),
  })
  .strict();

export type CodeAnalysisParams = z.infer<typeof CodeAnalysisParams>;

export const CODE_ANALYSIS: ToolContract<CodeAnalysisParams> = {
  name: "CODE_ANALYSIS",
  description: "Analyze source code for quality, types, or dependencies",
  version: "1.0.0",
  riskClass: "read-only",
  paramsSchema: CodeAnalysisParams,
  requiredPermissions: ["fs:read:workspace"],
  sideEffects: [],
  requiresApproval: false,
  timeoutMs: 30_000,
  tags: ["coding"],
};

// ---------- GIT_OPERATION ----------

export const GitOperationParams = z
  .object({
    subcommand: z.string().min(1, "Git subcommand must not be empty"),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
  })
  .strict();

export type GitOperationParams = z.infer<typeof GitOperationParams>;

export const GIT_OPERATION: ToolContract<GitOperationParams> = {
  name: "GIT_OPERATION",
  description: "Execute a git operation in the workspace repository",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: GitOperationParams,
  requiredPermissions: ["process:spawn", "fs:write:workspace"],
  sideEffects: [
    {
      description: "Modifies git repository state (commits, branches, etc.)",
      resource: "filesystem",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 30_000,
  tags: ["coding"],
};

// ---------- Registration ----------

/** All coding domain tool contracts. */
export const CODING_TOOL_CONTRACTS: ToolContract[] = [
  READ_FILE,
  WRITE_FILE,
  RUN_TESTS,
  SHELL_EXEC,
  CODE_ANALYSIS,
  GIT_OPERATION,
];

/**
 * Register all coding domain tool contracts into a registry.
 */
export function registerCodingToolContracts(
  registry: ToolRegistryInterface,
): void {
  for (const contract of CODING_TOOL_CONTRACTS) {
    registry.register(contract);
  }
}
