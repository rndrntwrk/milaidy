import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("cloud agent image publishes under the repository owner", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /IMAGE_NAME: \$\{\{ github\.repository_owner \}\}\/milaidy-agent/,
    "GHCR image ownership must follow the repository owner",
  );
  assert.doesNotMatch(
    workflow,
    /IMAGE_NAME:\s*milady-ai\//,
    "the RNDRNTWRK workflow must not publish to an unrelated GHCR namespace",
  );
});

test("manual cloud builds checkout the exact requested Alice revision", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(workflow, /source_sha:\n\s+description: "Exact Alice commit to build"/);
  assert.match(workflow, /SOURCE_REF: \$\{\{ inputs\.source_sha \|\|/);
  assert.match(workflow, /id: source_revision[\s\S]*?git rev-parse HEAD/);
  assert.match(
    workflow,
    /REVISION=\$\{\{ steps\.source_revision\.outputs\.sha \}\}/,
  );
  assert.match(
    workflow,
    /EXPECTED_REVISION: \$\{\{ steps\.source_revision\.outputs\.sha \}\}/,
  );
});

test("exact Alice revision builds cannot inherit the legacy fleet rollout path", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /Require isolated Alice candidate mode[\s\S]*?github\.event_name == 'workflow_dispatch'[\s\S]*?inputs\.source_sha != ''[\s\S]*?inputs\.skip_rollout != true[\s\S]*?exit 1/,
    "an exact source_sha must fail closed unless skip_rollout=true",
  );
});

test("exact-image qualification reserves the bounded smoke window", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /jobs:\n  build:\n    name: Build cloud agent image\n    runs-on: ubuntu-24\.04\n    timeout-minutes: 60/,
    "the job must retain enough time for the separately bounded candidate smoke",
  );
  assert.match(
    workflow,
    /- name: Smoke exact candidate image[\s\S]*?timeout-minutes: 10/,
    "candidate runtime smoke must keep its independent ten-minute ceiling",
  );
});

test("privileged Alice image publication accepts only the exact protected release head", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /Checkout[\s\S]*?persist-credentials: false[\s\S]*?Require exact protected Alice release head/,
    "checkout credentials must be removed before any repository-owned code executes",
  );
  assert.match(
    workflow,
    /PROTECTED_ALICE_REF: refs\/heads\/release\/alice-production-core-2026-08-22[\s\S]*?REQUESTED_SOURCE_SHA[\s\S]*?GITHUB_REF[\s\S]*?GITHUB_SHA/,
    "manual source builds must bind the requested SHA to the protected release head",
  );
  const gate = workflow.indexOf("- name: Require exact protected Alice release head");
  const setup = workflow.indexOf("- name: Setup Node.js 24");
  const hydrate = workflow.indexOf("- name: Hydrate Alice runtime avatar assets");
  assert.ok(gate >= 0 && gate < setup && gate < hydrate);
});

test("Alice release dispatch cannot fall through to cloud main or fleet rollout", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /Enforce Alice release dispatch contract[\s\S]*?github\.ref == 'refs\/heads\/release\/alice-production-core-2026-08-22'[\s\S]*?inputs\.source_sha == ''[\s\S]*?inputs\.skip_rollout != true[\s\S]*?exit 1/,
  );
});

test("cloud builds hydrate and validate Alice's runtime avatar assets before Vite", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const hydrateAssets = workflow.indexOf("- name: Hydrate Alice runtime avatar assets");
  const validateAssets = workflow.indexOf("- name: Validate Alice runtime avatar assets");
  const buildUi = workflow.indexOf("- name: Build UI (vite)");

  assert.ok(hydrateAssets >= 0, "the cloud build must hydrate Git LFS avatar bytes");
  assert.ok(validateAssets > hydrateAssets, "asset validation must follow hydration");
  assert.ok(buildUi > validateAssets, "Vite must only package validated avatar bytes");
  assert.match(
    workflow.slice(hydrateAssets, validateAssets),
    /git lfs pull --include="apps\/app\/public\/vrms\/\*\.vrm\.gz" --exclude=""/,
    "the build must hydrate only the runtime-compressed VRM set",
  );
  assert.match(
    workflow.slice(validateAssets, buildUi),
    /node scripts\/validate-cloud-avatar-assets\.mjs/,
    "the hydrated files must pass the fail-closed binary asset validator",
  );
});

test("cloud builds hydrate the tracked Eliza commit from the protected Alice fork", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(workflow, /eliza_sha="\$\(git ls-tree HEAD eliza \| awk '\{print \$3\}'\)"/);
  assert.match(
    workflow,
    /git clone --no-checkout --filter=blob:none https:\/\/github\.com\/rndrntwrk\/eliza\.git eliza/,
  );
  assert.match(workflow, /git -C eliza fetch --depth=1 origin "\$eliza_sha"/);
  assert.match(workflow, /expected_eliza_sha="e219c232e21d8b61017129647130830d811ee45a"/);
  assert.match(
    workflow,
    /git -C eliza fetch --depth=1 origin refs\/heads\/alice\/runtime-stable-2026-08-22:refs\/remotes\/origin\/alice\/runtime-stable-2026-08-22/,
  );
  assert.match(workflow, /test "\$eliza_sha" = "\$protected_eliza_sha"/);
  assert.match(workflow, /git -C eliza checkout --detach "\$eliza_sha"/);
  assert.match(workflow, /test "\$\(git -C eliza rev-parse HEAD\)" = "\$eliza_sha"/);
  assert.match(workflow, /alice\/runtime-stable-2026-08-22/);
  assert.doesNotMatch(workflow, /MILADY_ELIZA_BRANCH/);
  assert.doesNotMatch(workflow, /eliza submodule init failed, continuing/);
});

test("published Alice images carry SBOM and verifiable provenance", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  assert.match(workflow, /provenance: mode=max/);
  assert.match(workflow, /sbom: true/);
  assert.match(
    workflow,
    /permissions:[\s\S]*?id-token: write[\s\S]*?attestations: write/,
    "GitHub artifact attestation requires both OIDC and attestation write authority",
  );
  assert.match(
    workflow,
    /actions\/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a[\s\S]*?subject-digest: \$\{\{ steps\.cloud-image\.outputs\.digest \}\}[\s\S]*?push-to-registry: true/,
  );
  assert.doesNotMatch(workflow, /provenance: false/);
});

test("Alice production base images are immutable reviewed manifests", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  assert.match(
    dockerfile,
    /FROM oven\/bun:1\.3\.14@sha256:50317d83cd5a5ae1d8b35b3379c69f57ce1a0dbf4def91f0965653d767851834 AS bun-runtime/,
  );
  assert.equal(
    dockerfile.match(
      /FROM node:24\.19\.0-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848/g,
    )?.length,
    2,
  );
  assert.match(
    dockerfile,
    /FROM python:3\.11\.13-slim-bookworm@sha256:cec9aa7aa96eea4fa036e9b82be1e6b325f2e3707f462d885868df51ec0a4b47 AS python-runtime/,
  );
  assert.match(dockerfile, /COPY --from=python-runtime \/usr\/local \/usr\/local/);
  assert.match(
    dockerfile,
    /node deploy\/modal\/write_alice_runtime_build_manifest\.mjs/,
  );
  assert.doesNotMatch(dockerfile, /^FROM (?:node|oven\/bun):[^@\n]+$/m);
});

test("Alice Worker builds install the lockfile-pinned Wrangler at the repository root", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const lockfile = fs.readFileSync(path.join(repoRoot, "bun.lock"), "utf8");
  const rootImporter = lockfile.slice(0, lockfile.indexOf('\n    "apps/app":'));

  assert.equal(packageJson.devDependencies?.wrangler, "4.122.0");
  assert.match(
    rootImporter,
    /"devDependencies": \{[\s\S]*?"wrangler": "4\.122\.0"/,
    "the root lockfile importer must materialize node_modules/.bin/wrangler",
  );
});

test("Alice Worker typechecks generate exact Cloudflare binding declarations first", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const controlTypes = workflow.indexOf(
    "--config workers/alice-production-control/wrangler.jsonc",
  );
  const accessTypes = workflow.indexOf(
    "--config workers/alice-access-gateway/wrangler.jsonc",
  );
  const controlTypecheck = workflow.indexOf(
    "bun x tsc --project workers/alice-production-control/tsconfig.json --noEmit",
  );
  const accessTypecheck = workflow.indexOf(
    "bun x tsc --project workers/alice-access-gateway/tsconfig.json --noEmit",
  );

  assert.match(
    workflow,
    /\.\/node_modules\/\.bin\/wrangler types[\s\S]*?--env-interface AliceEnv[\s\S]*?workers\/alice-production-control\/worker-configuration\.d\.ts/,
  );
  assert.match(
    workflow,
    /\.\/node_modules\/\.bin\/wrangler types[\s\S]*?--env-interface AliceAccessGatewayBindings[\s\S]*?workers\/alice-access-gateway\/worker-configuration\.d\.ts/,
  );
  assert.ok(controlTypes >= 0 && controlTypes < controlTypecheck);
  assert.ok(accessTypes >= 0 && accessTypes < accessTypecheck);
});

test("protected Alice qualification verifies provider identity and exact Worker bundles", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  for (const testFile of [
    "deploy/modal/alice_production_acceptance.test.ts",
    "deploy/modal/alice_program_signing_key.test.mjs",
    "deploy/modal/alice_terminal_publication.test.mjs",
    "deploy/modal/alice_cloudflare_live_readback.test.mjs",
    "deploy/modal/alice_cloudflare_provider_config.test.mjs",
    "deploy/modal/alice_cloudflare_provider_readback.test.mjs",
    "deploy/modal/alice_cloudflare_release.test.mjs",
    "deploy/modal/alice_modal_safe_bootstrap.test.mjs",
    "deploy/modal/alice_recovery_credential_binding.test.mjs",
    "deploy/modal/alice_release_deadline.test.mjs",
    "deploy/modal/alice_worker_bundle_artifact.test.mjs",
    "scripts/deploy-alice-cloudflare-workflow.test.mjs",
  ]) {
    assert.ok(workflow.includes(testFile), `missing protected test ${testFile}`);
  }
  assert.match(
    workflow,
    /python3 -m unittest[\s\S]*?deploy\.modal\.test_alice_safe_bootstrap/,
    "protected qualification must exercise the safe bootstrap provider contract",
  );
  assert.match(
    workflow,
    /Build exact Alice Worker bundles[\s\S]*?\.\/node_modules\/\.bin\/wrangler --version[\s\S]*?test "\$wrangler_version" = "4\.122\.0"[\s\S]*?\.\/node_modules\/\.bin\/wrangler deploy[\s\S]*?--dry-run[\s\S]*?alice_worker_bundle_artifact\.mjs/,
  );
  const manifestSource = fs.readFileSync(
    path.join(repoRoot, "deploy/modal/alice_deployment_manifest.mjs"),
    "utf8",
  );
  assert.match(manifestSource, /fetchAliceCloudflareProviderState/);
  assert.match(manifestSource, /CLOUDFLARE_API_TOKEN/);
  assert.match(manifestSource, /verifyAliceWorkerBundleArtifact/);
  assert.doesNotMatch(manifestSource, /ALICE_ACCESS_POLICY_READBACK_PATH/);
  assert.doesNotMatch(manifestSource, /ALICE_AI_GATEWAY_PROVIDER_READBACK_PATH/);
  assert.doesNotMatch(manifestSource, /ALICE_ACCESS_WORKER_BUNDLE_SHA256/);
  assert.doesNotMatch(workflow, /bun x wrangler@/);
  assert.match(
    workflow,
    /Upload immutable Alice Worker bundle artifact[\s\S]*?actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02[\s\S]*?overwrite: false[\s\S]*?include-hidden-files: false/,
  );
  assert.match(
    workflow,
    /Attest exact Alice Worker bundle provenance[\s\S]*?subject-path: \$\{\{ steps\.worker_bundles\.outputs\.root \}\}\/\*\*\/\*/,
  );
  assert.match(
    workflow,
    /Remove runner-local Worker bundle staging directory[\s\S]*?"\$RUNNER_TEMP"\/alice-worker-bundles\.\*/,
  );
});

test("cloud release actions are pinned to immutable revisions", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  for (const revision of [
    "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
    "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
    "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
    "actions/cache@caa296126883cff596d87d8935842f9db880ef25",
    "docker/setup-buildx-action@37fe631027851001ddb9b187196cc803df7f5f0e",
    "docker/login-action@dbcb813823bdd20940b903addbd779551569679f",
    "docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a",
    "actions/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  ]) {
    assert.ok(workflow.includes(revision), `missing immutable action pin ${revision}`);
  }
  assert.doesNotMatch(
    workflow,
    /uses:\s+(?:actions|docker|oven-sh)\/[a-z0-9-]+@v\d+/i,
  );
});

test("qualifies the plugin resolver after its pinned runtime closure is built", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const earlyQualification = workflow.indexOf(
    "- name: Qualify Alice production-core contracts",
  );
  const coreBuild = workflow.indexOf("- name: Build @elizaos/core");
  const sharedBuild = workflow.indexOf("- name: Build @elizaos/shared");
  const skillsBuild = workflow.indexOf("- name: Build @elizaos/skills");
  const vaultBuild = workflow.indexOf("- name: Build @elizaos/vault");
  const pluginBuild = workflow.indexOf(
    "- name: Build @elizaos/plugin-agent-skills",
  );
  const closureEnd = workflow.indexOf("- name: Build @elizaos/plugin-wallet");
  const resolverQualification = workflow.indexOf(
    "- name: Qualify Alice runtime plugin resolver",
  );
  const runtimeBuild = workflow.indexOf("- name: Build runtime (tsdown)");
  assert.ok(
    earlyQualification >= 0 &&
      coreBuild > earlyQualification &&
      sharedBuild > coreBuild &&
      skillsBuild > sharedBuild &&
      vaultBuild > skillsBuild &&
      pluginBuild > vaultBuild &&
      closureEnd > pluginBuild &&
      resolverQualification > closureEnd &&
      runtimeBuild > resolverQualification,
  );
  const earlyBlock = workflow.slice(earlyQualification, coreBuild);
  assert.doesNotMatch(earlyBlock, /runtime\/plugin-resolver\.test\.ts/);
  const resolverBlock = workflow.slice(resolverQualification, runtimeBuild);
  assert.match(
    resolverBlock,
    /bun test packages\/agent\/src\/runtime\/plugin-resolver\.test\.ts/,
  );
});

test("the exact-image smoke proves Alice's production runtime authority boundary", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  assert.match(workflow, /deploy\/modal\/alice-denied-plugins\.txt/);
  assert.match(workflow, /ELIZA_SKIP_PLUGINS/);
  assert.match(workflow, /ALICE_RUNTIME_AUTHORITY_MODE=proposer-only/);
  assert.match(workflow, /\/api\/alice-production\/proof/);
  assert.match(workflow, /verify_alice_runtime_boundary\.mjs/);
  assert.match(workflow, /verify_alice_runtime_build_manifest\.mjs/);
  assert.match(workflow, /ALICE_RUNTIME_BUILD_MANIFEST_SHA256/);
  assert.match(workflow, /ALICE_EXACT_IMAGE_RESPONSE_ONLY_OK/);
  assert.match(workflow, /alice\.chat-boundary\.v1/);
  assert.match(workflow, /alice_smoke_model_server\.mjs/);
  assert.match(workflow, /ALICE_PRODUCTION_MUTATION_DENIED/);
  assert.match(workflow, /ALICE_DURABLE_CHAT_INGRESS_REQUIRED/);
  for (const forbiddenPath of [
    "/api/plugins/install",
    "/api/wallet/import",
    "/api/wallet/trade/execute",
    "/api/stream/start",
    "/api/terminal/run",
    "/api/wallet/keys",
    "/api/onboarding/status",
    "/api/secrets",
    "/api/broadcast/alice-cam/scene",
  ]) {
    assert.ok(workflow.includes(forbiddenPath), `missing live deny probe ${forbiddenPath}`);
  }
});

test("cloud builds port Alice's operator bridge before compiling the official agent", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const portBridge = workflow.indexOf("- name: Port Alice operator bridge");
  const buildAgent = workflow.indexOf("- name: Build @elizaos/agent");
  const buildRuntime = workflow.indexOf("- name: Build runtime (tsdown)");

  assert.ok(portBridge >= 0, "the operator bridge port step must exist");
  assert.match(
    workflow.slice(portBridge, buildAgent),
    /node scripts\/port-alice-operator-bridge\.mjs/,
    "the port step must use the checked-in fail-closed bridge tool",
  );
  assert.ok(
    buildAgent > portBridge && buildRuntime > portBridge,
    "the official agent and root runtime must compile only after the bridge is ported",
  );
});

test("cloud builds port and materialize Alice product plugins before runtime compilation", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  const productPort = workflow.indexOf("- name: Port Alice product plugins");
  const buildAgent = workflow.indexOf("- name: Build @elizaos/agent");
  const buildRuntime = workflow.indexOf("- name: Build runtime (tsdown)");

  assert.ok(productPort >= 0, "the product plugin port step must exist");
  assert.match(
    workflow.slice(productPort, buildAgent),
    /node scripts\/port-alice-product-plugins\.mjs/,
  );
  assert.ok(buildAgent > productPort && buildRuntime > productPort);
  assert.match(
    dockerfile,
    /node_modules\/@rndrntwrk\/plugin-555stream[\s\S]*packages\/plugin-555stream\/src/,
    "the canonical Stream and Ads plugin must be a physical runtime package",
  );
  assert.match(
    dockerfile,
    /node_modules\/@miladyai\/agent[\s\S]*packages\/agent\/src/,
    "the Arcade subpath must resolve through a physical Alice agent package",
  );
});

test("staging and manual no-rollout builds smoke the exact image and always tear it down", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /id: cloud-image[\s\S]*?uses: docker\/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a/,
    "the published image step must expose its immutable digest",
  );
  assert.match(
    workflow,
    /Smoke exact candidate image[\s\S]*?build_environment == 'staging'[\s\S]*?github\.event_name == 'workflow_dispatch'[\s\S]*?inputs\.skip_rollout == true[\s\S]*?steps\.cloud-image\.outputs\.digest/,
    "staging and manual no-rollout builds must smoke the exact digest returned by the publisher",
  );
  assert.match(
    workflow,
    /org\.opencontainers\.image\.revision[\s\S]*?EXPECTED_REVISION/,
    "the smoke must bind the image revision label to the workflow SHA",
  );
  assert.match(
    workflow,
    /Cleanup candidate smoke container[\s\S]*?always\(\)[\s\S]*?build_environment == 'staging'[\s\S]*?github\.event_name == 'workflow_dispatch'[\s\S]*?inputs\.skip_rollout == true[\s\S]*?docker rm -f/,
    "the disposable candidate container must be removed even after failure",
  );
  assert.match(
    workflow,
    /--env ELIZA_AUTH_DISABLED=0[\s\S]*?--env MILADY_API_TOKEN=alice-cloud-smoke-runtime-token[\s\S]*?\/api\/emotes[\s\S]*?dance-happy/,
    "the exact image smoke must reject a runtime missing Alice's VRM emote route",
  );
});

test("manual no-rollout canaries do not move the stable latest image tag", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const determineVersion = workflow.match(
    /- name: Determine version[\s\S]*?- name: Load deploy config/,
  )?.[0];
  const publishImage = workflow.match(
    /- name: Build and push Docker image[\s\S]*?- name: Smoke exact candidate image/,
  )?.[0];

  assert.ok(determineVersion, "the cloud build must determine candidate tag policy");
  assert.ok(publishImage, "the cloud image publisher must exist");
  assert.match(
    determineVersion,
    /github\.event_name[^\n]*workflow_dispatch[\s\S]*inputs\.skip_rollout[^\n]*true[\s\S]*PUBLISH_LATEST="false"/,
  );
  assert.match(
    publishImage,
    /steps\.version\.outputs\.publish_latest == 'true'[\s\S]*steps\.version\.outputs\.latest_tag/,
    "the moving latest tag must be omitted for an unapproved canary",
  );
});

test("manual version input cannot inject shell into the privileged image job", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const start = workflow.indexOf("- name: Determine version");
  const end = workflow.indexOf("- name: Load deploy config", start);
  const step = workflow.slice(start, end);
  const run = step.slice(step.indexOf("run: |"));
  assert.match(step, /ALICE_INPUT_VERSION: \$\{\{ inputs\.version \}\}/);
  assert.doesNotMatch(run, /\$\{\{ inputs\.version \}\}/);
  assert.match(
    run,
    /\^\[0-9\]\{1,6\}\\\.\[0-9\]\{1,6\}\\\.\[0-9\]\{1,6\}/,
  );
  assert.match(run, /printf '%s' "\$ALICE_INPUT_VERSION"/);
});

test("cloud builds bind both server and browser bundles to Alice app-core", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const runtimeBuild = workflow.match(
    /- name: Build runtime \(tsdown\)[\s\S]*?- name: Determine version/,
  )?.[0];
  const browserBuild = workflow.match(
    /- name: Build UI \(vite\)[\s\S]*?- name: Set up CI dockerignore/,
  )?.[0];

  assert.ok(runtimeBuild, "the server runtime build step must exist");
  assert.ok(browserBuild, "the browser build step must exist");
  assert.match(
    runtimeBuild,
    /MILADY_ELIZA_APP_CORE_ROOT:\s*packages\/app-core/,
    "the server bundle must use Alice's app-core rather than the hydrated upstream checkout",
  );
  assert.match(
    browserBuild,
    /MILADY_ELIZA_APP_CORE_ROOT:\s*packages\/app-core/,
    "the browser bundle must use Alice's app-core rather than the hydrated upstream checkout",
  );
});

test("candidate image smoke proves public broadcast is disabled and VRM bytes remain valid", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const smokeStep = workflow.match(
    /- name: Smoke exact candidate image[\s\S]*?- name: Cleanup candidate smoke container/,
  )?.[0];

  assert.ok(smokeStep, "candidate image smoke step must exist");
  assert.match(smokeStep, /\/broadcast\/alice-cam/);
  assert.match(smokeStep, /broadcastResponse\.status !== 401/);
  assert.doesNotMatch(smokeStep, /data-broadcast-shell/);
  assert.match(smokeStep, /\/vrms\/milady-9\.vrm\.gz/);
  assert.match(smokeStep, /gunzipSync/);
  assert.match(smokeStep, /glTF/);
});

test("cloud agent build keeps the checked-out Eliza workspace available", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const initStart = workflow.indexOf("- name: Init submodules");
  const installStart = workflow.indexOf("- name: Install dependencies");

  assert.ok(initStart >= 0, "Init submodules step must exist");
  assert.ok(
    installStart > initStart,
    "immutable dependency install must follow submodule initialization",
  );
  assert.doesNotMatch(
    workflow.slice(initStart, installStart),
    /disable-local-eliza-workspace\.mjs/,
    "the init step must not remove Eliza before workspace restoration",
  );
  assert.doesNotMatch(
    workflow.slice(initStart, installStart),
    /Restore build-critical workspaces|fs\.writeFileSync\("package\.json"/,
    "CI must not rewrite the committed workspace graph before frozen install",
  );
});

test("Alice image hydrates only its exact Eliza gitlink and excludes unadmitted contract trees", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const initStart = workflow.indexOf("- name: Init submodules");
  const installStart = workflow.indexOf("- name: Install dependencies");
  const initStep = workflow.slice(initStart, installStart);
  const dockerignoreStart = workflow.indexOf("- name: Set up CI dockerignore");
  const buildxStart = workflow.indexOf("- name: Set up Docker Buildx");
  const dockerignoreStep = workflow.slice(dockerignoreStart, buildxStart);
  const smokeStart = workflow.indexOf("- name: Smoke exact candidate image");
  const cleanupStart = workflow.indexOf("- name: Cleanup candidate smoke container");
  const smokeStep = workflow.slice(smokeStart, cleanupStart);

  assert.match(initStep, /git ls-tree HEAD eliza/);
  assert.match(initStep, /checkout --detach "\$eliza_sha"/);
  assert.doesNotMatch(initStep, /scripts\/init-submodules\.mjs/);
  assert.doesNotMatch(initStep, /\|\|\s*(?:echo|true)/);
  assert.match(dockerignoreStep, /echo 'steward-fi' >> \.dockerignore/);
  assert.match(dockerignoreStep, /echo 'test\/contracts' >> \.dockerignore/);
  assert.match(smokeStep, /test ! -e \/app\/steward-fi/);
  assert.match(smokeStep, /test ! -e \/app\/test\/contracts/);
});

test("Alice root has no exact workspace paths removed by latest Eliza", () => {
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const missing = rootPackage.workspaces.filter(
    (workspace) =>
      !workspace.startsWith("!") &&
      !workspace.includes("*") &&
      !fs.existsSync(path.join(repoRoot, workspace, "package.json")),
  );

  assert.deepEqual(missing, [], `missing exact workspaces: ${missing.join(", ")}`);
});

test("Alice frozen install retains its reviewed BlueBubbles workspace when pinned Eliza omits it", () => {
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const localBlueBubbles = path.join(
    repoRoot,
    "plugins/plugin-bluebubbles/typescript/package.json",
  );
  const pinnedElizaBlueBubbles = path.join(
    repoRoot,
    "eliza/plugins/plugin-bluebubbles/package.json",
  );
  const lockfile = fs.readFileSync(path.join(repoRoot, "bun.lock"), "utf8");

  assert.equal(
    rootPackage.dependencies["@elizaos/plugin-bluebubbles"],
    "workspace:*",
  );
  assert.ok(fs.existsSync(localBlueBubbles));
  assert.equal(fs.existsSync(pinnedElizaBlueBubbles), false);
  assert.ok(rootPackage.workspaces.includes("plugins/plugin-*/typescript"));
  assert.equal(
    rootPackage.workspaces.includes("!plugins/plugin-bluebubbles/typescript"),
    false,
  );
  assert.match(
    lockfile,
    /"@elizaos\/plugin-bluebubbles@workspace:plugins\/plugin-bluebubbles\/typescript"/,
  );
});

test("cloud agent build pins the reviewed Node patch and locked tsdown binary", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaCore = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "eliza/packages/core/package.json"),
      "utf8",
    ),
  );
  const requiredMajor = elizaCore.engines?.node?.match(/>=\s*(\d+)/)?.[1];
  const pinnedNode = "24.19.0";

  assert.ok(requiredMajor, "pinned Eliza must declare a minimum Node major");
  assert.equal(
    pinnedNode.split(".")[0],
    requiredMajor,
    "reviewed Node patch must satisfy the pinned Eliza major",
  );
  assert.match(
    workflow,
    new RegExp(`node-version: ["']${pinnedNode.replaceAll(".", "\\.")}["']`),
    `cloud agent build must use reviewed Node ${pinnedNode}`,
  );
  const runtimeBuild = workflow.match(
    /- name: Build runtime \(tsdown\)[\s\S]*?- name: Determine version/,
  )?.[0] ?? "";
  assert.match(runtimeBuild, /\.\/node_modules\/\.bin\/tsdown/);
  assert.doesNotMatch(runtimeBuild, /\bnpx\b/);

  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  assert.match(
    dockerfile,
    new RegExp(
      `^FROM node:${requiredMajor}\\.\\d+\\.\\d+-bookworm-slim@sha256:[a-f0-9]{64} AS pruner$`,
      "m",
    ),
    `cloud runtime image must use immutable Node ${requiredMajor} required by pinned Eliza`,
  );
});

test("cloud agent build uses the Bun version required by pinned Eliza", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const elizaPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "eliza/package.json"), "utf8"),
  );
  const requiredVersion = elizaPackage.packageManager?.match(/^bun@(.+)$/)?.[1];

  assert.ok(requiredVersion, "pinned Eliza must declare its Bun version");
  assert.equal(
    rootPackage.packageManager,
    `bun@${requiredVersion}`,
    "Alice and pinned Eliza must use one Bun version",
  );
  assert.match(
    workflow,
    new RegExp(`bun-version: ["']${requiredVersion.replaceAll(".", "\\.")}["']`),
    `cloud build must use Bun ${requiredVersion} required by pinned Eliza`,
  );

  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  assert.match(
    dockerfile,
    new RegExp(
      `^FROM oven/bun:${requiredVersion.replaceAll(".", "\\.")}@sha256:[a-f0-9]{64} AS bun-runtime$`,
      "m",
    ),
    `cloud runtime image must use immutable Bun ${requiredVersion} required by pinned Eliza`,
  );
});

test("cloud agent frozen install accepts the current Eliza layout", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaApps = path.join(repoRoot, "eliza/apps");

  assert.equal(
    fs.existsSync(elizaApps),
    false,
    "the pinned official Eliza checkout should exercise its apps-free layout",
  );
  assert.match(
    workflow,
    /bun install --ignore-scripts --frozen-lockfile/,
    "cloud build must install the committed lock without manifest mutation",
  );
  assert.match(
    workflow,
    /cd eliza\n\s+bun install --ignore-scripts --frozen-lockfile/,
    "cloud build must materialize the pinned Eliza workspace from its own lock",
  );
  assert.doesNotMatch(
    workflow,
    /bun run postinstall/,
    "cloud build must not apply legacy patches to the pinned official Eliza tree",
  );
  assert.doesNotMatch(
    workflow,
    /npm view .*dist\.tarball/,
    "cloud build must not replace locked dependencies with registry-latest tarballs",
  );
  assert.doesNotMatch(
    workflow,
    /eliza\/packages\/schemas|build had errors/,
    "cloud build must use current package scripts and fail closed on build errors",
  );
  assert.match(
    workflow,
    /cd eliza\/packages\/core\n\s+bun run build/,
    "cloud build must invoke the current Eliza core build script",
  );
  assert.match(
    workflow,
    /echo '!deploy\/cloud-agent-template' >> \.dockerignore/,
    "Docker context must retain the explicitly declared cloud-agent-template workspace",
  );
  assert.match(
    workflow,
    /echo '!deploy\/modal\/verify_alice_runtime_build_manifest\.mjs' >> \.dockerignore/,
    "Docker context must retain the runtime build verifier embedded in the image",
  );
  assert.match(
    workflow,
    /echo '!apps\/homepage' >> \.dockerignore/,
    "Docker context must retain the apps wildcard workspace that exists in this checkout",
  );
  assert.match(
    workflow,
    /echo '!eliza\/packages\/examples' >> \.dockerignore/,
    "Docker context must retain pinned Eliza example workspaces for frozen resolution",
  );
});

test("cloud agent image does not copy removed Eliza apps", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  assert.doesNotMatch(
    dockerfile,
    /\bcp(?: -a)? eliza\/apps\//,
    "image assembly must not require packages removed from official Eliza",
  );
  assert.doesNotMatch(
    dockerfile,
    /npm view .*dist\.tarball|https\.get\(/,
    "image assembly must never replace locked packages with registry-latest tarballs",
  );
  assert.equal(
    dockerfile.match(/const v = '\$\{VERSION_CLEAN\}';/g)?.length,
    1,
    "image version patch must remain valid JavaScript",
  );

  const elizaPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "eliza/package.json"), "utf8"),
  );
  const requiredBun = elizaPackage.packageManager?.match(/^bun@(.+)$/)?.[1];
  assert.ok(requiredBun, "pinned Eliza must declare a Bun version");
  assert.match(
    dockerfile,
    new RegExp(
      `FROM oven/bun:${requiredBun.replaceAll(".", "\\.")}@sha256:[a-f0-9]{64} AS bun-runtime`,
    ),
    "image build must source Bun from an immutable versioned image",
  );
  assert.match(
    dockerfile,
    /RUN bun install --ignore-scripts --frozen-lockfile/,
    "image build must materialize runtime packages from the committed lock",
  );
  assert.doesNotMatch(
    dockerfile,
    /requiredLockedPackages[\s\S]*?['"]jsonrepair['"]/,
    "image checks must not retain the removed pre-beta.7 Anthropic dependency",
  );
});

test("cloud agent builds pinned Eliza UI assets before Alice web", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaUiBuild = workflow.indexOf("cd eliza/packages/ui\n          bun run build");
  const aliceWebBuild = workflow.indexOf("cd apps/app\n          bun run build:web");

  assert.ok(elizaUiBuild >= 0, "cloud build must materialize @elizaos/ui dist assets");
  assert.ok(
    aliceWebBuild > elizaUiBuild,
    "Alice web build must run after pinned Eliza UI assets exist",
  );
});

test("cloud agent builds pinned Eliza app-core assets before Alice web", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaAppCoreBuild = workflow.indexOf(
    "cd eliza/packages/app-core\n          bun run build",
  );
  const aliceWebBuild = workflow.indexOf("cd apps/app\n          bun run build:web");

  assert.ok(
    elizaAppCoreBuild >= 0,
    "cloud build must materialize @elizaos/app-core dist assets",
  );
  assert.ok(
    aliceWebBuild > elizaAppCoreBuild,
    "Alice web build must run after pinned Eliza app-core assets exist",
  );
});

test("cloud agent builds official Eliza runtime plugins used by Alice", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const agentSkillsBuild = workflow.indexOf(
    "cd eliza/plugins/plugin-agent-skills\n          bun run build",
  );
  const anthropicBuild = workflow.indexOf(
    "cd eliza/plugins/plugin-anthropic\n          bun run build",
  );
  const dockerBuild = workflow.indexOf("- name: Build and push Docker image");

  assert.ok(agentSkillsBuild >= 0, "official agent-skills plugin must be built");
  assert.ok(anthropicBuild >= 0, "official Anthropic plugin must be built");
  assert.ok(
    dockerBuild > agentSkillsBuild && dockerBuild > anthropicBuild,
    "official runtime plugins must be built before image assembly",
  );
});

test("cloud image retains the latest Eliza auth runtime closure", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const pruner = fs.readFileSync(
    path.join(repoRoot, "scripts/cloud-image-prune-deps.mjs"),
    "utf8",
  );

  const sharedBuild = workflow.indexOf(
    "cd eliza/packages/shared\n          bun run build",
  );
  const vaultBuild = workflow.indexOf(
    "cd eliza/packages/vault\n          bun run build",
  );
  const authBuild = workflow.indexOf(
    "cd eliza/packages/auth\n          bun run build",
  );
  const dockerBuild = workflow.indexOf("- name: Build and push Docker image");

  assert.ok(sharedBuild >= 0, "official shared package must be built");
  assert.ok(vaultBuild > sharedBuild, "vault must be built after shared");
  assert.ok(authBuild > vaultBuild, "auth must be built after its vault dependency");
  assert.ok(dockerBuild > authBuild, "auth must exist before image assembly");
  assert.match(pruner, /"eliza\/packages\/auth"/);
  assert.match(pruner, /"eliza\/packages\/vault"/);
  assert.match(pruner, /"@elizaos\/auth"/);
  assert.match(pruner, /"@elizaos\/vault"/);
});

test("cloud image retains the official Eliza plugins statically imported by Alice", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  const runtimeBuild = workflow.indexOf("- name: Build runtime (tsdown)");
  for (const plugin of [
    "plugin-form",
    "plugin-commands",
    "plugin-app-control",
    "plugin-app-manager",
    "plugin-scheduling",
    "plugin-wallet",
  ]) {
    const build = workflow.indexOf(
      `cd eliza/plugins/${plugin}\n          bun run build`,
    );
    assert.ok(build >= 0, `official ${plugin} must be built`);
    assert.ok(
      runtimeBuild > build,
      `${plugin} must exist before Alice's runtime bundle is assembled`,
    );
    assert.match(
      dockerfile,
      new RegExp(
        `cp eliza/plugins/${plugin}/package\\.json node_modules/@elizaos/${plugin}/[\\s\\S]*?cp -a eliza/plugins/${plugin}/dist node_modules/@elizaos/${plugin}/dist`,
      ),
      `the runtime image must copy the exact built ${plugin} package`,
    );
    assert.match(
      dockerfile,
      new RegExp(`requiredLockedPackages[\\s\\S]*?'@elizaos/${plugin}'`),
      `image assembly must fail closed if ${plugin} is absent`,
    );
  }
  assert.match(
    workflow,
    /Build @elizaos\/plugin-wallet[\s\S]*?bun run build \|\| \{[\s\S]*?test -f dist\/index\.mjs[\s\S]*?test -f dist\/diagnostic\.js[\s\S]*?bun run build:views/,
    "wallet's known declaration-only failure may be tolerated only after exact runtime outputs are verified",
  );
  assert.match(
    dockerfile,
    /node_modules\/@elizaos\/plugin-wallet\/dist\/index\.mjs node_modules\/@elizaos\/plugin-wallet\/dist\/diagnostic\.js/,
    "the image must verify wallet's actual runtime entrypoints",
  );
  assert.match(
    dockerfile,
    /import\('@elizaos\/plugin-commands'\)/,
    "image assembly must evaluate Alice's static official commands import",
  );
  assert.match(
    dockerfile,
    /import\('@elizaos\/plugin-form'\)/,
    "image assembly must evaluate Alice's static official form import",
  );
});

test("cloud image retains the official agent orchestrator statically imported by Alice", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  const build = workflow.indexOf(
    "cd eliza/plugins/plugin-agent-orchestrator\n          bun run build",
  );
  const runtimeBuild = workflow.indexOf("- name: Build runtime (tsdown)");
  assert.ok(build >= 0, "official agent orchestrator must be built");
  assert.ok(
    runtimeBuild > build,
    "agent orchestrator must exist before Alice's runtime bundle is assembled",
  );
  assert.match(
    dockerfile,
    /cp eliza\/plugins\/plugin-agent-orchestrator\/package\.json node_modules\/@elizaos\/plugin-agent-orchestrator\/[\s\S]*?cp -a eliza\/plugins\/plugin-agent-orchestrator\/dist node_modules\/@elizaos\/plugin-agent-orchestrator\/dist/,
    "the runtime image must copy the exact built agent orchestrator",
  );
  assert.match(
    dockerfile,
    /requiredLockedPackages[\s\S]*?'@elizaos\/plugin-agent-orchestrator'/,
    "image assembly must fail closed if the orchestrator is absent",
  );
  assert.doesNotMatch(
    dockerfile,
    /Remove unbuilt orchestrator[\s\S]*?rm -rf[\s\S]*?node_modules\/@elizaos\/plugin-agent-orchestrator/,
    "the cloud image must not delete Alice's static orchestrator import",
  );
  assert.match(
    dockerfile,
    /import\('@elizaos\/plugin-agent-orchestrator'\)/,
    "image assembly must evaluate the pinned orchestrator dependency graph",
  );
});

test("cloud image retains the official SQL runtime statically imported by Alice", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  const build = workflow.indexOf(
    "cd eliza/plugins/plugin-sql\n          bun run build",
  );
  const runtimeBuild = workflow.indexOf("- name: Build runtime (tsdown)");
  assert.ok(build >= 0, "official SQL plugin must be built");
  assert.ok(
    runtimeBuild > build,
    "SQL runtime output must exist before Alice's bundle is assembled",
  );
  assert.match(
    dockerfile,
    /cp eliza\/plugins\/plugin-sql\/package\.json node_modules\/@elizaos\/plugin-sql\/[\s\S]*?cp -a eliza\/plugins\/plugin-sql\/src\/dist node_modules\/@elizaos\/plugin-sql\/src\/dist/,
    "the runtime image must copy the exact official SQL Node build",
  );
  assert.match(
    dockerfile,
    /requiredLockedPackages[\s\S]*?'@elizaos\/plugin-sql'/,
    "image assembly must fail closed if the SQL runtime is absent",
  );
  assert.match(
    dockerfile,
    /import\('@elizaos\/plugin-sql'\)/,
    "image assembly must evaluate Alice's static SQL import",
  );
});

test("cloud image retains the official auth dependency required by the orchestrator", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  assert.match(
    dockerfile,
    /cp eliza\/packages\/auth\/package\.json node_modules\/@elizaos\/auth\/[\s\S]*?cp -a eliza\/packages\/auth\/dist node_modules\/@elizaos\/auth\/dist/,
    "the runtime image must copy the exact built official auth package",
  );
  assert.match(
    dockerfile,
    /requiredLockedPackages[\s\S]*?'@elizaos\/auth'/,
    "image assembly must fail closed if the orchestrator's auth dependency is absent",
  );
});

test("cloud image overlays the latest app-manager host services and imports the package", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  assert.match(
    dockerfile,
    /cp eliza\/packages\/agent\/src\/services\/app-manager-agents-list-guard\.ts node_modules\/@elizaos\/agent\/src\/services\//,
    "latest official app-manager agents-list guard must be present in Alice's agent compatibility package",
  );
  assert.match(
    dockerfile,
    /cp eliza\/packages\/agent\/src\/services\/overlay-app-presence\.ts node_modules\/@elizaos\/agent\/src\/services\//,
    "latest official overlay presence service must be present in Alice's agent compatibility package",
  );
  assert.match(
    dockerfile,
    /import\('@elizaos\/plugin-app-manager'\)/,
    "the completed image dependency graph must import official plugin-app-manager during the build",
  );
});

test("cloud image materializes Alice's current Eliza inference and skills runtime closure", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  const skillsBuild = workflow.indexOf(
    "cd eliza/packages/skills\n          bun run build",
  );
  const localInferenceBuild = workflow.indexOf(
    "cd eliza/plugins/plugin-local-inference\n          bun run build",
  );
  const openAiBuild = workflow.indexOf(
    "cd eliza/plugins/plugin-openai\n          bun run build",
  );
  const elizaCloudBuild = workflow.indexOf(
    "cd eliza/plugins/plugin-elizacloud\n          bun run build",
  );
  const cloudSdkBuild = workflow.indexOf(
    "cd eliza/packages/cloud/sdk\n          bun run build",
  );
  const agentSkillsBuild = workflow.indexOf(
    "cd eliza/plugins/plugin-agent-skills\n          bun run build",
  );
  const runtimeBuild = workflow.indexOf("- name: Build runtime (tsdown)");

  assert.ok(skillsBuild >= 0, "official bundled skills must be built");
  assert.ok(
    agentSkillsBuild > skillsBuild,
    "bundled skills must exist before plugin-agent-skills is built",
  );
  assert.ok(
    localInferenceBuild >= 0 && runtimeBuild > localInferenceBuild,
    "local-inference runtime output must exist before Alice is bundled",
  );
  assert.ok(
    openAiBuild >= 0 && runtimeBuild > openAiBuild,
    "OpenAI-compatible provider output must exist before Alice is bundled",
  );
  assert.ok(
    cloudSdkBuild >= 0 && elizaCloudBuild > cloudSdkBuild,
    "Cloud SDK output must exist before plugin-elizacloud is built",
  );
  assert.ok(
    runtimeBuild > elizaCloudBuild,
    "Eliza Cloud output must exist before Alice is bundled",
  );
  assert.match(workflow, /test -f dist\/runtime\/index\.js/);
  assert.match(workflow, /test -f dist\/node\/index\.node\.js/);
  assert.match(workflow, /test -f dist\/utils\/config\.js/);

  for (const packageName of [
    "skills",
    "plugin-local-inference",
    "plugin-openai",
    "plugin-elizacloud",
    "cloud-sdk",
  ]) {
    assert.match(
      dockerfile,
      new RegExp(`requiredLockedPackages[\\s\\S]*?'@elizaos/${packageName}'`),
      `image assembly must fail closed if @elizaos/${packageName} is absent`,
    );
  }
  assert.match(
    dockerfile,
    /materializeRootLockedPackage\('@scure\/bip39'\)/,
    "image assembly must replace arbitrary transitive hoists with the root-lock-selected BIP39 package",
  );
  assert.match(
    dockerfile,
    /requiredLockedPackages[\s\S]*?'@scure\/bip39'/,
    "image assembly must fail closed if the root-lock-selected BIP39 package is absent",
  );
  assert.match(
    dockerfile,
    /cp -a eliza\/packages\/skills\/dist node_modules\/@elizaos\/skills\/dist/,
  );
  assert.match(
    dockerfile,
    /cp -a eliza\/packages\/skills\/skills node_modules\/@elizaos\/skills\/skills/,
  );
  assert.match(
    dockerfile,
    /cp -a eliza\/plugins\/plugin-local-inference\/dist node_modules\/@elizaos\/plugin-local-inference\/dist/,
  );
  assert.match(
    dockerfile,
    /cp -a eliza\/plugins\/plugin-openai\/dist node_modules\/@elizaos\/plugin-openai\/dist/,
  );
  assert.match(
    dockerfile,
    /cp -a eliza\/plugins\/plugin-elizacloud\/dist node_modules\/@elizaos\/plugin-elizacloud\/dist/,
  );
  assert.match(
    dockerfile,
    /cp -a eliza\/packages\/cloud\/sdk\/dist node_modules\/@elizaos\/cloud-sdk\/dist/,
  );
  assert.match(
    dockerfile,
    /import\('@scure\/bip39\/wordlists\/portuguese'\)[\s\S]*?import\('@elizaos\/skills'\)[\s\S]*?import\('@elizaos\/plugin-local-inference\/runtime'\)[\s\S]*?import\('@elizaos\/plugin-openai'\)[\s\S]*?import\('@elizaos\/plugin-elizacloud\/endpoint-config'\)[\s\S]*?import\('@elizaos\/plugin-elizacloud'\)/,
    "image assembly must evaluate the exact autonomous inference closure",
  );
  assert.match(
    workflow,
    /health\.agentState !== "running"/,
    "candidate smoke must reject an HTTP-only container whose agent never became ready",
  );
});

test("candidate image smoke exercises a provider-configured runtime boot", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const smokeStep = workflow.match(
    /- name: Smoke exact candidate image[\s\S]*?- name: Cleanup candidate smoke container/,
  )?.[0];

  assert.ok(smokeStep, "candidate image smoke step must exist");
  assert.match(
    smokeStep,
    /--env OPENAI_API_KEY=alice-cloud-smoke-provider-sentinel/,
    "a fresh smoke container needs a non-secret provider signal so official Eliza boots the runtime instead of awaiting onboarding",
  );
  assert.match(
    smokeStep,
    /--env ELIZA_VAULT_PASSPHRASE=alice-cloud-smoke-vault-passphrase/,
    "a headless smoke container needs a non-secret vault passphrase so runtime initialization reaches readiness",
  );
  assert.doesNotMatch(
    smokeStep,
    /secrets\.[A-Z0-9_]+/,
    "candidate image smoke must not depend on a production provider credential",
  );
});
