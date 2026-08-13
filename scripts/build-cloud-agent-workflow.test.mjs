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
  const restoreStart = workflow.indexOf(
    "- name: Restore build-critical workspaces",
  );

  assert.ok(initStart >= 0, "Init submodules step must exist");
  assert.ok(
    restoreStart > initStart,
    "workspace restore must follow submodule initialization",
  );
  assert.doesNotMatch(
    workflow.slice(initStart, restoreStart),
    /disable-local-eliza-workspace\.mjs/,
    "the init step must not remove Eliza before workspace restoration",
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

test("cloud agent workspace restore tolerates the current Eliza layout", () => {
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
  assert.doesNotMatch(
    workflow,
    /fs\.readdirSync\("eliza\/apps"\)/,
    "workspace restore must not unconditionally scan removed eliza/apps",
  );
});
