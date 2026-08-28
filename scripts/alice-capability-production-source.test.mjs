import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("production image and launcher contain no fabricated capability packages", () => {
  const dockerfile = read("deploy/Dockerfile.ci");
  const launcher = read("deploy/modal/alice_registry_runtime.py");
  for (const source of [dockerfile, launcher]) {
    assert.doesNotMatch(source, /0\.0\.0-(?:cloud-)?stub/);
    assert.doesNotMatch(source, /0\.0\.0-milady-stub/);
  }
  assert.doesNotMatch(dockerfile, /__STUBS__|__APP_STUBS__|__PLUGIN_STUBS__/);
  assert.doesNotMatch(launcher, /alice-denied-plugins|ELIZA_SKIP_PLUGINS/);
});

test("production workflow uses the exact BOM digest and never injects a deny list", () => {
  const workflow = read(".github/workflows/build-cloud-agent.yml");
  assert.match(workflow, /ALICE_CAPABILITY_BOM_SHA256/);
  assert.match(workflow, /alice-capability-bom\.json/);
  assert.doesNotMatch(workflow, /alice-denied-plugins|ALICE_PRODUCTION_SKIP_PLUGINS/);
  assert.doesNotMatch(workflow, /--env ELIZA_SKIP_PLUGINS/);
});

test("full-gated production build never runs optional-app or browser-bridge stubs", () => {
  const productionBuild = read("scripts/run-production-build.mjs");
  assert.match(productionBuild, /ALICE_RUNTIME_PROFILE/);
  assert.match(productionBuild, /full-gated/);
  assert.match(productionBuild, /ALICE_PRODUCTION_BUILD_STUB_FORBIDDEN/);
});

test("root workspace contains no fake capability package versions", () => {
  for (const relativePath of [
    "plugins/plugin-knowledge/package.json",
    "plugins/plugin-rolodex/package.json",
    "plugins/plugin-todo/package.json",
    "plugins/plugin-trajectory-logger/package.json",
  ]) {
    assert.equal(fs.existsSync(new URL(`../${relativePath}`, import.meta.url)), false);
  }
});
