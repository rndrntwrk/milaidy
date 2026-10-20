#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AliceRuntimeRootContractError,
  normalizeAliceRuntimeRootPolicy,
  verifyAliceRuntimeRootContractShape,
} from "./alice_runtime_root_contract.mjs";

export const RUNTIME_INPUTS_SCHEMA = "alice.runtime-inputs.v1";
export const RUNTIME_BUILD_POLICY_SCHEMA = "alice.runtime-build-policy.v1";
export const RUNTIME_REUSE_ADMISSION = "legacy-source-bound";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._/:@+-]{1,239}$/;

export const LEGACY_BUILD_ARGUMENT_KEYS = Object.freeze([
  "APP_ENTRYPOINT",
  "APP_CMD_START",
  "APP_PORT",
  "APP_API_BIND",
  "OCI_SOURCE",
  "OCI_TITLE",
  "OCI_DESCRIPTION",
  "OCI_LICENSES",
  "VERSION",
  "VERSION_CLEAN",
  "REVISION",
  "ELIZA_REVISION",
  "ESBUILD_VERSION",
]);

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
  if (typeof value !== "string" || !DIGEST.test(value)) {
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

function normalizeReference(value, field) {
  exactKeys(value, ["reference", "digest"], "REFERENCE_SHAPE_INVALID");
  if (
    typeof value.reference !== "string" ||
    !SAFE_REFERENCE.test(value.reference)
  ) {
    fail("REFERENCE_VALUE_INVALID", {
      field,
      observed:
        typeof value.reference === "string"
          ? value.reference.slice(0, 120)
          : typeof value.reference,
    });
  }
  assertDigest(value.digest, `${field}.digest`);
  return Object.freeze({
    reference: value.reference,
    digest: value.digest,
  });
}

export function verifyAliceRuntimeBuildPolicy(value) {
  exactKeys(
    value,
    [
      "schemaVersion",
      "platform",
      "runtimeVersionStrategy",
      "contextExporterDockerfileSha256",
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
  if (value.runtimeVersionStrategy !== "legacy-source-bound-inputs-sha256") {
    fail("RUNTIME_VERSION_STRATEGY_INVALID", {
      observed: value.runtimeVersionStrategy,
    });
  }

  exactKeys(
    value.baseImages,
    ["bun", "python", "node"],
    "BASE_IMAGE_KEYS_INVALID",
  );
  exactKeys(
    value.toolchain,
    ["node", "bun", "wrangler"],
    "TOOLCHAIN_KEYS_INVALID",
  );
  for (const key of ["node", "bun", "wrangler"]) {
    const version = value.toolchain[key];
    if (typeof version !== "string" || !SEMVER.test(version)) {
      fail("TOOLCHAIN_VERSION_INVALID", { field: key, observed: version });
    }
  }

  assertDigest(
    value.contextExporterDockerfileSha256,
    "contextExporterDockerfileSha256",
  );

  return Object.freeze({
    schemaVersion: value.schemaVersion,
    platform: value.platform,
    runtimeVersionStrategy: value.runtimeVersionStrategy,
    contextExporterDockerfileSha256:
      value.contextExporterDockerfileSha256,
    dockerfileFrontend: normalizeReference(
      value.dockerfileFrontend,
      "dockerfileFrontend",
    ),
    sbomScanner: normalizeReference(value.sbomScanner, "sbomScanner"),
    baseImages: Object.freeze({
      bun: normalizeReference(value.baseImages.bun, "baseImages.bun"),
      python: normalizeReference(
        value.baseImages.python,
        "baseImages.python",
      ),
      node: normalizeReference(value.baseImages.node, "baseImages.node"),
    }),
    toolchain: Object.freeze({
      node: value.toolchain.node,
      bun: value.toolchain.bun,
      wrangler: value.toolchain.wrangler,
    }),
  });
}

function normalizeBuildArguments(value, { buildCommit, elizaCommit }) {
  exactKeys(value, LEGACY_BUILD_ARGUMENT_KEYS, "BUILD_ARGUMENT_KEYS_INVALID");
  const normalized = {};
  for (const key of LEGACY_BUILD_ARGUMENT_KEYS) {
    const observed = value[key];
    if (
      typeof observed !== "string" ||
      observed.length === 0 ||
      observed.length > 2048 ||
      observed.includes("\0") ||
      observed.includes("\n") ||
      observed.includes("\r")
    ) {
      fail("BUILD_ARGUMENT_VALUE_INVALID", {
        field: key,
        observed:
          typeof observed === "string"
            ? observed.slice(0, 120)
            : typeof observed,
      });
    }
    normalized[key] = observed;
  }
  if (!/^[1-9][0-9]{1,4}$/.test(normalized.APP_PORT)) {
    fail("BUILD_ARGUMENT_PORT_INVALID", { observed: normalized.APP_PORT });
  }
  const port = Number(normalized.APP_PORT);
  if (port > 65535) {
    fail("BUILD_ARGUMENT_PORT_INVALID", { observed: normalized.APP_PORT });
  }
  if (!SEMVER.test(normalized.ESBUILD_VERSION)) {
    fail("BUILD_ARGUMENT_ESBUILD_VERSION_INVALID", {
      observed: normalized.ESBUILD_VERSION,
    });
  }
  if (normalized.REVISION !== buildCommit) {
    fail("BUILD_ARGUMENT_REVISION_MISMATCH", {
      expected: buildCommit,
      observed: normalized.REVISION,
    });
  }
  if (normalized.ELIZA_REVISION !== elizaCommit) {
    fail("BUILD_ARGUMENT_ELIZA_REVISION_MISMATCH", {
      expected: elizaCommit,
      observed: normalized.ELIZA_REVISION,
    });
  }
  if (!/^cloud-(?:staging-)?v[0-9A-Za-z][0-9A-Za-z.-]{0,95}$/.test(
    normalized.VERSION,
  )) {
    fail("BUILD_ARGUMENT_VERSION_INVALID", {
      observed: normalized.VERSION.slice(0, 120),
    });
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z.-]{0,95}$/.test(normalized.VERSION_CLEAN)) {
    fail("BUILD_ARGUMENT_VERSION_CLEAN_INVALID", {
      observed: normalized.VERSION_CLEAN.slice(0, 120),
    });
  }
  return Object.freeze(normalized);
}

function contentBuildPolicy(policy) {
  return Object.freeze({
    platform: policy.platform,
    dockerfileFrontend: policy.dockerfileFrontend,
    baseImages: policy.baseImages,
    toolchain: Object.freeze({
      node: policy.toolchain.node,
      bun: policy.toolchain.bun,
    }),
  });
}

function qualificationBuildPolicy(policy) {
  return Object.freeze({
    contextExporterDockerfileSha256:
      policy.contextExporterDockerfileSha256,
    sbomScanner: policy.sbomScanner,
    toolchain: Object.freeze({
      wrangler: policy.toolchain.wrangler,
    }),
  });
}

export function buildAliceRuntimeInputsContract({
  buildCommit,
  contextContract,
  contextPolicy,
  dockerfileBytes,
  dockerignoreBytes,
  buildPolicy,
  buildArguments,
}) {
  assertCommit(buildCommit, "buildCommit");
  let normalizedContextPolicy;
  let context;
  try {
    normalizedContextPolicy =
      normalizeAliceRuntimeRootPolicy(contextPolicy);
    context = verifyAliceRuntimeRootContractShape(contextContract, {
      expectedKind: "build-context",
      policy: normalizedContextPolicy,
    });
  } catch (error) {
    if (error instanceof AliceRuntimeRootContractError) {
      fail("CONTEXT_CONTRACT_INVALID", {
        causePredicateId: error.predicateId,
        causeDetails: error.details,
      });
    }
    throw error;
  }
  if (context.sourceCommit !== buildCommit) {
    fail("CONTEXT_BUILD_COMMIT_MISMATCH", {
      expected: buildCommit,
      observed: context.sourceCommit,
    });
  }

  const policy = verifyAliceRuntimeBuildPolicy(buildPolicy);
  const args = normalizeBuildArguments(buildArguments, {
    buildCommit,
    elizaCommit: context.elizaCommit,
  });

  const dockerfileSha256 = sha256(dockerfileBytes);
  const dockerignoreSha256 = sha256(dockerignoreBytes);
  const contextPolicySha256 = sha256(
    canonicalBytes(normalizedContextPolicy),
  );
  const contentBuildPolicySha256 = sha256(
    canonicalBytes(contentBuildPolicy(policy)),
  );
  const qualificationPolicySha256 = sha256(
    canonicalBytes(qualificationBuildPolicy(policy)),
  );
  const buildArgumentsSha256 = sha256(canonicalBytes(args));

  const identity = Object.freeze({
    schemaVersion: RUNTIME_INPUTS_SCHEMA,
    platform: policy.platform,
    runtimeVersionStrategy: policy.runtimeVersionStrategy,
    reuseAdmission: RUNTIME_REUSE_ADMISSION,
    buildCommit,
    elizaCommit: context.elizaCommit,
    contextEntriesSha256: context.entriesSha256,
    dockerfileSha256,
    contentBuildPolicySha256,
    buildArgumentsSha256,
  });
  const runtimeInputsSha256 = sha256(canonicalBytes(identity));

  return Object.freeze({
    ...identity,
    contextPolicySha256,
    dockerignoreSha256,
    qualificationPolicySha256,
    buildArguments: args,
    runtimeInputsSha256,
    runtimeVersion: `sha256-${runtimeInputsSha256.slice("sha256:".length)}`,
  });
}

export function verifyAliceRuntimeInputsContract(value) {
  exactKeys(
    value,
    [
      "schemaVersion",
      "platform",
      "runtimeVersionStrategy",
      "reuseAdmission",
      "buildCommit",
      "elizaCommit",
      "contextEntriesSha256",
      "contextPolicySha256",
      "dockerfileSha256",
      "dockerignoreSha256",
      "contentBuildPolicySha256",
      "qualificationPolicySha256",
      "buildArgumentsSha256",
      "buildArguments",
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
  if (
    value.runtimeVersionStrategy !== "legacy-source-bound-inputs-sha256"
  ) {
    fail("RUNTIME_INPUTS_VERSION_STRATEGY_INVALID");
  }
  if (value.reuseAdmission !== RUNTIME_REUSE_ADMISSION) {
    fail("RUNTIME_REUSE_ADMISSION_INVALID", {
      observed: value.reuseAdmission,
    });
  }
  assertCommit(value.buildCommit, "buildCommit");
  assertCommit(value.elizaCommit, "elizaCommit");
  for (const field of [
    "contextEntriesSha256",
    "contextPolicySha256",
    "dockerfileSha256",
    "dockerignoreSha256",
    "contentBuildPolicySha256",
    "qualificationPolicySha256",
    "buildArgumentsSha256",
    "runtimeInputsSha256",
  ]) {
    assertDigest(value[field], field);
  }

  const args = normalizeBuildArguments(value.buildArguments, {
    buildCommit: value.buildCommit,
    elizaCommit: value.elizaCommit,
  });
  const expectedBuildArgumentsSha = sha256(canonicalBytes(args));
  if (value.buildArgumentsSha256 !== expectedBuildArgumentsSha) {
    fail("BUILD_ARGUMENTS_SHA_MISMATCH", {
      expected: expectedBuildArgumentsSha,
      observed: value.buildArgumentsSha256,
    });
  }

  const identity = {
    schemaVersion: value.schemaVersion,
    platform: value.platform,
    runtimeVersionStrategy: value.runtimeVersionStrategy,
    reuseAdmission: value.reuseAdmission,
    buildCommit: value.buildCommit,
    elizaCommit: value.elizaCommit,
    contextEntriesSha256: value.contextEntriesSha256,
    dockerfileSha256: value.dockerfileSha256,
    contentBuildPolicySha256: value.contentBuildPolicySha256,
    buildArgumentsSha256: value.buildArgumentsSha256,
  };
  const expectedInputs = sha256(canonicalBytes(identity));
  if (value.runtimeInputsSha256 !== expectedInputs) {
    fail("RUNTIME_INPUTS_SHA_MISMATCH", {
      expected: expectedInputs,
      observed: value.runtimeInputsSha256,
    });
  }
  const expectedVersion = `sha256-${expectedInputs.slice("sha256:".length)}`;
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
    "context-policy",
    "dockerfile",
    "dockerignore",
    "build-policy",
    "build-arguments",
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
    contextPolicy: JSON.parse(
      await readFile(values.get("context-policy"), "utf8"),
    ),
    dockerfileBytes: await readFile(values.get("dockerfile")),
    dockerignoreBytes: await readFile(values.get("dockerignore")),
    buildPolicy: JSON.parse(
      await readFile(values.get("build-policy"), "utf8"),
    ),
    buildArguments: JSON.parse(
      await readFile(values.get("build-arguments"), "utf8"),
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
      reuseAdmission: contract.reuseAdmission,
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
