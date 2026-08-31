import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildAliceRuntimeRootContract } from "./alice_runtime_root_contract.mjs";
import {
  AliceRuntimeInputsError,
  buildAliceRuntimeInputsContract,
  verifyAliceRuntimeInputsContract,
} from "./alice_runtime_inputs.mjs";

const BUILD_A = "a".repeat(40);
const BUILD_B = "b".repeat(40);
const ELIZA = "c".repeat(40);
const digest = (char) => `sha256:${char.repeat(64)}`;

const policy = {
  schemaVersion: "alice.runtime-build-policy.v1",
  platform: "linux/amd64",
  runtimeVersionStrategy: "runtime-inputs-sha256",
  dockerfileFrontend: {
    reference: "docker.io/docker/dockerfile:1.7",
    digest: digest("1"),
  },
  sbomScanner: {
    reference: "docker.io/docker/buildkit-syft-scanner:stable-1",
    digest: digest("2"),
  },
  baseImages: {
    bun: { reference: "oven/bun:1.3.14", digest: digest("3") },
    python: {
      reference: "python:3.11.13-slim-bookworm",
      digest: digest("4"),
    },
    node: {
      reference: "node:24.19.0-bookworm-slim",
      digest: digest("5"),
    },
  },
  toolchain: { node: "24.19.0", bun: "1.3.14", wrangler: "4.122.0" },
};

async function context(buildCommit, elizaCommit = ELIZA) {
  const root = await mkdtemp(path.join(tmpdir(), "alice-runtime-inputs-"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src", "index.js"),
    "export const alice = true;\n",
  );
  const contract = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: buildCommit,
    elizaCommit,
  });
  return { root, contract };
}

async function expectPredicate(fn, predicateId) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof AliceRuntimeInputsError);
    assert.equal(error.predicateId, predicateId);
    return true;
  });
}

test("build commit is provenance metadata, not a runtime-content cache key", async (t) => {
  const a = await context(BUILD_A);
  const b = await context(BUILD_B);
  t.after(() => rm(a.root, { recursive: true, force: true }));
  t.after(() => rm(b.root, { recursive: true, force: true }));
  const first = buildAliceRuntimeInputsContract({
    buildCommit: BUILD_A,
    contextContract: a.contract,
    dockerfileBytes: Buffer.from("FROM scratch\n"),
    dockerignoreBytes: Buffer.from(".git\n"),
    buildPolicy: policy,
  });
  const second = buildAliceRuntimeInputsContract({
    buildCommit: BUILD_B,
    contextContract: b.contract,
    dockerfileBytes: Buffer.from("FROM scratch\n"),
    dockerignoreBytes: Buffer.from(".git\n"),
    buildPolicy: policy,
  });
  assert.notEqual(first.buildCommit, second.buildCommit);
  assert.equal(first.contextEntriesSha256, second.contextEntriesSha256);
  assert.equal(first.runtimeInputsSha256, second.runtimeInputsSha256);
  assert.equal(first.runtimeVersion, second.runtimeVersion);
});

test("Dockerfile, context, Eliza, and build policy changes alter runtime identity", async (t) => {
  const base = await context(BUILD_A);
  const changedContext = await context(BUILD_A);
  await writeFile(
    path.join(changedContext.root, "src", "index.js"),
    "export const alice = false;\n",
  );
  changedContext.contract = await buildAliceRuntimeRootContract({
    root: changedContext.root,
    sourceCommit: BUILD_A,
    elizaCommit: ELIZA,
  });
  const changedEliza = await context(BUILD_A, "d".repeat(40));
  t.after(() => rm(base.root, { recursive: true, force: true }));
  t.after(() => rm(changedContext.root, { recursive: true, force: true }));
  t.after(() => rm(changedEliza.root, { recursive: true, force: true }));
  const build = (overrides = {}) =>
    buildAliceRuntimeInputsContract({
      buildCommit: BUILD_A,
      contextContract: base.contract,
      dockerfileBytes: Buffer.from("FROM scratch\n"),
      dockerignoreBytes: Buffer.from(".git\n"),
      buildPolicy: policy,
      ...overrides,
    });
  const original = build();
  assert.notEqual(
    build({ dockerfileBytes: Buffer.from("FROM busybox\n") })
      .runtimeInputsSha256,
    original.runtimeInputsSha256,
  );
  assert.notEqual(
    build({ contextContract: changedContext.contract }).runtimeInputsSha256,
    original.runtimeInputsSha256,
  );
  assert.notEqual(
    build({ contextContract: changedEliza.contract }).runtimeInputsSha256,
    original.runtimeInputsSha256,
  );
  assert.notEqual(
    build({
      buildPolicy: {
        ...policy,
        toolchain: { ...policy.toolchain, wrangler: "4.123.0" },
      },
    }).runtimeInputsSha256,
    original.runtimeInputsSha256,
  );
});

test("contract shape is self-verifying and content-addressed", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  const contract = buildAliceRuntimeInputsContract({
    buildCommit: BUILD_A,
    contextContract: current.contract,
    dockerfileBytes: Buffer.from("FROM scratch\n"),
    dockerignoreBytes: Buffer.from(".git\n"),
    buildPolicy: policy,
  });
  assert.equal(verifyAliceRuntimeInputsContract(contract), contract);
  const changed = { ...contract, runtimeVersion: "sha256-wrong" };
  await expectPredicate(
    async () => verifyAliceRuntimeInputsContract(changed),
    "RUNTIME_VERSION_MISMATCH",
  );
});

test("context contract must have been produced from the claimed build commit", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  await expectPredicate(
    async () =>
      buildAliceRuntimeInputsContract({
        buildCommit: BUILD_B,
        contextContract: current.contract,
        dockerfileBytes: Buffer.from("FROM scratch\n"),
        dockerignoreBytes: Buffer.from(".git\n"),
        buildPolicy: policy,
      }),
    "CONTEXT_BUILD_COMMIT_MISMATCH",
  );
});
