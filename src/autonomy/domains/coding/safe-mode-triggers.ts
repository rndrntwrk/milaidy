/**
 * Coding domain safe-mode triggers — conditions that trigger safe mode
 * when coding operations become unsafe.
 *
 * @module autonomy/domains/coding/safe-mode-triggers
 */

import type { DomainSafeModeTrigger } from "../types.js";

/** Trigger when a shell command exceeds the configured timeout. */
export const shellTimeoutTrigger: DomainSafeModeTrigger = {
  id: "coding:trigger:shell-timeout",
  description: "Shell command exceeded maximum timeout",
  check: async (ctx) => {
    const shellTools = ["SHELL_EXEC", "RUN_TESTS"];
    if (!shellTools.includes(ctx.toolName)) return false;
    // Default timeout threshold: 120 seconds
    return ctx.durationMs > 120_000;
  },
  severity: "critical",
};

/** Trigger when 3 or more consecutive tool errors occur. */
export const repeatedTestFailureTrigger: DomainSafeModeTrigger = {
  id: "coding:trigger:repeated-test-failure",
  description: "3+ consecutive test or tool failures detected",
  check: async (ctx) => {
    return ctx.consecutiveErrors >= 3;
  },
  severity: "warning",
};

/** Trigger when a tool attempts to write to a forbidden path. */
export const pathViolationTrigger: DomainSafeModeTrigger = {
  id: "coding:trigger:path-violation",
  description: "Attempted write to forbidden system path",
  check: async (ctx) => {
    const writableTools = ["WRITE_FILE", "SHELL_EXEC", "GIT_OPERATION"];
    if (!writableTools.includes(ctx.toolName)) return false;

    const output = typeof ctx.result === "string" ? ctx.result : "";
    const forbidden = ["/etc", "/sys", "/proc", "/dev", "/boot", "/sbin"];
    return forbidden.some((p) => output.includes(p));
  },
  severity: "critical",
};

/** All coding domain safe-mode triggers. */
export const CODING_SAFE_MODE_TRIGGERS: DomainSafeModeTrigger[] = [
  shellTimeoutTrigger,
  repeatedTestFailureTrigger,
  pathViolationTrigger,
];
