import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTestEnv,
  resolveNodeCmd,
  runManagedTestCommand,
} from "./managed-test-command.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const nodeCmd = resolveNodeCmd();
const unitEnv = buildTestEnv(repoRoot);

const unitShards = [
  {
    label: "unit:agent-src",
    patterns: ["packages/agent/src"],
  },
  {
    label: "unit:agent-tests",
    patterns: ["packages/agent/test"],
  },
  {
    label: "unit:app-core",
    patterns: [
      "packages/app-core/src",
      "packages/shared/src",
    ],
  },
  {
    label: "unit:plugins",
    patterns: [
      "packages/agent/src/runtime/roles/test",
      "packages/plugin-selfcontrol/src",
      "packages/plugin-wechat/src",
      "packages/plugin-music-player/src",
      "plugins/plugin-discord/typescript/__tests__/identity.test.ts",
    ],
  },
  {
    label: "unit:workspace",
    patterns: [
      "src",
      "scripts",
      "apps/app/electrobun/src",
      "apps/chrome-extension",
      "test/format-error.test.ts",
    ],
  },
];

for (const shard of unitShards) {
  await runManagedTestCommand({
    repoRoot,
    lockName: "unit",
    label: shard.label,
    command: nodeCmd,
    args: [
      "./node_modules/.bin/vitest",
      "run",
      "--config",
      "vitest.config.ts",
      "--reporter=dot",
      ...shard.patterns,
    ],
    cwd: repoRoot,
    env: unitEnv,
  });
}
