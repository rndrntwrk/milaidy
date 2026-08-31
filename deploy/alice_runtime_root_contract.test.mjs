import assert from "node:assert/strict";
import {
  chmod,
  link,
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
  buildAliceRuntimeRootContract,
  verifyAliceRuntimeRootContract,
  verifyAliceRuntimeRootContractShape,
  writeAliceRuntimeRootContract,
} from "./alice_runtime_root_contract.mjs";

const SOURCE = "1".repeat(40);
const ELIZA = "2".repeat(40);

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

async function expectPredicate(fn, predicateId) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof AliceRuntimeRootContractError);
    assert.equal(error.predicateId, predicateId);
    return true;
  });
}

test("contract is deterministic across mtimes and directory creation order", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
  const now = new Date();
  await utimes(
    path.join(root, "bin", "alice-runtime"),
    now,
    new Date(now.getTime() + 5000),
  );
  await mkdir(path.join(root, "z-last"));
  await writeFile(path.join(root, "z-last", "tmp"), "x");
  await rm(path.join(root, "z-last"), { recursive: true });
  const second = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
  assert.equal(second.contractSha256, first.contractSha256);
  assert.deepEqual(second, first);
});

test("content and executable-bit changes alter the contract", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
  await writeFile(
    path.join(root, "bin", "alice-runtime"),
    "#!/bin/sh\necho changed\n",
  );
  const contentChanged = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
  assert.notEqual(contentChanged.contractSha256, first.contractSha256);
  await chmod(path.join(root, "bin", "alice-runtime"), 0o644);
  const modeChanged = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
  assert.notEqual(modeChanged.contractSha256, contentChanged.contractSha256);
});

test("relative in-root symlinks are admitted and escaping symlinks are rejected", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const contract = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
  const alias = contract.entries.find(
    (entry) => entry.path === "node_modules/@elizaos/core-alias",
  );
  assert.deepEqual(alias, {
    path: "node_modules/@elizaos/core-alias",
    type: "symlink",
    mode: 0o777,
    target: "core",
  });
  await symlink(
    "../../../../etc/passwd",
    path.join(root, "node_modules", "escape"),
  );
  await expectPredicate(
    () =>
      buildAliceRuntimeRootContract({
        root,
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
      }),
    "SYMLINK_ESCAPE",
  );
});

test("forbidden source-control and secret-shaped files fail closed", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".git"));
  await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
  await expectPredicate(
    () =>
      buildAliceRuntimeRootContract({
        root,
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
      }),
    "FORBIDDEN_PREFIX",
  );
  await rm(path.join(root, ".git"), { recursive: true });
  await writeFile(path.join(root, ".env"), "SECRET=value\n");
  await expectPredicate(
    () =>
      buildAliceRuntimeRootContract({
        root,
        sourceCommit: SOURCE,
        elizaCommit: ELIZA,
      }),
    "FORBIDDEN_BASENAME",
  );
});

test("manifest shape, summaries, ordering, and digest are independently verified", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const contract = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
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
  const contract = await writeAliceRuntimeRootContract({
    root,
    output,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
  await assert.rejects(() =>
    writeAliceRuntimeRootContract({
      root,
      output,
      sourceCommit: SOURCE,
      elizaCommit: ELIZA,
    }),
  );
  assert.equal(
    (await verifyAliceRuntimeRootContract({ root, contract }))
      .contractSha256,
    contract.contractSha256,
  );
  await rename(
    path.join(root, "bin", "alice-runtime"),
    path.join(root, "bin", "alice-runtime-renamed"),
  );
  await expectPredicate(
    () => verifyAliceRuntimeRootContract({ root, contract }),
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
  const contract = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
  });
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
