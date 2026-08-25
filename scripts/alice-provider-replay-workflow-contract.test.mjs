import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const captureSource = fs.readFileSync(
  path.join(root, "scripts", "alice-provider-replay-capture.mjs"),
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
  assert.match(source, /secrets\.ALICE_MODAL_REPLAY_TOKEN_ID/u);
  assert.match(source, /secrets\.ALICE_MODAL_REPLAY_TOKEN_SECRET/u);
  assert.doesNotMatch(source, /secrets\.CLOUDFLARE_API_TOKEN/u);
  assert.doesNotMatch(source, /secrets\.MODAL_TOKEN_(?:ID|SECRET)/u);

  for (const input of [
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
    "Capture full sanitized provider state before replay",
    "Normalize and fingerprint provider DTO",
    "Bind provider fingerprints through recovery contracts",
    "Materialize canonical owner Access config and signed manifest bytes",
    "Run Program and deploy admission without mutation",
    "Prove exact-one-artifact shell behavior",
    "Capture full sanitized provider state after replay",
    "Prove before and after provider state identical",
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

test("provider capture has one fail-closed read-only Cloudflare and Modal path", () => {
  assert.match(captureSource, /method !== "GET"/u);
  assert.match(captureSource, /"--capture-current"/u);
  for (const forbidden of [
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
