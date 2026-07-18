import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ALICE_RELEASE_RUNTIME_PINS,
  pinAliceReleaseRuntimeDeps,
} from "./pin-alice-release-runtime-deps.mjs";

test("release runtime pins are exact and normalization is idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "alice-runtime-pins-"));
  const packageJsonPath = join(root, "package.json");
  const packageJson = {
    name: "alice-release-fixture",
    private: true,
    workspaces: [
      "eliza/plugins/*",
      "eliza/plugins/plugin-sql",
      "eliza/plugins/plugin-shell",
      "eliza/plugins/plugin-openrouter",
      "plugins/plugin-*/typescript",
      "plugins/plugin-signal/typescript",
    ],
    dependencies: {
      "@elizaos/plugin-openrouter": "alpha",
      "@elizaos/plugin-shell": "workspace:*",
      "@elizaos/plugin-signal": "workspace:*",
      "@elizaos/plugin-sql": "next",
    },
    overrides: {
      "@elizaos/plugin-sql": "workspace:*",
    },
  };
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(join(root, "bun.lock"), "{}\n");

  try {
    const first = pinAliceReleaseRuntimeDeps(root, { log: () => {} });
    assert.equal(first.changed, true);
    assert.equal(first.removedLockfiles, 1);

    const normalized = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    for (const [name, version] of ALICE_RELEASE_RUNTIME_PINS) {
      assert.equal(normalized.dependencies[name], version);
    }
    assert.equal(normalized.overrides["@elizaos/plugin-sql"], "2.0.0-alpha.20");
    assert.equal(normalized.workspaces.includes("eliza/plugins/plugin-sql"), false);
    assert.equal(normalized.workspaces.includes("eliza/plugins/plugin-shell"), false);
    assert.equal(normalized.workspaces.includes("eliza/plugins/plugin-openrouter"), false);
    assert.equal(normalized.workspaces.includes("!eliza/plugins/plugin-sql"), true);
    assert.equal(normalized.workspaces.includes("!eliza/plugins/plugin-shell"), true);
    assert.equal(normalized.workspaces.includes("!eliza/plugins/plugin-openrouter"), true);
    assert.equal(normalized.workspaces.includes("plugins/plugin-signal/typescript"), false);
    assert.equal(normalized.workspaces.includes("!plugins/plugin-signal/typescript"), true);
    assert.equal(existsSync(join(root, "bun.lock")), false);

    const second = pinAliceReleaseRuntimeDeps(root, { log: () => {} });
    assert.deepEqual(second, { changed: false, changes: [], removedLockfiles: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
