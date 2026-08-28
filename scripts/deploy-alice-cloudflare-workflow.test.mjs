import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(
  path.join(repoRoot, ".github/workflows/deploy-alice-cloudflare.yml"),
  "utf8",
);
const watchdog = fs.readFileSync(
  path.join(repoRoot, ".github/workflows/recover-alice-production-watchdog.yml"),
  "utf8",
);
const buildWorkflow = fs.readFileSync(
  path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
  "utf8",
);
const replaySource = fs.readFileSync(
  path.join(repoRoot, "deploy/modal/alice_cloudflare_release.test.mjs"),
  "utf8",
);

function namedWorkflowSteps(source) {
  const headings = [...source.matchAll(/^      - name: (.+)$/gm)];
  return headings.map((heading, index) => {
    const end = headings[index + 1]?.index ?? source.length;
    const block = source.slice(heading.index, end);
    const runStart = block.search(/^        run:/m);
    return {
      name: heading[1],
      block,
      run: runStart === -1 ? "" : block.slice(runStart),
    };
  });
}

test("production deployment uses Container Program v2 without a Modal promotion path", () => {
  assert.match(workflow, /^      runtime_revision:/m);
  assert.doesNotMatch(workflow, /^      modal_revision:/m);
  assert.match(
    workflow,
    /ALICE_RUNTIME_REVISION: \$\{\{ inputs\.runtime_revision \}\}/,
  );
  assert.match(
    workflow,
    /ALICE_ROLLBACK_BOUNDARY: "container:alice-runtime:v\$\{\{ inputs\.runtime_revision \}\}"/,
  );
  assert.match(workflow, /ALICE_CLOUDFLARE_RUNTIME_IMAGE:/);
  assert.match(workflow, /ALICE_CAPABILITY_BOM_SHA256:/);
  for (const source of [workflow, watchdog]) {
    assert.doesNotMatch(source, /ALICE_MODAL_|MODAL_TOKEN_|alice_modal_/);
    assert.doesNotMatch(source, /Modal (?:promotion|bootstrap|recovery)/i);
  }
});

test("protected deployment consumes one exact successful build and immutable artifact", () => {
  assert.match(workflow, /environment: alice-production/);
  assert.match(
    workflow,
    /test "\$GITHUB_REF" = "\$EXPECTED_REF"[\s\S]*?test "\$GITHUB_SHA" = "\$SOURCE_SHA"/,
  );
  assert.match(
    workflow,
    /actions\/runs\/\$\{BUILD_RUN_ID\}[\s\S]*?\.head_sha[\s\S]*?\.head_branch[\s\S]*?\.conclusion[\s\S]*?build-cloud-agent\.yml/,
  );
  assert.match(
    workflow,
    /actions\/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53[\s\S]*?run-id: \$\{\{ inputs\.build_run_id \}\}[\s\S]*?name: \$\{\{ inputs\.worker_artifact_name \}\}/,
  );
  assert.match(
    workflow,
    /artifact_record_count="\$\(printf '%s' "\$artifact_record" \| awk 'NF \{ count\+\+ \} END \{ print count \+ 0 \}'\)"[\s\S]*?test "\$artifact_record_count" = "1"/,
  );
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.source_sha \}\}/);
});

test("source image provenance, build manifest, and capability BOM are verified before import", () => {
  assert.match(
    workflow,
    /gh attestation verify "oci:\/\/\$\{RUNTIME_IMAGE\}"[\s\S]*?--source-digest "\$SOURCE_SHA"[\s\S]*?--deny-self-hosted-runners/,
  );
  assert.match(
    workflow,
    /alice-runtime-build-manifest\.json[\s\S]*?ALICE_RUNTIME_BUILD_MANIFEST_SHA256[\s\S]*?verify_alice_runtime_build_manifest\.mjs/,
  );
  assert.match(
    workflow,
    /alice-capability-bom\.json[\s\S]*?ALICE_CAPABILITY_BOM_SHA256[\s\S]*?verify_alice_capability_bom\.mjs/,
  );
  assert.match(workflow, /docker pull --platform linux\/amd64 "\$RUNTIME_IMAGE"/);
  assert.doesNotMatch(workflow, /\bdocker (?:build|buildx build)\b/);
});

test("the once-built image is imported and read back as one exact Cloudflare digest", () => {
  const importStep = workflow.match(
    /- name: Import the once-built runtime into the exact Cloudflare registry[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(importStep, /docker tag "\$SOURCE_RUNTIME_IMAGE" "\$local_image"/);
  assert.match(importStep, /wrangler" containers push "\$local_image"/);
  assert.match(
    importStep,
    /registry\\\\\.cloudflare\\\\\.com\/\$\{CLOUDFLARE_ACCOUNT_ID\}\/alice-runtime@sha256:\[a-f0-9\]\{64\}/,
  );
  assert.match(importStep, /docker manifest inspect -v "\$registry_tag"/);
  assert.match(importStep, /test "\$runtime_image" = "\$local_runtime_image"/);
  assert.match(importStep, /containers images list[\s\S]*?length'\)" = "1"/);
  assert.match(importStep, /alice_cloudflare_container_image\.mjs/);
  assert.match(importStep, /ALICE_CLOUDFLARE_RUNTIME_IMAGE=\$runtime_image/);
});

test("exact registry digest, runtime revision, and BOM propagate into the signed release", () => {
  const materialize = workflow.match(
    /- name: Materialize signed manifest and exact-byte Worker configs[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(
    materialize,
    /ALICE_CLOUDFLARE_RUNTIME_IMAGE: \$\{\{ env\.ALICE_CLOUDFLARE_RUNTIME_IMAGE \}\}/,
  );
  assert.match(
    materialize,
    /ALICE_RUNTIME_BUILD_MANIFEST_SHA256: \$\{\{ env\.ALICE_RUNTIME_BUILD_MANIFEST_SHA256 \}\}/,
  );
  assert.match(
    materialize,
    /ALICE_CAPABILITY_BOM_SHA256: \$\{\{ env\.ALICE_CAPABILITY_BOM_SHA256 \}\}/,
  );
  assert.match(materialize, /alice_deployment_manifest\.mjs/);
  assert.match(materialize, /alice_cloudflare_config\.mjs/);
  assert.doesNotMatch(materialize, /ALICE_UPSTREAM_ORIGIN/);
});

test("state-plane auth is uploaded only as an access-Worker secret", () => {
  assert.match(
    workflow,
    /ALICE_STATE_PLANE_SERVICE_TOKEN: \$\{\{ secrets\.ALICE_STATE_PLANE_SERVICE_TOKEN \}\}/,
  );
  const materialize = workflow.match(
    /- name: Materialize signed manifest and exact-byte Worker configs[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  const imageImport = workflow.match(
    /- name: Import the once-built runtime into the exact Cloudflare registry[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.doesNotMatch(materialize, /ALICE_STATE_PLANE_SERVICE_TOKEN/);
  assert.doesNotMatch(imageImport, /ALICE_STATE_PLANE_SERVICE_TOKEN/);
  assert.doesNotMatch(materialize, /DISCORD|TELEGRAM/i);
  assert.doesNotMatch(imageImport, /DISCORD|TELEGRAM/i);
  assert.doesNotMatch(workflow, /ALICE_STATE_PLANE_TOKEN/);
});

test("only the Cloudflare recovery watchdog must be live before the first mutation", () => {
  const readiness = workflow.match(
    /- name: Verify Cloudflare recovery readiness before first mutation[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(readiness, /provider=cloudflare/);
  assert.match(readiness, /alice-watchdog-ready-\$\{provider\}/);
  assert.match(readiness, /Prestarted independent Cloudflare recovery/);
  assert.doesNotMatch(readiness, /for provider in/);
  assert.match(watchdog, /^  recover-cloudflare:/m);
  assert.doesNotMatch(watchdog, /^  recover-modal:/m);
  assert.match(watchdog, /--capture-recovery-readiness|providerReadbackPath|ALICE_RECOVERY_PROVIDER_READBACK_PATH/);
});

test("rollback journals contain relocatable Worker bytes and artifact-relative configs", () => {
  const anchor = workflow.match(
    /- name: Persist pre-mutation Cloudflare rollback journal[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(anchor, /\$\{\{ runner\.temp \}\}\/alice-worker-bundles/);
  assert.match(anchor, /\$\{\{ runner\.temp \}\}\/alice-release/);
  for (const source of [workflow, watchdog]) {
    assert.match(source, /recovery_root="\$\{RUNNER_TEMP\}\/alice-independent-cloudflare-recovery"/);
    assert.match(
      source,
      /ALICE_WORKER_BUNDLE_ROOT="\$recovery_root\/alice-worker-bundles"/,
    );
    assert.match(
      source,
      /ALICE_WRANGLER_OUTPUT_DIR="\$recovery_root\/alice-release\/wrangler"/,
    );
    assert.doesNotMatch(
      source.match(/Consume external journal[\s\S]*?(?=\n      - name:)/)?.[0] ?? "",
      /ALICE_WORKER_BUNDLE_ROOT="\$GITHUB_WORKSPACE/,
    );
  }
});

test("the independent terminal handoff requires container evidence, not provider bootstrap evidence", () => {
  const accept = workflow.match(/  accept:[\s\S]*?(?=\n  recover-cloudflare:)/)?.[0] ?? "";
  assert.match(accept, /container-image-evidence\.json/);
  assert.match(accept, /ALICE_CONTAINER_IMAGE_EVIDENCE_PATH:/);
  assert.match(accept, /alice_production_acceptance\.ts/);
  assert.doesNotMatch(accept, /promotion-evidence|bootstrap-evidence/);
  assert.match(
    accept,
    /Persist terminal production acceptance evidence as final success action[\s\S]*?if: success\(\)/,
  );
});

test("fresh-runner replay is mandatory, mutation-disabled, and exercises container configs", () => {
  assert.match(buildWorkflow, /ALICE_WORKER_CONTRACT_REPLAY: "1"/);
  assert.match(
    buildWorkflow,
    /ALICE_REPLAY_SOURCE_COMMIT: \$\{\{ steps\.source_revision\.outputs\.sha \}\}/,
  );
  assert.match(
    replaySource,
    /replays signed Worker bytes and recovery from a relocated fresh-runner root/,
  );
  assert.match(replaySource, /runnerRootRelocated: true/);
  assert.match(replaySource, /providerMutation: false/);
  assert.match(replaySource, /runtimeImage:[\s\S]*?registry\.cloudflare\.com/);
  assert.match(replaySource, /runtimeRevision: 49/);
  assert.doesNotMatch(replaySource, /upstreamOrigin: "https:\/\/rndrntwrk--alice/);
});

test("every provider mutation remains bounded by the shared recovery reserve", () => {
  const firstMutation = workflow.indexOf(
    "Import the once-built runtime into the exact Cloudflare registry",
  );
  const readiness = workflow.indexOf(
    "Verify Cloudflare recovery readiness before first mutation",
  );
  assert.ok(readiness >= 0 && readiness < firstMutation);
  for (const name of [
    "Import the once-built runtime into the exact Cloudflare registry",
    "Bootstrap unrouted fail-closed continuity identities",
    "Assert independently preprovisioned recovery boundary",
    "Prepare service-authenticated fail-closed control route",
    "Commit first-release PAUSE_ALL before runtime mutation",
    "Promote only attested immutable Worker bytes",
  ]) {
    const step = workflow.match(
      new RegExp(`- name: ${name}[\\s\\S]*?(?=\\n      - name:)`),
    )?.[0] ?? "";
    assert.match(step, /alice_release_deadline\.mjs mutation/);
    assert.match(step, /timeout --signal=TERM --kill-after=30s/);
  }
  assert.match(
    workflow,
    /Restore prior Cloudflare graph after any failed or cancelled mutation[\s\S]*?alice_release_deadline\.mjs cloudflare-recovery/,
  );
});

test("every direct gh boundary receives only a step-local GitHub token", () => {
  const missing = [];
  for (const source of [workflow, watchdog]) {
    for (const step of namedWorkflowSteps(source)) {
      if (/\bgh\s+[a-z][a-z-]*\b/.test(step.run) &&
          !/^          GH_TOKEN: \$\{\{ github\.token \}\}$/m.test(step.block)) {
        missing.push(step.name);
      }
    }
    assert.doesNotMatch(
      source,
      /^    env:\n(?:^      .*\n)*^      GH_TOKEN:/m,
      "GH_TOKEN must not be job-global",
    );
  }
  assert.deepEqual(missing, []);
});
