#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CI_DOCKERIGNORE_RECEIPT_SCHEMA =
  "alice.ci-dockerignore-receipt.v1";

export const ALICE_CI_DOCKERIGNORE_APPEND_LINES = Object.freeze([
  "!eliza/apps/app-companion",
  "!eliza/apps/app-lifeops",
  "!deploy/cloud-agent-template",
  "!deploy/cloud-agent-template/**",
  "!deploy/modal",
  "!deploy/modal/write_alice_runtime_build_manifest.mjs",
  "!deploy/modal/verify_alice_runtime_build_manifest.mjs",
  "!deploy/modal/alice_capability_bom.mjs",
  "!deploy/modal/verify_alice_capability_bom.mjs",
  "!deploy/alice",
  "!deploy/alice/alice-capability-policy.v1.json",
  "!apps/homepage",
  "!apps/homepage/**",
  "!eliza/packages/examples",
  "!eliza/packages/examples/**",
  "steward-fi",
  "steward-fi/**",
  "test/contracts",
  "test/contracts/**",
]);

export class AliceCiDockerignoreError extends Error {
  constructor(predicateId, details = {}) {
    super(`ALICE_CI_DOCKERIGNORE_INVALID:${predicateId}`);
    this.name = "AliceCiDockerignoreError";
    this.code = "ALICE_CI_DOCKERIGNORE_INVALID";
    this.predicateId = predicateId;
    this.details = Object.freeze({ ...details });
  }
}

function fail(predicateId, details = {}) {
  throw new AliceCiDockerignoreError(predicateId, details);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countLines(text) {
  if (text.length === 0) return 0;
  return text.endsWith("\n")
    ? text.split("\n").length - 1
    : text.split("\n").length;
}

function validateBaseBytes(baseBytes) {
  if (!Buffer.isBuffer(baseBytes) || baseBytes.length === 0) {
    fail("BASE_EMPTY");
  }
  const text = baseBytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(baseBytes)) {
    fail("BASE_UTF8_INVALID");
  }
  if (text.includes("\r")) {
    fail("BASE_CRLF_INVALID");
  }
  if (!text.endsWith("\n")) {
    fail("BASE_TERMINAL_NEWLINE_MISSING");
  }
  if (text.includes("\0")) {
    fail("BASE_NUL_INVALID");
  }
  const existingLines = new Set(text.split("\n"));
  for (const rule of ALICE_CI_DOCKERIGNORE_APPEND_LINES) {
    if (existingLines.has(rule)) {
      fail("BASE_ALREADY_CONTAINS_ALICE_RULE", { rule });
    }
  }
  return text;
}

function verifyAppendLines() {
  if (
    ALICE_CI_DOCKERIGNORE_APPEND_LINES.length === 0 ||
    new Set(ALICE_CI_DOCKERIGNORE_APPEND_LINES).size !==
      ALICE_CI_DOCKERIGNORE_APPEND_LINES.length
  ) {
    fail("APPEND_RULES_INVALID");
  }
  for (const rule of ALICE_CI_DOCKERIGNORE_APPEND_LINES) {
    if (
      typeof rule !== "string" ||
      rule.length === 0 ||
      rule.includes("\n") ||
      rule.includes("\r") ||
      rule.includes("\0")
    ) {
      fail("APPEND_RULE_INVALID", {
        observed:
          typeof rule === "string" ? rule.slice(0, 160) : typeof rule,
      });
    }
  }
}

export function buildAliceCiDockerignore(baseBytes) {
  verifyAppendLines();
  const baseText = validateBaseBytes(baseBytes);
  const appendText = `${ALICE_CI_DOCKERIGNORE_APPEND_LINES.join("\n")}\n`;
  const outputBytes = Buffer.from(`${baseText}${appendText}`, "utf8");
  const receiptUnsigned = Object.freeze({
    schemaVersion: CI_DOCKERIGNORE_RECEIPT_SCHEMA,
    baseSha256: sha256(baseBytes),
    appendRulesSha256: sha256(Buffer.from(appendText, "utf8")),
    outputSha256: sha256(outputBytes),
    baseLineCount: countLines(baseText),
    appendedLineCount: ALICE_CI_DOCKERIGNORE_APPEND_LINES.length,
    outputLineCount: countLines(outputBytes.toString("utf8")),
  });
  return Object.freeze({
    outputBytes,
    receipt: Object.freeze({
      ...receiptUnsigned,
      receiptSha256: sha256(canonicalBytes(receiptUnsigned)),
    }),
  });
}

function exactKeys(value, expected, predicateId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(predicateId);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(predicateId, { expectedKeys: wanted, observedKeys: actual });
  }
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("RECEIPT_DIGEST_INVALID", { field, observed: value });
  }
}

export function verifyAliceCiDockerignoreReceipt({
  baseBytes,
  outputBytes,
  receipt,
}) {
  exactKeys(
    receipt,
    [
      "schemaVersion",
      "baseSha256",
      "appendRulesSha256",
      "outputSha256",
      "baseLineCount",
      "appendedLineCount",
      "outputLineCount",
      "receiptSha256",
    ],
    "RECEIPT_KEYS_INVALID",
  );
  if (receipt.schemaVersion !== CI_DOCKERIGNORE_RECEIPT_SCHEMA) {
    fail("RECEIPT_SCHEMA_INVALID", { observed: receipt.schemaVersion });
  }
  for (const field of [
    "baseSha256",
    "appendRulesSha256",
    "outputSha256",
    "receiptSha256",
  ]) {
    assertDigest(receipt[field], field);
  }
  for (const field of [
    "baseLineCount",
    "appendedLineCount",
    "outputLineCount",
  ]) {
    if (!Number.isSafeInteger(receipt[field]) || receipt[field] < 0) {
      fail("RECEIPT_COUNT_INVALID", { field, observed: receipt[field] });
    }
  }
  const built = buildAliceCiDockerignore(baseBytes);
  if (!built.outputBytes.equals(outputBytes)) {
    fail("OUTPUT_BYTES_MISMATCH", {
      expected: built.receipt.outputSha256,
      observed: sha256(outputBytes),
    });
  }
  if (JSON.stringify(built.receipt) !== JSON.stringify(receipt)) {
    fail("RECEIPT_MISMATCH", {
      expected: built.receipt.receiptSha256,
      observed: receipt.receiptSha256,
    });
  }
  return Object.freeze(receipt);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail("CLI_ARGUMENT_INVALID", { token: token.slice(0, 160) });
    }
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail("CLI_VALUE_MISSING", { name });
    }
    if (values.has(name)) {
      fail("CLI_DUPLICATE_ARGUMENT", { name });
    }
    values.set(name, value);
    index += 1;
  }
  return values;
}

async function main(argv) {
  const values = parseArgs(argv);
  for (const required of ["base", "output", "receipt"]) {
    if (!values.has(required)) {
      fail("CLI_REQUIRED_ARGUMENT_MISSING", { required });
    }
  }
  const baseBytes = await readFile(values.get("base"));
  const built = buildAliceCiDockerignore(baseBytes);
  const output = values.get("output");
  const receipt = values.get("receipt");
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(path.dirname(receipt), { recursive: true });
  await writeFile(output, built.outputBytes, { flag: "wx", mode: 0o444 });
  await writeFile(receipt, canonicalBytes(built.receipt), {
    flag: "wx",
    mode: 0o444,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      outputSha256: built.receipt.outputSha256,
      receiptSha256: built.receipt.receiptSha256,
    })}\n`,
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof AliceCiDockerignoreError) {
      process.stderr.write(
        `${JSON.stringify({
          code: error.code,
          predicateId: error.predicateId,
          details: error.details,
        })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stderr.write(
      `${JSON.stringify({
        code: "ALICE_CI_DOCKERIGNORE_INTERNAL",
        message: error?.message ?? String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
