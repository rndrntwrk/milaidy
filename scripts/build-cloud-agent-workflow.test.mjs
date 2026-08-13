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

  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  assert.match(
    dockerfile,
    new RegExp(`^ARG NODE_VERSION=${requiredMajor}$`, "m"),
    `cloud runtime image must use Node ${requiredMajor} required by pinned Eliza`,
  );
});

test("cloud agent build uses the Bun version required by pinned Eliza", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const elizaPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "eliza/package.json"), "utf8"),
  );
  const requiredVersion = elizaPackage.packageManager?.match(/^bun@(.+)$/)?.[1];

  assert.ok(requiredVersion, "pinned Eliza must declare its Bun version");
  assert.equal(
    rootPackage.packageManager,
    `bun@${requiredVersion}`,
    "Alice and pinned Eliza must use one Bun version",
  );
  assert.match(
    workflow,
    new RegExp(`bun-version: ["']${requiredVersion.replaceAll(".", "\\.")}["']`),
    `cloud build must use Bun ${requiredVersion} required by pinned Eliza`,
  );

  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  assert.match(
    dockerfile,
    new RegExp(`^ARG BUN_VERSION=${requiredVersion.replaceAll(".", "\\.")}$`, "m"),
    `cloud runtime image must use Bun ${requiredVersion} required by pinned Eliza`,
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
  assert.match(
    workflow,
    /cd eliza\n\s+bun install --ignore-scripts --frozen-lockfile/,
    "cloud build must materialize the pinned Eliza workspace from its own lock",
  );
  assert.doesNotMatch(
    workflow,
    /bun run postinstall/,
    "cloud build must not apply legacy patches to the pinned official Eliza tree",
  );
  assert.doesNotMatch(
    workflow,
    /npm view .*dist\.tarball/,
    "cloud build must not replace locked dependencies with registry-latest tarballs",
  );
  assert.doesNotMatch(
    workflow,
    /eliza\/packages\/schemas|build had errors/,
    "cloud build must use current package scripts and fail closed on build errors",
  );
  assert.match(
    workflow,
    /cd eliza\/packages\/core\n\s+bun run build/,
    "cloud build must invoke the current Eliza core build script",
  );
});

test("cloud agent image does not copy removed Eliza apps", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  assert.doesNotMatch(
    dockerfile,
    /\bcp(?: -a)? eliza\/apps\//,
    "image assembly must not require packages removed from official Eliza",
  );
  assert.doesNotMatch(
    dockerfile,
    /npm view .*dist\.tarball|https\.get\(/,
    "image assembly must never replace locked packages with registry-latest tarballs",
  );
  assert.equal(
    dockerfile.match(/const v = '\$\{VERSION_CLEAN\}';/g)?.length,
    1,
    "image version patch must remain valid JavaScript",
  );
});

test("cloud agent builds pinned Eliza UI assets before Alice web", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaUiBuild = workflow.indexOf("cd eliza/packages/ui\n          bun run build");
  const aliceWebBuild = workflow.indexOf("cd apps/app\n          bun run build:web");

  assert.ok(elizaUiBuild >= 0, "cloud build must materialize @elizaos/ui dist assets");
  assert.ok(
    aliceWebBuild > elizaUiBuild,
    "Alice web build must run after pinned Eliza UI assets exist",
  );
});
