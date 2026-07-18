import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "resolve-milaidy-missing-workspaces.mjs",
);
const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const BASE_LOCK_PINS = new Map([
  ["@elizaos/plugin-cron", "2.0.0-alpha.8"],
  ["@elizaos/plugin-evm", "2.0.0-alpha.8"],
  ["@elizaos/plugin-experience", "2.0.0-alpha.11"],
  ["@elizaos/plugin-personality", "2.0.0-alpha.9"],
  ["@elizaos/plugin-pi-ai", "1.7.3-alpha.4"],
  ["@elizaos/plugin-scratchpad", "2.0.0-alpha.7"],
  ["@elizaos/plugin-secrets-manager", "2.0.0-alpha.10"],
  ["@elizaos/plugin-trust", "2.0.0-alpha.7"],
  ["@elizaos/plugin-solana", "2.0.0-alpha.6"],
  ["@elizaos/plugin-plugin-manager", "2.0.0-alpha.8"],
]);

function createFixture(packageJson) {
  const root = mkdtempSync(join(tmpdir(), "alice-workspace-resolver-"));
  writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(join(root, "bun.lock"), "{}\n");
  return root;
}

function runResolver(root, env = {}) {
  return spawnSync(process.execPath, [scriptPath, root], {
    encoding: "utf8",
    env: {
      ...process.env,
      ALICE_RELEASE_STRICT_PINS: "1",
      ...env,
    },
  });
}

test("strict release mode resolves absent tagged workspaces to base-lock pins", () => {
  const releaseTags = ["alpha", "beta", "next"];
  const dependencies = Object.fromEntries(
    [...BASE_LOCK_PINS.keys()]
      .slice(0, -1)
      .map((name, index) => [name, releaseTags[index % releaseTags.length]]),
  );
  const overrideName = [...BASE_LOCK_PINS.keys()].at(-1);
  const root = createFixture({
    name: "alice-release-fixture",
    private: true,
    workspaces: ["packages/*"],
    dependencies,
    overrides: { [overrideName]: "next" },
  });

  try {
    const result = runResolver(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const normalized = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    for (const [name, version] of BASE_LOCK_PINS) {
      const actual = normalized.dependencies[name] ?? normalized.overrides[name];
      assert.equal(actual, version, `${name} must use its base-lock version`);
    }
    assert.equal(existsSync(join(root, "bun.lock")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("strict release pins match the canonical base lock", () => {
  const baseLock = readFileSync(join(repositoryRoot, "bun.lock"), "utf8");
  for (const [name, version] of BASE_LOCK_PINS) {
    assert.equal(
      baseLock.includes(`"name": "${name}",\n      "version": "${version}"`),
      true,
      `${name}@${version} must be present in the base lock`,
    );
  }
});

test("strict release failure is atomic and never queries npm", () => {
  const root = createFixture({
    name: "alice-release-fixture",
    private: true,
    workspaces: [],
    dependencies: {
      "@elizaos/plugin-cron": "alpha",
      "@example/alice-unpinned": "alpha",
      "@example/alice-unpinned-workspace": "workspace:*",
    },
  });
  const fakeBin = join(root, "fake-bin");
  const npmMarker = join(root, "npm-was-called");
  mkdirSync(fakeBin);
  const fakeNpm = join(fakeBin, "npm");
  writeFileSync(fakeNpm, `#!/bin/sh\ntouch "${npmMarker}"\nexit 0\n`);
  chmodSync(fakeNpm, 0o755);
  const packageJsonBefore = readFileSync(join(root, "package.json"), "utf8");
  const lockfileBefore = readFileSync(join(root, "bun.lock"), "utf8");

  try {
    const result = runResolver(root, { PATH: `${fakeBin}:${process.env.PATH ?? ""}` });
    assert.notEqual(result.status, 0, "an unknown strict release pin must fail");
    assert.match(result.stderr, /unresolved missing workspace dependencies/);
    assert.equal(existsSync(npmMarker), false, "strict mode must not query npm");
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), packageJsonBefore);
    assert.equal(readFileSync(join(root, "bun.lock"), "utf8"), lockfileBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a present tagged workspace remains linked locally", () => {
  const root = createFixture({
    name: "alice-release-fixture",
    private: true,
    workspaces: ["packages/*"],
    dependencies: { "@example/local-plugin": "alpha" },
    overrides: { "@example/local-plugin": "next" },
  });
  const packageDir = join(root, "packages", "local-plugin");
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify({ name: "@example/local-plugin", version: "1.0.0" }, null, 2)}\n`,
  );

  try {
    const result = runResolver(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const normalized = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    assert.equal(normalized.dependencies["@example/local-plugin"], "workspace:*");
    assert.equal(normalized.overrides["@example/local-plugin"], "workspace:*");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
