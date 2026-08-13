import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("cloud agent build keeps the checked-out Eliza workspace available", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const initStart = workflow.indexOf("- name: Init submodules");
  const installStart = workflow.indexOf("- name: Install dependencies");

  assert.ok(initStart >= 0, "Init submodules step must exist");
  assert.ok(
    installStart > initStart,
    "immutable dependency install must follow submodule initialization",
  );
  assert.doesNotMatch(
    workflow.slice(initStart, installStart),
    /disable-local-eliza-workspace\.mjs/,
    "the init step must not remove Eliza before workspace restoration",
  );
  assert.doesNotMatch(
    workflow.slice(initStart, installStart),
    /Restore build-critical workspaces|fs\.writeFileSync\("package\.json"/,
    "CI must not rewrite the committed workspace graph before frozen install",
  );
});

test("cloud agent build uses the Node major required by pinned Eliza", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaCore = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "eliza/packages/core/package.json"),
      "utf8",
    ),
  );
  const requiredMajor = elizaCore.engines?.node?.match(/>=\s*(\d+)/)?.[1];

  assert.ok(requiredMajor, "pinned Eliza must declare a minimum Node major");
  assert.match(
    workflow,
    new RegExp(`node-version: ["']${requiredMajor}["']`),
    `cloud agent build must use Node ${requiredMajor} required by pinned Eliza`,
  );
});

test("cloud agent frozen install accepts the current Eliza layout", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaApps = path.join(repoRoot, "eliza/apps");

  assert.equal(
    fs.existsSync(elizaApps),
    false,
    "the pinned official Eliza checkout should exercise its apps-free layout",
  );
  assert.match(
    workflow,
    /bun install --ignore-scripts --frozen-lockfile/,
    "cloud build must install the committed lock without manifest mutation",
  );
});
