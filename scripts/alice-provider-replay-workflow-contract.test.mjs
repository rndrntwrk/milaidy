import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const captureSource = fs.readFileSync(
  path.join(root, "scripts", "alice-provider-replay-capture.mjs"),
  "utf8",
);
const fingerprintSource = fs.readFileSync(
  path.join(root, "scripts", "alice-provider-replay-fingerprint.mjs"),
  "utf8",
);
const finalizeSource = fs.readFileSync(
  path.join(root, "scripts", "alice-provider-replay-finalize.mjs"),
  "utf8",
);

function workflowFiles() {
  return fs
    .readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .map((name) => ({
      name,
      source: fs.readFileSync(path.join(workflowsDir, name), "utf8"),
    }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function jobBlock(source, name, nextName) {
  const start = source.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `missing job ${name}`);
  const end = nextName === undefined
    ? source.length
    : source.indexOf(`\n  ${nextName}:\n`, start + 1);
  assert.notEqual(end, -1, `missing job ${nextName}`);
  return source.slice(start, end);
}

test("one manual Ubuntu 24.04 workflow executes the complete mutation-disabled Alice provider replay", () => {
  const candidates = workflowFiles().filter(({ source }) =>
    source.includes("ALICE_PROVIDER_REPLAY_CONTRACT: v1"),
  );

  assert.equal(
    candidates.length,
    1,
    `expected exactly one manual complete Alice provider replay workflow, found ${candidates.length}`,
  );

  const [{ name, source }] = candidates;
  assert.equal(name, "replay-alice-provider-contract.yml");
  assert.match(source, /\non:\n\s+workflow_dispatch:\n/u);
  assert.match(source, /runs-on:\s+ubuntu-24\.04/u);
  assert.match(source, /timeout-minutes:\s+30/u);
  assert.match(source, /environment:\s+alice-production/u);
  assert.match(source, /ALICE_REPLAY_MUTATION_DISABLED:\s+"1"/u);
  assert.match(
    source,
    /secrets\.ALICE_CLOUDFLARE_REPLAY_READ_TOKEN/u,
  );
  assert.match(source, /secrets\.MODAL_TOKEN_ID/u);
  assert.match(source, /secrets\.MODAL_TOKEN_SECRET/u);
  assert.doesNotMatch(source, /secrets\.CLOUDFLARE_API_TOKEN/u);
  assert.doesNotMatch(source, /secrets\.ALICE_MODAL_REPLAY_TOKEN/u);

  for (const input of [
    "tooling_sha",
    "source_sha",
    "build_run_id",
    "worker_artifact_name",
    "worker_artifact_digest",
    "runtime_image",
    "runtime_build_manifest_sha256",
    "release_epoch",
    "modal_revision",
    "policy_hash",
  ]) {
    assert.match(
      source,
      new RegExp(`\\n\\s{6}${input}:\\n\\s+description:`, "u"),
      `missing exact immutable input ${input}`,
    );
  }

  for (const permission of ["actions", "attestations", "contents", "packages"]) {
    assert.match(source, new RegExp(`\\n\\s{2}${permission}: read`, "u"));
  }
  assert.doesNotMatch(source, /^\s+[a-z-]+:\s+write\s*$/gmu);

  const requiredStages = [
    "Validate immutable release, build, and artifact identities",
    "Checkout exact Alice release",
    "Verify immutable Worker artifact and attestations",
    "Capture full sanitized Cloudflare state before replay",
    "Normalize and fingerprint provider DTO",
    "Bind provider fingerprints through recovery contracts",
    "Materialize canonical owner Access config and signed manifest bytes",
    "Run Program and deploy admission without mutation",
    "Prove exact-one-artifact shell behavior",
    "Capture full sanitized Cloudflare state after replay",
    "Prove before and after Cloudflare state identical",
    "Upload sanitized replay evidence",
    "Cleanup replay state on every exit",
  ];
  for (const stage of requiredStages) {
    assert.match(source, new RegExp(`- name: ${escapeRegExp(stage)}`, "u"));
  }

  assert.match(source, /retention-days:\s+1/u);
  assert.match(source, /if:\s+\$\{\{\s+always\(\)\s+\}\}/u);

  for (const forbidden of [
    /wrangler\s+deploy/iu,
    /modal\s+deploy/iu,
    /(?:secret|variable)\s+(?:put|set)/iu,
    /(?:curl|gh api)[^\n]*(?:-X|--method)\s+(?:POST|PUT|PATCH|DELETE)/iu,
    /workflow\s+run\s+deploy-alice/iu,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("core provider capture is fail-closed Cloudflare GET-only and credential-isolated", () => {
  assert.match(captureSource, /method !== "GET"/u);
  for (const forbidden of [
    /node:child_process/u,
    /MODAL_TOKEN_(?:ID|SECRET)/u,
    /--capture-current/u,
    /FunctionUpdateSchedulingParams/u,
    /--enforce-current/u,
    /--delete-secret/u,
    /wrangler\s+deploy/iu,
    /modal\s+deploy/iu,
    /method:\s*"(?:POST|PUT|PATCH|DELETE)"/u,
  ]) {
    assert.doesNotMatch(captureSource, forbidden);
  }
});

test("Modal capture adapter only normalizes a pinned sanitized snapshot", () => {
  const adapterPath = path.join(
    root,
    "scripts",
    "alice-provider-replay-modal-snapshot.mjs",
  );
  assert.equal(fs.existsSync(adapterPath), true);
  const source = fs.readFileSync(adapterPath, "utf8");
  assert.match(source, /buildModalReplaySnapshot/u);
  assert.match(source, /ALICE_REPLAY_MUTATION_CUTOFF_REQUIRED/u);
  assert.doesNotMatch(source, /node:child_process/u);
  assert.doesNotMatch(source, /MODAL_TOKEN_(?:ID|SECRET)/u);
});

test("Modal adapter normalizes two captures and proves canonical equality", () => {
  const adapterPath = path.join(
    root,
    "scripts",
    "alice-provider-replay-modal-snapshot.mjs",
  );
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "alice-modal-replay-"));
  try {
    const modal = {
      appId: "ap-oFaCNy2jJDFalZienNB2Ht",
      appName: "alice-runtime",
      environment: "main",
      providerVersion: 48,
      providerHistory: [{ providerVersion: 48 }],
      functionIds: ["fu-test"],
      function: { webUrl: "https://rndrntwrk--alice.modal.run" },
      mountedSecretObjects: [{ id: "st-test", name: "alice-runtime" }],
      mountedVolumeIds: [],
      imageObjectIds: ["im-test"],
      autoscalerEnforcement: { status: "provider-unverifiable" },
      observedAt: "2026-08-25T04:00:00.000Z",
    };
    const beforeRaw = path.join(temp, "before-raw.json");
    const afterRaw = path.join(temp, "after-raw.json");
    const before = path.join(temp, "before.json");
    const after = path.join(temp, "after.json");
    const comparison = path.join(temp, "comparison.json");
    fs.writeFileSync(beforeRaw, `${JSON.stringify(modal)}\n`);
    fs.writeFileSync(
      afterRaw,
      `${JSON.stringify({
        ...modal,
        observedAt: "2026-08-25T05:00:00.000Z",
      })}\n`,
    );
    const env = { ...process.env, ALICE_REPLAY_MUTATION_DISABLED: "1" };
    for (const [input, output] of [
      [beforeRaw, before],
      [afterRaw, after],
    ]) {
      const result = childProcess.spawnSync(
        process.execPath,
        [adapterPath, "snapshot", input, output],
        { encoding: "utf8", env },
      );
      assert.equal(result.status, 0, result.stderr);
    }
    const result = childProcess.spawnSync(
      process.execPath,
      [adapterPath, "compare", before, after, comparison],
      { encoding: "utf8", env },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(comparison, "utf8")), {
      schemaVersion: "alice.modal-replay-comparison.v1",
      identical: true,
      stateSha256: JSON.parse(result.stdout).stateSha256,
    });
  } finally {
    fs.rmSync(temp, { force: true, recursive: true });
  }
});

test("core fingerprint and admission evidence compare Cloudflare state only", () => {
  for (const source of [fingerprintSource, finalizeSource]) {
    assert.match(source, /compareCloudflareReplaySnapshots/u);
    assert.doesNotMatch(source, /compareProviderSnapshots/u);
  }
});

test("Modal recovery credentials bracket the credential-free core replay in separate jobs", () => {
  const source = fs.readFileSync(
    path.join(workflowsDir, "replay-alice-provider-contract.yml"),
    "utf8",
  );
  const modalBefore = jobBlock(source, "modal_before", "replay");
  const replay = jobBlock(source, "replay", "modal_after");
  const modalAfter = jobBlock(source, "modal_after", "finalize");
  const finalize = jobBlock(source, "finalize");

  for (const modalCapture of [modalBefore, modalAfter]) {
    assert.match(
      modalCapture,
      /environment:\s+alice-production-modal-recovery/u,
    );
    assert.match(modalCapture, /"--capture-current"/u);
    assert.match(modalCapture, /secrets\.MODAL_TOKEN_ID/u);
    assert.match(modalCapture, /secrets\.MODAL_TOKEN_SECRET/u);
    assert.match(modalCapture, /retention-days:\s+1/u);
    assert.doesNotMatch(modalCapture, /alice-production\s*$/mu);
  }

  assert.match(modalBefore, /tooling_sha/u);
  assert.match(modalBefore, /source_sha/u);
  assert.match(
    source,
    /refs\/tags\/alice-provider-replay-\$\{ALICE_REPLAY_TOOLING_SHA\}/u,
  );
  assert.match(source, /test "\$GITHUB_SHA" = "\$ALICE_REPLAY_TOOLING_SHA"/u);
  assert.match(replay, /needs:\s+modal_before/u);
  assert.match(replay, /environment:\s+alice-production/u);
  assert.doesNotMatch(replay, /MODAL_TOKEN_(?:ID|SECRET)/u);
  assert.doesNotMatch(replay, /ALICE_MODAL_REPLAY_TOKEN/u);
  assert.match(modalAfter, /needs:\s+\[modal_before, replay\]/u);
  assert.match(
    finalize,
    /Prove fresh Modal before and after canonical states identical/u,
  );
  assert.match(finalize, /needs:\s+\[modal_before, replay, modal_after\]/u);
  assert.doesNotMatch(source, /ALICE_MODAL_REPLAY_TOKEN/u);
});
