#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElizaAppCoreScript } from "./lib/resolve-eliza-app-core-script.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const [scriptName, ...scriptArgs] = process.argv.slice(2);
const localElizaRoot = path.join(repoRoot, "eliza");

function resolveBunExecutable() {
  if (process.versions?.bun) {
    return process.execPath;
  }

  const bunHome =
    process.env.BUN_INSTALL?.trim() ||
    process.env.HOME?.trim() ||
    process.env.USERPROFILE?.trim() ||
    null;

  return bunHome
    ? path.join(
        bunHome,
        ".bun",
        "bin",
        process.platform === "win32" ? "bun.exe" : "bun",
      )
    : "bun";
}

if (!scriptName) {
  console.error(
    "usage: node scripts/run-eliza-app-core-script.mjs <script-name> [...args]",
  );
  process.exit(1);
}

const scriptPath = resolveElizaAppCoreScript(scriptName, { repoRoot });
const useBun = path.resolve(scriptPath).startsWith(
  `${path.resolve(localElizaRoot)}${path.sep}`,
);
const child = spawn(useBun ? resolveBunExecutable() : process.execPath, [scriptPath, ...scriptArgs], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(
    `[milady] Failed to start ${scriptName}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[milady] ${scriptName} exited due to signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
