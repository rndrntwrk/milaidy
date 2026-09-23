#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AliceRuntimeRootContractError,
  writeAliceRuntimeRootContract,
} from "./alice_runtime_root_contract.mjs";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

export class AliceRuntimeContextSnapshotError extends Error {
  constructor(predicateId, details = {}) {
    super(`ALICE_RUNTIME_CONTEXT_SNAPSHOT_INVALID:${predicateId}`);
    this.name = "AliceRuntimeContextSnapshotError";
    this.code = "ALICE_RUNTIME_CONTEXT_SNAPSHOT_INVALID";
    this.predicateId = predicateId;
    this.details = Object.freeze({ ...details });
  }
}

function fail(predicateId, details = {}) {
  throw new AliceRuntimeContextSnapshotError(predicateId, details);
}

function isInsideOrEqual(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
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

async function requireRegularFile(filePath, predicateId) {
  const stats = await lstat(filePath).catch(() =>
    fail(predicateId, { path: filePath }),
  );
  if (!stats.isFile() || stats.isSymbolicLink()) {
    fail(predicateId, { path: filePath, mode: stats.mode });
  }
}

async function requireAbsent(filePath, predicateId) {
  const exists = await lstat(filePath)
    .then(() => true)
    .catch((error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    });
  if (exists) {
    fail(predicateId, { path: filePath });
  }
}

async function resolveCreateTarget(filePath) {
  const absolute = path.resolve(filePath);
  const parent = path.dirname(absolute);
  await mkdir(parent, { recursive: true });
  const parentReal = await realpath(parent);
  return path.join(parentReal, path.basename(absolute));
}

export function buildAliceRuntimeContextSnapshotArgs({
  dockerfile,
  outputDirectory,
  contextDirectory = ".",
}) {
  for (const [field, value] of Object.entries({
    dockerfile,
    outputDirectory,
    contextDirectory,
  })) {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.includes("\0") ||
      value.includes("\n") ||
      value.includes("\r")
    ) {
      fail("COMMAND_ARGUMENT_INVALID", { field });
    }
  }
  return Object.freeze([
    "buildx",
    "build",
    "--progress=plain",
    "--platform=linux/amd64",
    "--file",
    dockerfile,
    "--output",
    `type=local,dest=${outputDirectory}`,
    "--no-cache",
    contextDirectory,
  ]);
}

async function executeDocker({
  cwd,
  args,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = 256 * 1024,
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    fail("DOCKER_TIMEOUT_INVALID", { observed: timeoutMs });
  }
  await new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeoutTimer = null;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      callback();
    };

    const append = (current, chunk) => {
      if (Buffer.byteLength(current, "utf8") >= maxOutputBytes) {
        return current;
      }
      const remaining = maxOutputBytes - Buffer.byteLength(current, "utf8");
      return current + chunk.toString("utf8", 0, remaining);
    };

    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
      process.stderr.write(chunk);
    });

    child.once("error", (error) => {
      finish(() =>
        reject(
          new AliceRuntimeContextSnapshotError("DOCKER_START_FAILED", {
            code: error.code ?? null,
          }),
        ),
      );
    });

    child.once("exit", (code, signal) => {
      finish(() => {
        if (signal || code !== 0) {
          reject(
            new AliceRuntimeContextSnapshotError("DOCKER_BUILD_FAILED", {
              exitCode: code,
              signal: signal ?? null,
              stdoutTail: stdout.slice(-4000),
              stderrTail: stderr.slice(-4000),
            }),
          );
          return;
        }
        resolve();
      });
    });

    timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      const hardKillTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      hardKillTimer.unref();
      reject(
        new AliceRuntimeContextSnapshotError("DOCKER_BUILD_TIMEOUT", {
          timeoutMs,
        }),
      );
    }, timeoutMs);
  });
}

export async function snapshotAliceRuntimeContext({
  repoRoot,
  dockerfile,
  expectedDockerfileSha256,
  outputDirectory,
  contractPath,
  sourceCommit,
  elizaCommit,
  policy,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  execute = executeDocker,
}) {
  assertDigest(expectedDockerfileSha256, "expectedDockerfileSha256");
  const canonicalRepo = await realpath(repoRoot).catch(() =>
    fail("REPO_ROOT_INVALID", { path: repoRoot }),
  );
  const repoStats = await lstat(repoRoot).catch(() =>
    fail("REPO_ROOT_INVALID", { path: repoRoot }),
  );
  if (!repoStats.isDirectory() || repoStats.isSymbolicLink()) {
    fail("REPO_ROOT_INVALID", { path: repoRoot });
  }

  const dockerfilePath = path.resolve(canonicalRepo, dockerfile);
  if (!isInsideOrEqual(canonicalRepo, dockerfilePath)) {
    fail("DOCKERFILE_PATH_ESCAPE", { path: dockerfile });
  }
  await requireRegularFile(dockerfilePath, "DOCKERFILE_INVALID");
  const observedDockerfileSha256 = await sha256File(dockerfilePath);
  if (observedDockerfileSha256 !== expectedDockerfileSha256) {
    fail("DOCKERFILE_DIGEST_MISMATCH", {
      expected: expectedDockerfileSha256,
      observed: observedDockerfileSha256,
    });
  }
  await requireRegularFile(
    path.join(canonicalRepo, ".dockerignore"),
    "DOCKERIGNORE_INVALID",
  );

  const absoluteOutputDirectory = path.resolve(outputDirectory);
  const absoluteContractPath = path.resolve(contractPath);
  await requireAbsent(absoluteOutputDirectory, "OUTPUT_ALREADY_EXISTS");
  await requireAbsent(absoluteContractPath, "CONTRACT_ALREADY_EXISTS");

  const safeOutputDirectory = await resolveCreateTarget(
    absoluteOutputDirectory,
  );
  const safeContractPath = await resolveCreateTarget(absoluteContractPath);

  if (isInsideOrEqual(canonicalRepo, safeOutputDirectory)) {
    fail("OUTPUT_INSIDE_REPOSITORY", { path: safeOutputDirectory });
  }
  if (isInsideOrEqual(canonicalRepo, safeContractPath)) {
    fail("CONTRACT_INSIDE_REPOSITORY", { path: safeContractPath });
  }
  if (isInsideOrEqual(safeOutputDirectory, safeContractPath)) {
    fail("CONTRACT_INSIDE_OUTPUT", { path: safeContractPath });
  }

  const relativeDockerfile = path.relative(canonicalRepo, dockerfilePath);
  const args = buildAliceRuntimeContextSnapshotArgs({
    dockerfile: relativeDockerfile,
    outputDirectory: safeOutputDirectory,
    contextDirectory: ".",
  });

  let completed = false;
  try {
    await execute({
      cwd: canonicalRepo,
      args,
      timeoutMs,
    });
    const outputStats = await lstat(safeOutputDirectory).catch(() =>
      fail("OUTPUT_MISSING", { path: safeOutputDirectory }),
    );
    if (!outputStats.isDirectory() || outputStats.isSymbolicLink()) {
      fail("OUTPUT_INVALID", { path: safeOutputDirectory });
    }
    const outputReal = await realpath(safeOutputDirectory);
    if (
      outputReal !== safeOutputDirectory ||
      isInsideOrEqual(canonicalRepo, outputReal)
    ) {
      fail("OUTPUT_REALPATH_INVALID", {
        expected: safeOutputDirectory,
        observed: outputReal,
      });
    }

    const contract = await writeAliceRuntimeRootContract({
      root: safeOutputDirectory,
      contractKind: "build-context",
      output: safeContractPath,
      sourceCommit,
      elizaCommit,
      policy,
    });
    completed = true;
    return Object.freeze({
      command: "docker",
      args,
      dockerfileSha256: observedDockerfileSha256,
      contract,
    });
  } finally {
    if (!completed) {
      await rm(safeOutputDirectory, { recursive: true, force: true });
      await rm(safeContractPath, { force: true });
    }
  }
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
  for (const required of [
    "repo-root",
    "dockerfile",
    "dockerfile-sha256",
    "output-directory",
    "contract",
    "source-commit",
    "eliza-commit",
  ]) {
    if (!values.has(required)) {
      fail("CLI_REQUIRED_ARGUMENT_MISSING", { required });
    }
  }
  const policy = values.has("policy")
    ? JSON.parse(await readFile(values.get("policy"), "utf8"))
    : undefined;
  const timeoutMs = values.has("timeout-ms")
    ? Number(values.get("timeout-ms"))
    : DEFAULT_TIMEOUT_MS;
  const result = await snapshotAliceRuntimeContext({
    repoRoot: values.get("repo-root"),
    dockerfile: values.get("dockerfile"),
    expectedDockerfileSha256: values.get("dockerfile-sha256"),
    outputDirectory: values.get("output-directory"),
    contractPath: values.get("contract"),
    sourceCommit: values.get("source-commit"),
    elizaCommit: values.get("eliza-commit"),
    policy,
    timeoutMs,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      dockerfileSha256: result.dockerfileSha256,
      contractSha256: result.contract.contractSha256,
    })}\n`,
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    if (
      error instanceof AliceRuntimeContextSnapshotError ||
      error instanceof AliceRuntimeRootContractError
    ) {
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
        code: "ALICE_RUNTIME_CONTEXT_SNAPSHOT_INTERNAL",
        message: error?.message ?? String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
