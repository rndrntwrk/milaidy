#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptFile), "..");
const LOCK_PATH = resolve(repoRoot, "upstreams.lock.json");
const ELIZA_PATH = resolve(repoRoot, "eliza");
const EXPECTED_URL = "https://github.com/elizaos/eliza.git";
const EXPECTED_BRANCH = "develop";

function fail(message) {
  console.error(`[check-eliza-submodule-pin] ${message}`);
  process.exitCode = 1;
}

function git(args, cwd = repoRoot) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readGitlink() {
  const line = git(["ls-files", "-s", "--", "eliza"]);
  const [mode, sha] = line.split(/\s+/, 3);
  if (mode !== "160000" || !/^[0-9a-f]{40}$/i.test(sha ?? "")) {
    fail(`eliza is not tracked as a submodule gitlink: ${line || "<empty>"}`);
    return null;
  }
  return sha;
}

function readGitmodulesValue(key) {
  try {
    return git(["config", "-f", ".gitmodules", key]);
  } catch {
    return "";
  }
}

function assertCommitPrefix(label, value, expectedSha) {
  const actual = String(value ?? "").trim();
  if (!actual) {
    fail(`${label} is empty`);
    return;
  }
  if (!expectedSha.startsWith(actual) && !actual.startsWith(expectedSha)) {
    fail(`${label}=${actual} does not match eliza gitlink ${expectedSha}`);
  }
}

const elizaSha = readGitlink();
if (!elizaSha) process.exit(1);

const url = readGitmodulesValue("submodule.eliza.url").toLowerCase();
if (url !== EXPECTED_URL) {
  fail(
    `.gitmodules submodule.eliza.url=${url || "<empty>"}; expected ${EXPECTED_URL}`,
  );
}

const branch = readGitmodulesValue("submodule.eliza.branch");
if (branch !== EXPECTED_BRANCH) {
  fail(
    `.gitmodules submodule.eliza.branch=${branch || "<empty>"}; expected ${EXPECTED_BRANCH}`,
  );
}

const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
assertCommitPrefix(
  "upstreams.lock.json elizaCommit",
  lock.elizaCommit,
  elizaSha,
);

for (const upstream of lock.upstreams ?? []) {
  if (String(upstream.repoUrl ?? "").toLowerCase() === EXPECTED_URL) {
    assertCommitPrefix(
      `upstreams.lock.json ${upstream.packageName} pinnedCommit`,
      upstream.pinnedCommit,
      elizaSha,
    );
  }
}

const checkoutMarkers = [
  resolve(ELIZA_PATH, "package.json"),
  resolve(ELIZA_PATH, "packages", "typescript", "package.json"),
];
if (checkoutMarkers.every((marker) => existsSync(marker))) {
  try {
    const checkoutSha = git(["rev-parse", "HEAD"], ELIZA_PATH);
    if (checkoutSha !== elizaSha) {
      fail(`eliza checkout is ${checkoutSha}, expected ${elizaSha}`);
    }
  } catch (err) {
    fail(
      `eliza checkout markers exist but git metadata is unreadable: ${err.message}`,
    );
  }
} else {
  console.warn(
    "[check-eliza-submodule-pin] eliza checkout is not initialized; verified gitlink and lock metadata only.",
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`[check-eliza-submodule-pin] eliza gitlink verified: ${elizaSha}`);
