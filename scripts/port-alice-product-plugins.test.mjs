import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { portAliceProductPlugins } from "./port-alice-product-plugins.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

test("ports Stream, Ads, and Arcade autoload into exact pinned Eliza", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "alice-product-plugins-"));
  try {
    const source = path.join(
      repoRoot,
      "eliza/packages/agent/src/runtime/plugin-collector.ts",
    );
    const target = path.join(
      root,
      "eliza/packages/agent/src/runtime/plugin-collector.ts",
    );
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(source));

    await portAliceProductPlugins(root);
    const first = await readFile(target, "utf8");

    assert.match(
      first,
      /const STREAM555_PLUGIN_PACKAGE = "@rndrntwrk\/plugin-555stream";/,
    );
    assert.match(
      first,
      /const FIVE55_GAMES_PLUGIN_PACKAGE = "@miladyai\/agent\/plugins\/five55-games";/,
    );
    assert.match(first, /function hasStream555RuntimeEnv\(/);
    assert.match(first, /readAliceProductEnvValue\(configEnv, "STREAM555_AGENT_API_KEY"\)/);
    assert.match(first, /readAliceProductEnvValue\(configEnv, "STREAM555_AGENT_TOKEN"\)/);
    assert.match(first, /readAliceProductEnvValue\(configEnv, "STREAM_API_BEARER_TOKEN"\)/);
    assert.match(first, /"stream555-canonical": STREAM555_PLUGIN_PACKAGE/);
    assert.match(first, /"five55-games": FIVE55_GAMES_PLUGIN_PACKAGE/);
    assert.match(
      first,
      /pluginsToLoad\.add\(STREAM555_PLUGIN_PACKAGE\)[\s\S]*pluginsToLoad\.add\(FIVE55_GAMES_PLUGIN_PACKAGE\)/,
    );
    assert.match(first, /env: STREAM555_BASE_URL \+ stream auth/);
    const transpiled = ts.transpileModule(first, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    assert.deepEqual(
      transpiled.diagnostics ?? [],
      [],
      "ported official collector must remain valid TypeScript",
    );

    await portAliceProductPlugins(root);
    assert.equal(await readFile(target, "utf8"), first, "port must be idempotent");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when the official collector shape drifts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "alice-product-drift-"));
  try {
    const target = path.join(
      root,
      "eliza/packages/agent/src/runtime/plugin-collector.ts",
    );
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "export function collectPluginNames() { return new Set(); }\n");
    await assert.rejects(
      portAliceProductPlugins(root),
      /collector .* anchor drifted/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
