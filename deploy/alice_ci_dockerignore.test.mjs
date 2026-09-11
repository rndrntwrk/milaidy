import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ALICE_CI_DOCKERIGNORE_APPEND_LINES,
  AliceCiDockerignoreError,
  buildAliceCiDockerignore,
  verifyAliceCiDockerignoreReceipt,
} from "./alice_ci_dockerignore.mjs";

async function expectPredicate(fn, predicateId) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof AliceCiDockerignoreError);
    assert.equal(error.predicateId, predicateId);
    return true;
  });
}

test("generator exactly preserves base bytes and appends current Alice rules", () => {
  const base = Buffer.from(".git\nnode_modules\ndeploy/\n", "utf8");
  const built = buildAliceCiDockerignore(base);
  assert.equal(
    built.outputBytes.toString("utf8"),
    `${base.toString("utf8")}${ALICE_CI_DOCKERIGNORE_APPEND_LINES.join("\n")}\n`,
  );
  assert.equal(built.receipt.appendedLineCount, 19);
  assert.equal(
    verifyAliceCiDockerignoreReceipt({
      baseBytes: base,
      outputBytes: built.outputBytes,
      receipt: built.receipt,
    }),
    built.receipt,
  );
});

test("base must be canonical LF UTF-8 with one terminal newline", async () => {
  await expectPredicate(
    async () => buildAliceCiDockerignore(Buffer.from(".git\r\n")),
    "BASE_CRLF_INVALID",
  );
  await expectPredicate(
    async () => buildAliceCiDockerignore(Buffer.from(".git")),
    "BASE_TERMINAL_NEWLINE_MISSING",
  );
  await expectPredicate(
    async () => buildAliceCiDockerignore(Buffer.from([0xff, 0xfe])),
    "BASE_UTF8_INVALID",
  );
});

test("base cannot silently absorb or override an Alice append rule", async () => {
  await expectPredicate(
    async () =>
      buildAliceCiDockerignore(
        Buffer.from(".git\n!deploy/modal\n", "utf8"),
      ),
    "BASE_ALREADY_CONTAINS_ALICE_RULE",
  );
});

test("receipt detects output or receipt mutation", async () => {
  const base = Buffer.from(".git\n", "utf8");
  const built = buildAliceCiDockerignore(base);
  await expectPredicate(
    async () =>
      verifyAliceCiDockerignoreReceipt({
        baseBytes: base,
        outputBytes: Buffer.concat([built.outputBytes, Buffer.from("extra\n")]),
        receipt: built.receipt,
      }),
    "OUTPUT_BYTES_MISMATCH",
  );
  await expectPredicate(
    async () =>
      verifyAliceCiDockerignoreReceipt({
        baseBytes: base,
        outputBytes: built.outputBytes,
        receipt: { ...built.receipt, outputLineCount: 1 },
      }),
    "RECEIPT_MISMATCH",
  );
});

test("CLI destinations use create-only semantics", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "alice-dockerignore-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = path.join(root, "base.dockerignore");
  const output = path.join(root, ".dockerignore");
  const receipt = path.join(root, "receipt.json");
  await writeFile(base, ".git\n", "utf8");
  const { spawnSync } = await import("node:child_process");
  const script = new URL("./alice_ci_dockerignore.mjs", import.meta.url);
  const first = spawnSync(
    process.execPath,
    [
      script.pathname,
      "--base",
      base,
      "--output",
      output,
      "--receipt",
      receipt,
    ],
    { encoding: "utf8" },
  );
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /"ok":true/);
  assert.equal(
    (await readFile(output, "utf8")).includes("!deploy/modal\n"),
    true,
  );
  const second = spawnSync(
    process.execPath,
    [
      script.pathname,
      "--base",
      base,
      "--output",
      output,
      "--receipt",
      receipt,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(second.status, 0);
});
