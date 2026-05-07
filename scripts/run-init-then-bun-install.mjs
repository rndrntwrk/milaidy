#!/usr/bin/env node
/**
 * First-line installer.
 *
 * Alice defaults to repo-local elizaOS source. Use `bun run eliza:packages`
 * when you explicitly want to rewrite the workspace to published packages.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const rootDir = resolve(__dirname, "..");

const bunArgs = ["install", ...process.argv.slice(2)];
const result = spawnSync("bun", bunArgs, {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    MILADY_ELIZA_SOURCE: process.env.MILADY_ELIZA_SOURCE || "local",
  },
  shell: false,
});

process.exit(result.status ?? 1);
