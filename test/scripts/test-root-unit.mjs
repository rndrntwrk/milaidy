import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTestEnv,
  resolveNodeCmd,
  runManagedTestCommand,
} from "./managed-test-command.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

await runManagedTestCommand({
  repoRoot,
  lockName: "unit",
  label: "unit",
  command: resolveNodeCmd(),
  args: ["./node_modules/.bin/vitest", "run", "--config", "vitest.config.ts"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});
