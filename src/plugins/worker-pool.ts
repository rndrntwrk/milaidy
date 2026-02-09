/**
 * Plugin Worker Pool — process isolation via worker threads.
 *
 * Provides sandboxed execution environment for plugins:
 * - Memory and CPU limits via resourceLimits
 * - Filtered environment variables
 * - IPC message routing
 * - Health monitoring with heartbeat
 * - Automatic restart on failure
 *
 * @module plugins/worker-pool
 */

import { EventEmitter } from "node:events";
import { Worker, type WorkerOptions } from "node:worker_threads";
import { logger } from "@elizaos/core";
import type { PluginPermission, ResourceLimits } from "./permissions.js";

// ---------- Types ----------

export interface WorkerConfig {
  /** Absolute path to the plugin entry point. */
  pluginPath: string;
  /** Plugin name (must be unique). */
  pluginName: string;
  /** Granted permissions for this plugin. */
  permissions: PluginPermission[];
  /** Resource limits. */
  resourceLimits?: ResourceLimits;
  /** Custom environment variables. */
  env?: Record<string, string>;
}

export interface WorkerMessage {
  /** Message type. */
  type: string;
  /** Message ID for request-response correlation. */
  id?: string;
  /** Message payload. */
  payload?: unknown;
  /** Error if message is an error response. */
  error?: string;
}

export interface PluginWorkerStats {
  /** Plugin name. */
  name: string;
  /** Whether the worker is running. */
  running: boolean;
  /** Number of restarts. */
  restarts: number;
  /** Time worker started. */
  startedAt: number | null;
  /** Last heartbeat time. */
  lastHeartbeat: number | null;
  /** Pending message count. */
  pendingMessages: number;
}

// ---------- Constants ----------

/** Default heartbeat interval in milliseconds. */
const HEARTBEAT_INTERVAL_MS = 5000;

/** Heartbeat timeout before considering worker dead. */
const HEARTBEAT_TIMEOUT_MS = 15000;

/** Maximum restart attempts before giving up. */
const MAX_RESTART_ATTEMPTS = 3;

/** Base delay for exponential backoff. */
const RESTART_BACKOFF_BASE_MS = 1000;

/** Worker ready timeout. */
const READY_TIMEOUT_MS = 10000;

// ---------- Plugin Worker ----------

/**
 * Wrapper around a Worker thread for a single plugin.
 */
export class PluginWorker extends EventEmitter {
  private worker: Worker | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat: number = 0;
  private restartCount: number = 0;
  private startedAt: number | null = null;
  private pendingMessages = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private messageIdCounter = 0;

  constructor(
    private config: WorkerConfig,
    private pool: PluginWorkerPool,
  ) {
    super();
  }

  /**
   * Start the worker.
   */
  async start(): Promise<void> {
    if (this.worker) {
      throw new Error(`Worker ${this.config.pluginName} is already running`);
    }

    const workerOptions: WorkerOptions = {
      workerData: {
        pluginPath: this.config.pluginPath,
        pluginName: this.config.pluginName,
        permissions: this.config.permissions,
      },
      env: this.buildSafeEnv(),
    };

    // Apply resource limits if specified
    if (this.config.resourceLimits) {
      const limits = this.config.resourceLimits;
      workerOptions.resourceLimits = {};

      if (limits.maxMemoryMb) {
        // Split between young and old generation
        const youngGen = Math.floor(limits.maxMemoryMb * 0.25);
        const oldGen = Math.floor(limits.maxMemoryMb * 0.75);
        workerOptions.resourceLimits.maxYoungGenerationSizeMb = youngGen;
        workerOptions.resourceLimits.maxOldGenerationSizeMb = oldGen;
      }
    }

    // Create worker pointing to the entry script
    this.worker = new Worker(
      new URL("./plugin-worker-entry.js", import.meta.url),
      workerOptions,
    );

    this.setupWorkerHandlers();
    this.startedAt = Date.now();

    // Wait for ready signal
    await this.waitReady();

    // Start heartbeat monitoring
    this.startHeartbeat();

    logger.info(`[worker-pool] Started worker for plugin: ${this.config.pluginName}`);
  }

  /**
   * Stop the worker gracefully.
   */
  async stop(): Promise<void> {
    this.stopHeartbeat();

    if (!this.worker) return;

    // Request graceful shutdown
    this.sendMessage({ type: "shutdown" });

    // Wait for exit with timeout
    await Promise.race([
      new Promise<void>((resolve) => {
        this.worker?.once("exit", () => resolve());
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    // Force terminate if still running
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }

    this.startedAt = null;
    logger.info(`[worker-pool] Stopped worker for plugin: ${this.config.pluginName}`);
  }

  /**
   * Restart the worker.
   */
  async restart(): Promise<void> {
    this.restartCount++;

    if (this.restartCount > MAX_RESTART_ATTEMPTS) {
      logger.error(
        `[worker-pool] Plugin ${this.config.pluginName} exceeded max restart attempts`,
      );
      this.emit("max-restarts");
      return;
    }

    // Exponential backoff
    const delay = RESTART_BACKOFF_BASE_MS * Math.pow(2, this.restartCount - 1);
    logger.info(
      `[worker-pool] Restarting ${this.config.pluginName} in ${delay}ms (attempt ${this.restartCount})`,
    );

    await this.stop();
    await new Promise((r) => setTimeout(r, delay));
    await this.start();
  }

  /**
   * Send a message to the worker and wait for response.
   */
  async call<T = unknown>(method: string, args: unknown[] = [], timeoutMs = 30000): Promise<T> {
    if (!this.worker) {
      throw new Error(`Worker ${this.config.pluginName} is not running`);
    }

    const id = `${++this.messageIdCounter}`;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id);
        reject(new Error(`Call to ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingMessages.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.sendMessage({
        type: "call",
        id,
        payload: { method, args },
      });
    });
  }

  /**
   * Send a message to the worker (fire-and-forget).
   */
  sendMessage(message: WorkerMessage): void {
    if (!this.worker) {
      logger.warn(
        `[worker-pool] Cannot send message to stopped worker: ${this.config.pluginName}`,
      );
      return;
    }

    this.worker.postMessage(message);
  }

  /**
   * Get worker statistics.
   */
  getStats(): PluginWorkerStats {
    return {
      name: this.config.pluginName,
      running: this.worker !== null,
      restarts: this.restartCount,
      startedAt: this.startedAt,
      lastHeartbeat: this.lastHeartbeat || null,
      pendingMessages: this.pendingMessages.size,
    };
  }

  /**
   * Check if worker is healthy.
   */
  isHealthy(): boolean {
    if (!this.worker) return false;
    if (!this.lastHeartbeat) return true; // Still initializing

    const elapsed = Date.now() - this.lastHeartbeat;
    return elapsed < HEARTBEAT_TIMEOUT_MS;
  }

  // ---------- Private Methods ----------

  private setupWorkerHandlers(): void {
    if (!this.worker) return;

    this.worker.on("message", (msg: WorkerMessage) => {
      this.handleMessage(msg);
    });

    this.worker.on("error", (err) => {
      logger.error(
        `[worker-pool] Worker ${this.config.pluginName} error: ${err.message}`,
      );
      this.emit("error", err);
      this.pool.handleWorkerError(this.config.pluginName, err);
    });

    this.worker.on("exit", (code) => {
      logger.warn(
        `[worker-pool] Worker ${this.config.pluginName} exited with code ${code}`,
      );
      this.worker = null;
      this.emit("exit", code);

      if (code !== 0) {
        this.pool.handleWorkerError(
          this.config.pluginName,
          new Error(`Worker exited with code ${code}`),
        );
      }
    });
  }

  private handleMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case "heartbeat":
        this.lastHeartbeat = Date.now();
        break;

      case "ready":
        this.emit("ready");
        break;

      case "response":
        if (msg.id) {
          const pending = this.pendingMessages.get(msg.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingMessages.delete(msg.id);

            if (msg.error) {
              pending.reject(new Error(msg.error));
            } else {
              pending.resolve(msg.payload);
            }
          }
        }
        break;

      case "log":
        const { level, message } = msg.payload as { level: string; message: string };
        logger.log(level as "info" | "warn" | "error", `[${this.config.pluginName}] ${message}`);
        break;

      case "permission:request":
        this.emit("permission:request", msg.payload);
        break;

      default:
        this.emit("message", msg);
    }
  }

  private async waitReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${this.config.pluginName} failed to start within ${READY_TIMEOUT_MS}ms`));
      }, READY_TIMEOUT_MS);

      this.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      // Send heartbeat request
      this.sendMessage({ type: "heartbeat" });

      // Check if worker is responsive
      if (!this.isHealthy()) {
        logger.warn(
          `[worker-pool] Worker ${this.config.pluginName} missed heartbeat`,
        );
        this.emit("unhealthy");
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.heartbeatTimer.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private buildSafeEnv(): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: process.env.NODE_ENV ?? "production",
    };

    // Only pass specific env vars based on permissions
    if (this.config.permissions.includes("process:env:read")) {
      const allowedPatterns = [
        /^LOG_LEVEL$/i,
        /^DEBUG$/i,
        /^TZ$/,
        /^LANG$/,
        /^LC_/,
      ];

      for (const [key, value] of Object.entries(process.env)) {
        if (value && allowedPatterns.some((p) => p.test(key))) {
          env[key] = value;
        }
      }
    }

    // Add custom env vars
    if (this.config.env) {
      Object.assign(env, this.config.env);
    }

    return env;
  }
}

// ---------- Worker Pool ----------

/**
 * Pool for managing multiple plugin workers.
 */
export class PluginWorkerPool extends EventEmitter {
  private workers = new Map<string, PluginWorker>();

  /**
   * Spawn a new worker for a plugin.
   */
  async spawn(config: WorkerConfig): Promise<PluginWorker> {
    if (this.workers.has(config.pluginName)) {
      throw new Error(`Worker for ${config.pluginName} already exists`);
    }

    const worker = new PluginWorker(config, this);
    this.workers.set(config.pluginName, worker);

    try {
      await worker.start();
    } catch (err) {
      this.workers.delete(config.pluginName);
      throw err;
    }

    return worker;
  }

  /**
   * Get a worker by plugin name.
   */
  get(pluginName: string): PluginWorker | undefined {
    return this.workers.get(pluginName);
  }

  /**
   * Stop a specific worker.
   */
  async stop(pluginName: string): Promise<void> {
    const worker = this.workers.get(pluginName);
    if (worker) {
      await worker.stop();
      this.workers.delete(pluginName);
    }
  }

  /**
   * Stop all workers.
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.workers.values()).map((w) => w.stop());
    await Promise.all(stopPromises);
    this.workers.clear();
  }

  /**
   * Get all workers.
   */
  getAll(): PluginWorker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get statistics for all workers.
   */
  getStats(): PluginWorkerStats[] {
    return Array.from(this.workers.values()).map((w) => w.getStats());
  }

  /**
   * Handle worker error (called by PluginWorker).
   */
  async handleWorkerError(pluginName: string, error: Error): Promise<void> {
    logger.error(`[worker-pool] Plugin "${pluginName}" error: ${error.message}`);

    this.emit("worker:error", { pluginName, error });

    // Attempt restart
    const worker = this.workers.get(pluginName);
    if (worker) {
      await worker.restart();
    }
  }

  /**
   * Health check for all workers.
   */
  healthCheck(): { healthy: string[]; unhealthy: string[] } {
    const healthy: string[] = [];
    const unhealthy: string[] = [];

    for (const [name, worker] of this.workers) {
      if (worker.isHealthy()) {
        healthy.push(name);
      } else {
        unhealthy.push(name);
      }
    }

    return { healthy, unhealthy };
  }
}

// ---------- Singleton Instance ----------

let _pool: PluginWorkerPool | null = null;

/**
 * Get the global worker pool instance.
 */
export function getWorkerPool(): PluginWorkerPool {
  if (!_pool) {
    _pool = new PluginWorkerPool();
  }
  return _pool;
}

/**
 * Reset the worker pool (for testing).
 */
export async function resetWorkerPool(): Promise<void> {
  if (_pool) {
    await _pool.stopAll();
    _pool = null;
  }
}
