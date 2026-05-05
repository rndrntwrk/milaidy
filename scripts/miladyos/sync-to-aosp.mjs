#!/usr/bin/env node
// Thin wrapper — re-execs the upstream implementation in @elizaos/app-core
// (resolved from the local ./eliza source checkout when present, falling
// back to the published @elizaos/app-core in node_modules) so its
// `process.argv[1] === import.meta.url` entry-point gate fires correctly.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElizaAppCoreScript } from "../lib/resolve-eliza-app-core-script.mjs";

const __SCRIPT__ = path.basename(fileURLToPath(import.meta.url));
const upstream = resolveElizaAppCoreScript(`aosp/${__SCRIPT__}`);

const result = spawnSync(
  process.execPath,
  [upstream, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
