#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyAliceRuntimeRootContractShape,
} from "./alice_runtime_root_contract.mjs";

export const IMAGE_OBSERVATION_SCHEMA = "alice.image-observation.v1";
export const RUNTIME_OBSERVATION_SCHEMA = "alice.runtime-observation.v1";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

export class AliceImageObservationError extends Error {
  constructor(predicateId, details = {}) {
    super(`ALICE_IMAGE_OBSERVATION_INVALID:${predicateId}`);
    this.name = "AliceImageObservationError";
    this.code = "ALICE_IMAGE_OBSERVATION_INVALID";
    this.predicateId = predicateId;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (predicateId, details = {}) => {
  throw new AliceImageObservationError(predicateId, details);
};
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

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

function assertDigest(value, predicateId) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail(predicateId, {
      observed: typeof value === "string" ? value.slice(0, 96) : typeof value,
    });
  }
}

function assertCommit(value, predicateId) {
  if (typeof value !== "string" || !COMMIT.test(value)) {
    fail(predicateId, {
      observed: typeof value === "string" ? value.slice(0, 48) : typeof value,
    });
  }
}

function stringValue(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || value.includes("\0")) {
    fail("IMAGE_CONFIG_STRING_INVALID", { field });
  }
  return value;
}

function stringArray(value, field, { nullable = false, sort = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (!Array.isArray(value)) fail("IMAGE_CONFIG_ARRAY_INVALID", { field });
  const normalized = value.map((item, index) => {
    if (typeof item !== "string" || item.includes("\0")) {
      fail("IMAGE_CONFIG_ARRAY_ENTRY_INVALID", { field, index });
    }
    return item;
  });
  if (sort) normalized.sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  return Object.freeze(normalized);
}

function nonnegativeInteger(value, field, { fallback = null } = {}) {
  if ((value === null || value === undefined) && fallback !== null) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("IMAGE_CONFIG_INTEGER_INVALID", { field, observed: value });
  }
  return value;
}

function sortedStringObject(value, field) {
  if (value === null || value === undefined) return Object.freeze({});
  if (typeof value !== "object" || Array.isArray(value)) {
    fail("IMAGE_CONFIG_OBJECT_INVALID", { field });
  }
  const output = {};
  for (const key of Object.keys(value).sort((a, b) =>
    Buffer.from(a).compare(Buffer.from(b)))) {
    if (!key || key.includes("\0") || typeof value[key] !== "string") {
      fail("IMAGE_CONFIG_OBJECT_ENTRY_INVALID", { field, key });
    }
    output[key] = value[key];
  }
  return Object.freeze(output);
}

function healthcheck(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    fail("IMAGE_HEALTHCHECK_INVALID");
  }
  return Object.freeze({
    test: stringArray(value.Test ?? [], "healthcheck.test"),
    intervalNs: nonnegativeInteger(value.Interval ?? 0, "healthcheck.interval"),
    timeoutNs: nonnegativeInteger(value.Timeout ?? 0, "healthcheck.timeout"),
    startPeriodNs: nonnegativeInteger(
      value.StartPeriod ?? 0,
      "healthcheck.startPeriod",
    ),
    startIntervalNs: nonnegativeInteger(
      value.StartInterval ?? 0,
      "healthcheck.startInterval",
    ),
    retries: nonnegativeInteger(value.Retries ?? 0, "healthcheck.retries"),
  });
}

function normalizeImageConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    fail("IMAGE_CONFIG_INVALID");
  }
  return Object.freeze({
    user: stringValue(config.User ?? "", "user"),
    workingDir: stringValue(config.WorkingDir ?? "", "workingDir"),
    entrypoint: stringArray(config.Entrypoint, "entrypoint", { nullable: true }),
    cmd: stringArray(config.Cmd, "cmd", { nullable: true }),
    env: stringArray(config.Env ?? [], "env"),
    labels: sortedStringObject(config.Labels, "labels"),
    exposedPorts: stringArray(
      Object.keys(config.ExposedPorts ?? {}),
      "exposedPorts",
      { sort: true },
    ),
    healthcheck: healthcheck(config.Healthcheck),
    stopSignal: stringValue(config.StopSignal, "stopSignal", { nullable: true }),
    shell: stringArray(config.Shell, "shell", { nullable: true }),
  });
}

export function buildAliceImageObservation(inspectPayload) {
  if (!Array.isArray(inspectPayload) || inspectPayload.length !== 1) {
    fail("IMAGE_INSPECT_CARDINALITY_INVALID", {
      observed: Array.isArray(inspectPayload) ? inspectPayload.length : typeof inspectPayload,
    });
  }
  const image = inspectPayload[0];
  if (!image || typeof image !== "object" || Array.isArray(image)) {
    fail("IMAGE_INSPECT_INVALID");
  }
  assertDigest(image.Id, "IMAGE_ID_INVALID");
  if (image.Os !== "linux" || image.Architecture !== "amd64") {
    fail("IMAGE_PLATFORM_INVALID", {
      os: image.Os ?? null,
      architecture: image.Architecture ?? null,
    });
  }
  const config = normalizeImageConfig(image.Config);
  const configSha256 = sha256(canonical(config));
  const repoDigests = stringArray(image.RepoDigests ?? [], "repoDigests", {
    sort: true,
  });
  for (const value of repoDigests) {
    const separator = value.lastIndexOf("@sha256:");
    if (separator < 1 || !DIGEST.test(value.slice(separator + 1))) {
      fail("IMAGE_REPO_DIGEST_INVALID", { observed: value.slice(0, 160) });
    }
  }
  if (
    !image.RootFS ||
    typeof image.RootFS !== "object" ||
    Array.isArray(image.RootFS) ||
    image.RootFS.Type !== "layers"
  ) {
    fail("IMAGE_ROOTFS_INVALID");
  }
  const rootFsLayers = stringArray(image.RootFS.Layers ?? [], "rootFsLayers");
  for (const value of rootFsLayers) assertDigest(value, "IMAGE_LAYER_DIGEST_INVALID");
  const size = nonnegativeInteger(image.Size, "size");
  const virtualSize = nonnegativeInteger(
    image.VirtualSize,
    "virtualSize",
    { fallback: size },
  );
  const unsigned = Object.freeze({
    schemaVersion: IMAGE_OBSERVATION_SCHEMA,
    imageId: image.Id,
    repoDigests,
    os: image.Os,
    architecture: image.Architecture,
    variant: stringValue(image.Variant ?? "", "variant"),
    size,
    virtualSize,
    rootFsType: image.RootFS.Type,
    rootFsLayers,
    config,
    configSha256,
  });
  return Object.freeze({
    ...unsigned,
    observationSha256: sha256(canonical(unsigned)),
  });
}

function verifyStringArray(value, field, { sorted = false } = {}) {
  const normalized = stringArray(value, field);
  if (sorted) {
    const expected = [...normalized].sort((a, b) =>
      Buffer.from(a).compare(Buffer.from(b)));
    if (JSON.stringify(expected) !== JSON.stringify(value)) {
      fail("IMAGE_ARRAY_ORDER_INVALID", { field });
    }
  }
}

export function verifyAliceImageObservation(value) {
  exactKeys(value, [
    "schemaVersion",
    "imageId",
    "repoDigests",
    "os",
    "architecture",
    "variant",
    "size",
    "virtualSize",
    "rootFsType",
    "rootFsLayers",
    "config",
    "configSha256",
    "observationSha256",
  ], "IMAGE_OBSERVATION_KEYS_INVALID");
  if (value.schemaVersion !== IMAGE_OBSERVATION_SCHEMA) {
    fail("IMAGE_OBSERVATION_SCHEMA_INVALID");
  }
  assertDigest(value.imageId, "IMAGE_ID_INVALID");
  assertDigest(value.configSha256, "IMAGE_CONFIG_DIGEST_INVALID");
  assertDigest(value.observationSha256, "IMAGE_OBSERVATION_DIGEST_INVALID");
  if (value.os !== "linux" || value.architecture !== "amd64") {
    fail("IMAGE_PLATFORM_INVALID", { os: value.os, architecture: value.architecture });
  }
  stringValue(value.variant, "variant");
  nonnegativeInteger(value.size, "size");
  nonnegativeInteger(value.virtualSize, "virtualSize");
  if (value.rootFsType !== "layers") fail("IMAGE_ROOTFS_INVALID");
  verifyStringArray(value.repoDigests, "repoDigests", { sorted: true });
  verifyStringArray(value.rootFsLayers, "rootFsLayers");
  for (const layer of value.rootFsLayers) assertDigest(layer, "IMAGE_LAYER_DIGEST_INVALID");
  exactKeys(value.config, [
    "user",
    "workingDir",
    "entrypoint",
    "cmd",
    "env",
    "labels",
    "exposedPorts",
    "healthcheck",
    "stopSignal",
    "shell",
  ], "IMAGE_CONFIG_KEYS_INVALID");
  const normalizedConfig = normalizeImageConfig({
    User: value.config.user,
    WorkingDir: value.config.workingDir,
    Entrypoint: value.config.entrypoint,
    Cmd: value.config.cmd,
    Env: value.config.env,
    Labels: value.config.labels,
    ExposedPorts: Object.fromEntries(value.config.exposedPorts.map((port) => [port, {}])),
    Healthcheck: value.config.healthcheck === null ? null : {
      Test: value.config.healthcheck.test,
      Interval: value.config.healthcheck.intervalNs,
      Timeout: value.config.healthcheck.timeoutNs,
      StartPeriod: value.config.healthcheck.startPeriodNs,
      StartInterval: value.config.healthcheck.startIntervalNs,
      Retries: value.config.healthcheck.retries,
    },
    StopSignal: value.config.stopSignal,
    Shell: value.config.shell,
  });
  if (JSON.stringify(normalizedConfig) !== JSON.stringify(value.config)) {
    fail("IMAGE_CONFIG_NONCANONICAL");
  }
  const expectedConfigDigest = sha256(canonical(value.config));
  if (value.configSha256 !== expectedConfigDigest) {
    fail("IMAGE_CONFIG_DIGEST_MISMATCH", {
      expected: expectedConfigDigest,
      observed: value.configSha256,
    });
  }
  const { observationSha256, ...unsigned } = value;
  const expectedObservationDigest = sha256(canonical(unsigned));
  if (observationSha256 !== expectedObservationDigest) {
    fail("IMAGE_OBSERVATION_DIGEST_MISMATCH", {
      expected: expectedObservationDigest,
      observed: observationSha256,
    });
  }
  return Object.freeze(value);
}

function requireBuffer(value, field) {
  if (!Buffer.isBuffer(value) || value.length === 0) {
    fail("OBSERVATION_BYTES_INVALID", { field });
  }
  return value;
}

function exactContractBytes(contract, bytes, field) {
  requireBuffer(bytes, field);
  const expected = canonical(contract);
  if (!expected.equals(bytes)) {
    fail("CONTRACT_BYTES_MISMATCH", {
      field,
      expected: sha256(expected),
      observed: sha256(bytes),
    });
  }
}

function topLevelInventory(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.type !== "file") continue;
    const top = entry.path.split("/", 1)[0];
    const current = groups.get(top) ?? { path: top, fileCount: 0, totalFileBytes: 0 };
    current.fileCount += 1;
    current.totalFileBytes += entry.size;
    groups.set(top, current);
  }
  return Object.freeze(
    [...groups.values()]
      .sort((a, b) =>
        b.totalFileBytes - a.totalFileBytes ||
        Buffer.from(a.path).compare(Buffer.from(b.path)))
      .map((entry) => Object.freeze(entry)),
  );
}

function largestFiles(entries, limit = 100) {
  return Object.freeze(
    entries
      .filter((entry) => entry.type === "file")
      .map((entry) => Object.freeze({
        path: entry.path,
        size: entry.size,
        sha256: entry.sha256,
      }))
      .sort((a, b) =>
        b.size - a.size || Buffer.from(a.path).compare(Buffer.from(b.path)))
      .slice(0, limit),
  );
}

function contractObservation(contract, bytes) {
  return Object.freeze({
    contractSha256: contract.contractSha256,
    entriesSha256: contract.entriesSha256,
    contractBytes: bytes.length,
    entryCount: contract.entryCount,
    fileCount: contract.fileCount,
    directoryCount: contract.directoryCount,
    symlinkCount: contract.symlinkCount,
    totalFileBytes: contract.totalFileBytes,
    topLevel: topLevelInventory(contract.entries),
    largestFiles: largestFiles(contract.entries),
  });
}

export function buildAliceRuntimeObservation({
  contextContract,
  contextContractBytes,
  runtimeRootContract,
  runtimeRootContractBytes,
  imageObservation,
  runtimeBuildManifestBytes,
  capabilityBomBytes,
}) {
  if (
    contextContract?.sourceCommit !== runtimeRootContract?.sourceCommit ||
    contextContract?.elizaCommit !== runtimeRootContract?.elizaCommit
  ) {
    fail("SOURCE_IDENTITY_MISMATCH", {
      contextSourceCommit: contextContract?.sourceCommit ?? null,
      runtimeSourceCommit: runtimeRootContract?.sourceCommit ?? null,
      contextElizaCommit: contextContract?.elizaCommit ?? null,
      runtimeElizaCommit: runtimeRootContract?.elizaCommit ?? null,
    });
  }
  const context = verifyAliceRuntimeRootContractShape(contextContract, {
    expectedKind: "build-context",
  });
  const runtime = verifyAliceRuntimeRootContractShape(runtimeRootContract, {
    expectedKind: "runtime-root",
  });
  exactContractBytes(context, contextContractBytes, "contextContractBytes");
  exactContractBytes(runtime, runtimeRootContractBytes, "runtimeRootContractBytes");
  const image = verifyAliceImageObservation(imageObservation);
  const revision = image.config.labels["org.opencontainers.image.revision"];
  if (revision !== context.sourceCommit) {
    fail("IMAGE_SOURCE_IDENTITY_MISMATCH", {
      expected: context.sourceCommit,
      observed: revision ?? null,
    });
  }
  const runtimeManifest = requireBuffer(
    runtimeBuildManifestBytes,
    "runtimeBuildManifestBytes",
  );
  const capabilityBom = requireBuffer(capabilityBomBytes, "capabilityBomBytes");
  const unsigned = Object.freeze({
    schemaVersion: RUNTIME_OBSERVATION_SCHEMA,
    sourceCommit: context.sourceCommit,
    elizaCommit: context.elizaCommit,
    context: contractObservation(context, contextContractBytes),
    runtimeRoot: contractObservation(runtime, runtimeRootContractBytes),
    imageObservationSha256: image.observationSha256,
    imageConfigSha256: image.configSha256,
    imageId: image.imageId,
    imageSize: image.size,
    imageVirtualSize: image.virtualSize,
    runtimeBuildManifestSha256: sha256(runtimeManifest),
    runtimeBuildManifestBytes: runtimeManifest.length,
    capabilityBomSha256: sha256(capabilityBom),
    capabilityBomBytes: capabilityBom.length,
  });
  return Object.freeze({
    ...unsigned,
    observationSha256: sha256(canonical(unsigned)),
  });
}

function verifyInventory(value, field) {
  if (!Array.isArray(value)) fail("INVENTORY_INVALID", { field });
  let priorSize = Number.MAX_SAFE_INTEGER;
  let priorPath = null;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      fail("INVENTORY_ENTRY_INVALID", { field });
    }
    if (typeof entry.path !== "string" || !entry.path) {
      fail("INVENTORY_PATH_INVALID", { field });
    }
    const size = entry.totalFileBytes ?? entry.size;
    if (!Number.isSafeInteger(size) || size < 0) {
      fail("INVENTORY_SIZE_INVALID", { field, path: entry.path });
    }
    if (
      size > priorSize ||
      (size === priorSize && priorPath !== null &&
        Buffer.from(entry.path).compare(Buffer.from(priorPath)) <= 0)
    ) {
      fail("INVENTORY_ORDER_INVALID", { field, path: entry.path });
    }
    priorSize = size;
    priorPath = entry.path;
  }
}

export function verifyAliceRuntimeObservation(value) {
  exactKeys(value, [
    "schemaVersion",
    "sourceCommit",
    "elizaCommit",
    "context",
    "runtimeRoot",
    "imageObservationSha256",
    "imageConfigSha256",
    "imageId",
    "imageSize",
    "imageVirtualSize",
    "runtimeBuildManifestSha256",
    "runtimeBuildManifestBytes",
    "capabilityBomSha256",
    "capabilityBomBytes",
    "observationSha256",
  ], "RUNTIME_OBSERVATION_KEYS_INVALID");
  if (value.schemaVersion !== RUNTIME_OBSERVATION_SCHEMA) {
    fail("RUNTIME_OBSERVATION_SCHEMA_INVALID");
  }
  assertCommit(value.sourceCommit, "SOURCE_COMMIT_INVALID");
  assertCommit(value.elizaCommit, "ELIZA_COMMIT_INVALID");
  for (const field of [
    "imageObservationSha256",
    "imageConfigSha256",
    "imageId",
    "runtimeBuildManifestSha256",
    "capabilityBomSha256",
    "observationSha256",
  ]) {
    assertDigest(value[field], "RUNTIME_OBSERVATION_DIGEST_INVALID");
  }
  for (const field of [
    "imageSize",
    "imageVirtualSize",
    "runtimeBuildManifestBytes",
    "capabilityBomBytes",
  ]) {
    nonnegativeInteger(value[field], field);
  }
  for (const [field, contractKind] of [
    ["context", "build-context"],
    ["runtimeRoot", "runtime-root"],
  ]) {
    const observed = value[field];
    exactKeys(observed, [
      "contractSha256",
      "entriesSha256",
      "contractBytes",
      "entryCount",
      "fileCount",
      "directoryCount",
      "symlinkCount",
      "totalFileBytes",
      "topLevel",
      "largestFiles",
    ], "CONTRACT_OBSERVATION_KEYS_INVALID");
    assertDigest(observed.contractSha256, "CONTRACT_OBSERVATION_DIGEST_INVALID");
    assertDigest(observed.entriesSha256, "CONTRACT_OBSERVATION_DIGEST_INVALID");
    for (const countField of [
      "contractBytes",
      "entryCount",
      "fileCount",
      "directoryCount",
      "symlinkCount",
      "totalFileBytes",
    ]) {
      nonnegativeInteger(observed[countField], `${contractKind}.${countField}`);
    }
    verifyInventory(observed.topLevel, `${contractKind}.topLevel`);
    verifyInventory(observed.largestFiles, `${contractKind}.largestFiles`);
  }
  const { observationSha256, ...unsigned } = value;
  const expected = sha256(canonical(unsigned));
  if (observationSha256 !== expected) {
    fail("RUNTIME_OBSERVATION_DIGEST_MISMATCH", {
      expected,
      observed: observationSha256,
    });
  }
  return Object.freeze(value);
}

async function writeCreateOnly(output, value) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, canonical(value), { flag: "wx", mode: 0o444 });
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command) fail("CLI_COMMAND_MISSING");
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const token = rest[index];
    const value = rest[index + 1];
    if (!token?.startsWith("--") || !value || value.startsWith("--")) {
      fail("CLI_ARGUMENT_INVALID", { token: token?.slice(0, 120) ?? null });
    }
    const name = token.slice(2);
    if (values.has(name)) fail("CLI_DUPLICATE_ARGUMENT", { name });
    values.set(name, value);
  }
  return { command, values };
}

function requireArgs(values, names) {
  for (const name of names) {
    if (!values.has(name)) fail("CLI_REQUIRED_ARGUMENT_MISSING", { name });
  }
}

async function main(argv) {
  const { command, values } = parseArgs(argv);
  if (command === "image") {
    requireArgs(values, ["inspect", "output"]);
    const observation = buildAliceImageObservation(
      JSON.parse(await readFile(values.get("inspect"), "utf8")),
    );
    await writeCreateOnly(values.get("output"), observation);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      observationSha256: observation.observationSha256,
      configSha256: observation.configSha256,
    })}\n`);
    return;
  }
  if (command === "runtime") {
    requireArgs(values, [
      "context",
      "runtime-root",
      "image",
      "runtime-manifest",
      "capability-bom",
      "output",
    ]);
    const contextContractBytes = await readFile(values.get("context"));
    const runtimeRootContractBytes = await readFile(values.get("runtime-root"));
    const observation = buildAliceRuntimeObservation({
      contextContract: JSON.parse(contextContractBytes),
      contextContractBytes,
      runtimeRootContract: JSON.parse(runtimeRootContractBytes),
      runtimeRootContractBytes,
      imageObservation: JSON.parse(await readFile(values.get("image"), "utf8")),
      runtimeBuildManifestBytes: await readFile(values.get("runtime-manifest")),
      capabilityBomBytes: await readFile(values.get("capability-bom")),
    });
    await writeCreateOnly(values.get("output"), observation);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      observationSha256: observation.observationSha256,
      contextEntries: observation.context.entryCount,
      runtimeEntries: observation.runtimeRoot.entryCount,
      runtimeBytes: observation.runtimeRoot.totalFileBytes,
    })}\n`);
    return;
  }
  fail("CLI_COMMAND_INVALID", { observed: command });
}

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof AliceImageObservationError) {
      process.stderr.write(`${JSON.stringify({
        code: error.code,
        predicateId: error.predicateId,
        details: error.details,
      })}\n`);
    } else {
      process.stderr.write(`${JSON.stringify({
        code: "ALICE_IMAGE_OBSERVATION_INTERNAL",
        message: error?.message ?? String(error),
      })}\n`);
    }
    process.exitCode = 1;
  });
}
