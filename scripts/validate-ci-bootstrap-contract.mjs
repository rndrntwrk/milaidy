#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();

const WORKFLOWS = [
  ".github/workflows/test.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/ci-fork.yml",
  ".github/workflows/docker-ci-smoke.yml",
];

const DISABLE_MARKERS = [
  "scripts/disable-local-eliza-workspace.mjs",
  "disable-local-eliza-workspace: \"true\"",
  "disable-local-eliza-workspace: 'true'",
];

const SOURCE_PRESENT_MARKERS = [
  "bun run test:ci:real",
  "bun run test:desktop:contract",
  "bun run test:selfcontrol:unit",
  "bun run test:selfcontrol:e2e",
  "bun run test:selfcontrol:startup",
  "eliza/packages/app-core/scripts/docker-ci-smoke.sh",
  "apps/app/electrobun",
];

const failures = [];

for (const workflowRelPath of WORKFLOWS) {
  const workflowPath = path.join(REPO_ROOT, workflowRelPath);
  if (!fs.existsSync(workflowPath)) continue;

  const text = fs.readFileSync(workflowPath, "utf8");
  const hasDisableStep = DISABLE_MARKERS.some((marker) => text.includes(marker));
  if (!hasDisableStep) continue;

  const conflicting = SOURCE_PRESENT_MARKERS.filter((marker) =>
    text.includes(marker),
  );
  if (conflicting.length === 0) continue;

  failures.push({
    workflowRelPath,
    conflicting,
  });
}

if (failures.length > 0) {
  console.error("CI bootstrap contract validation failed:");
  for (const failure of failures) {
    console.error(
      `- ${failure.workflowRelPath} mixes local-workspace disable markers with source-present commands.`,
    );
    for (const marker of failure.conflicting) {
      console.error(`  marker: ${marker}`);
    }
  }
  process.exit(1);
}

console.log("CI bootstrap contract validation passed.");
