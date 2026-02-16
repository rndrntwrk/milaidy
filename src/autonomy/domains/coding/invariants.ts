/**
 * Coding domain invariants — safety checks run after tool execution.
 *
 * 6 invariants covering shell safety, output bounds, path safety,
 * test output validity, git safety, and secret detection.
 *
 * @module autonomy/domains/coding/invariants
 */

import type {
  Invariant,
  InvariantCheckerInterface,
} from "../../verification/invariants/types.js";

// ---------- Helpers ----------

/** Stringify the pipeline result output for pattern matching. */
function resultToString(result: unknown): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

// ---------- ANSI escape sequence detection ----------

/** ANSI escape sequence pattern (CSI, OSC, and raw ESC codes). */
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][AB0-2]/;

/**
 * Detects ANSI escape sequences in tool output that could indicate
 * terminal injection attacks.
 */
export const noShellEscapeInvariant: Invariant = {
  id: "invariant:coding:no-shell-escape",
  description: "Tool output must not contain ANSI escape sequences",
  check: async (ctx) => {
    const output = resultToString(ctx.pipelineResult.result);
    return !ANSI_ESCAPE_RE.test(output);
  },
  severity: "warning",
};

// ---------- Output size bound ----------

const MAX_OUTPUT_BYTES = 1_048_576; // 1 MB

/**
 * Rejects tool output larger than 1 MB to prevent memory exhaustion
 * and log flooding.
 */
export const outputSizeBoundInvariant: Invariant = {
  id: "invariant:coding:output-size-bound",
  description: "Tool output must not exceed 1 MB",
  check: async (ctx) => {
    const output = resultToString(ctx.pipelineResult.result);
    return output.length <= MAX_OUTPUT_BYTES;
  },
  severity: "warning",
};

// ---------- Path safety ----------

const FORBIDDEN_PATHS = [
  "/etc",
  "/sys",
  "/proc",
  "/dev",
  "/boot",
  "/sbin",
  "/usr/sbin",
];

const FORBIDDEN_PATH_RE = new RegExp(
  `(?:^|\\s|["'/\\\\])(?:${FORBIDDEN_PATHS.map((p) => p.replace(/\//g, "\\/")).join("|")})(?:[/"'\\\\]|\\s|$)`,
);

/**
 * Blocks operations that reference forbidden system paths.
 * Checks the pipeline result for evidence of writes to /etc, /sys, /proc, etc.
 */
export const pathSafetyInvariant: Invariant = {
  id: "invariant:coding:path-safety",
  description:
    "Operations must not target forbidden system paths (/etc, /sys, /proc, etc.)",
  check: async (ctx) => {
    // Only relevant for write-capable tools
    const writableTools = ["WRITE_FILE", "SHELL_EXEC", "GIT_OPERATION"];
    if (!writableTools.includes(ctx.toolName)) return true;

    const output = resultToString(ctx.pipelineResult.result);
    return !FORBIDDEN_PATH_RE.test(output);
  },
  severity: "critical",
};

// ---------- Test output validity ----------

/**
 * Verifies that test execution produces result data (not an empty or
 * undefined output) so that results can be parsed downstream.
 */
export const testOutputValidInvariant: Invariant = {
  id: "invariant:coding:test-output-valid",
  description:
    "Test execution must produce non-empty output for result parsing",
  check: async (ctx) => {
    if (ctx.toolName !== "RUN_TESTS") return true;
    if (!ctx.executionSucceeded) return true; // Only check successful runs

    const output = resultToString(ctx.pipelineResult.result);
    return output.length > 0;
  },
  severity: "warning",
};

// ---------- Git safety ----------

const FORCE_PUSH_MAIN_RE =
  /push\s+.*--force(?:-with-lease)?\s+.*(?:main|master)|push\s+.*(?:main|master)\s+.*--force/i;

/**
 * Blocks force-push operations targeting main/master branches.
 */
export const gitSafetyInvariant: Invariant = {
  id: "invariant:coding:git-safety",
  description: "Must not force-push to main or master branches",
  check: async (ctx) => {
    if (ctx.toolName !== "GIT_OPERATION" && ctx.toolName !== "SHELL_EXEC")
      return true;

    const output = resultToString(ctx.pipelineResult.result);
    return !FORCE_PUSH_MAIN_RE.test(output);
  },
  severity: "critical",
};

// ---------- No secrets in output ----------

/** Patterns that match common API key and token formats. */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/i,
  /(?:secret|token|password|passwd)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i,
  /sk-[A-Za-z0-9]{32,}/, // OpenAI-style keys
  /ghp_[A-Za-z0-9]{36}/, // GitHub personal access tokens
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
];

/**
 * Catches API keys, tokens, and private keys in tool output.
 */
export const noSecretsInOutputInvariant: Invariant = {
  id: "invariant:coding:no-secrets-in-output",
  description: "Tool output must not contain API keys, tokens, or secrets",
  check: async (ctx) => {
    const output = resultToString(ctx.pipelineResult.result);
    return !SECRET_PATTERNS.some((re) => re.test(output));
  },
  severity: "warning",
};

// ---------- Registration ----------

/** All coding domain invariants. */
export const CODING_INVARIANTS: Invariant[] = [
  noShellEscapeInvariant,
  outputSizeBoundInvariant,
  pathSafetyInvariant,
  testOutputValidInvariant,
  gitSafetyInvariant,
  noSecretsInOutputInvariant,
];

/**
 * Register all coding domain invariants into an invariant checker.
 */
export function registerCodingInvariants(
  checker: InvariantCheckerInterface,
): void {
  checker.registerMany(CODING_INVARIANTS);
}
