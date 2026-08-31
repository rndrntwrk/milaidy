#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_ROOT_SCHEMA = "alice.runtime-root.v1";
export const RUNTIME_ROOT_POLICY_SCHEMA = "alice.runtime-root-policy.v1";

const DEFAULT_POLICY = Object.freeze({
  schemaVersion: RUNTIME_ROOT_POLICY_SCHEMA,
  forbiddenPrefixes: [".git", ".github"],
  forbiddenBasenames: [
    ".env",
    ".env.local",
    ".env.production",
    ".npmrc",
    ".pypirc",
  ],
  maxFileBytes: 1024 * 1024 * 1024,
});

export class AliceRuntimeRootContractError extends Error {
  constructor(predicateId, details = {}) {
    super(`ALICE_RUNTIME_ROOT_CONTRACT_INVALID:${predicateId}`);
    this.name = "AliceRuntimeRootContractError";
    this.code = "ALICE_RUNTIME_ROOT_CONTRACT_INVALID";
    this.predicateId = predicateId;
    this.details = Object.freeze({ ...details });
  }
}

function fail(predicateId, details = {}) {
  throw new AliceRuntimeRootContractError(predicateId, details);
}

function assertExactKeys(value, expectedKeys, predicateId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(predicateId, {
      observedType: Array.isArray(value) ? "array" : typeof value,
    });
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(predicateId, { expectedKeys: expected, observedKeys: actual });
  }
}

function assertSha256(value, predicateId) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(predicateId, {
      observed:
        typeof value === "string" ? value.slice(0, 80) : typeof value,
    });
  }
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

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeRelativePath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    fail("PATH_INVALID", { path: normalized.slice(0, 240) });
  }
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    fail("PATH_INVALID", { path: normalized.slice(0, 240) });
  }
  return normalized;
}

function normalizePolicy(raw) {
  const value = raw ?? DEFAULT_POLICY;
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "forbiddenPrefixes",
      "forbiddenBasenames",
      "maxFileBytes",
    ],
    "POLICY_SHAPE_INVALID",
  );
  if (value.schemaVersion !== RUNTIME_ROOT_POLICY_SCHEMA) {
    fail("POLICY_SCHEMA_INVALID", { observed: value.schemaVersion });
  }
  if (
    !Array.isArray(value.forbiddenPrefixes) ||
    !Array.isArray(value.forbiddenBasenames)
  ) {
    fail("POLICY_LIST_INVALID");
  }
  const normalizeStringList = (items, field) => {
    const normalized = items.map((item) => {
      if (
        typeof item !== "string" ||
        item.length === 0 ||
        item.startsWith("/") ||
        item.includes("\0")
      ) {
        fail("POLICY_ENTRY_INVALID", {
          field,
          observed:
            typeof item === "string" ? item.slice(0, 120) : typeof item,
        });
      }
      return item
        .replaceAll("\\", "/")
        .replace(/^\.\//, "")
        .replace(/\/$/, "");
    });
    if (new Set(normalized).size !== normalized.length) {
      fail("POLICY_DUPLICATE_INVALID", { field });
    }
    return normalized.sort();
  };
  if (!Number.isSafeInteger(value.maxFileBytes) || value.maxFileBytes < 1) {
    fail("POLICY_MAX_FILE_BYTES_INVALID", {
      observed: value.maxFileBytes,
    });
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    forbiddenPrefixes: Object.freeze(
      normalizeStringList(value.forbiddenPrefixes, "forbiddenPrefixes"),
    ),
    forbiddenBasenames: Object.freeze(
      normalizeStringList(value.forbiddenBasenames, "forbiddenBasenames"),
    ),
    maxFileBytes: value.maxFileBytes,
  });
}

function enforcePolicy(relativePath, policy) {
  const basename = relativePath.split("/").at(-1);
  if (policy.forbiddenBasenames.includes(basename)) {
    fail("FORBIDDEN_BASENAME", { path: relativePath, basename });
  }
  for (const prefix of policy.forbiddenPrefixes) {
    if (relativePath === prefix || relativePath.startsWith(`${prefix}/`)) {
      fail("FORBIDDEN_PREFIX", { path: relativePath, prefix });
    }
  }
}

function modeBits(stats) {
  return stats.mode & 0o7777;
}

function ensureRelativeSymlinkInsideRoot(relativePath, target) {
  if (
    typeof target !== "string" ||
    target.length === 0 ||
    target.includes("\0")
  ) {
    fail("SYMLINK_TARGET_INVALID", { path: relativePath });
  }
  if (path.posix.isAbsolute(target) || path.win32.isAbsolute(target)) {
    fail("SYMLINK_ABSOLUTE_TARGET", {
      path: relativePath,
      target: target.slice(0, 240),
    });
  }
  const parent = path.posix.dirname(relativePath);
  const resolved = path.posix.normalize(
    path.posix.join(parent, target.replaceAll("\\", "/")),
  );
  if (
    resolved === ".." ||
    resolved.startsWith("../") ||
    path.posix.isAbsolute(resolved)
  ) {
    fail("SYMLINK_ESCAPE", {
      path: relativePath,
      target: target.slice(0, 240),
    });
  }
}

async function walkRuntimeRoot(rootPath, policy) {
  const entries = [];
  const rootReal = await realpath(rootPath).catch(() =>
    fail("ROOT_MISSING", { root: rootPath }),
  );
  const rootStats = await stat(rootReal);
  if (!rootStats.isDirectory()) {
    fail("ROOT_NOT_DIRECTORY", { root: rootPath });
  }

  async function walkDirectory(directoryPath, relativeDirectory = "") {
    const children = await readdir(directoryPath, { withFileTypes: true });
    children.sort((a, b) =>
      Buffer.from(a.name).compare(Buffer.from(b.name)),
    );

    for (const child of children) {
      const relativePath = normalizeRelativePath(
        relativeDirectory
          ? `${relativeDirectory}/${child.name}`
          : child.name,
      );
      enforcePolicy(relativePath, policy);
      const absolutePath = path.join(directoryPath, child.name);
      const stats = await lstat(absolutePath);
      const mode = modeBits(stats);

      if (stats.isDirectory()) {
        entries.push(
          Object.freeze({ path: relativePath, type: "directory", mode }),
        );
        await walkDirectory(absolutePath, relativePath);
        continue;
      }
      if (stats.isFile()) {
        if (stats.size > policy.maxFileBytes) {
          fail("FILE_TOO_LARGE", {
            path: relativePath,
            size: stats.size,
            maxFileBytes: policy.maxFileBytes,
          });
        }
        entries.push(
          Object.freeze({
            path: relativePath,
            type: "file",
            mode,
            size: stats.size,
            sha256: await sha256File(absolutePath),
          }),
        );
        continue;
      }
      if (stats.isSymbolicLink()) {
        const target = (await readlink(absolutePath)).replaceAll("\\", "/");
        ensureRelativeSymlinkInsideRoot(relativePath, target);
        entries.push(
          Object.freeze({
            path: relativePath,
            type: "symlink",
            mode,
            target,
          }),
        );
        continue;
      }
      fail("SPECIAL_FILE_FORBIDDEN", { path: relativePath, mode });
    }
  }

  await walkDirectory(rootReal);
  entries.sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
  return Object.freeze(entries);
}

function summarizeEntries(entries) {
  let fileCount = 0;
  let directoryCount = 0;
  let symlinkCount = 0;
  let totalFileBytes = 0;
  for (const entry of entries) {
    if (entry.type === "file") {
      fileCount += 1;
      totalFileBytes += entry.size;
    } else if (entry.type === "directory") {
      directoryCount += 1;
    } else if (entry.type === "symlink") {
      symlinkCount += 1;
    }
  }
  return Object.freeze({
    entryCount: entries.length,
    fileCount,
    directoryCount,
    symlinkCount,
    totalFileBytes,
  });
}

export async function buildAliceRuntimeRootContract({
  root,
  sourceCommit,
  elizaCommit,
  platform = "linux/amd64",
  policy: rawPolicy,
}) {
  assertCommit(sourceCommit, "sourceCommit");
  assertCommit(elizaCommit, "elizaCommit");
  if (platform !== "linux/amd64") {
    fail("PLATFORM_INVALID", { observed: platform });
  }
  const policy = normalizePolicy(rawPolicy);
  const entries = await walkRuntimeRoot(root, policy);
  const summary = summarizeEntries(entries);
  const entriesSha256 = sha256Bytes(canonicalBytes(entries));
  const policySha256 = sha256Bytes(canonicalBytes(policy));
  const unsigned = Object.freeze({
    schemaVersion: RUNTIME_ROOT_SCHEMA,
    platform,
    sourceCommit,
    elizaCommit,
    policySha256,
    entriesSha256,
    ...summary,
    entries,
  });
  const contractSha256 = sha256Bytes(canonicalBytes(unsigned));
  return Object.freeze({ ...unsigned, contractSha256 });
}

function validateManifestEntry(entry, previousPath) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail("ENTRY_SHAPE_INVALID");
  }
  const commonKeys = ["path", "type", "mode"];
  if (entry.type === "file") {
    assertExactKeys(
      entry,
      [...commonKeys, "size", "sha256"],
      "FILE_ENTRY_KEYS_INVALID",
    );
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      fail("FILE_ENTRY_SIZE_INVALID", { path: entry.path });
    }
    assertSha256(entry.sha256, "FILE_ENTRY_SHA_INVALID");
  } else if (entry.type === "directory") {
    assertExactKeys(entry, commonKeys, "DIRECTORY_ENTRY_KEYS_INVALID");
  } else if (entry.type === "symlink") {
    assertExactKeys(
      entry,
      [...commonKeys, "target"],
      "SYMLINK_ENTRY_KEYS_INVALID",
    );
    ensureRelativeSymlinkInsideRoot(entry.path, entry.target);
  } else {
    fail("ENTRY_TYPE_INVALID", { observed: entry.type });
  }
  const normalized = normalizeRelativePath(entry.path);
  if (normalized !== entry.path) {
    fail("ENTRY_PATH_NON_CANONICAL", { path: entry.path });
  }
  if (
    !Number.isSafeInteger(entry.mode) ||
    entry.mode < 0 ||
    entry.mode > 0o7777
  ) {
    fail("ENTRY_MODE_INVALID", { path: entry.path, observed: entry.mode });
  }
  if (
    previousPath !== null &&
    Buffer.from(previousPath).compare(Buffer.from(entry.path)) >= 0
  ) {
    fail("ENTRY_ORDER_INVALID", { previousPath, path: entry.path });
  }
  return entry.path;
}

export function verifyAliceRuntimeRootContractShape(value) {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "platform",
      "sourceCommit",
      "elizaCommit",
      "policySha256",
      "entriesSha256",
      "entryCount",
      "fileCount",
      "directoryCount",
      "symlinkCount",
      "totalFileBytes",
      "entries",
      "contractSha256",
    ],
    "CONTRACT_KEYS_INVALID",
  );
  if (value.schemaVersion !== RUNTIME_ROOT_SCHEMA) {
    fail("CONTRACT_SCHEMA_INVALID", { observed: value.schemaVersion });
  }
  if (value.platform !== "linux/amd64") {
    fail("CONTRACT_PLATFORM_INVALID", { observed: value.platform });
  }
  assertCommit(value.sourceCommit, "sourceCommit");
  assertCommit(value.elizaCommit, "elizaCommit");
  assertSha256(value.policySha256, "POLICY_SHA_INVALID");
  assertSha256(value.entriesSha256, "ENTRIES_SHA_INVALID");
  assertSha256(value.contractSha256, "CONTRACT_SHA_INVALID");
  if (!Array.isArray(value.entries)) {
    fail("ENTRIES_INVALID");
  }

  let previousPath = null;
  for (const entry of value.entries) {
    previousPath = validateManifestEntry(entry, previousPath);
  }
  const summary = summarizeEntries(value.entries);
  for (const [key, observed] of Object.entries(summary)) {
    if (value[key] !== observed) {
      fail("SUMMARY_MISMATCH", {
        field: key,
        expected: observed,
        observed: value[key],
      });
    }
  }
  const expectedEntriesSha = sha256Bytes(canonicalBytes(value.entries));
  if (value.entriesSha256 !== expectedEntriesSha) {
    fail("ENTRIES_SHA_MISMATCH", {
      expected: expectedEntriesSha,
      observed: value.entriesSha256,
    });
  }
  const { contractSha256, ...unsigned } = value;
  const expectedContractSha = sha256Bytes(canonicalBytes(unsigned));
  if (contractSha256 !== expectedContractSha) {
    fail("CONTRACT_SHA_MISMATCH", {
      expected: expectedContractSha,
      observed: contractSha256,
    });
  }
  return Object.freeze(value);
}

export async function verifyAliceRuntimeRootContract({
  root,
  contract,
  policy,
}) {
  const verified = verifyAliceRuntimeRootContractShape(contract);
  const rebuilt = await buildAliceRuntimeRootContract({
    root,
    sourceCommit: verified.sourceCommit,
    elizaCommit: verified.elizaCommit,
    platform: verified.platform,
    policy,
  });
  if (rebuilt.contractSha256 !== verified.contractSha256) {
    const limit = Math.max(rebuilt.entries.length, verified.entries.length);
    let firstDifference = null;
    for (let index = 0; index < limit; index += 1) {
      const expected = verified.entries[index] ?? null;
      const observed = rebuilt.entries[index] ?? null;
      if (JSON.stringify(expected) !== JSON.stringify(observed)) {
        firstDifference = { index, expected, observed };
        break;
      }
    }
    fail("ROOT_CONTENT_MISMATCH", {
      expectedContractSha256: verified.contractSha256,
      observedContractSha256: rebuilt.contractSha256,
      firstDifference,
    });
  }
  return rebuilt;
}

export async function writeAliceRuntimeRootContract({ output, ...input }) {
  const contract = await buildAliceRuntimeRootContract(input);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, canonicalBytes(contract), {
    flag: "wx",
    mode: 0o444,
  });
  return contract;
}

function parseArgs(argv) {
  const [command = "write", ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      fail("CLI_ARGUMENT_INVALID", { token: token.slice(0, 120) });
    }
    const name = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      fail("CLI_VALUE_MISSING", { name });
    }
    if (values.has(name)) {
      fail("CLI_DUPLICATE_ARGUMENT", { name });
    }
    values.set(name, value);
    index += 1;
  }
  return { command, values };
}

async function readPolicy(policyPath) {
  if (!policyPath) {
    return DEFAULT_POLICY;
  }
  return normalizePolicy(JSON.parse(await readFile(policyPath, "utf8")));
}

async function main(argv) {
  const { command, values } = parseArgs(argv);
  if (command === "write") {
    const required = ["root", "output", "source-commit", "eliza-commit"];
    for (const key of required) {
      if (!values.has(key)) {
        fail("CLI_REQUIRED_ARGUMENT_MISSING", { key });
      }
    }
    const contract = await writeAliceRuntimeRootContract({
      root: values.get("root"),
      output: values.get("output"),
      sourceCommit: values.get("source-commit"),
      elizaCommit: values.get("eliza-commit"),
      platform: values.get("platform") ?? "linux/amd64",
      policy: await readPolicy(values.get("policy")),
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, contractSha256: contract.contractSha256 })}\n`,
    );
    return;
  }
  if (command === "verify") {
    const required = ["root", "manifest"];
    for (const key of required) {
      if (!values.has(key)) {
        fail("CLI_REQUIRED_ARGUMENT_MISSING", { key });
      }
    }
    const contract = JSON.parse(
      await readFile(values.get("manifest"), "utf8"),
    );
    const verified = await verifyAliceRuntimeRootContract({
      root: values.get("root"),
      contract,
      policy: await readPolicy(values.get("policy")),
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, contractSha256: verified.contractSha256 })}\n`,
    );
    return;
  }
  fail("CLI_COMMAND_INVALID", { observed: command });
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof AliceRuntimeRootContractError) {
      process.stderr.write(
        `${JSON.stringify({ code: error.code, predicateId: error.predicateId, details: error.details })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stderr.write(
      `${JSON.stringify({ code: "ALICE_RUNTIME_ROOT_CONTRACT_INTERNAL", message: error?.message ?? String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
