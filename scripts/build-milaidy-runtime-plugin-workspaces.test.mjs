import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "build-milaidy-runtime-plugin-workspaces.mjs",
);

function createPluginFixture({
  buildScript = "echo build",
  fakeBunBody,
  packageName = "@elizaos/plugin-cron",
  workspaceRoot = "plugins",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "alice-plugin-builder-"));
  const packageSegment = packageName.split("/").at(-1);
  const packageDir = join(root, workspaceRoot, packageSegment, "typescript");
  const fakeBin = join(root, "fake-bin");
  mkdirSync(packageDir, { recursive: true });
  mkdirSync(fakeBin);

  const packageJson = {
    name: packageName,
    version: "2.0.0-alpha.8",
    main: "dist/index.js",
  };
  if (buildScript !== null) {
    packageJson.scripts = { build: buildScript };
  }
  writeFileSync(join(packageDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

  if (fakeBunBody) {
    const fakeBun = join(fakeBin, "bun");
    writeFileSync(fakeBun, `#!/bin/sh\n${fakeBunBody}\n`);
    chmodSync(fakeBun, 0o755);
  }

  return { root, fakeBin, packageDir };
}

function runBuilder(root, fakeBin) {
  return spawnSync(process.execPath, [scriptPath, root], {
    encoding: "utf8",
    env: {
      ...process.env,
      ALICE_BUN_BIN: join(fakeBin, "bun"),
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    },
  });
}

test("missing runtime entry without a build script fails closed", () => {
  const fixture = createPluginFixture({ buildScript: null });
  try {
    const result = runBuilder(fixture.root, fixture.fakeBin);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /has no build script/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a malformed plugin manifest fails with its path", () => {
  const fixture = createPluginFixture();
  writeFileSync(join(fixture.packageDir, "package.json"), "{not-json\n");
  try {
    const result = runBuilder(fixture.root, fixture.fakeBin);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid package\.json.*plugin-cron/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a failed build is rejected even if it leaves a runtime entry", () => {
  const fixture = createPluginFixture({
    fakeBunBody: "mkdir -p dist\ntouch dist/index.js\nexit 7",
  });
  try {
    const result = runBuilder(fixture.root, fixture.fakeBin);
    assert.equal(result.status, 7);
    assert.match(result.stderr, /build exited 7/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a successful build must produce a runtime entry", () => {
  const fixture = createPluginFixture({ fakeBunBody: "exit 0" });
  try {
    const result = runBuilder(fixture.root, fixture.fakeBin);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no runtime JS entry was produced/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("browser-only output is not accepted as a runtime entry", () => {
  const fixture = createPluginFixture({
    fakeBunBody: "mkdir -p dist/browser\ntouch dist/browser/index.browser.js\nexit 0",
  });
  writeFileSync(
    join(fixture.packageDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@elizaos/plugin-cron",
        version: "2.0.0-alpha.8",
        exports: {
          ".": {
            browser: "./dist/browser/index.browser.js",
          },
        },
        scripts: { build: "echo build" },
      },
      null,
      2,
    )}\n`,
  );
  try {
    const result = runBuilder(fixture.root, fixture.fakeBin);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no runtime JS entry was produced/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a successful build with fresh runtime output is accepted", () => {
  const fixture = createPluginFixture({
    fakeBunBody: "mkdir -p dist\ntouch dist/index.js\nexit 0",
    workspaceRoot: join("eliza", "plugins"),
  });
  try {
    const result = runBuilder(fixture.root, fixture.fakeBin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /built 1 Milaidy runtime workspace/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

for (const packageName of [
  "@elizaos/app-task-coordinator",
  "@elizaos/app-lifeops",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-app-control",
  "@elizaos/plugin-edge-tts",
  "@elizaos/plugin-google",
  "@elizaos/plugin-video",
]) {
  test(`Alice core runtime builds ${packageName} when its dist entry is absent`, () => {
    const fixture = createPluginFixture({
      packageName,
      fakeBunBody: "mkdir -p dist\ntouch dist/index.js\nexit 0",
      workspaceRoot: join("eliza", "plugins"),
    });
    try {
      const result = runBuilder(fixture.root, fixture.fakeBin);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(
        result.stdout,
        new RegExp(`building runtime plugin ${packageName}`),
      );
      assert.match(result.stdout, /built 1 Milaidy runtime workspace/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

test("Alice runtime workspaces build dependencies before their consumers", () => {
  const fixture = createPluginFixture({
    packageName: "@elizaos/plugin-agent-orchestrator",
    fakeBunBody: "mkdir -p dist\ntouch dist/index.js\nexit 0",
    workspaceRoot: join("eliza", "plugins"),
  });
  const coordinatorDir = join(
    fixture.root,
    "eliza",
    "plugins",
    "app-task-coordinator",
    "typescript",
  );
  mkdirSync(coordinatorDir, { recursive: true });
  writeFileSync(
    join(coordinatorDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@elizaos/app-task-coordinator",
        version: "2.0.0-alpha.8",
        main: "dist/index.js",
        scripts: { build: "echo build" },
      },
      null,
      2,
    )}\n`,
  );

  try {
    const result = runBuilder(fixture.root, fixture.fakeBin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(
      result.stdout.indexOf("@elizaos/app-task-coordinator") <
        result.stdout.indexOf("@elizaos/plugin-agent-orchestrator"),
      result.stdout,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
