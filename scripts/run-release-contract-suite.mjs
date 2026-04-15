#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const appCoreRoot = path.resolve(repoRoot, "eliza", "packages", "app-core");
const legacyElectrobunDir = path.join(repoRoot, "apps", "app", "electrobun");
const canonicalElectrobunDir = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "platforms",
  "electrobun",
);
const releaseContractTests = [
  "eliza/packages/app-core/scripts/asset-cdn.test.ts",
  "eliza/packages/app-core/scripts/docker-contract.test.ts",
  "eliza/packages/app-core/scripts/chrome-extension-release-surface.test.ts",
  "scripts/electrobun-pr-workflow-contract.test.ts",
  "eliza/packages/app-core/scripts/whisper-build-script-drift.test.ts",
  "eliza/packages/app-core/scripts/release-check.test.ts",
  "eliza/packages/app-core/scripts/static-asset-manifest.test.ts",
];

let createdCompatLink = false;

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? "1",
    },
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status ?? 1}: ${command} ${args.join(" ")}`,
    );
  }
}

let exitCode = 0;
try {
  if (
    !fs.existsSync(legacyElectrobunDir) &&
    fs.existsSync(canonicalElectrobunDir)
  ) {
    fs.mkdirSync(path.dirname(legacyElectrobunDir), { recursive: true });
    fs.symlinkSync(
      path.relative(path.dirname(legacyElectrobunDir), canonicalElectrobunDir),
      legacyElectrobunDir,
      process.platform === "win32" ? "junction" : "dir",
    );
    createdCompatLink = true;
  }

  run("bunx", ["vitest", "run", "--passWithNoTests", ...releaseContractTests]);
  run("bunx", [
    "vitest",
    "run",
    "--passWithNoTests",
    "eliza/packages/app-core/scripts/startup-integration-script-drift.test.ts",
  ]);

  // tsdown and release:check resolve repo-root-relative entries/config.
  run("bunx", ["tsdown", "--fail-on-warn", "false"]);
  fs.mkdirSync(path.join(repoRoot, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, "dist", "package.json"),
    '{"type":"module"}\n',
  );
  run("node", ["--import", "tsx", "scripts/write-build-info.ts"]);
  run("node", ["scripts/generate-static-asset-manifest.mjs"], appCoreRoot);
  run("bun", ["run", "release:check"]);
} catch (err) {
  console.error(err.message ?? err);
  exitCode = 1;
} finally {
  if (createdCompatLink) {
    if (fs.existsSync(legacyElectrobunDir)) {
      const legacyStat = fs.lstatSync(legacyElectrobunDir);

      if (legacyStat.isSymbolicLink()) {
        fs.unlinkSync(legacyElectrobunDir);
      } else {
        fs.rmSync(legacyElectrobunDir, { force: true, recursive: true });
      }
    }
  }
}

process.exit(exitCode);
