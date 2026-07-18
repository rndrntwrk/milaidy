import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIRST_PARTY_SOURCE = "packages/app-companion";
const FORBIDDEN_CODE_SOURCES = [
  "eliza/apps/app-companion",
  "eliza/plugins/app-companion",
];

const consumers = [
  "apps/app/vite.config.ts",
  "apps/app/tsconfig.json",
  "deploy/Dockerfile.ci",
  "scripts/templates/tsconfig.local-mode.json",
];

function readRepositoryFile(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

test("all companion code consumers resolve the first-party workspace", () => {
  for (const relativePath of consumers) {
    const source = readRepositoryFile(relativePath);
    assert.match(
      source,
      /packages\/app-companion/,
      `${relativePath} must resolve ${FIRST_PARTY_SOURCE}`,
    );
    for (const forbiddenSource of FORBIDDEN_CODE_SOURCES) {
      assert.equal(
        source.includes(forbiddenSource),
        false,
        `${relativePath} must not consume companion code from ${forbiddenSource}`,
      );
    }
  }
});

test("the only upstream companion reference is the named static-asset source", () => {
  const relativePath = "scripts/ensure-eliza-renderer-avatar-assets.mjs";
  const source = readRepositoryFile(relativePath);
  const references = source
    .split("\n")
    .filter((line) => line.includes("eliza/plugins/app-companion"));

  assert.equal(references.length, 2);
  for (const line of references) {
    assert.match(line, /eliza\/plugins\/app-companion\/public(?:_src)?/);
  }
});

test("the first-party companion owns its lockfile importer and build inputs", () => {
  const lockfile = readRepositoryFile("bun.lock");
  assert.equal(lockfile.includes('"packages/app-companion": {'), true);
  assert.equal(lockfile.includes('"eliza/apps/app-companion": {'), false);

  const manifest = JSON.parse(
    readRepositoryFile("packages/app-companion/package.json"),
  );
  const buildConfig =
    manifest.scripts["build:js"].match(/--config\s+(\S+)/)?.[1];
  assert.ok(buildConfig, "app-companion build:js must name a config file");
  assert.ok(
    existsSync(resolve(repositoryRoot, "packages/app-companion", buildConfig)),
    `missing app-companion build config: ${buildConfig}`,
  );

  const buildTsconfig = JSON.parse(
    readRepositoryFile("packages/app-companion/tsconfig.build.json"),
  );
  assert.ok(
    existsSync(
      resolve(repositoryRoot, "packages/app-companion", buildTsconfig.extends),
    ),
    `missing app-companion build tsconfig: ${buildTsconfig.extends}`,
  );
  assert.ok(
    manifest.files.includes("src"),
    "source exports must be included in the published package",
  );
});

test("container packaging fails closed when first-party companion source is absent", () => {
  const dockerfile = readRepositoryFile("deploy/Dockerfile.ci");
  const companionBlock = dockerfile.slice(
    dockerfile.indexOf("# @elizaos/app-companion:"),
    dockerfile.indexOf("# @elizaos/app-lifeops:"),
  );
  assert.doesNotMatch(companionBlock, /\|\| true/);
  assert.doesNotMatch(companionBlock, /WARN: app-companion src missing/);
  assert.match(
    companionBlock,
    /test -f node_modules\/@elizaos\/app-companion\/src\/plugin\.ts/,
  );

  const workflow = readRepositoryFile(
    ".github/workflows/build-cloud-agent.yml",
  );
  assert.doesNotMatch(workflow, /!eliza\/apps\/app-companion/);
  assert.match(workflow, /!packages\/app-companion/);
});

test("production builds verify Alice assets before compiling", () => {
  const buildScript = readRepositoryFile("scripts/run-production-build.mjs");
  const verification = buildScript.indexOf("verify-alice-companion-assets.mjs");
  const modeSwitch = buildScript.indexOf("if (isLocalElizaDisabled())");
  assert.ok(
    verification >= 0,
    "production build must invoke Alice asset verification",
  );
  assert.ok(
    verification < modeSwitch,
    "Alice asset verification must run before either production build mode",
  );
});
