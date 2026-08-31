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

const contextPolicy = {
  schemaVersion: "alice.runtime-root-policy.v1",
  forbiddenPrefixes: [".git", ".github"],
  forbiddenBasenames: [".env", ".npmrc"],
  maxFileBytes: 1024 * 1024,
  maxEntryCount: 1000,
  maxTotalFileBytes: 4 * 1024 * 1024,
  allowDanglingSymlinks: true,
};

const policy = {
  schemaVersion: "alice.runtime-build-policy.v1",
  platform: "linux/amd64",
  runtimeVersionStrategy: "legacy-source-bound-inputs-sha256",
  contextExporterDockerfileSha256: digest("0"),
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

function buildArgs(buildCommit, elizaCommit = ELIZA, overrides = {}) {
  return {
    APP_ENTRYPOINT: "app.mjs",
    APP_CMD_START: "node app.mjs",
    APP_PORT: "2138",
    APP_API_BIND: "127.0.0.1",
    OCI_SOURCE: "https://github.com/rndrntwrk/milaidy",
    OCI_TITLE: "Alice",
    OCI_DESCRIPTION: "Alice runtime",
    OCI_LICENSES: "MIT",
    VERSION: "cloud-v2.0.172",
    VERSION_CLEAN: "2.0.172",
    REVISION: buildCommit,
    ELIZA_REVISION: elizaCommit,
    ESBUILD_VERSION: "0.28.0",
    ...overrides,
  };
}

async function context(buildCommit, elizaCommit = ELIZA, extra = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "alice-runtime-inputs-"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src", "index.js"),
    "export const alice = true;\n",
  );
  for (const [relative, bytes] of Object.entries(extra)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const contract = await buildAliceRuntimeRootContract({
    root,
    contractKind: "build-context",
    sourceCommit: buildCommit,
    elizaCommit,
    policy: contextPolicy,
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

function build(current, overrides = {}) {
  return buildAliceRuntimeInputsContract({
    buildCommit: current.contract.sourceCommit,
    contextContract: current.contract,
    contextPolicy,
    dockerfileBytes: Buffer.from("FROM scratch\n"),
    dockerignoreBytes: Buffer.from(".git\n"),
    buildPolicy: policy,
    buildArguments: buildArgs(
      current.contract.sourceCommit,
      current.contract.elizaCommit,
    ),
    ...overrides,
  });
}

test("legacy builder remains source-bound until metadata is removed from image bytes", async (t) => {
  const a = await context(BUILD_A);
  const b = await context(BUILD_B);
  t.after(() => rm(a.root, { recursive: true, force: true }));
  t.after(() => rm(b.root, { recursive: true, force: true }));
  const first = build(a);
  const second = build(b);
  assert.equal(first.contextEntriesSha256, second.contextEntriesSha256);
  assert.notEqual(first.runtimeInputsSha256, second.runtimeInputsSha256);
  assert.notEqual(first.runtimeVersion, second.runtimeVersion);
  assert.equal(first.reuseAdmission, "legacy-source-bound");
});

test("every content-affecting build argument is bound", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  const original = build(current);
  for (const [field, value] of [
    ["APP_ENTRYPOINT", "alternate.mjs"],
    ["APP_CMD_START", "node alternate.mjs"],
    ["APP_PORT", "3131"],
    ["APP_API_BIND", "0.0.0.0"],
    ["OCI_SOURCE", "https://example.invalid/repository"],
    ["OCI_TITLE", "Alice changed"],
    ["OCI_DESCRIPTION", "Changed"],
    ["OCI_LICENSES", "Apache-2.0"],
    ["VERSION", "cloud-v2.0.173"],
    ["VERSION_CLEAN", "2.0.173"],
    ["ESBUILD_VERSION", "0.29.0"],
  ]) {
    const changed = build(current, {
      buildArguments: buildArgs(BUILD_A, ELIZA, { [field]: value }),
    });
    assert.notEqual(
      changed.runtimeInputsSha256,
      original.runtimeInputsSha256,
      field,
    );
  }
});

test("revision and Eliza build args must equal the contract", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  await expectPredicate(
    async () =>
      build(current, {
        buildArguments: buildArgs(BUILD_A, ELIZA, {
          REVISION: BUILD_B,
        }),
      }),
    "BUILD_ARGUMENT_REVISION_MISMATCH",
  );
  await expectPredicate(
    async () =>
      build(current, {
        buildArguments: buildArgs(BUILD_A, ELIZA, {
          ELIZA_REVISION: "d".repeat(40),
        }),
      }),
    "BUILD_ARGUMENT_ELIZA_REVISION_MISMATCH",
  );
});

test("qualification-only scanner and Wrangler changes do not alter runtime input identity", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  const original = build(current);
  const changed = build(current, {
    buildPolicy: {
      ...policy,
      sbomScanner: {
        reference: "docker.io/scanner:new",
        digest: digest("9"),
      },
      toolchain: { ...policy.toolchain, wrangler: "4.123.0" },
    },
  });
  assert.equal(changed.runtimeInputsSha256, original.runtimeInputsSha256);
  assert.notEqual(
    changed.qualificationPolicySha256,
    original.qualificationPolicySha256,
  );
});

test("dockerignore bytes are evidence while exported context entries are content authority", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  const original = build(current);
  const commentChanged = build(current, {
    dockerignoreBytes: Buffer.from("# comment\n.git\n"),
  });
  assert.equal(
    commentChanged.runtimeInputsSha256,
    original.runtimeInputsSha256,
  );
  assert.notEqual(
    commentChanged.dockerignoreSha256,
    original.dockerignoreSha256,
  );
});

test("generated build-info bytes are visible and therefore invalidate the legacy input", async (t) => {
  const a = await context(BUILD_A, ELIZA, {
    "dist/build-info.json": '{"builtAt":"2026-08-31T00:00:00Z"}\n',
  });
  const b = await context(BUILD_A, ELIZA, {
    "dist/build-info.json": '{"builtAt":"2026-08-31T00:00:01Z"}\n',
  });
  t.after(() => rm(a.root, { recursive: true, force: true }));
  t.after(() => rm(b.root, { recursive: true, force: true }));
  assert.notEqual(build(a).runtimeInputsSha256, build(b).runtimeInputsSha256);
});

test("self-declared context policy cannot weaken the expected policy", async (t) => {
  const permissivePolicy = {
    ...contextPolicy,
    forbiddenBasenames: [],
  };
  const root = await mkdtemp(path.join(tmpdir(), "alice-runtime-inputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, ".env"), "SECRET=value\n");
  const contract = await buildAliceRuntimeRootContract({
    root,
    contractKind: "build-context",
    sourceCommit: BUILD_A,
    elizaCommit: ELIZA,
    policy: permissivePolicy,
  });
  await expectPredicate(
    async () =>
      buildAliceRuntimeInputsContract({
        buildCommit: BUILD_A,
        contextContract: contract,
        contextPolicy,
        dockerfileBytes: Buffer.from("FROM scratch\n"),
        dockerignoreBytes: Buffer.from(".git\n"),
        buildPolicy: policy,
        buildArguments: buildArgs(BUILD_A),
      }),
    "CONTEXT_CONTRACT_INVALID",
  );
});

test("build context and runtime-root contracts cannot be interchanged", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "alice-runtime-inputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "app.mjs"), "export {};\n");
  const wrong = await buildAliceRuntimeRootContract({
    root,
    contractKind: "runtime-root",
    sourceCommit: BUILD_A,
    elizaCommit: ELIZA,
    policy: { ...contextPolicy, allowDanglingSymlinks: false },
  });
  await expectPredicate(
    async () =>
      buildAliceRuntimeInputsContract({
        buildCommit: BUILD_A,
        contextContract: wrong,
        contextPolicy: {
          ...contextPolicy,
          allowDanglingSymlinks: false,
        },
        dockerfileBytes: Buffer.from("FROM scratch\n"),
        dockerignoreBytes: Buffer.from(".git\n"),
        buildPolicy: policy,
        buildArguments: buildArgs(BUILD_A),
      }),
    "CONTEXT_CONTRACT_INVALID",
  );
});

test("runtime version uses the full 256-bit input digest", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  const contract = build(current);
  assert.equal(
    contract.runtimeVersion,
    `sha256-${contract.runtimeInputsSha256.slice("sha256:".length)}`,
  );
  assert.equal(contract.runtimeVersion.length, "sha256-".length + 64);
  assert.equal(verifyAliceRuntimeInputsContract(contract), contract);
});

test("contract shape and build-argument digest are self-verifying", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  const contract = build(current);
  const changed = structuredClone(contract);
  changed.buildArguments.VERSION = "cloud-v2.0.999";
  await expectPredicate(
    async () => verifyAliceRuntimeInputsContract(changed),
    "BUILD_ARGUMENTS_SHA_MISMATCH",
  );
});

test("context contract must match the claimed build commit", async (t) => {
  const current = await context(BUILD_A);
  t.after(() => rm(current.root, { recursive: true, force: true }));
  await expectPredicate(
    async () =>
      buildAliceRuntimeInputsContract({
        buildCommit: BUILD_B,
        contextContract: current.contract,
        contextPolicy,
        dockerfileBytes: Buffer.from("FROM scratch\n"),
        dockerignoreBytes: Buffer.from(".git\n"),
        buildPolicy: policy,
        buildArguments: buildArgs(BUILD_B),
      }),
    "CONTEXT_BUILD_COMMIT_MISMATCH",
  );
});
