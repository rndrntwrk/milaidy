#!/usr/bin/env node
// Thin wrapper — re-execs the upstream implementation at
// eliza/packages/app-core/scripts/aosp/sim.mjs so its `process.argv[1]
// === import.meta.url` entry-point gate fires correctly.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const upstream = path.resolve(
  here,
  "..",
  "..",
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "aosp",
  "sim.mjs",
);

const result = spawnSync(process.execPath, [upstream, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
