import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const READY_TIMEOUT_MS = 30_000;

type SpawnedProcess = {
  child: ChildProcessWithoutNullStreams;
  output: string[];
};

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a port"));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode != null) {
    return true;
  }

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onExit = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      child.off("close", onExit);
    };

    child.once("exit", onExit);
    child.once("close", onExit);
  });
}

async function waitForJsonPredicate<T>(
  url: string,
  predicate: (value: T) => boolean,
  timeoutMs: number = READY_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const value = (await response.json()) as T;
      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for ${url}`);
}

function spawnBun(args: string[], env: NodeJS.ProcessEnv): SpawnedProcess {
  const child = spawn("bun", args, {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  spawnedChildren.add(child);
  child.once("close", () => {
    spawnedChildren.delete(child);
  });
  const output: string[] = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => output.push(chunk));
  child.stderr.on("data", (chunk: string) => output.push(chunk));
  return { child, output };
}

function buildEnv(
  stateDir: string,
  configPath: string,
  port: number,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DISCORD_API_TOKEN: "",
    DISCORD_BOT_TOKEN: "",
    ELIZA_CONFIG_PATH: configPath,
    ELIZA_DISABLE_LOCAL_EMBEDDINGS: "1",
    ELIZA_PORT: String(port),
    ELIZA_STATE_DIR: stateDir,
    MILADY_API_PORT: String(port),
    MILADY_CONFIG_PATH: configPath,
    MILADY_DISABLE_LOCAL_EMBEDDINGS: "1",
    MILADY_STATE_DIR: stateDir,
    TELEGRAM_BOT_TOKEN: "",
  };
}

async function createTempHarness(): Promise<{
  cleanup: () => Promise<void>;
  configPath: string;
  rootDir: string;
  stateDir: string;
}> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "milady-pglite-e2e-"));
  const stateDir = path.join(rootDir, "state");
  const configPath = path.join(rootDir, "milady.json");
  await mkdir(stateDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({ logging: { level: "error" } }) + "\n");
  return {
    cleanup: async () => {
      await rm(rootDir, { recursive: true, force: true });
    },
    configPath,
    rootDir,
    stateDir,
  };
}

const cleanups: Array<() => Promise<void>> = [];
const spawnedChildren = new Set<ChildProcessWithoutNullStreams>();

afterEach(async () => {
  for (const child of spawnedChildren) {
    if (child.exitCode == null) {
      child.kill("SIGTERM");
      await waitForChildExit(child, 10_000);
    }
  }
  spawnedChildren.clear();
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe("PGlite fail-fast e2e", () => {
  it("direct runtime help exits without booting the runtime or creating a db", async () => {
    const harness = await createTempHarness();
    cleanups.push(harness.cleanup);

    const port = await getFreePort();
    const env = buildEnv(harness.stateDir, harness.configPath, port);
    const dbDir = path.join(harness.stateDir, "workspace", ".eliza", ".elizadb");
    const proc = spawnBun(
      ["packages/app-core/src/runtime/eliza.ts", "--help"],
      env,
    );

    const exited = await waitForChildExit(proc.child, 10_000);
    expect(exited).toBe(true);
    expect(proc.child.exitCode).toBe(0);
    expect(existsSync(dbDir)).toBe(false);
    expect(proc.output.join("")).toContain("bun run start:eliza");
  });

  it("bun run start:eliza --help exits without booting the runtime or creating a db", async () => {
    const harness = await createTempHarness();
    cleanups.push(harness.cleanup);

    const port = await getFreePort();
    const env = buildEnv(harness.stateDir, harness.configPath, port);
    const dbDir = path.join(harness.stateDir, "workspace", ".eliza", ".elizadb");
    const proc = spawnBun(["run", "start:eliza", "--help"], env);

    const exited = await waitForChildExit(proc.child, 10_000);
    expect(exited).toBe(true);
    expect(proc.child.exitCode).toBe(0);
    expect(existsSync(dbDir)).toBe(false);
    expect(proc.output.join("")).toContain("bun run start:eliza");
  });

  it("starts successfully with a malformed pid file and does not create backup db dirs", async () => {
    const harness = await createTempHarness();
    cleanups.push(harness.cleanup);

    const firstPort = await getFreePort();
    const firstProc = spawnBun(
      ["run", "start:eliza"],
      buildEnv(harness.stateDir, harness.configPath, firstPort),
    );
    await waitForJsonPredicate<{ ready?: boolean; runtime?: string }>(
      `http://127.0.0.1:${firstPort}/api/health`,
      (value) => value.ready === true && value.runtime === "ok",
    );
    firstProc.child.kill("SIGTERM");
    await waitForChildExit(firstProc.child, 10_000);

    const dbDir = path.join(harness.stateDir, "workspace", ".eliza", ".elizadb");
    writeFileSync(
      path.join(dbDir, "postmaster.pid"),
      "-42\n/tmp/pglite/base\n1775818211\n5432\n\n\n938287249       666\n",
    );

    const secondPort = await getFreePort();
    const secondProc = spawnBun(
      ["run", "start:eliza"],
      buildEnv(harness.stateDir, harness.configPath, secondPort),
    );
    await waitForJsonPredicate<{ ready?: boolean; runtime?: string }>(
      `http://127.0.0.1:${secondPort}/api/health`,
      (value) => value.ready === true && value.runtime === "ok",
    );
    secondProc.child.kill("SIGTERM");
    await waitForChildExit(secondProc.child, 10_000);

    const siblings = readdirSync(path.dirname(dbDir)).filter((entry) =>
      entry.startsWith(".elizadb.corrupt-"),
    );
    expect(siblings).toHaveLength(0);
  });

  it("fails fast on a corrupted db file without auto-resetting the data dir", async () => {
    const harness = await createTempHarness();
    cleanups.push(harness.cleanup);

    const setupPort = await getFreePort();
    const setupProc = spawnBun(
      ["run", "start:eliza"],
      buildEnv(harness.stateDir, harness.configPath, setupPort),
    );
    await waitForJsonPredicate<{ ready?: boolean; runtime?: string }>(
      `http://127.0.0.1:${setupPort}/api/health`,
      (value) => value.ready === true && value.runtime === "ok",
    );
    setupProc.child.kill("SIGTERM");
    await waitForChildExit(setupProc.child, 10_000);

    const dbDir = path.join(harness.stateDir, "workspace", ".eliza", ".elizadb");
    writeFileSync(path.join(dbDir, "global", "1213"), "x");

    const runPort = await getFreePort();
    const proc = spawnBun(
      [
        "-e",
        [
          'import { startEliza } from "./packages/app-core/src/runtime/eliza.ts";',
          "startEliza({ serverOnly: true })",
          '  .then(() => process.exit(0))',
          "  .catch((err) => {",
          '    console.error(`ERR_CODE=${String(err?.code ?? "")}`);',
          '    console.error(`ERR_MESSAGE=${String(err?.message ?? "")}`);',
          "    process.exit(1);",
          "  });",
        ].join("\n"),
      ],
      buildEnv(harness.stateDir, harness.configPath, runPort),
    );

    const exited = await waitForChildExit(proc.child, 20_000);
    const output = proc.output.join("");
    const siblings = readdirSync(path.dirname(dbDir)).filter((entry) =>
      entry.startsWith(".elizadb.corrupt-"),
    );

    expect(exited).toBe(true);
    expect(proc.child.exitCode).toBe(1);
    expect(output).toContain("ERR_CODE=ELIZA_PGLITE_MANUAL_RESET_REQUIRED");
    expect(output).toContain("rename or delete only this directory");
    expect(output).toContain(dbDir);
    expect(siblings).toHaveLength(0);
    expect(readFileSync(path.join(dbDir, "global", "1213"), "utf8")).toBe("x");
  });
});
