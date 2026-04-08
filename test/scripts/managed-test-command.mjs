import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SIGNAL_EXIT_CODES = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};

function isRealNodeExecutable(candidate) {
  if (!candidate || !fs.existsSync(candidate)) {
    return false;
  }
  const stat = fs.statSync(candidate);
  if (!stat.isFile()) {
    return false;
  }
  const normalized = candidate.replace(/\\/g, "/");
  return !/\/bun-node-[^/]+\/node$/.test(normalized);
}

export function resolveNodeCmd() {
  if (isRealNodeExecutable(process.env.npm_node_execpath)) {
    return process.env.npm_node_execpath;
  }
  for (const candidate of [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ]) {
    if (isRealNodeExecutable(candidate)) {
      return candidate;
    }
  }
  if (isRealNodeExecutable(process.execPath)) {
    return process.execPath;
  }
  return "node";
}

export function buildTestEnv(cwd) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("npm_") || key === "INIT_CWD") {
      delete env[key];
    }
  }
  env.NODE_NO_WARNINGS = env.NODE_NO_WARNINGS || "1";
  env.MILADY_LIVE_TEST = "0";
  env.ELIZA_LIVE_TEST = "0";
  env.PWD = path.resolve(cwd);
  return env;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return true;
    }
    await sleep(100);
  }
  return !isPidAlive(pid);
}

async function killProcessTree(pid) {
  if (!isPidAlive(pid)) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // Best effort.
    }
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }
  }

  if (await waitForExit(pid, 5_000)) {
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Best effort.
    }
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readLock(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function writeLock(lockPath, state) {
  ensureDir(path.dirname(lockPath));
  fs.writeFileSync(lockPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function removeLock(lockPath) {
  fs.rmSync(lockPath, { force: true });
}

async function cleanupStaleLock(lockPath) {
  const existing = readLock(lockPath);
  if (!existing) {
    return;
  }

  const ownerPid = Number.isInteger(existing.ownerPid)
    ? existing.ownerPid
    : Number.parseInt(String(existing.ownerPid ?? ""), 10);
  const childPid = Number.isInteger(existing.childPid)
    ? existing.childPid
    : Number.parseInt(String(existing.childPid ?? ""), 10);

  if (ownerPid && isPidAlive(ownerPid)) {
    throw new Error(
      `[test-runner] Another "${existing.lockName ?? path.basename(lockPath)}" run is already active (pid ${ownerPid}).`,
    );
  }

  if (childPid && isPidAlive(childPid)) {
    await killProcessTree(childPid);
  }

  removeLock(lockPath);
}

export async function runManagedTestCommand({
  repoRoot,
  lockName,
  label,
  command,
  args,
  cwd = repoRoot,
  env = buildTestEnv(cwd),
}) {
  const lockPath = path.join(repoRoot, ".tmp", "test-runner", `${lockName}.json`);
  await cleanupStaleLock(lockPath);

  const initialState = {
    lockName,
    label,
    ownerPid: process.pid,
    childPid: null,
    startedAt: new Date().toISOString(),
    cwd: path.resolve(cwd),
    command,
    args,
  };
  writeLock(lockPath, initialState);

  const startedAt = Date.now();
  console.log(
    `[test-runner] START ${label}: ${[command, ...args].join(" ")}`,
  );

  let child = null;
  let shuttingDown = false;

  const cleanup = async (reason = "cleanup") => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (child?.pid) {
      await killProcessTree(child.pid);
    }
    removeLock(lockPath);
    if (reason !== "normal") {
      console.error(`[test-runner] STOP ${label}: ${reason}`);
    }
  };

  const signalHandlers = new Map();
  for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
    const handler = () => {
      void cleanup(`received ${signal}`).finally(() => {
        process.exit(SIGNAL_EXIT_CODES[signal] ?? 1);
      });
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }

  try {
    await new Promise((resolve, reject) => {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: "inherit",
        detached: process.platform !== "win32",
      });

      writeLock(lockPath, {
        ...initialState,
        childPid: child.pid ?? null,
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("exit", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        const suffix =
          signal != null
            ? `signal ${signal}`
            : `exit code ${code ?? "unknown"}`;
        reject(new Error(`[test-runner] ${label} failed with ${suffix}`));
      });
    });

    console.log(
      `[test-runner] PASS ${label} (${Date.now() - startedAt}ms)`,
    );
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
    await cleanup("normal");
  }
}
