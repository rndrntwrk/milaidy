import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
