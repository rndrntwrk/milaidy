#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const appDir = path.join(repoRoot, "apps", "app");
const isAliceFullGatedBuild = process.env.ALICE_RUNTIME_PROFILE === "full-gated";

if (isAliceFullGatedBuild && (process.env.ELIZA_SKIP_PLUGINS ?? "").trim()) {
  throw new Error("ALICE_PRODUCTION_BUILD_STUB_FORBIDDEN");
}

function run(command, args, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

if (!isLocalElizaDisabled()) {
  await run(process.execPath, [
    "scripts/run-eliza-app-core-script.mjs",
    "build-capacitor-app.mjs",
  ]);
} else {
  if (!isAliceFullGatedBuild) {
    await run(process.execPath, [
      "scripts/ensure-elizaos-optional-app-stubs.mjs",
    ]);
  }
  await run(process.execPath, ["scripts/patch-elizaos-package-styles.mjs"]);
  if (!isAliceFullGatedBuild) {
    await run(process.execPath, [
      "scripts/patch-elizaos-plugin-browser-bridge-package.mjs",
    ]);
  }
  await run(process.execPath, [
    "scripts/patch-elizaos-app-core-native-browser-package.mjs",
  ]);
  await run(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build"],
    appDir,
  );
}
