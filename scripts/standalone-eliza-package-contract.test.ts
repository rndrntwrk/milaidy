import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "vitest";

function readJson(path: string) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

function assertPathFallback(
  tsconfigPath: string,
  alias: string,
  fallback: string,
) {
  const tsconfig = readJson(tsconfigPath);
  const targets = tsconfig.compilerOptions?.paths?.[alias];
  assert.ok(Array.isArray(targets), `${tsconfigPath} missing ${alias} path`);
  assert.ok(
    targets.includes(fallback),
    `${tsconfigPath} ${alias} must fall back to ${fallback}`,
  );
}

test("app-core package exports Milady runtime entrypoints", () => {
  const appCorePackage = readJson("eliza/packages/app-core/package.json");

  assert.equal(appCorePackage.exports["./entry"], "./src/entry.ts");
  assert.equal(appCorePackage.exports["./api/server"], "./src/api/server.ts");
  assert.equal(
    appCorePackage.exports["./platform/native-plugin-entrypoints"],
    "./src/platform/native-plugin-entrypoints.ts",
  );
});

test("root build can resolve app-core entries from npm without eliza", () => {
  const tsdownConfig = read("tsdown.config.ts");

  assert.match(tsdownConfig, /function appCoreEntry/);
  assert.match(tsdownConfig, /MILADY_ELIZA_SOURCE/);
  assert.match(tsdownConfig, /MILADY_SKIP_LOCAL_UPSTREAMS/);
  assert.match(tsdownConfig, /MILADY_ELIZA_APP_CORE_ROOT/);
  assert.match(tsdownConfig, /require\.resolve\(packageSubpath\)/);
  assert.doesNotMatch(tsdownConfig, /entry:\s*["']eliza\/packages\/app-core/);
});

test("TypeScript aliases keep npm fallbacks for standalone installs", () => {
  for (const tsconfigPath of ["tsconfig.json", "apps/app/tsconfig.json"]) {
    assertPathFallback(
      tsconfigPath,
      "@elizaos/app-core",
      "./node_modules/@elizaos/app-core",
    );
    assertPathFallback(
      tsconfigPath,
      "@elizaos/app-core/*",
      "./node_modules/@elizaos/app-core/*",
    );
    assertPathFallback(
      tsconfigPath,
      "@elizaos/app-lifeops",
      "./node_modules/@elizaos/app-lifeops",
    );
  }

  assertPathFallback(
    "apps/app/tsconfig.json",
    "@elizaos/capacitor-agent",
    "./node_modules/@elizaos/capacitor-agent",
  );
  assertPathFallback(
    "apps/app/tsconfig.json",
    "react",
    "./node_modules/@types/react/index.d.ts",
  );
});

test("native package resolution no longer points at the eliza checkout", () => {
  const podfile = read("eliza/packages/app-core/platforms/ios/App/Podfile");
  assert.match(podfile, /node_package_path\('@capacitor\/ios'\)/);
  assert.match(podfile, /node_package_path\('@elizaos\/capacitor-agent'\)/);
  assert.doesNotMatch(podfile, /\.\.\/\.\.\/\.\.\/\.\.\/native-plugins/);

  const nativeDeclarations = read("apps/app/src/capacitor-plugin-modules.d.ts");
  assert.doesNotMatch(
    nativeDeclarations,
    /\.\.\/\.\.\/\.\.\/eliza\/packages\/native-plugins/,
  );
});

test("Milady app declares every elizaOS app package it imports", () => {
  const appPackage = readJson("apps/app/package.json");
  const dependencies = appPackage.dependencies ?? {};

  for (const packageName of [
    "@elizaos/app-contacts",
    "@elizaos/app-phone",
    "@elizaos/app-steward",
    "@elizaos/app-task-coordinator",
    "@elizaos/app-training",
    "@elizaos/app-wifi",
  ]) {
    assert.equal(
      dependencies[packageName],
      "workspace:*",
      `${packageName} must be declared until workspace deps are rewritten for publish`,
    );
  }
});

test("CI dependency alignment covers local elizaOS streaming packages", () => {
  const alignScript = read("scripts/align-eliza-ci-node-modules.mjs");

  assert.match(alignScript, /@elizaos\/cloud-routing/);
  assert.match(alignScript, /@elizaos\/plugin-streaming/);
  assert.match(
    alignScript,
    /eliza\/packages\/agent\/node_modules\/@elizaos\/plugin-streaming/,
  );
  assert.match(
    alignScript,
    /eliza\/plugins\/plugin-streaming\/node_modules\/@elizaos\/cloud-routing/,
  );
});

test("eliza dist packaging honors Milady standalone mode", () => {
  const preparePackageDist = read("eliza/scripts/prepare-package-dist.mjs");

  assert.match(preparePackageDist, /MILADY_SKIP_LOCAL_UPSTREAMS/);
  assert.doesNotMatch(
    preparePackageDist,
    /process\.env\.ELIZA_SKIP_LOCAL_UPSTREAMS === "1" \|\|\s*process\.env\.ELIZA_SKIP_LOCAL_UPSTREAMS === "1"/,
  );
});

test("elizaOS package channel is configurable instead of alpha-only", () => {
  const helper = read("scripts/lib/eliza-package-mode.mjs");
  const disableScript = read("scripts/disable-local-eliza-workspace.mjs");
  const setupScript = read("scripts/setup-upstreams.mjs");
  const fallbackDeps = read(
    "scripts/install-published-workspace-fallback-deps.sh",
  );

  assert.match(helper, /DEFAULT_ELIZAOS_PACKAGE_DIST_TAG = "alpha"/);
  assert.match(helper, /MILADY_ELIZAOS_DIST_TAG/);
  assert.match(helper, /ELIZAOS_NPM_TAG/);
  assert.match(helper, /MILADY_ELIZAOS_VERSION/);
  assert.match(disableScript, /selectRegistryPackageVersion/);
  assert.doesNotMatch(disableScript, /\.alpha/);
  assert.match(setupScript, /getElizaosPackageSpecifier/);
  assert.doesNotMatch(setupScript, /FALLBACK_TAG = "alpha"/);
  assert.match(fallbackDeps, /ELIZAOS_PACKAGE_SPECIFIER/);
  assert.doesNotMatch(fallbackDeps, /@alpha/);
});

test("Milady-only elizaCloud bridge patch is not pinned to an alpha package", () => {
  const patchScript = read("scripts/patch-elizacloud.mjs");
  const postinstall = read("scripts/milady-postinstall-repo-setup.mjs");

  assert.match(patchScript, /distAlreadyHasBridgeFixes/);
  assert.match(patchScript, /MILADY_REQUIRE_ELIZACLOUD_BRIDGE_PATCH/);
  assert.doesNotMatch(patchScript, /PINNED_VERSION/);
  assert.doesNotMatch(patchScript, /2\.0\.0-alpha\.8/);
  assert.doesNotMatch(postinstall, /new alpha is published/);
});

test("local eliza source clone target is configurable", () => {
  const setupScript = read("scripts/setup-upstreams.mjs");
  const helper = read("scripts/lib/eliza-package-mode.mjs");

  assert.match(setupScript, /getElizaGitUrl/);
  assert.match(setupScript, /getElizaGitBranch/);
  assert.match(helper, /MILADY_ELIZA_BRANCH/);
  assert.match(helper, /MILADY_ELIZA_GIT_URL/);
});
