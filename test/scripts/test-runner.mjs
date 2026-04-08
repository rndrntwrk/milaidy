import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTestEnv,
  resolveNodeCmd,
  runManagedTestCommand,
} from "./managed-test-command.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const bunCmd = process.env.npm_execpath || process.env.BUN || "bun";
const nodeCmd = resolveNodeCmd();
const appRoot = path.join(repoRoot, "apps", "app");

await runManagedTestCommand({
  repoRoot,
  lockName: "app-unit",
  label: "app-unit",
  command: nodeCmd,
  args: ["./node_modules/.bin/vitest", "run"],
  cwd: appRoot,
  env: buildTestEnv(appRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "unit",
  label: "unit",
  command: nodeCmd,
  args: ["./node_modules/.bin/vitest", "run", "--config", "vitest.config.ts"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "e2e",
  label: "e2e",
  command: bunCmd,
  args: ["run", "test:e2e"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "startup-e2e",
  label: "startup-e2e",
  command: bunCmd,
  args: ["run", "test:startup:e2e"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "orchestrator-integration",
  label: "orchestrator-integration",
  command: bunCmd,
  args: ["run", "test:orchestrator:integration"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});
