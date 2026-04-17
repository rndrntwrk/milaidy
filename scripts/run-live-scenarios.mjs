#!/usr/bin/env node
/**
 * Milady-side wrapper around the upstream lifeops scenario runner.
 *
 * Responsibilities:
 *   1. Ensure SKIP_REASON gating: when scenarios are filtered/skipped via
 *      SCENARIO_SKIP, an explicit SKIP_REASON env var must be set or this
 *      wrapper exits non-zero.
 *   2. Forward to the upstream runner located in the eliza submodule.
 *   3. Fail loudly if the upstream runner reports `failedCount > 0`.
 *
 * Required env:
 *   - MILADY_LIVE_TEST=1 and ELIZA_LIVE_TEST=1 (asserted)
 *   - At least one provider key (OPENAI_API_KEY, OPENROUTER_API_KEY, etc.) —
 *     the upstream runner will throw if none are present.
 *
 * Optional env:
 *   - LIFEOPS_JUDGE_THRESHOLD: minimum LLM judge score (default 0.8). Forwarded
 *     to the upstream runner via LIFEOPS_LIVE_JUDGE_MIN_SCORE.
 *   - SCENARIO_FILTER: comma-separated scenario IDs (forwards as --scenario).
 *   - SKIP_REASON: required when any scenario is intentionally skipped.
 *   - REPORT_PATH: where to write the JSON report (default: artifacts/lifeops-scenario-report.json).
 *
 * Usage:
 *   node scripts/run-live-scenarios.mjs [--list] [--scenario id1,id2] [--report path]
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const UPSTREAM_RUNNER = path.join(
  REPO_ROOT,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "lifeops-scenario-runner.ts",
);

if (!existsSync(UPSTREAM_RUNNER)) {
  console.error(
    `[run-live-scenarios] upstream runner missing at ${UPSTREAM_RUNNER}. ` +
      `Did you run 'bun run setup:upstreams' or initialize the eliza submodule?`,
  );
  process.exit(2);
}

if (
  process.env.MILADY_LIVE_TEST !== "1" &&
  process.env.ELIZA_LIVE_TEST !== "1"
) {
  console.error(
    "[run-live-scenarios] refusing to run: MILADY_LIVE_TEST=1 (or ELIZA_LIVE_TEST=1) is required.",
  );
  process.exit(2);
}

const skipFilter = (process.env.SCENARIO_SKIP ?? "").trim();
const skipReason = (process.env.SKIP_REASON ?? "").trim();
if (skipFilter.length > 0 && skipReason.length === 0) {
  console.error(
    `[run-live-scenarios] SCENARIO_SKIP="${skipFilter}" requires SKIP_REASON to document why. ` +
      `Set SKIP_REASON="<concrete reason>" to acknowledge.`,
  );
  process.exit(2);
}
if (skipReason.length > 0) {
  console.warn(
    `[run-live-scenarios] SKIP_REASON acknowledged: "${skipReason}" (filter="${skipFilter}")`,
  );
}

const reportPath =
  process.env.REPORT_PATH ??
  path.join(REPO_ROOT, "artifacts", "lifeops-scenario-report.json");
mkdirSync(path.dirname(reportPath), { recursive: true });

const args = [
  "run",
  UPSTREAM_RUNNER,
  "--report",
  reportPath,
  ...process.argv.slice(2),
];
const filter = (process.env.SCENARIO_FILTER ?? "").trim();
if (filter.length > 0) {
  args.push("--scenario", filter);
}

const judgeThreshold = process.env.LIFEOPS_JUDGE_THRESHOLD ?? "0.8";
const env = {
  ...process.env,
  MILADY_LIVE_TEST: "1",
  ELIZA_LIVE_TEST: "1",
  LIFEOPS_LIVE_JUDGE_MIN_SCORE: judgeThreshold,
};

console.log(
  `[run-live-scenarios] threshold=${judgeThreshold} report=${reportPath} args=${args.slice(2).join(" ")}`,
);

const child = spawn("bun", args, { cwd: REPO_ROOT, env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[run-live-scenarios] killed by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
