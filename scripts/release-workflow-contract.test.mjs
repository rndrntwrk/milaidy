import assert from "node:assert/strict";
import fs from "node:fs";
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
