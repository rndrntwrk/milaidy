#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const elizaPackageSpecifier =
  process.env.MILADY_ELIZAOS_VERSION ||
  process.env.ELIZAOS_VERSION ||
  process.env.MILADY_ELIZAOS_DIST_TAG ||
  process.env.ELIZAOS_DIST_TAG ||
  process.env.MILADY_ELIZAOS_NPM_TAG ||
  process.env.ELIZAOS_NPM_TAG ||
  "alpha";

function run(args, options = {}) {
  const result = spawnSync("bun", args, {
    cwd: options.cwd ?? repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(
  ["add", "--no-save", "--dev", "--ignore-scripts", "@playwright/test@1.59.1"],
  {
    cwd: path.join(repoRoot, "apps/app"),
  },
);

const elizaRoot = path.join(repoRoot, "eliza");
if (fs.existsSync(path.join(elizaRoot, "package.json"))) {
  run(
    [
      "add",
      "--no-save",
      "--ignore-scripts",
      `@elizaos/plugin-elizacloud@${elizaPackageSpecifier}`,
    ],
    { cwd: elizaRoot },
  );
}
