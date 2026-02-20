/**
 * E2E Test Harness for Milaidy.
 *
 * Provides a complete test environment with:
 * - Automatic server startup/shutdown
 * - Temporary configuration management
 * - API client for making requests
 * - Port allocation
 *
 * @module test/e2e/framework/harness
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { createApiClient, type ApiClient } from "./api-client.js";

export interface TestHarnessConfig {
  /** Partial Milaidy configuration */
  config: Record<string, unknown>;
  /** Environment variables */
  env?: Record<string, string>;
  /** Startup timeout in ms */
  timeout?: number;
  /** Specific port to use (otherwise random) */
  port?: number;
  /** Log output to console */
  verbose?: boolean;
}

export interface TestHarness {
  /** API client for making requests */
  client: ApiClient;
  /** Server port */
  port: number;
  /** Stop the harness */
  stop(): Promise<void>;
  /** Get server logs */
  getLogs(): string[];
  /** Wait for a condition */
  waitFor(condition: () => Promise<boolean>, timeoutMs?: number): Promise<void>;
}

/**
 * Start a test harness with the given configuration.
 */
export async function startHarness(config: TestHarnessConfig): Promise<TestHarness> {
  const port = config.port ?? (await getRandomPort());
  const timeout = config.timeout ?? 30000;
  const verbose = config.verbose ?? false;

  // Create temp config file
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-test-"));
  const configPath = path.join(tempDir, "milaidy.json");

  const fullConfig = {
    ...config.config,
    gateway: {
      ...(config.config.gateway as Record<string, unknown> ?? {}),
      port,
    },
  };

  await fs.writeFile(configPath, JSON.stringify(fullConfig, null, 2));

  // Find the entry point
  const projectRoot = path.resolve(import.meta.dirname, "../../..");
  const entryPoint = path.join(projectRoot, "dist", "entry.js");

  // Check if built
  try {
    await fs.access(entryPoint);
  } catch {
    throw new Error(
      "Project not built. Run 'npm run build' before running E2E tests.",
    );
  }

  const logs: string[] = [];
  let process: ChildProcess | null = null;

  // Start the server
  process = spawn("node", [entryPoint, "start"], {
    cwd: projectRoot,
    env: {
      ...globalThis.process.env,
      ...config.env,
      MILAIDY_CONFIG: configPath,
      MILAIDY_PORT: String(port),
      LOG_LEVEL: verbose ? "debug" : "error",
      NODE_ENV: "test",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Capture output
  process.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    logs.push(`[stdout] ${line}`);
    if (verbose) console.log(`[harness] ${line}`);
  });

  process.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    logs.push(`[stderr] ${line}`);
    if (verbose) console.error(`[harness] ${line}`);
  });

  process.on("error", (err) => {
    logs.push(`[error] ${err.message}`);
  });

  // Create API client
  const client = createApiClient(`http://localhost:${port}`);

  // Wait for server to be ready
  const startTime = Date.now();
  let ready = false;

  while (Date.now() - startTime < timeout) {
    try {
      const status = await client.getStatus();
      // For many E2E suites we only need the API server to be reachable.
      // The agent runtime may legitimately be "not_started" in test mode.
      if (status && typeof status.state === "string") {
        ready = true;
        break;
      }
    } catch {
      // Not ready yet
    }
    await sleep(500);
  }

  if (!ready) {
    // Kill the process
    process.kill("SIGTERM");
    await fs.rm(tempDir, { recursive: true, force: true });
    throw new Error(
      `Server failed to start within ${timeout}ms. Logs:\n${logs.join("\n")}`,
    );
  }

  return {
    client,
    port,

    async stop() {
      if (process) {
        process.kill("SIGTERM");

        // Wait for process to exit
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            process?.kill("SIGKILL");
            resolve();
          }, 5000);

          process?.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        process = null;
      }

      // Cleanup temp files
      await fs.rm(tempDir, { recursive: true, force: true });
    },

    getLogs() {
      return [...logs];
    },

    async waitFor(condition: () => Promise<boolean>, timeoutMs = 10000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (await condition()) return;
        await sleep(200);
      }
      throw new Error("Condition not met within timeout");
    },
  };
}

/**
 * Get a random available port.
 */
async function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        server.close(() => resolve(addr.port));
      } else {
        reject(new Error("Could not get port"));
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test fixture helper for creating isolated test data.
 */
export class TestFixture {
  private tempDir: string | null = null;

  async setup(): Promise<string> {
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-fixture-"));
    return this.tempDir;
  }

  async writeFile(name: string, content: string): Promise<string> {
    if (!this.tempDir) throw new Error("Fixture not setup");
    const filePath = path.join(this.tempDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      this.tempDir = null;
    }
  }
}
