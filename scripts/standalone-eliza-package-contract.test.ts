import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "vitest";

function readJson(path: string) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

function assertNoElizaWorkspaceSpecifiers(
  packageJsonPath: string,
  scopes = ["@elizaos/", "@clawville/"],
) {
  const pkg = readJson(packageJsonPath);
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "overrides",
  ]) {
    for (const [name, specifier] of Object.entries(pkg[section] ?? {})) {
      if (!scopes.some((scope) => name.startsWith(scope))) continue;
      assert.notEqual(
        specifier,
        "workspace:*",
        `${packageJsonPath} ${section}.${name} must not point at a local elizaOS workspace`,
      );
    }
  }
}

test("Milady no longer tracks eliza as a submodule", () => {
  assert.equal(fs.existsSync(".gitmodules"), false);
  assert.match(read(".gitignore"), /^\/eliza\/$/m);

  const rootPackage = readJson("package.json");
  assert.deepEqual(rootPackage.workspaces, ["apps/*"]);
  assert.equal(rootPackage.scripts.preinstall, undefined);
  assert.equal(
    rootPackage.scripts["setup:upstreams"],
    "node scripts/eliza-source-mode.mjs local --install",
  );
});

test("package manifests default to published elizaOS alpha packages", () => {
  for (const packageJsonPath of [
    "package.json",
    "apps/app/package.json",
    "apps/homepage/package.json",
  ]) {
    assertNoElizaWorkspaceSpecifiers(packageJsonPath);
  }

  const rootPackage = readJson("package.json");
  assert.equal(rootPackage.dependencies["@elizaos/app-core"], "alpha");
  assert.equal(rootPackage.dependencies["@elizaos/core"], "alpha");
  assert.equal(rootPackage.dependencies["@elizaos/agent"], "alpha");

  const appPackage = readJson("apps/app/package.json");
  assert.equal(appPackage.dependencies["@elizaos/app-core"], "alpha");
  assert.equal(appPackage.dependencies["@elizaos/shared"], "alpha");
});

test("root build resolves app-core entries from packages by default", () => {
  const helper = read("scripts/lib/eliza-package-mode.mjs");
  const resolver = read("scripts/lib/resolve-eliza-app-core-script.mjs");
  const tsdownConfig = read("tsdown.config.ts");

  assert.match(helper, /DEFAULT_ELIZA_SOURCE_MODE = "packages"/);
  assert.match(resolver, /preferLocal && existsSync/);
  assert.match(tsdownConfig, /"packages"/);
  assert.match(tsdownConfig, /require\.resolve\(packageSubpath\)/);
  assert.doesNotMatch(tsdownConfig, /entry:\s*["']eliza\/packages\/app-core/);
});

test("app TypeScript aliases do not prefer the local eliza checkout", () => {
  for (const tsconfigPath of [
    "apps/app/tsconfig.json",
    "apps/homepage/tsconfig.json",
  ]) {
    const source = read(tsconfigPath);
    assert.doesNotMatch(source, /"\.\/eliza\//);
    assert.doesNotMatch(source, /"\.\.\/\.\.\/eliza\//);
  }

  const appTsconfig = readJson("apps/app/tsconfig.json");
  assert.deepEqual(appTsconfig.compilerOptions.paths["@elizaos/app-core"], [
    "./node_modules/@elizaos/app-core",
  ]);
  assert.deepEqual(appTsconfig.compilerOptions.paths["@elizaos/app-lifeops"], [
    "./apps/app/src/optional-eliza-app-stub.tsx",
  ]);
  assert.deepEqual(
    appTsconfig.compilerOptions.paths["@elizaos/capacitor-agent"],
    ["./apps/app/src/native-plugin-stubs.ts"],
  );
});

test("vite only uses local eliza when local source mode is explicit", () => {
  const viteConfig = read("apps/app/vite.config.ts");

  assert.match(viteConfig, /function shouldUseLocalElizaSource/);
  assert.match(viteConfig, /MILADY_ELIZA_SOURCE/);
  assert.match(viteConfig, /"packages"/);
  assert.match(viteConfig, /optionalElizaAppStubEntry/);
  assert.match(viteConfig, /nativePluginStubEntry/);
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

test("local eliza source clone target remains explicit and configurable", () => {
  const sourceModeScript = read("scripts/eliza-source-mode.mjs");
  const setupScript = read("scripts/setup-upstreams.mjs");
  const helper = read("scripts/lib/eliza-package-mode.mjs");

  assert.match(sourceModeScript, /local \[--install\]/);
  assert.match(setupScript, /getElizaGitUrl/);
  assert.match(setupScript, /getElizaGitBranch/);
  assert.match(helper, /MILADY_ELIZA_BRANCH/);
  assert.match(helper, /MILADY_ELIZA_GIT_URL/);
});
