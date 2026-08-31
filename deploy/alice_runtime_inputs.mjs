#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAliceRuntimeRootContractShape } from "./alice_runtime_root_contract.mjs";

export const RUNTIME_INPUTS_SCHEMA = "alice.runtime-inputs.v1";
export const RUNTIME_BUILD_POLICY_SCHEMA = "alice.runtime-build-policy.v1";

export class AliceRuntimeInputsError extends Error {
  constructor(predicateId, details = {}) {
    super(`ALICE_RUNTIME_INPUTS_INVALID:${predicateId}`);
    this.name = "AliceRuntimeInputsError";
    this.code = "ALICE_RUNTIME_INPUTS_INVALID";
    this.predicateId = predicateId;
    this.details = Object.freeze({ ...details });
  }
}

function fail(predicateId, details = {}) {
  throw new AliceRuntimeInputsError(predicateId, details);
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertCommit(value, field) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    fail("COMMIT_INVALID", {
      field,
      observed:
        typeof value === "string" ? value.slice(0, 80) : typeof value,
    });
  }
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("DIGEST_INVALID", {
      field,
      observed:
        typeof value === "string" ? value.slice(0, 80) : typeof value,
    });
  }
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

function verifyReference(value, field) {
  exactKeys(value, ["reference", "digest"], "REFERENCE_SHAPE_INVALID");
  if (
    typeof value.reference !== "string" ||
    value.reference.length < 3 ||
    value.reference.length > 240
  ) {
    fail("REFERENCE_VALUE_INVALID", { field });
  }
  assertDigest(value.digest, `${field}.digest`);
}

export function verifyAliceRuntimeBuildPolicy(value) {
  exactKeys(
    value,
    [
      "schemaVersion",
      "platform",
      "runtimeVersionStrategy",
      "dockerfileFrontend",
      "sbomScanner",
      "baseImages",
      "toolchain",
    ],
    "BUILD_POLICY_KEYS_INVALID",
  );
  if (value.schemaVersion !== RUNTIME_BUILD_POLICY_SCHEMA) {
    fail("BUILD_POLICY_SCHEMA_INVALID", { observed: value.schemaVersion });
  }
  if (value.platform !== "linux/amd64") {
    fail("BUILD_POLICY_PLATFORM_INVALID", { observed: value.platform });
  }
  if (value.runtimeVersionStrategy !== "runtime-inputs-sha256") {
    fail("RUNTIME_VERSION_STRATEGY_INVALID", {
      observed: value.runtimeVersionStrategy,
    });
  }
  verifyReference(value.dockerfileFrontend, "dockerfileFrontend");
  verifyReference(value.sbomScanner, "sbomScanner");
  exactKeys(
    value.baseImages,
    ["bun", "python", "node"],
    "BASE_IMAGE_KEYS_INVALID",
  );
  for (const key of ["bun", "python", "node"]) {
    verifyReference(value.baseImages[key], `baseImages.${key}`);
  }
  exactKeys(
    value.toolchain,
    ["node", "bun", "wrangler"],
    "TOOLCHAIN_KEYS_INVALID",
  );
  for (const key of ["node", "bun", "wrangler"]) {
    const version = value.toolchain[key];
    if (
      typeof version !== "string" ||
      !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
    ) {
      fail("TOOLCHAIN_VERSION_INVALID", { field: key, observed: version });
    }
  }
  return Object.freeze(value);
}

export function buildAliceRuntimeInputsContract({
  buildCommit,
  contextContract,
  dockerfileBytes,
  dockerignoreBytes,
  buildPolicy,
}) {
  assertCommit(buildCommit, "buildCommit");
  const context = verifyAliceRuntimeRootContractShape(contextContract);
  if (context.sourceCommit !== buildCommit) {
    fail("CONTEXT_BUILD_COMMIT_MISMATCH", {
      expected: buildCommit,
      observed: context.sourceCommit,
    });
  }
  const policy = verifyAliceRuntimeBuildPolicy(buildPolicy);
  const dockerfileSha256 = sha256(dockerfileBytes);
  const dockerignoreSha256 = sha256(dockerignoreBytes);
  const buildPolicySha256 = sha256(canonicalBytes(policy));
  const identity = Object.freeze({
    schemaVersion: RUNTIME_INPUTS_SCHEMA,
    platform: policy.platform,
    runtimeVersionStrategy: policy.runtimeVersionStrategy,
    elizaCommit: context.elizaCommit,
    contextEntriesSha256: context.entriesSha256,
    contextPolicySha256: context.policySha256,
    dockerfileSha256,
    dockerignoreSha256,
    buildPolicySha256,
  });
  const runtimeInputsSha256 = sha256(canonicalBytes(identity));
  return Object.freeze({
    ...identity,
    buildCommit,
    runtimeInputsSha256,
    runtimeVersion: `sha256-${runtimeInputsSha256.slice(
      "sha256:".length,
      "sha256:".length + 20,
    )}`,
  });
}

export function verifyAliceRuntimeInputsContract(value) {
  exactKeys(
    value,
    [
      "schemaVersion",
      "platform",
      "runtimeVersionStrategy",
      "elizaCommit",
      "contextEntriesSha256",
      "contextPolicySha256",
      "dockerfileSha256",
      "dockerignoreSha256",
      "buildPolicySha256",
      "buildCommit",
      "runtimeInputsSha256",
      "runtimeVersion",
    ],
    "RUNTIME_INPUTS_KEYS_INVALID",
  );
  if (value.schemaVersion !== RUNTIME_INPUTS_SCHEMA) {
    fail("RUNTIME_INPUTS_SCHEMA_INVALID");
  }
  if (value.platform !== "linux/amd64") {
    fail("RUNTIME_INPUTS_PLATFORM_INVALID");
  }
  if (value.runtimeVersionStrategy !== "runtime-inputs-sha256") {
    fail("RUNTIME_INPUTS_VERSION_STRATEGY_INVALID");
  }
  assertCommit(value.elizaCommit, "elizaCommit");
  assertCommit(value.buildCommit, "buildCommit");
  for (const field of [
    "contextEntriesSha256",
    "contextPolicySha256",
    "dockerfileSha256",
    "dockerignoreSha256",
    "buildPolicySha256",
    "runtimeInputsSha256",
  ]) {
    assertDigest(value[field], field);
  }
  const identity = {
    schemaVersion: value.schemaVersion,
    platform: value.platform,
    runtimeVersionStrategy: value.runtimeVersionStrategy,
    elizaCommit: value.elizaCommit,
    contextEntriesSha256: value.contextEntriesSha256,
    contextPolicySha256: value.contextPolicySha256,
    dockerfileSha256: value.dockerfileSha256,
    dockerignoreSha256: value.dockerignoreSha256,
    buildPolicySha256: value.buildPolicySha256,
  };
  const expectedInputs = sha256(canonicalBytes(identity));
  if (value.runtimeInputsSha256 !== expectedInputs) {
    fail("RUNTIME_INPUTS_SHA_MISMATCH", {
      expected: expectedInputs,
      observed: value.runtimeInputsSha256,
    });
  }
  const expectedVersion = `sha256-${expectedInputs.slice(
    "sha256:".length,
    "sha256:".length + 20,
  )}`;
  if (value.runtimeVersion !== expectedVersion) {
    fail("RUNTIME_VERSION_MISMATCH", {
      expected: expectedVersion,
      observed: value.runtimeVersion,
    });
  }
  return Object.freeze(value);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail("CLI_ARGUMENT_INVALID", { token });
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail("CLI_VALUE_MISSING", { token });
    }
    const name = token.slice(2);
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
  for (const key of [
    "build-commit",
    "context-manifest",
    "dockerfile",
    "dockerignore",
    "build-policy",
    "output",
  ]) {
    if (!values.has(key)) {
      fail("CLI_REQUIRED_ARGUMENT_MISSING", { key });
    }
  }
  const contract = buildAliceRuntimeInputsContract({
    buildCommit: values.get("build-commit"),
    contextContract: JSON.parse(
      await readFile(values.get("context-manifest"), "utf8"),
    ),
    dockerfileBytes: await readFile(values.get("dockerfile")),
    dockerignoreBytes: await readFile(values.get("dockerignore")),
    buildPolicy: JSON.parse(
      await readFile(values.get("build-policy"), "utf8"),
    ),
  });
  const output = values.get("output");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, canonicalBytes(contract), {
    flag: "wx",
    mode: 0o444,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      runtimeInputsSha256: contract.runtimeInputsSha256,
      runtimeVersion: contract.runtimeVersion,
    })}\n`,
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof AliceRuntimeInputsError) {
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
        code: "ALICE_RUNTIME_INPUTS_INTERNAL",
        message: error?.message ?? String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
