/**
 * Container-based plugin sandboxing using Docker.
 *
 * Provides maximum isolation for untrusted third-party plugins by running
 * them in Docker containers with strict resource limits, no network access,
 * and read-only filesystem.
 *
 * @module plugins/container-sandbox
 */

import { EventEmitter } from "node:events";
import path from "node:path";
import type { PluginPermission } from "./permissions.js";

// Types
export interface ContainerSandboxConfig {
  /** Docker image to use */
  image: string;
  /** Memory limit (e.g., "256m", "1g") */
  memoryLimit: string;
  /** CPU limit as fraction of one core (0.5 = 50%) */
  cpuLimit: number;
  /** Network mode: none, bridge, or host */
  networkMode: "none" | "bridge" | "host";
  /** Mount root filesystem as read-only */
  readOnlyRootfs: boolean;
  /** Prevent privilege escalation */
  noNewPrivileges: boolean;
  /** Linux capabilities to drop */
  capDrop: string[];
  /** Path to seccomp profile */
  seccompProfile?: string;
  /** Environment variables to pass */
  env?: Record<string, string>;
  /** Timeout for container operations (ms) */
  timeout?: number;
}

export interface ContainerStatus {
  id: string;
  name: string;
  state: "created" | "running" | "paused" | "stopped" | "dead";
  exitCode?: number;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface SandboxMessage {
  type: "ready" | "result" | "error" | "log";
  payload?: unknown;
  error?: string;
}

const DEFAULT_CONFIG: ContainerSandboxConfig = {
  image: "node:22-alpine",
  memoryLimit: "256m",
  cpuLimit: 0.5,
  networkMode: "none",
  readOnlyRootfs: true,
  noNewPrivileges: true,
  capDrop: ["ALL"],
  timeout: 30000,
};

/**
 * Container sandbox for running untrusted plugins.
 *
 * Uses Docker to provide process and filesystem isolation.
 * Communication with the plugin happens via stdin/stdout JSON messages.
 */
export class ContainerSandbox extends EventEmitter {
  private containerId?: string;
  private docker?: DockerClient;
  private config: ContainerSandboxConfig;
  private pluginName: string;
  private ready = false;

  constructor(
    pluginName: string,
    config: Partial<ContainerSandboxConfig> = {},
  ) {
    super();
    this.pluginName = pluginName;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the container sandbox.
   */
  async start(pluginPath: string, permissions: PluginPermission[]): Promise<void> {
    this.docker = await getDockerClient();

    if (!this.docker) {
      throw new Error("Docker is not available");
    }

    // Build container configuration
    const containerConfig = this.buildContainerConfig(pluginPath, permissions);

    // Create container
    const container = await this.docker.createContainer(containerConfig);
    this.containerId = container.id;

    // Start container
    await container.start();

    // Wait for ready signal
    await this.waitForReady();

    this.emit("started", { containerId: this.containerId });
  }

  /**
   * Send a message to the plugin and wait for response.
   */
  async call<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ready || !this.containerId) {
      throw new Error("Sandbox not ready");
    }

    const message = JSON.stringify({ method, params });
    const result = await this.docker!.exec(this.containerId, message, {
      timeout: this.config.timeout,
    });

    const response = JSON.parse(result) as SandboxMessage;

    if (response.type === "error") {
      throw new Error(response.error ?? "Unknown error");
    }

    return response.payload as T;
  }

  /**
   * Stop the container sandbox.
   */
  async stop(): Promise<void> {
    if (!this.containerId || !this.docker) return;

    try {
      await this.docker.stopContainer(this.containerId, { timeout: 5000 });
      await this.docker.removeContainer(this.containerId);
    } catch {
      // Container may already be stopped
    }

    this.containerId = undefined;
    this.ready = false;
    this.emit("stopped");
  }

  /**
   * Get container status.
   */
  async getStatus(): Promise<ContainerStatus | null> {
    if (!this.containerId || !this.docker) return null;
    return this.docker.inspectContainer(this.containerId);
  }

  /**
   * Build Docker container configuration.
   */
  private buildContainerConfig(
    pluginPath: string,
    permissions: PluginPermission[],
  ): ContainerCreateOptions {
    const env = this.buildEnvironment(permissions);

    return {
      Image: this.config.image,
      name: `milaidy-plugin-${this.pluginName}-${Date.now()}`,
      Cmd: ["node", "--experimental-vm-modules", "/sandbox/runner.js"],
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Memory: parseMemoryLimit(this.config.memoryLimit),
        NanoCpus: Math.floor(this.config.cpuLimit * 1e9),
        NetworkMode: this.config.networkMode,
        ReadonlyRootfs: this.config.readOnlyRootfs,
        SecurityOpt: [
          "no-new-privileges:true",
          ...(this.config.seccompProfile
            ? [`seccomp=${this.config.seccompProfile}`]
            : []),
        ],
        CapDrop: this.config.capDrop,
        Binds: [
          `${pluginPath}:/plugin:ro`,
          // Tmpfs for temporary files
        ],
        Tmpfs: {
          "/tmp": "rw,noexec,nosuid,size=64m",
        },
        // Resource limits
        PidsLimit: 100,
        Ulimits: [
          { Name: "nofile", Soft: 1024, Hard: 1024 },
          { Name: "nproc", Soft: 64, Hard: 64 },
        ],
      },
      // Disable stdin
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    };
  }

  /**
   * Build environment variables based on permissions.
   */
  private buildEnvironment(permissions: PluginPermission[]): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: "production",
      PLUGIN_NAME: this.pluginName,
      MILAIDY_SANDBOX: "container",
    };

    // Only pass specific env vars based on permissions
    if (permissions.includes("process:env:read")) {
      // Still filter sensitive vars
      const allowedPatterns = [/^LOG_LEVEL$/, /^DEBUG$/, /^TZ$/];

      for (const [key, value] of Object.entries(process.env)) {
        if (value && allowedPatterns.some((p) => p.test(key))) {
          env[key] = value;
        }
      }
    }

    return env;
  }

  /**
   * Wait for container to signal ready.
   */
  private async waitForReady(): Promise<void> {
    const timeout = this.config.timeout ?? 30000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const status = await this.getStatus();
        if (status?.state === "running") {
          // Try to get ready signal
          const result = await this.docker!.exec(
            this.containerId!,
            JSON.stringify({ method: "__ping" }),
            { timeout: 5000 },
          );

          const response = JSON.parse(result) as SandboxMessage;
          if (response.type === "ready") {
            this.ready = true;
            return;
          }
        }
      } catch {
        // Not ready yet
      }

      await sleep(500);
    }

    throw new Error("Container failed to become ready");
  }
}

// Docker client interface (simplified)
interface DockerClient {
  createContainer(config: ContainerCreateOptions): Promise<{ id: string }>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, options?: { timeout?: number }): Promise<void>;
  removeContainer(id: string): Promise<void>;
  inspectContainer(id: string): Promise<ContainerStatus>;
  exec(id: string, input: string, options?: { timeout?: number }): Promise<string>;
}

interface ContainerCreateOptions {
  Image: string;
  name?: string;
  Cmd?: string[];
  Env?: string[];
  HostConfig?: {
    Memory?: number;
    NanoCpus?: number;
    NetworkMode?: string;
    ReadonlyRootfs?: boolean;
    SecurityOpt?: string[];
    CapDrop?: string[];
    Binds?: string[];
    Tmpfs?: Record<string, string>;
    PidsLimit?: number;
    Ulimits?: Array<{ Name: string; Soft: number; Hard: number }>;
  };
  OpenStdin?: boolean;
  StdinOnce?: boolean;
  AttachStdin?: boolean;
  AttachStdout?: boolean;
  AttachStderr?: boolean;
}

/**
 * Get a Docker client instance.
 * Returns null if Docker is not available.
 */
async function getDockerClient(): Promise<DockerClient | null> {
  try {
    // Dynamic import to avoid requiring dockerode when not used
    const { default: Docker } = await import("dockerode");
    const docker = new Docker();

    // Test connection
    await docker.ping();

    return {
      async createContainer(config) {
        const container = await docker.createContainer(config);
        return { id: container.id };
      },
      async startContainer(id) {
        const container = docker.getContainer(id);
        await container.start();
      },
      async stopContainer(id, options) {
        const container = docker.getContainer(id);
        await container.stop({ t: Math.floor((options?.timeout ?? 10000) / 1000) });
      },
      async removeContainer(id) {
        const container = docker.getContainer(id);
        await container.remove({ force: true });
      },
      async inspectContainer(id) {
        const container = docker.getContainer(id);
        const info = await container.inspect();
        return {
          id: info.Id,
          name: info.Name,
          state: info.State.Status as ContainerStatus["state"],
          exitCode: info.State.ExitCode,
          startedAt: info.State.StartedAt
            ? new Date(info.State.StartedAt)
            : undefined,
          finishedAt: info.State.FinishedAt
            ? new Date(info.State.FinishedAt)
            : undefined,
        };
      },
      async exec(id, input, options) {
        const container = docker.getContainer(id);
        const exec = await container.exec({
          Cmd: ["cat"],
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
        });

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Exec timeout"));
          }, options?.timeout ?? 30000);

          exec.start({ hijack: true, stdin: true }, (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              reject(err);
              return;
            }

            let output = "";
            stream?.on("data", (chunk: Buffer) => {
              output += chunk.toString();
            });
            stream?.on("end", () => {
              clearTimeout(timeout);
              resolve(output);
            });

            stream?.write(input);
            stream?.end();
          });
        });
      },
    };
  } catch {
    return null;
  }
}

/**
 * Parse memory limit string to bytes.
 */
function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+)([kmg]?)$/i);
  if (!match) return 256 * 1024 * 1024; // Default 256MB

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "k":
      return value * 1024;
    case "m":
      return value * 1024 * 1024;
    case "g":
      return value * 1024 * 1024 * 1024;
    default:
      return value;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if Docker is available on this system.
 */
export async function isDockerAvailable(): Promise<boolean> {
  const client = await getDockerClient();
  return client !== null;
}
