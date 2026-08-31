#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
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
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_ROOT_SCHEMA = "alice.runtime-root.v1";
export const RUNTIME_ROOT_POLICY_SCHEMA = "alice.runtime-root-policy.v1";
export const RUNTIME_ROOT_KINDS = Object.freeze(["build-context", "runtime-root"]);
const KINDS = new Set(RUNTIME_ROOT_KINDS);
const SHA = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const DEFAULT_POLICY = Object.freeze({
  schemaVersion: RUNTIME_ROOT_POLICY_SCHEMA,
  forbiddenPrefixes: [".git", ".github"],
  forbiddenBasenames: [".env", ".env.local", ".env.production", ".npmrc", ".pypirc"],
  maxFileBytes: 1024 ** 3,
  maxEntryCount: 2_000_000,
  maxTotalFileBytes: 20 * 1024 ** 3,
  allowDanglingSymlinks: false,
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

const fail = (predicateId, details = {}) => {
  throw new AliceRuntimeRootContractError(predicateId, details);
};
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const hashBytes = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
async function hashFile(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}
function exactKeys(value, expected, predicateId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(predicateId);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, i) => key !== wanted[i])) {
    fail(predicateId, { expectedKeys: wanted, observedKeys: actual });
  }
}
function assertCommit(value, field) {
  if (typeof value !== "string" || !COMMIT.test(value)) fail("COMMIT_INVALID", { field });
}
function assertDigest(value, predicateId) {
  if (typeof value !== "string" || !SHA.test(value)) fail(predicateId);
}
function assertKind(value, predicateId = "CONTRACT_KIND_INVALID") {
  if (typeof value !== "string" || !KINDS.has(value)) fail(predicateId, { observed: value });
}
function normalizeRelative(relative) {
  const value = relative.split(path.sep).join("/");
  if (!value || value === "." || value.startsWith("/") || value.includes("\0")) {
    fail("PATH_INVALID", { path: value.slice(0, 240) });
  }
  if (value.split("/").some((part) => !part || part === "." || part === "..")) {
    fail("PATH_INVALID", { path: value.slice(0, 240) });
  }
  return value;
}

export function normalizeAliceRuntimeRootPolicy(raw = DEFAULT_POLICY) {
  exactKeys(raw, [
    "schemaVersion", "forbiddenPrefixes", "forbiddenBasenames", "maxFileBytes",
    "maxEntryCount", "maxTotalFileBytes", "allowDanglingSymlinks",
  ], "POLICY_SHAPE_INVALID");
  if (raw.schemaVersion !== RUNTIME_ROOT_POLICY_SCHEMA) fail("POLICY_SCHEMA_INVALID");
  const list = (value, field) => {
    if (!Array.isArray(value)) fail("POLICY_LIST_INVALID", { field });
    const normalized = value.map((item) => {
      if (typeof item !== "string" || !item || item.startsWith("/") || /[\0\r\n]/.test(item)) {
        fail("POLICY_ENTRY_INVALID", { field });
      }
      const result = item.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
      if (!result || result === "." || result.split("/").some((part) => !part || part === "." || part === "..")) {
        fail("POLICY_ENTRY_INVALID", { field });
      }
      return result;
    }).sort();
    if (new Set(normalized).size !== normalized.length) fail("POLICY_DUPLICATE_INVALID", { field });
    return Object.freeze(normalized);
  };
  for (const field of ["maxFileBytes", "maxEntryCount", "maxTotalFileBytes"]) {
    if (!Number.isSafeInteger(raw[field]) || raw[field] < 1) fail("POLICY_LIMIT_INVALID", { field });
  }
  if (typeof raw.allowDanglingSymlinks !== "boolean") fail("POLICY_DANGLING_SYMLINK_INVALID");
  return Object.freeze({
    schemaVersion: raw.schemaVersion,
    forbiddenPrefixes: list(raw.forbiddenPrefixes, "forbiddenPrefixes"),
    forbiddenBasenames: list(raw.forbiddenBasenames, "forbiddenBasenames"),
    maxFileBytes: raw.maxFileBytes,
    maxEntryCount: raw.maxEntryCount,
    maxTotalFileBytes: raw.maxTotalFileBytes,
    allowDanglingSymlinks: raw.allowDanglingSymlinks,
  });
}

function enforcePath(relative, policy) {
  const basename = relative.split("/").at(-1);
  if (policy.forbiddenBasenames.includes(basename)) fail("FORBIDDEN_BASENAME", { path: relative });
  for (const prefix of policy.forbiddenPrefixes) {
    if (relative === prefix || relative.startsWith(`${prefix}/`)) fail("FORBIDDEN_PREFIX", { path: relative });
  }
}
function validateSymlinkPath(relative, target) {
  if (typeof target !== "string" || !target || /[\0\r\n]/.test(target)) fail("SYMLINK_TARGET_INVALID", { path: relative });
  if (path.posix.isAbsolute(target) || path.win32.isAbsolute(target)) fail("SYMLINK_ABSOLUTE_TARGET", { path: relative });
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), target.replaceAll("\\", "/")));
  if (resolved === ".." || resolved.startsWith("../") || path.posix.isAbsolute(resolved)) fail("SYMLINK_ESCAPE", { path: relative });
}
function summarize(entries) {
  const result = { entryCount: entries.length, fileCount: 0, directoryCount: 0, symlinkCount: 0, totalFileBytes: 0 };
  for (const entry of entries) {
    if (entry.type === "file") { result.fileCount += 1; result.totalFileBytes += entry.size; }
    else if (entry.type === "directory") result.directoryCount += 1;
    else if (entry.type === "symlink") result.symlinkCount += 1;
  }
  if (!Number.isSafeInteger(result.totalFileBytes)) fail("TOTAL_FILE_BYTES_UNSAFE");
  return Object.freeze(result);
}
function enforceSummary(summary, policy) {
  if (summary.entryCount > policy.maxEntryCount) fail("ENTRY_COUNT_LIMIT_EXCEEDED", { observed: summary.entryCount, maximum: policy.maxEntryCount });
  if (summary.totalFileBytes > policy.maxTotalFileBytes) fail("TOTAL_FILE_BYTES_LIMIT_EXCEEDED", { observed: summary.totalFileBytes, maximum: policy.maxTotalFileBytes });
}

async function walk(root, policy) {
  const rootLstat = await lstat(root).catch(() => fail("ROOT_MISSING", { root }));
  if (rootLstat.isSymbolicLink()) fail("ROOT_SYMLINK_FORBIDDEN", { root });
  const rootReal = await realpath(root);
  if (!(await stat(rootReal)).isDirectory()) fail("ROOT_NOT_DIRECTORY", { root });
  const entries = [];
  let total = 0;
  const append = (entry) => {
    entries.push(Object.freeze(entry));
    if (entries.length > policy.maxEntryCount) fail("ENTRY_COUNT_LIMIT_EXCEEDED", { observed: entries.length, maximum: policy.maxEntryCount });
  };
  async function visit(directory, prefix = "") {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((a, b) => Buffer.from(a.name).compare(Buffer.from(b.name)));
    for (const child of children) {
      const relative = normalizeRelative(prefix ? `${prefix}/${child.name}` : child.name);
      enforcePath(relative, policy);
      const absolute = path.join(directory, child.name);
      const info = await lstat(absolute);
      const mode = info.mode & 0o7777;
      if (info.isDirectory()) {
        append({ path: relative, type: "directory", mode });
        await visit(absolute, relative);
      } else if (info.isFile()) {
        if (info.size > policy.maxFileBytes) fail("FILE_TOO_LARGE", { path: relative, size: info.size });
        total += info.size;
        if (!Number.isSafeInteger(total) || total > policy.maxTotalFileBytes) fail("TOTAL_FILE_BYTES_LIMIT_EXCEEDED", { path: relative, observed: total });
        append({ path: relative, type: "file", mode, size: info.size, sha256: await hashFile(absolute) });
      } else if (info.isSymbolicLink()) {
        const target = (await readlink(absolute)).replaceAll("\\", "/");
        validateSymlinkPath(relative, target);
        if (!policy.allowDanglingSymlinks) {
          const resolved = await realpath(absolute).catch(() => fail("SYMLINK_DANGLING", { path: relative }));
          const rel = path.relative(rootReal, resolved);
          if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) fail("SYMLINK_ESCAPE", { path: relative });
        }
        append({ path: relative, type: "symlink", mode, target });
      } else fail("SPECIAL_FILE_FORBIDDEN", { path: relative, mode });
    }
  }
  await visit(rootReal);
  entries.sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
  return Object.freeze(entries);
}

export async function buildAliceRuntimeRootContract({ root, contractKind, sourceCommit, elizaCommit, platform = "linux/amd64", policy: rawPolicy }) {
  assertKind(contractKind);
  assertCommit(sourceCommit, "sourceCommit");
  assertCommit(elizaCommit, "elizaCommit");
  if (platform !== "linux/amd64") fail("PLATFORM_INVALID", { observed: platform });
  const policy = normalizeAliceRuntimeRootPolicy(rawPolicy);
  const entries = await walk(root, policy);
  const summary = summarize(entries);
  enforceSummary(summary, policy);
  const unsigned = Object.freeze({
    schemaVersion: RUNTIME_ROOT_SCHEMA,
    contractKind,
    platform,
    sourceCommit,
    elizaCommit,
    policySha256: hashBytes(canonical(policy)),
    entriesSha256: hashBytes(canonical(entries)),
    ...summary,
    entries,
  });
  return Object.freeze({ ...unsigned, contractSha256: hashBytes(canonical(unsigned)) });
}

function validateEntry(entry, previous, policy) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail("ENTRY_SHAPE_INVALID");
  const common = ["path", "type", "mode"];
  if (entry.type === "file") {
    exactKeys(entry, [...common, "size", "sha256"], "FILE_ENTRY_KEYS_INVALID");
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail("FILE_ENTRY_SIZE_INVALID", { path: entry.path });
    if (policy && entry.size > policy.maxFileBytes) fail("FILE_TOO_LARGE", { path: entry.path });
    assertDigest(entry.sha256, "FILE_ENTRY_SHA_INVALID");
  } else if (entry.type === "directory") exactKeys(entry, common, "DIRECTORY_ENTRY_KEYS_INVALID");
  else if (entry.type === "symlink") { exactKeys(entry, [...common, "target"], "SYMLINK_ENTRY_KEYS_INVALID"); validateSymlinkPath(entry.path, entry.target); }
  else fail("ENTRY_TYPE_INVALID", { observed: entry.type });
  if (normalizeRelative(entry.path) !== entry.path) fail("ENTRY_PATH_NON_CANONICAL", { path: entry.path });
  if (policy) enforcePath(entry.path, policy);
  if (!Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) fail("ENTRY_MODE_INVALID", { path: entry.path });
  if (previous !== null && Buffer.from(previous).compare(Buffer.from(entry.path)) >= 0) fail("ENTRY_ORDER_INVALID", { previousPath: previous, path: entry.path });
  return entry.path;
}

export function verifyAliceRuntimeRootContractShape(value, { expectedKind = null, policy: rawPolicy } = {}) {
  exactKeys(value, [
    "schemaVersion", "contractKind", "platform", "sourceCommit", "elizaCommit", "policySha256", "entriesSha256",
    "entryCount", "fileCount", "directoryCount", "symlinkCount", "totalFileBytes", "entries", "contractSha256",
  ], "CONTRACT_KEYS_INVALID");
  if (value.schemaVersion !== RUNTIME_ROOT_SCHEMA) fail("CONTRACT_SCHEMA_INVALID");
  assertKind(value.contractKind);
  if (expectedKind !== null) { assertKind(expectedKind, "EXPECTED_KIND_INVALID"); if (value.contractKind !== expectedKind) fail("CONTRACT_KIND_MISMATCH", { expected: expectedKind, observed: value.contractKind }); }
  if (value.platform !== "linux/amd64") fail("CONTRACT_PLATFORM_INVALID");
  assertCommit(value.sourceCommit, "sourceCommit");
  assertCommit(value.elizaCommit, "elizaCommit");
  assertDigest(value.policySha256, "POLICY_SHA_INVALID");
  assertDigest(value.entriesSha256, "ENTRIES_SHA_INVALID");
  assertDigest(value.contractSha256, "CONTRACT_SHA_INVALID");
  if (!Array.isArray(value.entries)) fail("ENTRIES_INVALID");
  const policy = rawPolicy === undefined ? null : normalizeAliceRuntimeRootPolicy(rawPolicy);
  if (policy && value.policySha256 !== hashBytes(canonical(policy))) fail("POLICY_SHA_MISMATCH");
  let previous = null;
  for (const entry of value.entries) previous = validateEntry(entry, previous, policy);
  const summary = summarize(value.entries);
  if (policy) enforceSummary(summary, policy);
  for (const [key, observed] of Object.entries(summary)) if (value[key] !== observed) fail("SUMMARY_MISMATCH", { field: key, expected: observed, observed: value[key] });
  const entriesHash = hashBytes(canonical(value.entries));
  if (entriesHash !== value.entriesSha256) fail("ENTRIES_SHA_MISMATCH", { expected: entriesHash, observed: value.entriesSha256 });
  const { contractSha256, ...unsigned } = value;
  const contractHash = hashBytes(canonical(unsigned));
  if (contractHash !== contractSha256) fail("CONTRACT_SHA_MISMATCH", { expected: contractHash, observed: contractSha256 });
  return Object.freeze(value);
}

export async function verifyAliceRuntimeRootContract({ root, contract, expectedKind = null, policy }) {
  const verified = verifyAliceRuntimeRootContractShape(contract, { expectedKind, policy });
  const rebuilt = await buildAliceRuntimeRootContract({
    root,
    contractKind: verified.contractKind,
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
      if (JSON.stringify(expected) !== JSON.stringify(observed)) { firstDifference = { index, expected, observed }; break; }
    }
    fail("ROOT_CONTENT_MISMATCH", { expectedContractSha256: verified.contractSha256, observedContractSha256: rebuilt.contractSha256, firstDifference });
  }
  return rebuilt;
}

async function safeOutput(root, output) {
  const rootReal = await realpath(root);
  const absolute = path.resolve(output);
  await mkdir(path.dirname(absolute), { recursive: true });
  const candidate = path.join(await realpath(path.dirname(absolute)), path.basename(absolute));
  const relative = path.relative(rootReal, candidate);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) fail("OUTPUT_INSIDE_ROOT", { output: candidate });
  return candidate;
}

export async function writeAliceRuntimeRootContract({ output, root, ...input }) {
  const destination = await safeOutput(root, output);
  const contract = await buildAliceRuntimeRootContract({ root, ...input });
  await writeFile(destination, canonical(contract), { flag: "wx", mode: 0o444 });
  return contract;
}

function parseArgs(argv) {
  const [command = "write", ...rest] = argv;
  const values = new Map();
  for (let i = 0; i < rest.length; i += 2) {
    const token = rest[i];
    const value = rest[i + 1];
    if (!token?.startsWith("--")) fail("CLI_ARGUMENT_INVALID", { token });
    if (!value || value.startsWith("--")) fail("CLI_VALUE_MISSING", { name: token.slice(2) });
    if (values.has(token.slice(2))) fail("CLI_DUPLICATE_ARGUMENT", { name: token.slice(2) });
    values.set(token.slice(2), value);
  }
  return { command, values };
}
async function readPolicy(file) { return file ? normalizeAliceRuntimeRootPolicy(JSON.parse(await readFile(file, "utf8"))) : DEFAULT_POLICY; }
async function main(argv) {
  const { command, values } = parseArgs(argv);
  if (command === "write") {
    for (const key of ["root", "kind", "output", "source-commit", "eliza-commit"]) if (!values.has(key)) fail("CLI_REQUIRED_ARGUMENT_MISSING", { key });
    const result = await writeAliceRuntimeRootContract({
      root: values.get("root"), contractKind: values.get("kind"), output: values.get("output"),
      sourceCommit: values.get("source-commit"), elizaCommit: values.get("eliza-commit"),
      platform: values.get("platform") ?? "linux/amd64", policy: await readPolicy(values.get("policy")),
    });
    process.stdout.write(`${JSON.stringify({ ok: true, contractKind: result.contractKind, contractSha256: result.contractSha256 })}\n`);
    return;
  }
  if (command === "verify") {
    for (const key of ["root", "manifest"]) if (!values.has(key)) fail("CLI_REQUIRED_ARGUMENT_MISSING", { key });
    const result = await verifyAliceRuntimeRootContract({
      root: values.get("root"), contract: JSON.parse(await readFile(values.get("manifest"), "utf8")),
      expectedKind: values.get("kind") ?? null, policy: await readPolicy(values.get("policy")),
    });
    process.stdout.write(`${JSON.stringify({ ok: true, contractKind: result.contractKind, contractSha256: result.contractSha256 })}\n`);
    return;
  }
  fail("CLI_COMMAND_INVALID", { observed: command });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main(process.argv.slice(2)).catch((error) => {
  if (error instanceof AliceRuntimeRootContractError) {
    process.stderr.write(`${JSON.stringify({ code: error.code, predicateId: error.predicateId, details: error.details })}\n`);
  } else {
    process.stderr.write(`${JSON.stringify({ code: "ALICE_RUNTIME_ROOT_CONTRACT_INTERNAL", message: error?.message ?? String(error) })}\n`);
  }
  process.exitCode = 1;
});
