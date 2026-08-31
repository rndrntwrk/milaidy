import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
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

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "alice-context-snapshot-"));
  await mkdir(path.join(root, "deploy"));
  await writeFile(path.join(root, ".dockerignore"), ".git\n");
  await writeFile(
    path.join(root, "deploy", "Dockerfile.runtime-context"),
    "FROM scratch\nCOPY . /\n",
  );
  return root;
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

test("snapshot binds the exact Docker-exported filesystem into a root contract", async (t) => {
  const repoRoot = await fixture();
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
    outputDirectory: output,
    contractPath,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
    execute: async ({ cwd, args }) => {
      assert.equal(cwd, repoRoot);
      assert.equal(args.at(-1), ".");
      await mkdir(path.join(output, "src"), { recursive: true });
      await writeFile(path.join(output, "src", "index.js"), "alice\n");
    },
  });

  assert.equal(result.contract.sourceCommit, SOURCE);
  assert.equal(result.contract.elizaCommit, ELIZA);
  assert.equal(
    result.contract.entries.some((entry) => entry.path === "src/index.js"),
    true,
  );
  assert.equal(
    JSON.parse(await readFile(contractPath, "utf8")).contractSha256,
    result.contract.contractSha256,
  );
});

test("preexisting output or contract fails before Docker execution", async (t) => {
  const repoRoot = await fixture();
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
        outputDirectory: output,
        contractPath,
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        execute: async () => {
          called = true;
        },
      }),
    "OUTPUT_ALREADY_EXISTS",
  );
  assert.equal(called, false);
});

test("Docker failure is preserved and partial output is removed", async (t) => {
  const repoRoot = await fixture();
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
        outputDirectory: output,
        contractPath,
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        execute: async () => {
          await mkdir(output, { recursive: true });
          await writeFile(path.join(output, "partial"), "x");
          throw new AliceRuntimeContextSnapshotError("DOCKER_BUILD_FAILED", {
            exitCode: 1,
          });
        },
      }),
    "DOCKER_BUILD_FAILED",
  );
  await assert.rejects(() => readFile(path.join(output, "partial")));
});

test("snapshot output and contract must stay outside the source repository", async (t) => {
  const repoRoot = await fixture();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  await expectPredicate(
    () =>
      snapshotAliceRuntimeContext({
        repoRoot,
        dockerfile: "deploy/Dockerfile.runtime-context",
        outputDirectory: path.join(repoRoot, "output"),
        contractPath: path.join(
          tmpdir(),
          `alice-contract-${process.pid}.json`,
        ),
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        execute: async () => {},
      }),
    "OUTPUT_INSIDE_REPOSITORY",
  );
});

test("Dockerfile cannot escape the repository root", async (t) => {
  const repoRoot = await fixture();
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  await expectPredicate(
    () =>
      snapshotAliceRuntimeContext({
        repoRoot,
        dockerfile: "../outside.Dockerfile",
        outputDirectory: path.join(
          tmpdir(),
          `alice-output-${process.pid}`,
        ),
        contractPath: path.join(
          tmpdir(),
          `alice-contract-${process.pid}.json`,
        ),
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
        execute: async () => {},
      }),
    "DOCKERFILE_PATH_ESCAPE",
  );
});
