#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredDocs = [
  "CHANGELOG.md",
  "README.md",
  "docs/QUICKSTART_3_STEPS.md",
  "docs/OPERATOR_SETUP_MATRIX.md",
  "docs/MILAIDY_WEB_ACCESS.md",
  "docs/PUBLIC_RELEASE_CHECKLIST.md",
  "docs/PLUGIN_RELEASE_P0_CHECKLIST.md",
  "elizaos.plugin.json",
  "skills/stream-operator/SKILL.md",
  "skills/openclaw/SKILL.md",
  ".github/workflows/ci.yml",
];

const actionFile = "src/actions/index.ts";
const actionsDir = "src/actions";
const requiredActionNames = [
  "STREAM555_HEALTHCHECK",
  "STREAM555_BOOTSTRAP_SESSION",
  "STREAM555_STREAM_START",
  "STREAM555_STREAM_STOP",
  "STREAM555_STREAM_STATUS",
  "STREAM555_GO_LIVE_APP",
  "STREAM555_AD_LIST",
  "STREAM555_AD_BREAK_TRIGGER",
];

const failures = [];

for (const relative of requiredDocs) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) {
    failures.push(`missing required file: ${relative}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (pkg.elizaos?.displayName !== "555 Stream") {
  failures.push("package.json elizaos.displayName must be '555 Stream'");
}
if (pkg.homepage !== "https://docs.rndrntwrk.com/555stream") {
  failures.push("package.json homepage must point to canonical ecosystem docs");
}
if (pkg.publishConfig?.access !== "public") {
  failures.push("package.json publishConfig.access must be 'public'");
}

const actionIndexSource = fs.existsSync(path.join(root, actionFile))
  ? fs.readFileSync(path.join(root, actionFile), "utf8")
  : "";
if (!actionIndexSource) {
  failures.push(`missing required file: ${actionFile}`);
} else {
  const actionNames = new Set();
  const actionsPath = path.join(root, actionsDir);
  if (!fs.existsSync(actionsPath)) {
    failures.push(`missing required directory: ${actionsDir}`);
  } else {
    for (const entry of fs.readdirSync(actionsPath)) {
      if (!entry.endsWith(".ts")) continue;
      const source = fs.readFileSync(path.join(actionsPath, entry), "utf8");
      for (const match of source.matchAll(/name:\s*['"`]([A-Z0-9_]+)['"`]/g)) {
        if (match[1]) actionNames.add(match[1]);
      }
    }
  }

  for (const actionName of requiredActionNames) {
    if (!actionNames.has(actionName)) {
      failures.push(`required action not found in ${actionFile}: ${actionName}`);
    }
  }
}

const pluginManifest = JSON.parse(fs.readFileSync(path.join(root, "elizaos.plugin.json"), "utf8"));
if (pluginManifest.displayName !== "555 Stream") {
  failures.push("elizaos.plugin.json displayName must be '555 Stream'");
}
if (!pluginManifest.quickstart?.steps?.some((step) => step.includes("STREAM555_AGENT_API_KEY"))) {
  failures.push("elizaos.plugin.json quickstart must document STREAM555_AGENT_API_KEY");
}

if (failures.length > 0) {
  console.error("release-check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("release-check passed");
}
