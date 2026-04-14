#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const suites = {
  lint: [
    {
      label: "Repo Biome",
      command: "bun",
      args: ["run", "verify:lint:workspace"],
    },
    {
      label: "apps/app lint",
      command: "bun",
      args: ["run", "--cwd", "apps/app", "lint"],
    },
    {
      label: "apps/homepage lint",
      command: "bun",
      args: ["run", "--cwd", "apps/homepage", "lint"],
    },
    {
      label: "eliza TypeScript lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:check"],
    },
    {
      label: "eliza Rust lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:rust"],
    },
    {
      label: "eliza Python lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:python"],
    },
  ],
  typecheck: [
    {
      label: "Root workspace typecheck",
      command: "bun",
      args: ["run", "verify:typecheck:workspace"],
    },
    {
      label: "apps/app typecheck",
      command: "bun",
      args: ["run", "--cwd", "apps/app", "typecheck"],
    },
    {
      label: "apps/homepage typecheck",
      command: "bun",
      args: ["run", "--cwd", "apps/homepage", "typecheck"],
    },
    {
      label: "eliza TypeScript typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck"],
    },
    {
      label: "eliza Rust typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck:rust"],
    },
    {
      label: "eliza Python typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck:python"],
    },
  ],
};

function usage() {
  const suiteList = Object.keys(suites).join(", ");
  console.error(`Usage: node scripts/run-repo-checks.mjs <${suiteList}>`);
}

const suiteName = process.argv[2];
if (!suiteName || !(suiteName in suites)) {
  usage();
  process.exit(1);
}

for (const step of suites[suiteName]) {
  console.log(`\n[repo-checks] ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
