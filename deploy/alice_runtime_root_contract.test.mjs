import assert from "node:assert/strict";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AliceRuntimeRootContractError,
  assertAliceRuntimeStableFileIdentity,
  buildAliceRuntimeRootContract,
  verifyAliceRuntimeRootContract,
  verifyAliceRuntimeRootContractShape,
  writeAliceRuntimeRootContract,
} from "./alice_runtime_root_contract.mjs";

const SOURCE = "1".repeat(40);
const ELIZA = "2".repeat(40);
const RUNTIME_ROOT = "runtime-root";
const BUILD_CONTEXT = "build-context";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "alice-runtime-root-"));
  await mkdir(path.join(root, "bin"));
  await mkdir(path.join(root, "node_modules", "@elizaos", "core"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "bin", "alice-runtime"),
    "#!/bin/sh\necho alice\n",
    { mode: 0o755 },
  );
  await writeFile(
    path.join(root, "node_modules", "@elizaos", "core", "package.json"),
    '{"name":"@elizaos/core"}\n',
  );
  await symlink(
    "core",
    path.join(root, "node_modules", "@elizaos", "core-alias"),
  );
  return root;
}

function buildContract(root, overrides = {}) {
  return buildAliceRuntimeRootContract({
    root,
    contractKind: RUNTIME_ROOT,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
    ...overrides,
  });
}

function writeContract(root, output, overrides = {}) {
  return writeAliceRuntimeRootContract({
    root,
    output,
    contractKind: RUNTIME_ROOT,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
    ...overrides,
  });
}

async function expectPredicate(fn, predicateId) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof AliceRuntimeRootContractError);
    assert.equal(error.predicateId, predicateId);
    return true;
  });
}

test("contract kind is explicit and independently verified", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  await expectPredicate(
    () =>
      buildAliceRuntimeRootContract({
        root,
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
      }),
    "CONTRACT_KIND_INVALID",
  );
  await expectPredicate(
    () => buildContract(root, { contractKind: "unknown" }),
    "CONTRACT_KIND_INVALID",
  );

  const runtime = await buildContract(root);
  assert.equal(runtime.contractKind, RUNTIME_ROOT);
  assert.equal(
    verifyAliceRuntimeRootContractShape(runtime, {
      expectedKind: RUNTIME_ROOT,
    }),
    runtime,
  );
  await expectPredicate(
    async () =>
      verifyAliceRuntimeRootContractShape(runtime, {
        expectedKind: BUILD_CONTEXT,
      }),
    "CONTRACT_KIND_MISMATCH",
  );

  const context = await buildContract(root, { contractKind: BUILD_CONTEXT });
  assert.equal(context.contractKind, BUILD_CONTEXT);
});

test("runtime roots bind ownership while build contexts remain runner-ownership independent", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const runtime = await buildContract(root);
  for (const entry of runtime.entries) {
    assert.equal(Number.isSafeInteger(entry.uid), true, entry.path);
    assert.equal(Number.isSafeInteger(entry.gid), true, entry.path);
    assert.ok(entry.uid >= 0, entry.path);
    assert.ok(entry.gid >= 0, entry.path);
  }

  const context = await buildContract(root, { contractKind: BUILD_CONTEXT });
  for (const entry of context.entries) {
    assert.equal(Object.hasOwn(entry, "uid"), false, entry.path);
    assert.equal(Object.hasOwn(entry, "gid"), false, entry.path);
  }

  assert.notEqual(runtime.entriesSha256, context.entriesSha256);
});

test("file identity must remain stable across open, hash, and final readback", async () => {
  const stable = {
    dev: 2049,
    ino: 44,
    mode: 0o100755,
    uid: 1001,
    gid: 1001,
    size: 128,
    mtimeMs: 1_777_000_000_000,
    ctimeMs: 1_777_000_000_001,
  };
  assert.doesNotThrow(() =>
    assertAliceRuntimeStableFileIdentity(stable, { ...stable }, "bin/alice"),
  );
  for (const [field, value] of [
    ["dev", 2050],
    ["ino", 45],
    ["mode", 0o100644],
    ["uid", 1002],
    ["gid", 1002],
    ["size", 129],
    ["mtimeMs", stable.mtimeMs + 1],
    ["ctimeMs", stable.ctimeMs + 1],
  ]) {
    assert.throws(
      () =>
        assertAliceRuntimeStableFileIdentity(
          stable,
          { ...stable, [field]: value },
          "bin/alice",
        ),
      (error) => {
        assert.ok(error instanceof AliceRuntimeRootContractError);
        assert.equal(error.predicateId, "FILE_CHANGED_DURING_HASH");
        assert.equal(error.details.path, "bin/alice");
        assert.equal(error.details.field, field);
        return true;
      },
    );
  }
});

test("contract is deterministic across mtimes and directory creation order", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await buildContract(root);
  const now = new Date();
  await utimes(
    path.join(root, "bin", "alice-runtime"),
    now,
    new Date(now.getTime() + 5000),
  );
  await mkdir(path.join(root, "z-last"));
  await writeFile(path.join(root, "z-last", "tmp"), "x");
  await rm(path.join(root, "z-last"), { recursive: true });
  const second = await buildContract(root);
  assert.equal(second.contractSha256, first.contractSha256);
  assert.deepEqual(second, first);
});

test("content and executable-bit changes alter the contract", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await buildContract(root);
  await writeFile(
    path.join(root, "bin", "alice-runtime"),
    "#!/bin/sh\necho changed\n",
  );
  const contentChanged = await buildContract(root);
  assert.notEqual(contentChanged.contractSha256, first.contractSha256);
  await chmod(path.join(root, "bin", "alice-runtime"), 0o644);
  const modeChanged = await buildContract(root);
  assert.notEqual(modeChanged.contractSha256, contentChanged.contractSha256);
});

test("relative in-root symlinks are admitted and escaping symlinks are rejected", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const contract = await buildContract(root);
  const alias = contract.entries.find(
    (entry) => entry.path === "node_modules/@elizaos/core-alias",
  );
  const aliasInfo = await lstat(
    path.join(root, "node_modules", "@elizaos", "core-alias"),
  );
  assert.deepEqual(alias, {
    path: "node_modules/@elizaos/core-alias",
    type: "symlink",
    mode: 0o777,
    uid: aliasInfo.uid,
    gid: aliasInfo.gid,
    target: "core",
  });
  await symlink(
    "../../../../etc/passwd",
    path.join(root, "node_modules", "escape"),
  );
  await expectPredicate(
    () => buildContract(root),
    "SYMLINK_ESCAPE",
  );
});

test("forbidden source-control and secret-shaped files fail closed", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".git"));
  await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
  await expectPredicate(
    () => buildContract(root),
    "FORBIDDEN_PREFIX",
  );
  await rm(path.join(root, ".git"), { recursive: true });
  await writeFile(path.join(root, ".env"), "SECRET=value\n");
  await expectPredicate(
    () => buildContract(root),
    "FORBIDDEN_BASENAME",
  );
});

test("manifest shape, summaries, ordering, and digest are independently verified", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const contract = await buildContract(root);
  assert.equal(verifyAliceRuntimeRootContractShape(contract), contract);
  const mutated = structuredClone(contract);
  mutated.entries[0].mode = 0;
  await expectPredicate(
    async () => verifyAliceRuntimeRootContractShape(mutated),
    "ENTRIES_SHA_MISMATCH",
  );
});

test("write uses create-only semantics and verify detects first root difference", async (t) => {
  const root = await fixture();
  const outputDir = await mkdtemp(
    path.join(tmpdir(), "alice-runtime-contract-output-"),
  );
  const output = path.join(outputDir, "alice-runtime-root.json");
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const contract = await writeContract(root, output);
  await assert.rejects(() => writeContract(root, output));
  assert.equal(
    (await verifyAliceRuntimeRootContract({
      root,
      contract,
      expectedKind: RUNTIME_ROOT,
    })).contractSha256,
    contract.contractSha256,
  );
  await rename(
    path.join(root, "bin", "alice-runtime"),
    path.join(root, "bin", "alice-runtime-renamed"),
  );
  await expectPredicate(
    () =>
      verifyAliceRuntimeRootContract({
        root,
        contract,
        expectedKind: RUNTIME_ROOT,
      }),
    "ROOT_CONTENT_MISMATCH",
  );
});

test("hardlinks are represented as ordinary files with equal content digests", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await link(
    path.join(root, "bin", "alice-runtime"),
    path.join(root, "bin", "alice-runtime-hardlink"),
  );
  const contract = await buildContract(root);
  const a = contract.entries.find(
    (entry) => entry.path === "bin/alice-runtime",
  );
  const b = contract.entries.find(
    (entry) => entry.path === "bin/alice-runtime-hardlink",
  );
  assert.equal(a.type, "file");
  assert.equal(b.type, "file");
  assert.equal(a.sha256, b.sha256);
});
