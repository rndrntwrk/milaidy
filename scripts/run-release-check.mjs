#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  findReleaseCheckFile,
  findReleaseCheckPackDryRunFile,
  patchReleaseCheckPackFallbackFiles,
} from "./patch-release-check-pack-fallback.mjs";
import {
  isElizaWorktreeClean,
  listElizaUntrackedFiles,
  restoreGeneratedElizaChanges,
} from "./run-release-contract-suite.mjs";

const releaseWorkflowPath = ".github/workflows/release-electrobun.yml";
const releaseWorkflowNeedles = [
  "MILADY_NO_VISION_DEPS: $" +
    "{{ matrix.platform.os == 'windows' && '1' || '' }}",
];

const shouldRestoreElizaChanges = isElizaWorktreeClean();
const initialElizaUntrackedFiles = shouldRestoreElizaChanges
  ? listElizaUntrackedFiles()
  : [];
const originalContents = new Map();
let exitStatus = 1;
let exitSignal = null;

try {
  const applyResult = spawnSync(
    "node",
    ["scripts/apply-eliza-ci-patches.mjs"],
    { stdio: "inherit" },
  );
  if (applyResult.status !== 0) {
    exitStatus = applyResult.status ?? 1;
    exitSignal = applyResult.signal;
    throw new Error("run-release-check: eliza CI patch overlay failed");
  }

  const electrobunSmokePatchCheck = spawnSync(
    "node",
    ["scripts/patch-eliza-electrobun-windows-smoke-startup.mjs"],
    { stdio: "inherit" },
  );
  if (electrobunSmokePatchCheck.status !== 0) {
    exitStatus = electrobunSmokePatchCheck.status ?? 1;
    exitSignal = electrobunSmokePatchCheck.signal;
    throw new Error(
      "run-release-check: Electrobun Windows smoke startup overlay drifted",
    );
  }

  const electrobunMacosStagePatchCheck = spawnSync(
    "node",
    ["scripts/patch-eliza-electrobun-macos-stage-entitlements.mjs"],
    { stdio: "inherit" },
  );
  if (electrobunMacosStagePatchCheck.status !== 0) {
    exitStatus = electrobunMacosStagePatchCheck.status ?? 1;
    exitSignal = electrobunMacosStagePatchCheck.signal;
    throw new Error(
      "run-release-check: Electrobun macOS staging overlay drifted",
    );
  }

  const releaseWorkflow = fs.readFileSync(releaseWorkflowPath, "utf8");
  const missingReleaseWorkflowNeedles = releaseWorkflowNeedles.filter(
    (needle) => !releaseWorkflow.includes(needle),
  );
  if (missingReleaseWorkflowNeedles.length > 0) {
    exitStatus = 1;
    throw new Error(
      [
        "run-release-check: release workflow is missing Windows postinstall native-script guard:",
        ...missingReleaseWorkflowNeedles.map((needle) => `  - ${needle}`),
      ].join("\n"),
    );
  }

  const releaseCheckFilePath = findReleaseCheckFile();
  const packDryRunFilePath = findReleaseCheckPackDryRunFile();
  for (const filePath of [releaseCheckFilePath, packDryRunFilePath]) {
    if (typeof filePath === "string" && fs.existsSync(filePath)) {
      originalContents.set(filePath, fs.readFileSync(filePath, "utf8"));
    }
  }

  if (!releaseCheckFilePath) {
    throw new Error("run-release-check: could not find release-check.ts");
  }

  patchReleaseCheckPackFallbackFiles({
    releaseCheckFilePath,
    packDryRunFilePath,
  });

  const result = spawnSync(
    "bun",
    [
      "eliza/packages/app-core/scripts/run-node-tsx.mjs",
      "eliza/packages/app-core/scripts/release-check.ts",
    ],
    { stdio: "inherit" },
  );

  exitStatus = result.status ?? 1;
  exitSignal = result.signal;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (exitStatus === 0) {
    exitStatus = 1;
  }
} finally {
  for (const [filePath, contents] of originalContents) {
    fs.writeFileSync(filePath, contents);
  }
  restoreGeneratedElizaChanges(
    shouldRestoreElizaChanges,
    undefined,
    initialElizaUntrackedFiles,
  );
}

if (exitSignal) {
  process.kill(process.pid, exitSignal);
}
process.exit(exitStatus);
