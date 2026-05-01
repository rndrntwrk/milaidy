#!/usr/bin/env node
/**
 * Bridge patch — strip `--tools <list>` from coding-agent-adapters' Claude
 * autonomous preset. The hardcoded list (Bash, Edit, Write, etc.) only
 * matches Claude Code's dev-tier tool registry; on the claude.ai OAuth tier
 * Milady's bot user runs under, those names are not in the registry, so
 * passing them via --tools FILTERS the model down to a tiny read-only set
 * (Read, Grep, Glob, AskUserQuestion, TodoWrite). Skipping the flag entirely
 * lets claude expose its actual default toolset (Monitor, ScheduleWakeup,
 * etc.) and --dangerously-skip-permissions still bypasses approval.
 *
 * Pinned to coding-agent-adapters@0.16.3 — refuses to apply to other
 * versions because the patch context lines may shift.
 *
 * Patches BOTH index.js (ESM) and index.cjs (CJS), and both the project's
 * node_modules copy AND bun's global install cache. Idempotent — re-running
 * after the patch is already applied is a no-op.
 *
 * Remove this script once the upstream package exposes a config knob to
 * disable the --tools cliFlag (or the claude.ai tier ships dev-tier tool
 * names — whichever comes first).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PINNED_VERSION = "0.16.3";
const OLD = `    const allTools = Object.keys(CLAUDE_TOOL_CATEGORIES);\n    cliFlags.push("--tools", allTools.join(","));`;
const NEW = `    // milady patch: --tools <list> filters out tools claude.ai OAuth tier exposes\n    // (Monitor, ScheduleWakeup, etc.) because they are not in CLAUDE_TOOL_CATEGORIES.\n    // Skipping --tools entirely lets claude expose its full default toolset;\n    // --dangerously-skip-permissions still bypasses approval. See\n    // scripts/patch-coding-agent-adapters-tools-flag.mjs for context.\n    void CLAUDE_TOOL_CATEGORIES;`;

function candidatePaths() {
  const candidates = [];
  const home = os.homedir();
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
  );
  // Project's resolved node_modules — symlink chain ends at .bun/.../dist/
  candidates.push(
    path.join(
      repoRoot,
      "node_modules",
      ".bun",
      `coding-agent-adapters@${PINNED_VERSION}`,
      "node_modules",
      "coding-agent-adapters",
      "dist",
    ),
  );
  // Bun's global install cache — Bun resolves imports through this path.
  candidates.push(
    path.join(
      home,
      ".bun",
      "install",
      "cache",
      `coding-agent-adapters@${PINNED_VERSION}@@@1`,
      "dist",
    ),
  );
  return candidates.flatMap((dir) =>
    ["index.js", "index.cjs"].map((f) => path.join(dir, f)),
  );
}

function patchOne(file) {
  if (!fs.existsSync(file)) return { file, status: "missing" };
  const src = fs.readFileSync(file, "utf-8");
  if (src.includes("milady patch: --tools"))
    return { file, status: "already-applied" };
  if (!src.includes(OLD)) {
    return { file, status: "marker-not-found" };
  }
  fs.writeFileSync(file, src.replace(OLD, NEW), "utf-8");
  return { file, status: "patched" };
}

let exitCode = 0;
const results = [];
for (const file of candidatePaths()) {
  const r = patchOne(file);
  results.push(r);
  if (r.status === "marker-not-found") {
    exitCode = 1;
  }
}

const tag = "[patch-coding-agent-adapters-tools-flag]";
for (const r of results) {
  console.log(`${tag} ${r.status}: ${r.file}`);
}

if (exitCode !== 0) {
  console.error(
    `${tag} aborting — context lines have shifted; review the script.`,
  );
}
process.exit(exitCode);
