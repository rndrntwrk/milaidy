import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const bunCmd = process.env.npm_execpath || process.env.BUN || "bun";

function isRealNodeExecutable(candidate) {
  if (!candidate || !fs.existsSync(candidate)) {
    return false;
  }
  const stat = fs.statSync(candidate);
  if (!stat.isFile()) {
    return false;
  }
  const normalized = candidate.replace(/\\/g, "/");
  return !/\/bun-node-[^/]+\/node$/.test(normalized);
}

function resolveNodeCmd() {
  if (isRealNodeExecutable(process.env.npm_node_execpath)) {
    return process.env.npm_node_execpath;
  }
  for (const candidate of [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ]) {
    if (isRealNodeExecutable(candidate)) {
      return candidate;
    }
  }
  if (isRealNodeExecutable(process.execPath)) {
    return process.execPath;
  }
  return "node";
}

const nodeCmd = resolveNodeCmd();

function buildEnv(cwd) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("npm_") || key === "INIT_CWD") {
      delete env[key];
    }
  }
  env.NODE_NO_WARNINGS = env.NODE_NO_WARNINGS || "1";
  env.MILADY_LIVE_TEST = "0";
  env.ELIZA_LIVE_TEST = "0";
  env.PWD = path.resolve(cwd);
  return env;
}

function runStep(label, command, args, cwd = repoRoot) {
  execFileSync(command, args, {
    cwd,
    env: buildEnv(cwd),
    stdio: "inherit",
  });
}

runStep("app-unit", nodeCmd, ["./node_modules/.bin/vitest", "run"], path.join(repoRoot, "apps", "app"));
runStep("unit", bunCmd, ["x", "vitest", "run", "--config", "vitest.config.ts"]);
runStep("e2e", bunCmd, ["run", "test:e2e"]);
runStep("startup-e2e", bunCmd, ["run", "test:startup:e2e"]);
runStep("orchestrator-integration", bunCmd, ["run", "test:orchestrator:integration"]);
