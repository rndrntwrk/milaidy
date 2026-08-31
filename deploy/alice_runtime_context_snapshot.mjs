#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AliceRuntimeRootContractError,
  writeAliceRuntimeRootContract,
} from "./alice_runtime_root_contract.mjs";

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

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
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

async function executeDocker({ cwd, args, maxOutputBytes = 256 * 1024 }) {
  await new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
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
      reject(
        new AliceRuntimeContextSnapshotError("DOCKER_START_FAILED", {
          code: error.code ?? null,
        }),
      );
    });
    child.once("exit", (code, signal) => {
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
}

export async function snapshotAliceRuntimeContext({
  repoRoot,
  dockerfile,
  outputDirectory,
  contractPath,
  sourceCommit,
  elizaCommit,
  policy,
  execute = executeDocker,
}) {
  const canonicalRepo = await realpath(repoRoot).catch(() =>
    fail("REPO_ROOT_INVALID", { path: repoRoot }),
  );
  const dockerfilePath = path.resolve(canonicalRepo, dockerfile);
  if (!isInside(canonicalRepo, dockerfilePath)) {
    fail("DOCKERFILE_PATH_ESCAPE", { path: dockerfile });
  }
  await requireRegularFile(dockerfilePath, "DOCKERFILE_INVALID");
  await requireRegularFile(
    path.join(canonicalRepo, ".dockerignore"),
    "DOCKERIGNORE_INVALID",
  );
  const absoluteOutputDirectory = path.resolve(outputDirectory);
  const absoluteContractPath = path.resolve(contractPath);
  if (
    absoluteOutputDirectory === canonicalRepo ||
    isInside(canonicalRepo, absoluteOutputDirectory)
  ) {
    fail("OUTPUT_INSIDE_REPOSITORY", { path: absoluteOutputDirectory });
  }
  if (
    absoluteContractPath === canonicalRepo ||
    isInside(canonicalRepo, absoluteContractPath)
  ) {
    fail("CONTRACT_INSIDE_REPOSITORY", { path: absoluteContractPath });
  }
  if (
    absoluteContractPath === absoluteOutputDirectory ||
    isInside(absoluteOutputDirectory, absoluteContractPath)
  ) {
    fail("CONTRACT_INSIDE_OUTPUT", { path: absoluteContractPath });
  }
  await requireAbsent(absoluteOutputDirectory, "OUTPUT_ALREADY_EXISTS");
  await requireAbsent(absoluteContractPath, "CONTRACT_ALREADY_EXISTS");
  await mkdir(path.dirname(absoluteOutputDirectory), { recursive: true });
  await mkdir(path.dirname(absoluteContractPath), { recursive: true });

  const relativeDockerfile = path.relative(canonicalRepo, dockerfilePath);
  const args = buildAliceRuntimeContextSnapshotArgs({
    dockerfile: relativeDockerfile,
    outputDirectory: absoluteOutputDirectory,
    contextDirectory: ".",
  });
  let completed = false;
  try {
    await execute({ cwd: canonicalRepo, args });
    const outputStats = await lstat(absoluteOutputDirectory).catch(() =>
      fail("OUTPUT_MISSING", { path: absoluteOutputDirectory }),
    );
    if (!outputStats.isDirectory() || outputStats.isSymbolicLink()) {
      fail("OUTPUT_INVALID", { path: absoluteOutputDirectory });
    }
    const contract = await writeAliceRuntimeRootContract({
      root: absoluteOutputDirectory,
      output: absoluteContractPath,
      sourceCommit,
      elizaCommit,
      policy,
    });
    completed = true;
    return Object.freeze({
      command: "docker",
      args,
      contract,
    });
  } finally {
    if (!completed) {
      await rm(absoluteOutputDirectory, { recursive: true, force: true });
      await rm(absoluteContractPath, { force: true });
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
  const result = await snapshotAliceRuntimeContext({
    repoRoot: values.get("repo-root"),
    dockerfile: values.get("dockerfile"),
    outputDirectory: values.get("output-directory"),
    contractPath: values.get("contract"),
    sourceCommit: values.get("source-commit"),
    elizaCommit: values.get("eliza-commit"),
    policy,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
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
