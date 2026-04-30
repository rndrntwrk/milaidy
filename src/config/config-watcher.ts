/**
 * Config Hot Reload Watcher — watch config files and apply changes without restart.
 *
 * Provides:
 * - File system watching with debounced change detection
 * - Deep diff computation for config changes
 * - Handler registration for specific config paths
 * - Hot-reloadable vs restart-required classification
 *
 * @module config/config-watcher
 */

import fs from "node:fs";
import { logger } from "@elizaos/core";
import type { TypedEventBus } from "../events/event-bus.js";
import { loadMilaidyConfig } from "./config.js";
import { resolveConfigPath } from "./paths.js";
import type { MilaidyConfig } from "./types.js";

// ---------- Types ----------

/**
 * A config path pattern (e.g., "models.large", "plugins.allow", "api.*").
 */
export type ConfigPath = string;

/**
 * Represents a change to a specific config value.
 */
export interface ConfigChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  fullConfig: MilaidyConfig;
}

/**
 * Handler registration for config changes.
 */
export interface ConfigChangeHandler {
  /** Config path(s) to match (supports wildcards). */
  path: ConfigPath | ConfigPath[];
  /** Handler function to call on change. */
  handler: (change: ConfigChange) => Promise<void>;
  /** If true, changes to this path require a restart instead of hot reload. */
  restartRequired?: boolean;
}

/**
 * Options for the config watcher.
 */
export interface ConfigWatcherOptions {
  /** Debounce delay in ms (default: 300). */
  debounceMs?: number;
  /** Event bus for emitting config change events. */
  eventBus?: TypedEventBus;
}

// ---------- Deep Diff Implementation ----------

/**
 * Check if a value is a plain object (not array, null, or primitive).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Get all leaf paths from an object.
 */
function getLeafPaths(obj: unknown, prefix = ""): string[] {
  const paths: string[] = [];

  if (!isPlainObject(obj)) {
    if (prefix) paths.push(prefix);
    return paths;
  }

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && Object.keys(value).length > 0) {
      paths.push(...getLeafPaths(value, path));
    } else {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Get a value at a path from an object.
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (!isPlainObject(current)) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Compute the difference between two objects.
 * Returns an object with only the changed paths (flattened to leaf values).
 */
function deepDiff(oldObj: unknown, newObj: unknown): Record<string, { oldValue: unknown; newValue: unknown }> {
  const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};

  // Get all leaf paths from both objects
  const oldPaths = getLeafPaths(oldObj);
  const newPaths = getLeafPaths(newObj);
  const allPaths = new Set([...oldPaths, ...newPaths]);

  for (const path of allPaths) {
    const oldValue = getValueAtPath(oldObj, path);
    const newValue = getValueAtPath(newObj, path);

    // Compare values (stringify for deep comparison of arrays/objects)
    const oldStr = JSON.stringify(oldValue);
    const newStr = JSON.stringify(newValue);

    if (oldStr !== newStr) {
      changes[path] = { oldValue, newValue };
    }
  }

  return changes;
}

// ---------- Debounce Helper ----------

/**
 * Creates a debounced function that delays invoking func until after wait ms.
 */
function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      func(...args);
    }, wait);
  };
}

// ---------- Config Watcher ----------

/**
 * Watches the config file and dispatches changes to registered handlers.
 */
export class ConfigWatcher {
  private handlers: ConfigChangeHandler[] = [];
  private currentConfig: MilaidyConfig;
  private watcher: fs.FSWatcher | null = null;
  private configPath: string;
  private eventBus?: TypedEventBus;
  private debounceMs: number;
  private disposed = false;

  constructor(options: ConfigWatcherOptions = {}) {
    this.debounceMs = options.debounceMs ?? 300;
    this.eventBus = options.eventBus;
    this.configPath = resolveConfigPath();
    this.currentConfig = loadMilaidyConfig();
  }

  /**
   * Register a handler for specific config paths.
   */
  onConfigChange(handler: ConfigChangeHandler): () => void {
    this.handlers.push(handler);

    // Return unregister function
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index > -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  /**
   * Start watching the config file.
   */
  start(): void {
    if (this.watcher || this.disposed) return;

    // Check if config file exists
    if (!fs.existsSync(this.configPath)) {
      logger.warn(`[config-watcher] Config file not found: ${this.configPath}`);
      return;
    }

    logger.info(`[config-watcher] Watching config file: ${this.configPath}`);

    // Create debounced handler
    const debouncedHandler = debounce(() => {
      this.handleConfigChange().catch((err) => {
        logger.error(`[config-watcher] Error handling config change: ${err instanceof Error ? err.message : err}`);
      });
    }, this.debounceMs);

    // Watch the config file
    try {
      this.watcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === "change") {
          debouncedHandler();
        }
      });

      this.watcher.on("error", (err) => {
        logger.error(`[config-watcher] Watch error: ${err.message}`);
      });
    } catch (err) {
      logger.error(`[config-watcher] Failed to start watching: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Stop watching the config file.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info("[config-watcher] Stopped watching config file");
    }
  }

  /**
   * Dispose of the watcher.
   */
  dispose(): void {
    this.stop();
    this.handlers = [];
    this.disposed = true;
  }

  /**
   * Force a config reload (useful for testing or manual triggers).
   */
  async reload(): Promise<void> {
    await this.handleConfigChange();
  }

  /**
   * Get the current config.
   */
  getConfig(): MilaidyConfig {
    return this.currentConfig;
  }

  /**
   * Check if a config path matches a pattern.
   * Supports:
   *   - Exact match: "api.port" matches "api.port"
   *   - Global wildcard: "*" matches any path
   *   - Suffix wildcard: "api.*" matches "api", "api.port", "api.host.name"
   *   - Prefix match: "plugins" matches "plugins.allow"
   */
  private pathMatches(path: string, pattern: ConfigPath | ConfigPath[]): boolean {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];

    return patterns.some((p) => {
      // Global wildcard - matches everything
      if (p === "*") return true;

      // Exact match
      if (p === path) return true;

      // Suffix wildcard (e.g., "api.*" matches "api.port")
      if (p.endsWith(".*")) {
        const prefix = p.slice(0, -2);
        return path === prefix || path.startsWith(`${prefix}.`);
      }

      // Prefix match (e.g., "plugins" matches "plugins.allow")
      if (path.startsWith(`${p}.`)) return true;

      return false;
    });
  }

  /**
   * Handle a config file change.
   */
  private async handleConfigChange(): Promise<void> {
    try {
      // Load new config
      const newConfig = loadMilaidyConfig();

      // Compute diff
      const rawChanges = deepDiff(this.currentConfig, newConfig);
      const changePaths = Object.keys(rawChanges);

      if (changePaths.length === 0) {
        logger.debug("[config-watcher] No changes detected");
        return;
      }

      logger.info(`[config-watcher] Detected ${changePaths.length} config change(s): ${changePaths.join(", ")}`);

      // Create ConfigChange objects
      const changes: ConfigChange[] = changePaths.map((path) => ({
        path,
        oldValue: rawChanges[path].oldValue,
        newValue: rawChanges[path].newValue,
        fullConfig: newConfig,
      }));

      // Group handlers by restart requirement
      const hotReloadable: Array<{ handler: ConfigChangeHandler; change: ConfigChange }> = [];
      const requiresRestart: string[] = [];

      for (const change of changes) {
        const matchingHandlers = this.handlers.filter((h) =>
          this.pathMatches(change.path, h.path)
        );

        for (const handler of matchingHandlers) {
          if (handler.restartRequired) {
            requiresRestart.push(change.path);
          } else {
            hotReloadable.push({ handler, change });
          }
        }
      }

      // Execute hot-reloadable handlers
      for (const { handler, change } of hotReloadable) {
        try {
          await handler.handler(change);

          // Emit event for each change
          if (this.eventBus) {
            this.eventBus.emit("system:config:changed", {
              path: change.path,
              oldValue: change.oldValue,
              newValue: change.newValue,
            });
          }

          logger.debug(`[config-watcher] Handler executed for ${change.path}`);
        } catch (err) {
          logger.error(
            `[config-watcher] Handler failed for ${change.path}: ${err instanceof Error ? err.message : err}`
          );
        }
      }

      // Warn about restart-required changes
      if (requiresRestart.length > 0) {
        logger.warn(
          `[config-watcher] The following changes require restart: ${requiresRestart.join(", ")}`
        );
      }

      // Emit reload event
      if (this.eventBus && changePaths.length > 0) {
        this.eventBus.emit("system:config:reloaded", {
          changedPaths: changePaths,
          timestamp: Date.now(),
        });
      }

      // Update current config
      this.currentConfig = newConfig;
    } catch (err) {
      logger.error(`[config-watcher] Failed to process config change: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ---------- Global Singleton ----------

let _configWatcher: ConfigWatcher | null = null;

/**
 * Get the global config watcher instance.
 */
export function getConfigWatcher(options?: ConfigWatcherOptions): ConfigWatcher {
  if (!_configWatcher) {
    _configWatcher = new ConfigWatcher(options);
  }
  return _configWatcher;
}

/**
 * Reset the global config watcher (for testing).
 */
export function resetConfigWatcher(): void {
  if (_configWatcher) {
    _configWatcher.dispose();
    _configWatcher = null;
  }
}

// ---------- Pre-defined Hot-Reloadable Paths ----------

/**
 * Config paths that can be hot-reloaded without restart.
 */
export const HOT_RELOADABLE_PATHS: ConfigPath[] = [
  "logging.*",
  "api.rateLimit.*",
  "plugins.allow",
  "plugins.deny",
  "agents.*.model",
  "agents.*.temperature",
  "agents.*.maxTokens",
  "skills.*",
  "ui.*",
];

/**
 * Config paths that require a restart to take effect.
 */
export const RESTART_REQUIRED_PATHS: ConfigPath[] = [
  "api.port",
  "api.host",
  "database.*",
  "plugins.path",
  "auth.profiles",
  "browser.executablePath",
];
