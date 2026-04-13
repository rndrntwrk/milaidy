#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CAPACITOR_PLUGIN_NAMES,
  NATIVE_PLUGINS_ROOT,
} from "./capacitor-plugin-names.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _appDir = path.resolve(__dirname, "..");
const pluginsDir = NATIVE_PLUGINS_ROOT;
const pluginNames = CAPACITOR_PLUGIN_NAMES;

// Skip plugin builds if explicitly disabled or if Capacitor core is missing
const skipPlugins =
  process.env.SKIP_NATIVE_PLUGINS === "1" || process.env.CI === "true";
const activeChildren = new Set();

function terminateActiveChildren() {
  for (const child of activeChildren) {
    if (!child || child.exitCode !== null || child.killed) {
      continue;
    }
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      continue;
    }
    child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  terminateActiveChildren();
  process.exit(130);
});
process.on("SIGTERM", () => {
  terminateActiveChildren();
  process.exit(143);
});

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    activeChildren.add(child);
    let settled = false;
    function finish(err) {
      if (settled) {
        return;
      }
      settled = true;
      activeChildren.delete(child);
      if (err) {
        reject(err);
        return;
      }
      resolve();
    }
    child.on("error", (err) => finish(err));
    child.on("exit", (code, signal) => {
      if (signal) {
        finish(new Error(`${command} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        finish(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      finish();
    });
  });
}

const npmCommand = "bun";
const npmArgs = ["run", "build"];
const requestedConcurrency = Number.parseInt(
  process.env.NATIVE_PLUGIN_BUILD_CONCURRENCY ?? "",
  10,
);
const maxConcurrency = Number.isFinite(requestedConcurrency)
  ? Math.max(1, requestedConcurrency)
  : process.platform === "win32"
    ? 1
    : pluginNames.length;

if (skipPlugins) {
  console.log(
    "[plugins] skipping native plugin builds (CI or explicitly disabled)",
  );
  process.exit(0);
}

async function buildPlugin(name) {
  console.log(`[plugin:${name}] building...`);
  await run(npmCommand, npmArgs, path.join(pluginsDir, name));
  console.log(`[plugin:${name}] done`);
}

let nextPluginIndex = 0;
const workers = Array.from(
  { length: Math.min(maxConcurrency, pluginNames.length) },
  async () => {
    while (nextPluginIndex < pluginNames.length) {
      const name = pluginNames[nextPluginIndex++];
      await buildPlugin(name);
    }
  },
);

try {
  await Promise.all(workers);
} catch (error) {
  terminateActiveChildren();
  throw error;
}
