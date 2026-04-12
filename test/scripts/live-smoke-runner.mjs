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

function buildLiveTestEnv(cwd) {
  return {
    ...buildTestEnv(cwd),
    MILADY_LIVE_TEST: "1",
    ELIZA_LIVE_TEST: "1",
  };
}

const runs = [
  {
    lockName: "ui-playwright",
    label: "ui-playwright",
    command: bunCmd,
    args: ["run", "test:ui:playwright"],
    cwd: repoRoot,
  },
  {
    lockName: "ui-storybook-e2e",
    label: "ui-storybook-e2e",
    command: bunCmd,
    args: ["run", "test:e2e"],
    cwd: path.join(repoRoot, "packages", "ui"),
  },
  {
    lockName: "live-plugins",
    label: "live-plugins",
    command: bunCmd,
    args: ["run", "test:live:plugins"],
    cwd: repoRoot,
  },
  {
    lockName: "cloud-e2e-smoke",
    label: "cloud-e2e-smoke",
    command: bunCmd,
    args: ["run", "test:e2e:smoke"],
    cwd: path.join(repoRoot, "cloud"),
  },
  {
    lockName: "eliza-e2e-smoke",
    label: "eliza-e2e-smoke",
    command: bunCmd,
    args: ["run", "test:e2e:smoke"],
    cwd: path.join(repoRoot, "eliza", "packages", "typescript"),
  },
  {
    lockName: "steward-fi-e2e-smoke",
    label: "steward-fi-e2e-smoke",
    command: bunCmd,
    args: ["run", "test:e2e:smoke"],
    cwd: path.join(repoRoot, "steward-fi"),
  },
];

for (const run of runs) {
  await runManagedTestCommand({
    repoRoot,
    lockName: run.lockName,
    label: run.label,
    command: run.command,
    args: run.args,
    cwd: run.cwd,
    env: buildLiveTestEnv(run.cwd),
  });
}

await runManagedTestCommand({
  repoRoot,
  lockName: "repo-live-smoke-summary",
  label: "repo-live-smoke-summary",
  command: nodeCmd,
  args: ["scripts/audit-live-test-surface.mjs", "--fail-on-violations"],
  cwd: repoRoot,
  env: buildLiveTestEnv(repoRoot),
});
