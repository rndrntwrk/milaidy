import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyAliceRuntimeBuildPolicy } from "./alice_runtime_inputs.mjs";
import { normalizeAliceRuntimeRootPolicy } from "./alice_runtime_root_contract.mjs";

const SOURCE = "3".repeat(40);
const ELIZA = "4".repeat(40);
const deployRoot = path.dirname(fileURLToPath(import.meta.url));
const contractCli = path.join(deployRoot, "alice_runtime_root_contract.mjs");
const contextPolicyPath = path.join(
  deployRoot,
  "alice_runtime_context_policy.v1.json",
);
const rootPolicyPath = path.join(
  deployRoot,
  "alice_runtime_root_policy.v1.json",
);
const buildPolicyPath = path.join(
  deployRoot,
  "alice_runtime_build_policy.v1.json",
);
const contextDockerfilePath = path.join(
  deployRoot,
  "Dockerfile.runtime-context",
);

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function runNode(args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: path.resolve(deployRoot, ".."),
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

test("checked-in runtime policies and context Dockerfile form one valid contract", async () => {
  const contextPolicy = normalizeAliceRuntimeRootPolicy(
    await readJson(contextPolicyPath),
  );
  const rootPolicy = normalizeAliceRuntimeRootPolicy(
    await readJson(rootPolicyPath),
  );
  const buildPolicy = verifyAliceRuntimeBuildPolicy(
    await readJson(buildPolicyPath),
  );
  const dockerfileBytes = await readFile(contextDockerfilePath);

  assert.equal(contextPolicy.allowDanglingSymlinks, true);
  assert.equal(rootPolicy.allowDanglingSymlinks, false);
  assert.ok(
    rootPolicy.forbiddenBasenames.includes("auth.json"),
    "runtime root must reject persisted provider credentials",
  );
  assert.equal(
    buildPolicy.contextExporterDockerfileSha256,
    sha256(dockerfileBytes),
  );
  assert.equal(
    buildPolicy.runtimeVersionStrategy,
    "legacy-source-bound-inputs-sha256",
  );
  assert.equal(buildPolicy.platform, "linux/amd64");
});

test("checked-in runtime-root policy succeeds through the real CLI write and verify paths", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "alice-policy-root-"));
  const evidence = await mkdtemp(
    path.join(tmpdir(), "alice-policy-evidence-"),
  );
  const manifest = path.join(evidence, "runtime-root.json");
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(evidence, { recursive: true, force: true }));

  await mkdir(path.join(root, "bin"), { recursive: true });
  await writeFile(
    path.join(root, "bin", "alice-runtime"),
    "#!/bin/sh\necho alice\n",
    { mode: 0o755 },
  );

  const written = await runNode([
    contractCli,
    "write",
    "--root",
    root,
    "--kind",
    "runtime-root",
    "--output",
    manifest,
    "--source-commit",
    SOURCE,
    "--eliza-commit",
    ELIZA,
    "--policy",
    rootPolicyPath,
  ]);
  assert.equal(written.code, 0, written.stderr);
  assert.equal(JSON.parse(written.stdout).contractKind, "runtime-root");

  const verified = await runNode([
    contractCli,
    "verify",
    "--root",
    root,
    "--manifest",
    manifest,
    "--kind",
    "runtime-root",
    "--policy",
    rootPolicyPath,
  ]);
  assert.equal(verified.code, 0, verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout), JSON.parse(written.stdout));
});

test("checked-in context policy admits an in-root dangling link only for context observation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "alice-context-policy-root-"));
  const evidence = await mkdtemp(
    path.join(tmpdir(), "alice-context-policy-evidence-"),
  );
  const contextManifest = path.join(evidence, "context.json");
  const runtimeManifest = path.join(evidence, "runtime.json");
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(evidence, { recursive: true, force: true }));

  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await symlink("missing-package", path.join(root, "node_modules", "alias"));

  const context = await runNode([
    contractCli,
    "write",
    "--root",
    root,
    "--kind",
    "build-context",
    "--output",
    contextManifest,
    "--source-commit",
    SOURCE,
    "--eliza-commit",
    ELIZA,
    "--policy",
    contextPolicyPath,
  ]);
  assert.equal(context.code, 0, context.stderr);

  const runtime = await runNode([
    contractCli,
    "write",
    "--root",
    root,
    "--kind",
    "runtime-root",
    "--output",
    runtimeManifest,
    "--source-commit",
    SOURCE,
    "--eliza-commit",
    ELIZA,
    "--policy",
    rootPolicyPath,
  ]);
  assert.notEqual(runtime.code, 0);
  assert.equal(JSON.parse(runtime.stderr).predicateId, "SYMLINK_DANGLING");
});
