/**
 * Plugin Worker Entry Point — sandboxed execution environment.
 *
 * This file runs inside a Worker thread and:
 * - Applies permission-based API restrictions
 * - Loads and initializes the plugin
 * - Handles IPC messages from the main thread
 * - Sends heartbeats for health monitoring
 *
 * @module plugins/plugin-worker-entry
 */

import { isMainThread, parentPort, workerData } from "node:worker_threads";
import type { PluginPermission } from "./permissions.js";

// Only run in worker thread
if (isMainThread || !parentPort) {
  throw new Error("This file should only be run as a worker thread");
}

// ---------- Types ----------

interface WorkerData {
  pluginPath: string;
  pluginName: string;
  permissions: PluginPermission[];
}

interface WorkerMessage {
  type: string;
  id?: string;
  payload?: unknown;
}

// ---------- Worker Context ----------

const data = workerData as WorkerData;
const port = parentPort;
const permissions = new Set(data.permissions);

// ---------- Permission Checking ----------

function hasPermission(permission: PluginPermission): boolean {
  return permissions.has(permission);
}

function checkPermission(permission: PluginPermission, operation: string): void {
  if (!hasPermission(permission)) {
    throw new Error(
      `Plugin "${data.pluginName}" lacks permission "${permission}" for operation: ${operation}`,
    );
  }
}

// ---------- API Sandboxing ----------

/**
 * Patch the filesystem module to enforce permissions.
 */
function patchFileSystem(): void {
  const fs = require("node:fs");
  const fsPromises = require("node:fs/promises");
  const path = require("node:path");

  const workspaceDir = process.env.PLUGIN_WORKSPACE ?? process.cwd();
  const homeDir = require("node:os").homedir();

  function isInWorkspace(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    return resolved.startsWith(workspaceDir);
  }

  function isInHome(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    return resolved.startsWith(homeDir);
  }

  function checkReadAccess(filePath: string): void {
    if (hasPermission("fs:read:system")) return;

    if (isInWorkspace(filePath)) {
      checkPermission("fs:read:workspace", `read ${filePath}`);
    } else if (isInHome(filePath)) {
      checkPermission("fs:read:home", `read ${filePath}`);
    } else {
      throw new Error(
        `Plugin "${data.pluginName}" cannot read outside workspace/home: ${filePath}`,
      );
    }
  }

  function checkWriteAccess(filePath: string): void {
    if (hasPermission("fs:write:any")) return;

    const resolved = path.resolve(filePath);

    // Check temp directory
    const tmpDir = require("node:os").tmpdir();
    if (resolved.startsWith(tmpDir)) {
      checkPermission("fs:write:temp", `write ${filePath}`);
      return;
    }

    // Check workspace
    if (isInWorkspace(filePath)) {
      checkPermission("fs:write:workspace", `write ${filePath}`);
      return;
    }

    throw new Error(
      `Plugin "${data.pluginName}" cannot write outside workspace: ${filePath}`,
    );
  }

  // Patch synchronous read methods
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function (filePath: string, ...args: unknown[]) {
    checkReadAccess(filePath);
    return originalReadFileSync.call(this, filePath, ...args);
  };

  const originalReaddirSync = fs.readdirSync;
  fs.readdirSync = function (dirPath: string, ...args: unknown[]) {
    checkReadAccess(dirPath);
    return originalReaddirSync.call(this, dirPath, ...args);
  };

  // Patch synchronous write methods
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function (filePath: string, ...args: unknown[]) {
    checkWriteAccess(filePath);
    return originalWriteFileSync.call(this, filePath, ...args);
  };

  const originalMkdirSync = fs.mkdirSync;
  fs.mkdirSync = function (dirPath: string, ...args: unknown[]) {
    checkWriteAccess(dirPath);
    return originalMkdirSync.call(this, dirPath, ...args);
  };

  // Patch promise-based methods
  const originalReadFile = fsPromises.readFile;
  fsPromises.readFile = async function (filePath: string, ...args: unknown[]) {
    checkReadAccess(filePath);
    return originalReadFile.call(this, filePath, ...args);
  };

  const originalWriteFile = fsPromises.writeFile;
  fsPromises.writeFile = async function (filePath: string, ...args: unknown[]) {
    checkWriteAccess(filePath);
    return originalWriteFile.call(this, filePath, ...args);
  };
}

/**
 * Patch the network modules to enforce permissions.
 */
function patchNetwork(): void {
  // Patch fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const protocol = new URL(url).protocol;

    if (protocol === "https:") {
      checkPermission("net:outbound:https", `fetch ${url}`);
    } else if (protocol === "http:") {
      checkPermission("net:outbound:http", `fetch ${url}`);
    }

    return originalFetch.call(this, input, init);
  };

  // Patch http/https modules
  const http = require("node:http");
  const https = require("node:https");

  const originalHttpRequest = http.request;
  http.request = function (...args: unknown[]) {
    checkPermission("net:outbound:http", "http.request");
    return originalHttpRequest.apply(this, args);
  };

  const originalHttpsRequest = https.request;
  https.request = function (...args: unknown[]) {
    checkPermission("net:outbound:https", "https.request");
    return originalHttpsRequest.apply(this, args);
  };

  // Patch WebSocket if available
  if (globalThis.WebSocket) {
    const OriginalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = class extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        checkPermission("net:outbound:websocket", `WebSocket ${url}`);
        super(url, protocols);
      }
    };
  }
}

/**
 * Patch child_process module to enforce permissions.
 */
function patchChildProcess(): void {
  const childProcess = require("node:child_process");

  const originalSpawn = childProcess.spawn;
  childProcess.spawn = function (...args: unknown[]) {
    checkPermission("process:spawn", `spawn ${args[0]}`);
    return originalSpawn.apply(this, args);
  };

  const originalExec = childProcess.exec;
  childProcess.exec = function (...args: unknown[]) {
    checkPermission("process:shell", `exec ${args[0]}`);
    return originalExec.apply(this, args);
  };

  const originalExecSync = childProcess.execSync;
  childProcess.execSync = function (...args: unknown[]) {
    checkPermission("process:shell", `execSync ${args[0]}`);
    return originalExecSync.apply(this, args);
  };
}

/**
 * Patch process.env access.
 */
function patchProcessEnv(): void {
  if (!hasPermission("process:env:read")) {
    // Create a proxy that blocks reads
    const safeEnv: Record<string, string | undefined> = {
      NODE_ENV: process.env.NODE_ENV,
      TZ: process.env.TZ,
    };

    Object.defineProperty(process, "env", {
      value: new Proxy(safeEnv, {
        get(target, prop) {
          if (typeof prop === "string" && prop in target) {
            return target[prop];
          }
          return undefined;
        },
        set(target, prop, value) {
          if (!hasPermission("process:env:write")) {
            throw new Error(
              `Plugin "${data.pluginName}" cannot modify environment variables`,
            );
          }
          target[prop as string] = value;
          return true;
        },
      }),
      configurable: false,
    });
  }
}

// ---------- Apply Sandbox ----------

function applySandbox(): void {
  // Always apply filesystem restrictions unless full access
  if (!hasPermission("fs:read:system") || !hasPermission("fs:write:any")) {
    patchFileSystem();
  }

  // Network restrictions
  if (
    !hasPermission("net:outbound:https") ||
    !hasPermission("net:outbound:http")
  ) {
    patchNetwork();
  }

  // Process restrictions
  if (!hasPermission("process:spawn") || !hasPermission("process:shell")) {
    patchChildProcess();
  }

  // Environment restrictions
  if (!hasPermission("process:env:read")) {
    patchProcessEnv();
  }
}

// ---------- Message Handling ----------

let plugin: unknown = null;

async function handleMessage(msg: WorkerMessage): Promise<void> {
  switch (msg.type) {
    case "heartbeat":
      port.postMessage({ type: "heartbeat" });
      break;

    case "shutdown":
      // Graceful shutdown
      if (plugin && typeof (plugin as { shutdown?: () => Promise<void> }).shutdown === "function") {
        await (plugin as { shutdown: () => Promise<void> }).shutdown();
      }
      process.exit(0);
      break;

    case "call":
      if (!msg.id) break;

      try {
        const { method, args } = msg.payload as { method: string; args: unknown[] };

        if (!plugin) {
          throw new Error("Plugin not loaded");
        }

        const fn = (plugin as Record<string, unknown>)[method];
        if (typeof fn !== "function") {
          throw new Error(`Method "${method}" not found on plugin`);
        }

        const result = await fn.apply(plugin, args);

        port.postMessage({
          type: "response",
          id: msg.id,
          payload: result,
        });
      } catch (err) {
        port.postMessage({
          type: "response",
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;

    default:
      // Forward to plugin if it has a message handler
      if (plugin && typeof (plugin as { onMessage?: (msg: WorkerMessage) => void }).onMessage === "function") {
        (plugin as { onMessage: (msg: WorkerMessage) => void }).onMessage(msg);
      }
  }
}

// ---------- Logging ----------

function log(level: string, message: string): void {
  port.postMessage({
    type: "log",
    payload: { level, message },
  });
}

// Make log available globally for plugins
(globalThis as Record<string, unknown>).__pluginLog = log;

// ---------- Main ----------

async function main(): Promise<void> {
  try {
    // Apply sandbox restrictions
    applySandbox();

    // Load the plugin
    log("info", `Loading plugin: ${data.pluginPath}`);
    plugin = await import(data.pluginPath);

    // If plugin has default export, use that
    if (plugin && typeof plugin === "object" && "default" in plugin) {
      plugin = (plugin as { default: unknown }).default;
    }

    // Initialize plugin if it has an init function
    if (plugin && typeof (plugin as { init?: () => Promise<void> }).init === "function") {
      await (plugin as { init: () => Promise<void> }).init();
    }

    // Signal ready
    port.postMessage({ type: "ready" });

    // Handle messages
    port.on("message", handleMessage);

    log("info", "Plugin loaded and ready");
  } catch (err) {
    log("error", `Failed to load plugin: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Worker initialization failed:", err);
  process.exit(1);
});
