import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AliceRuntimeContextSnapshotError,
  buildAliceRuntimeContextSnapshotArgs,
  snapshotAliceRuntimeContext,
} from "./alice_runtime_context_snapshot.mjs";

const SOURCE = "a".repeat(40);
const ELIZA = "b".repeat(40);
const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const policy = {
  schemaVersion: "alice.runtime-root-policy.v1",
  forbiddenPrefixes: [".git", ".github"],
  forbiddenBasenames: [".env", ".npmrc"],
  maxFileBytes: 1024 * 1024,
  maxEntryCount: 1000,
  maxTotalFileBytes: 4 * 1024 * 1024,
  allowDanglingSymlinks: true,
};

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "alice-context-snapshot-"));
  await mkdir(path.join(root, "deploy"));
  await writeFile(path.join(root, ".dockerignore"), ".git\n");
  const dockerfileBytes = Buffer.from("FROM scratch\nCOPY . /\n");
  await writeFile(
    path.join(root, "deploy", "Dockerfile.runtime-context"),
    dockerfileBytes,
  );
  return { root, dockerfileBytes };
}

async function expectPredicate(fn, predicateId) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof AliceRuntimeContextSnapshotError);
    assert.equal(error.predicateId, predicateId);
    return true;
  });
}

test("Buildx command exports the single-platform context filesystem exactly", () => {
  assert.deepEqual(
    buildAliceRuntimeContextSnapshotArgs({
      dockerfile: "deploy/Dockerfile.runtime-context",
      outputDirectory: "/tmp/output",
    }),
    [
      "buildx",
      "build",
      "--progress=plain",
      "--platform=linux/amd64",
      "--file",
      "deploy/Dockerfile.runtime-context",
      "--output",
      "type=local,dest=/tmp/output",
      "--no-cache",
      ".",
    ],
  );
});

test("snapshot binds the exact fixed Docker-exported context", async (t) => {
  const { root: repoRoot, dockerfileBytes } = await fixture();
  const artifacts = await mkdtemp(
    path.join(tmpdir(), "alice-context-artifacts-"),
  );
  const output = path.join(artifacts, "context-root");
  const contractPath = path.join(artifacts, "context.json");
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(artifacts, { recursive: true, force: true }));

  const result = await snapshotAliceRuntimeContext({
    repoRoot,
    dockerfile: "deploy/Dockerfile.runtime-context",
    expectedDockerfileSha256: sha256(dockerfileBytes),
    outputDirectory: output,
    contractPath,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
    policy,
    execute: async ({ cwd, args, timeoutMs }) => {
      assert.equal(cwd, repoRoot);
      assert.equal(args.at(-1), ".");
      assert.equal(timeoutMs, 600000);
      await mkdir(path.join(output, "src"), { recursive: true });
      await writeFile(path.join(output, "src", "index.js"), "alice\n");
    },
  });

  assert.equal(result.contract.contractKind, "build-context");
  assert.equal(result.contract.sourceCommit, SOURCE);
  assert.equal(result.contract.elizaCommit, ELIZA);
  assert.equal(result.dockerfileSha256, sha256(dockerfileBytes));
  assert.equal(
    result.contract.entries.some((entry) => entry.path === "src/index.js"),
    true,
  );
  assert.equal(
    JSON.parse(await readFile(contractPath, "utf8")).contractSha256,
    result.contract.contractSha256,
  );
});

test("Dockerfile bytes are pinned before execution", async (t) => {
  const { root: repoRoot } = await fixture();
  const artifacts = await mkdtemp(
    path.join(tmpdir(), "alice-context-artifacts-"),
  );
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  let called = false;
  await expectPredicate(
    () =>
      snapshotAliceRuntimeContext({
        repoRoot,
        dockerfile: "deploy/Dockerfile.runtime-context",
        expectedDockerfileSha256: `sha256:${"0".repeat(64)}`,
        outputDirectory: path.join(artifacts, "root"),
        contractPath: path.join(artifacts, "contract.json"),
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        policy,
        execute: async () => {
          called = true;
        },
      }),
    "DOCKERFILE_DIGEST_MISMATCH",
  );
  assert.equal(called, false);
});

test("preexisting output fails before Docker execution", async (t) => {
  const { root: repoRoot, dockerfileBytes } = await fixture();
  const artifacts = await mkdtemp(
    path.join(tmpdir(), "alice-context-artifacts-"),
  );
  const output = path.join(artifacts, "context-root");
  const contractPath = path.join(artifacts, "context.json");
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  await mkdir(output);
  let called = false;
  await expectPredicate(
    () =>
      snapshotAliceRuntimeContext({
        repoRoot,
        dockerfile: "deploy/Dockerfile.runtime-context",
        expectedDockerfileSha256: sha256(dockerfileBytes),
        outputDirectory: output,
        contractPath,
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        policy,
        execute: async () => {
          called = true;
        },
      }),
    "OUTPUT_ALREADY_EXISTS",
  );
  assert.equal(called, false);
});

test("Docker failure is preserved and partial output is removed", async (t) => {
  const { root: repoRoot, dockerfileBytes } = await fixture();
  const artifacts = await mkdtemp(
    path.join(tmpdir(), "alice-context-artifacts-"),
  );
  const output = path.join(artifacts, "context-root");
  const contractPath = path.join(artifacts, "context.json");
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  await expectPredicate(
    () =>
      snapshotAliceRuntimeContext({
        repoRoot,
        dockerfile: "deploy/Dockerfile.runtime-context",
        expectedDockerfileSha256: sha256(dockerfileBytes),
        outputDirectory: output,
        contractPath,
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        policy,
        execute: async () => {
          await mkdir(output, { recursive: true });
          await writeFile(path.join(output, "partial"), "x");
          throw new AliceRuntimeContextSnapshotError(
            "DOCKER_BUILD_FAILED",
            { exitCode: 1 },
          );
        },
      }),
    "DOCKER_BUILD_FAILED",
  );
  await assert.rejects(() => readFile(path.join(output, "partial")));
});

test("output cannot be redirected into the checkout through a symlinked parent", async (t) => {
  const { root: repoRoot, dockerfileBytes } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), "alice-context-link-"));
  const redirect = path.join(outside, "redirect");
  await symlink(repoRoot, redirect);
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  let called = false;
  await expectPredicate(
    () =>
      snapshotAliceRuntimeContext({
        repoRoot,
        dockerfile: "deploy/Dockerfile.runtime-context",
        expectedDockerfileSha256: sha256(dockerfileBytes),
        outputDirectory: path.join(redirect, "context-root"),
        contractPath: path.join(outside, "contract.json"),
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        policy,
        execute: async () => {
          called = true;
        },
      }),
    "OUTPUT_INSIDE_REPOSITORY",
  );
  assert.equal(called, false);
});

test("contract cannot be redirected into the checkout through a symlinked parent", async (t) => {
  const { root: repoRoot, dockerfileBytes } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), "alice-context-link-"));
  const redirect = path.join(outside, "redirect");
  await symlink(repoRoot, redirect);
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  let called = false;
  await expectPredicate(
    () =>
      snapshotAliceRuntimeContext({
        repoRoot,
        dockerfile: "deploy/Dockerfile.runtime-context",
        expectedDockerfileSha256: sha256(dockerfileBytes),
        outputDirectory: path.join(outside, "context-root"),
        contractPath: path.join(redirect, "contract.json"),
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        policy,
        execute: async () => {
          called = true;
        },
      }),
    "CONTRACT_INSIDE_REPOSITORY",
  );
  assert.equal(called, false);
});

test("Dockerfile cannot escape the repository root", async (t) => {
  const { root: repoRoot } = await fixture();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  await expectPredicate(
    () =>
      snapshotAliceRuntimeContext({
        repoRoot,
        dockerfile: "../outside.Dockerfile",
        expectedDockerfileSha256: `sha256:${"0".repeat(64)}`,
        outputDirectory: path.join(tmpdir(), `alice-output-${process.pid}`),
        contractPath: path.join(tmpdir(), `alice-contract-${process.pid}.json`),
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        policy,
        execute: async () => {},
      }),
    "DOCKERFILE_PATH_ESCAPE",
  );
});
