import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workflow = (name) => fs.readFileSync(`.github/workflows/${name}`, "utf8");

test("canonical release workflow owns channel routing", () => {
  const release = workflow("agent-release.yml");

  assert.match(release, /^name: Release$/m);
  assert.match(release, /channel:\n\s+description: "Release channel"/);
  for (const channel of ["canary", "beta", "rc", "stable"]) {
    assert.match(release, new RegExp(`- ${channel}`));
  }
  assert.match(release, /NPM_DIST_TAG="canary"/);
  assert.match(release, /NPM_DIST_TAG="beta"/);
  assert.match(release, /NPM_DIST_TAG="rc"/);
  assert.match(release, /NPM_DIST_TAG="latest"/);
  assert.match(
    release,
    /channel: \$\{\{ needs\.version\.outputs\.channel \}\}/,
  );
  assert.match(
    release,
    /publish_packages: \$\{\{ needs\.version\.outputs\.channel != 'canary' \}\}/,
  );
});

test("distribution workflows consume the canonical channel policy", () => {
  const orchestrator = workflow("release-orchestrator.yml");
  const publishPackages = workflow("publish-packages.yml");
  const publishNpm = workflow("publish-npm.yml");
  const electrobun = workflow("release-electrobun.yml");

  assert.match(orchestrator, /channel:\n\s+description: "Release channel/);
  assert.match(orchestrator, /NPM_DIST_TAG="canary"/);
  assert.match(orchestrator, /SNAP_RELEASE="edge"/);
  assert.match(
    orchestrator,
    /canary distribution requires an alpha\/nightly version/,
  );
  assert.match(
    orchestrator,
    /snap_release: \$\{\{ needs\.prepare\.outputs\.snap_release \}\}/,
  );

  assert.match(publishPackages, /snap_release:/);
  assert.match(
    publishPackages,
    /release: \$\{\{ needs\.prepare\.outputs\.snap_release \}\}/,
  );
  assert.doesNotMatch(publishPackages, /edge,beta|stable,candidate/);

  assert.match(publishNpm, /DIST_TAG="canary"/);
  assert.match(publishNpm, /DIST_TAG="rc"/);

  assert.match(electrobun, /channel:\n\s+description: "Release channel/);
  assert.match(electrobun, /beta desktop release requires a beta version/);
  assert.match(electrobun, /BUILD_ENV="stable"/);
});

test("cloud image build stages Milady app into Dockerfile layout", () => {
  const cloudImage = workflow("build-cloud-image.yml");

  assert.match(
    cloudImage,
    /cp apps\/app\/package\.json packages\/app\/package\.json/,
  );
  assert.match(cloudImage, /cp -R apps\/app\/dist packages\/app\/dist/);
  assert.match(cloudImage, /test -f packages\/app\/package\.json/);
  assert.match(cloudImage, /test -d packages\/app\/dist/);
});

test("npm release builds generate gitignored eliza i18n data before bundling", () => {
  const release = workflow("agent-release.yml");
  const reusableNpmPublish = workflow("reusable-npm-publish.yml");

  for (const content of [release, reusableNpmPublish]) {
    assert.match(
      content,
      /node eliza\/packages\/app-core\/scripts\/ensure-shared-i18n-data\.mjs[\s\S]*?bunx tsdown/,
    );
  }
});

test("Electrobun release exposes whisper-node for upstream script layout", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(
    electrobun,
    /name: Expose whisper-node for eliza Electrobun scripts/,
  );
  assert.match(electrobun, /req\.resolve\("whisper-node\/package\.json"\)/);
  assert.match(
    electrobun,
    /ln -sfn "\$\(realpath "\$whisper_pkg"\)" eliza\/packages\/node_modules\/whisper-node/,
  );
});

test("Electrobun release uses Milady whisper cache path", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(electrobun, /~\/\.cache\/milady\/whisper/);
  assert.match(
    electrobun,
    /\$HOME\/\.cache\/milady\/whisper\/ggml-base\.en\.bin/,
  );
  assert.match(
    electrobun,
    /eliza\/packages\/node_modules\/whisper-node\/lib\/whisper\.cpp\/models\/ggml-base\.en\.bin/,
  );
});

test("Electrobun release applies Milady eliza overlay before manual build setup", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(
    electrobun,
    /name: Apply Milady eliza CI patches[\s\S]*?run: node scripts\/apply-eliza-ci-patches\.mjs[\s\S]*?name: Setup Bun/,
  );
  assert.match(
    electrobun,
    /node eliza\/packages\/app-core\/scripts\/build-patched-electrobun-cli\.mjs "\$\{\{ steps\.resolve-electrobun\.outputs\.package-dir \}\}" "\$\{\{ matrix\.platform\.artifact-name \}\}"/,
  );
});

test("Electrobun macOS release keeps one command path for both CPU architectures", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(electrobun, /"artifact-name"\s*:\s*"macos-arm64"/);
  assert.match(electrobun, /"artifact-name"\s*:\s*"macos-x64"/);
  assert.doesNotMatch(electrobun, /arch -x86_64/);
  assert.doesNotMatch(electrobun, /ELIZA_DESKTOP_COMMAND_PREFIX/);
  assert.match(
    electrobun,
    /node eliza\/packages\/app-core\/scripts\/desktop-build\.mjs stage --variant=base --build-whisper/,
  );
  assert.match(
    electrobun,
    /node eliza\/packages\/app-core\/scripts\/desktop-build\.mjs package --env=\$\{\{ needs\.prepare\.outputs\.env \}\}/,
  );
});

test("Electrobun macOS release patch signs nested native runtime binaries idempotently", () => {
  const patchScript = fs.readFileSync(
    "scripts/patch-eliza-electrobun-windows-smoke-startup.mjs",
    "utf8",
  );

  assert.match(patchScript, /sign_nested_macos_runtime_targets\(\)/);
  assert.match(
    patchScript,
    /runtime_resources_dir="\$STAGED_APP_PATH\/Contents\/Resources\/app\/eliza-dist"/,
  );
  assert.match(patchScript, /find "\$runtime_resources_dir" -type f -print0/);
  assert.match(patchScript, /file "\$candidate_path"/);
  assert.match(patchScript, /Mach-O/);
  assert.match(patchScript, /result\.text\.includes\('for tarball_pattern in/);
});

test("Electrobun macOS release patch tolerates CRLF stager checkout", (t) => {
  const tmpRepo = fs.mkdtempSync(
    path.join(os.tmpdir(), "milady-release-patch-"),
  );
  t.after(() => fs.rmSync(tmpRepo, { recursive: true, force: true }));

  const copyRepoFile = (relativePath) => {
    const destination = path.join(tmpRepo, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(relativePath, destination);
  };

  copyRepoFile("scripts/patch-eliza-electrobun-windows-smoke-startup.mjs");
  for (const relativePath of [
    "eliza/packages/app-core/platforms/electrobun/src/startup-trace.ts",
    "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    "eliza/packages/app-core/platforms/electrobun/src/native/steward.ts",
    "eliza/packages/agent/src/services/telegram-account-auth.ts",
    "eliza/packages/app-core/test/helpers/real-runtime.ts",
    "eliza/packages/app-core/platforms/electrobun/scripts/local-adhoc-sign-macos.ts",
  ]) {
    copyRepoFile(relativePath);
  }

  const stagerPath = path.join(
    tmpRepo,
    "eliza/packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh",
  );
  fs.mkdirSync(path.dirname(stagerPath), { recursive: true });
  const cleanStager = execFileSync(
    "git",
    [
      "-C",
      "eliza",
      "show",
      "20a35d6b45914605876c8b43017c831c025d0abe:packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh",
    ],
    { encoding: "utf8" },
  );
  fs.writeFileSync(stagerPath, cleanStager.replace(/\r?\n/g, "\r\n"));

  execFileSync(
    process.execPath,
    ["scripts/patch-eliza-electrobun-windows-smoke-startup.mjs"],
    { cwd: tmpRepo, stdio: "pipe" },
  );

  const patchedStager = fs.readFileSync(stagerPath, "utf8");
  assert.match(patchedStager, /retry_codesign\(\) \{/);
  assert.match(
    patchedStager,
    /for tarball_pattern in "\*-macos-\*\.app\.tar\.zst"/,
  );
  assert.match(patchedStager, /sign_nested_macos_runtime_targets\(\) \{/);
});

test("Electrobun release has a lightweight PR contract workflow", () => {
  const workflowText = workflow("test-electrobun-release.yml");

  assert.match(workflowText, /^name: Validate Electrobun Release Workflow$/m);
  assert.match(workflowText, /branches: \[main, develop\]/);
  assert.match(workflowText, /BUN_VERSION: "1\.3\.13"/);
  assert.match(
    workflowText,
    /run: bun run test:regression-matrix:release-contract/,
  );
  assert.match(workflowText, /run: bun run test:release:contract/);
});

test("Electrobun Windows smoke validates the public installer", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(electrobun, /ELIZA_WINDOWS_SMOKE_REQUIRE_INSTALLER: "1"/);
  assert.match(electrobun, /Smoke runs through the public installer/);
});

test("npm package includes app-core release helper scripts", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  assert.ok(packageJson.files.includes("eliza/packages/app-core/scripts"));
});
