/**
 * Plugin Permission System — capability-based security for plugins.
 *
 * Implements a fine-grained permission model inspired by:
 * - Claude Code sandboxing architecture
 * - MCP security framework
 * - Android/iOS permission models
 *
 * Plugins must declare required/optional permissions in their manifest.
 * Permissions are checked at runtime before sensitive operations.
 *
 * @module plugins/permissions
 */

import { EventEmitter } from "node:events";
import { logger } from "@elizaos/core";

// ---------- Permission Types ----------

/**
 * Filesystem permissions.
 */
export type FilesystemPermission =
  | "fs:read:workspace" // Read workspace directory
  | "fs:read:home" // Read home directory
  | "fs:read:system" // Read system files
  | "fs:write:workspace" // Write to workspace
  | "fs:write:temp" // Write to temp directory
  | "fs:write:any"; // Write anywhere (dangerous)

/**
 * Network permissions.
 */
export type NetworkPermission =
  | "net:outbound:https" // HTTPS requests
  | "net:outbound:http" // HTTP requests (insecure)
  | "net:outbound:websocket" // WebSocket connections
  | "net:inbound:listen" // Listen on ports
  | "net:dns"; // DNS lookups

/**
 * Process permissions.
 */
export type ProcessPermission =
  | "process:spawn" // Spawn child processes
  | "process:shell" // Execute shell commands
  | "process:env:read" // Read environment variables
  | "process:env:write"; // Modify environment variables

/**
 * System permissions.
 */
export type SystemPermission =
  | "system:native" // Native Node.js addons
  | "system:ffi" // Foreign function interface
  | "system:gpu"; // GPU access

/**
 * AI/Model permissions.
 */
export type AIPermission =
  | "ai:inference" // Make AI API calls
  | "ai:embedding" // Generate embeddings
  | "ai:training"; // Training operations

/**
 * Data permissions.
 */
export type DataPermission =
  | "data:database" // Database access
  | "data:memory" // Agent memory access
  | "data:secrets"; // Access to secrets

/**
 * All plugin permissions.
 */
export type PluginPermission =
  | FilesystemPermission
  | NetworkPermission
  | ProcessPermission
  | SystemPermission
  | AIPermission
  | DataPermission;

/**
 * Permission categories for grouping in UI.
 */
export const PERMISSION_CATEGORIES: Record<
  string,
  { name: string; description: string; permissions: PluginPermission[] }
> = {
  filesystem: {
    name: "Filesystem",
    description: "Access to read and write files",
    permissions: [
      "fs:read:workspace",
      "fs:read:home",
      "fs:read:system",
      "fs:write:workspace",
      "fs:write:temp",
      "fs:write:any",
    ],
  },
  network: {
    name: "Network",
    description: "Internet and network access",
    permissions: [
      "net:outbound:https",
      "net:outbound:http",
      "net:outbound:websocket",
      "net:inbound:listen",
      "net:dns",
    ],
  },
  process: {
    name: "Process",
    description: "Execute commands and access environment",
    permissions: [
      "process:spawn",
      "process:shell",
      "process:env:read",
      "process:env:write",
    ],
  },
  system: {
    name: "System",
    description: "Low-level system access",
    permissions: ["system:native", "system:ffi", "system:gpu"],
  },
  ai: {
    name: "AI & Models",
    description: "AI inference and model access",
    permissions: ["ai:inference", "ai:embedding", "ai:training"],
  },
  data: {
    name: "Data",
    description: "Database and memory access",
    permissions: ["data:database", "data:memory", "data:secrets"],
  },
};

/**
 * Human-readable descriptions for each permission.
 */
export const PERMISSION_DESCRIPTIONS: Record<PluginPermission, string> = {
  "fs:read:workspace": "Read files in the workspace directory",
  "fs:read:home": "Read files in your home directory",
  "fs:read:system": "Read system files outside home directory",
  "fs:write:workspace": "Create and modify files in workspace",
  "fs:write:temp": "Write to temporary directories",
  "fs:write:any": "Write to any location on disk (dangerous)",

  "net:outbound:https": "Make secure HTTPS requests",
  "net:outbound:http": "Make insecure HTTP requests",
  "net:outbound:websocket": "Open WebSocket connections",
  "net:inbound:listen": "Listen for incoming network connections",
  "net:dns": "Perform DNS lookups",

  "process:spawn": "Start child processes",
  "process:shell": "Execute shell commands",
  "process:env:read": "Read environment variables",
  "process:env:write": "Modify environment variables",

  "system:native": "Load native Node.js addons",
  "system:ffi": "Use foreign function interface",
  "system:gpu": "Access GPU for computation",

  "ai:inference": "Make AI API calls for inference",
  "ai:embedding": "Generate text embeddings",
  "ai:training": "Perform model training operations",

  "data:database": "Access the database",
  "data:memory": "Access agent memory and conversation history",
  "data:secrets": "Access stored secrets and credentials",
};

/**
 * Dangerous permissions that require explicit user approval.
 */
export const DANGEROUS_PERMISSIONS: Set<PluginPermission> = new Set([
  "fs:write:any",
  "fs:read:system",
  "process:shell",
  "process:env:write",
  "system:native",
  "system:ffi",
  "data:secrets",
]);

// ---------- Permission Errors ----------

export class PermissionDeniedError extends Error {
  constructor(
    public readonly plugin: string,
    public readonly permission: PluginPermission,
    message?: string,
  ) {
    super(
      message ??
        `Plugin "${plugin}" requires permission "${permission}" which was not granted`,
    );
    this.name = "PermissionDeniedError";
  }
}

// ---------- Plugin Manifest ----------

/**
 * Resource limits for plugin execution.
 */
export interface ResourceLimits {
  /** Maximum heap memory in megabytes. */
  maxMemoryMb?: number;
  /** Maximum CPU usage percentage (0-100). */
  maxCpuPercent?: number;
  /** Maximum network bandwidth in bytes per second. */
  maxNetworkBytesPerSecond?: number;
  /** Maximum number of open file handles. */
  maxFileHandles?: number;
  /** Maximum execution time in milliseconds. */
  maxExecutionTimeMs?: number;
}

/**
 * Isolation level for plugin execution.
 */
export type IsolationLevel = "none" | "process" | "container" | "vm";

/**
 * Network isolation mode.
 */
export type NetworkIsolation = "host" | "restricted" | "none";

/**
 * Filesystem isolation mode.
 */
export type FilesystemIsolation = "full" | "workspace" | "readonly" | "none";

/**
 * Isolation configuration for a plugin.
 */
export interface IsolationConfig {
  /** Isolation level. */
  level: IsolationLevel;
  /** Network isolation mode. */
  network?: NetworkIsolation;
  /** Filesystem isolation mode. */
  filesystem?: FilesystemIsolation;
}

/**
 * Integrity verification for plugin files.
 */
export interface IntegrityConfig {
  /** SHA-256 checksums for each file. */
  checksums: Record<string, string>;
  /** Ed25519 signature of the manifest. */
  signature?: string;
  /** Public key fingerprint of the signer. */
  signedBy?: string;
}

/**
 * Plugin manifest declaring permissions and capabilities.
 */
export interface PluginManifest {
  /** Plugin name (must be unique). */
  name: string;
  /** Semantic version. */
  version: string;
  /** Human-readable description. */
  description: string;
  /** Plugin author. */
  author?: string;
  /** Homepage/repository URL. */
  homepage?: string;

  /** Permission declarations. */
  permissions: {
    /** Permissions required for the plugin to function. */
    required: PluginPermission[];
    /** Optional permissions that enhance functionality. */
    optional: PluginPermission[];
  };

  /** Resource limits. */
  resourceLimits?: ResourceLimits;

  /** Isolation configuration. */
  isolation?: IsolationConfig;

  /** Integrity verification. */
  integrity?: IntegrityConfig;

  /** Trusted domains for network requests. */
  trustedDomains?: string[];

  /** Environment variables the plugin needs (names only, not values). */
  requiredEnvVars?: string[];
}

// ---------- Permission Guard ----------

/**
 * Event emitter for permission-related events.
 */
export const permissionEvents = new EventEmitter();

/**
 * Permission request payload.
 */
export interface PermissionRequest {
  plugin: string;
  permission: PluginPermission;
  reason: string;
  isDangerous: boolean;
}

/**
 * Permission guard for runtime permission checking.
 */
export class PermissionGuard {
  private grantedPermissions: Set<PluginPermission>;
  private deniedPermissions: Set<PluginPermission>;

  constructor(
    private readonly pluginName: string,
    initialPermissions: PluginPermission[] = [],
  ) {
    this.grantedPermissions = new Set(initialPermissions);
    this.deniedPermissions = new Set();
  }

  /**
   * Check if a permission is granted. Throws if not.
   */
  check(permission: PluginPermission): void {
    if (!this.grantedPermissions.has(permission)) {
      logger.warn(
        `[permissions] Plugin "${this.pluginName}" denied permission: ${permission}`,
      );
      throw new PermissionDeniedError(this.pluginName, permission);
    }
  }

  /**
   * Check if a permission is granted without throwing.
   */
  has(permission: PluginPermission): boolean {
    return this.grantedPermissions.has(permission);
  }

  /**
   * Check if any of the given permissions is granted.
   */
  hasAny(permissions: PluginPermission[]): boolean {
    return permissions.some((p) => this.grantedPermissions.has(p));
  }

  /**
   * Check if all of the given permissions are granted.
   */
  hasAll(permissions: PluginPermission[]): boolean {
    return permissions.every((p) => this.grantedPermissions.has(p));
  }

  /**
   * Request a permission at runtime.
   * Emits a permission request event for user approval.
   */
  async request(
    permission: PluginPermission,
    reason: string,
  ): Promise<boolean> {
    // Already granted
    if (this.grantedPermissions.has(permission)) {
      return true;
    }

    // Previously denied this session
    if (this.deniedPermissions.has(permission)) {
      return false;
    }

    const isDangerous = DANGEROUS_PERMISSIONS.has(permission);

    const request: PermissionRequest = {
      plugin: this.pluginName,
      permission,
      reason,
      isDangerous,
    };

    logger.info(
      `[permissions] Plugin "${this.pluginName}" requesting permission: ${permission}`,
    );

    // Emit event and wait for response
    const approved = await this.emitPermissionRequest(request);

    if (approved) {
      this.grantedPermissions.add(permission);
      logger.info(
        `[permissions] Permission granted: ${permission} for ${this.pluginName}`,
      );
    } else {
      this.deniedPermissions.add(permission);
      logger.info(
        `[permissions] Permission denied: ${permission} for ${this.pluginName}`,
      );
    }

    return approved;
  }

  /**
   * Grant a permission programmatically.
   */
  grant(permission: PluginPermission): void {
    this.grantedPermissions.add(permission);
    this.deniedPermissions.delete(permission);
  }

  /**
   * Revoke a permission.
   */
  revoke(permission: PluginPermission): void {
    this.grantedPermissions.delete(permission);
  }

  /**
   * Get all granted permissions.
   */
  getGrantedPermissions(): PluginPermission[] {
    return Array.from(this.grantedPermissions);
  }

  /**
   * Emit permission request and wait for response.
   */
  private async emitPermissionRequest(
    request: PermissionRequest,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Set timeout for auto-deny
      const timeout = setTimeout(() => {
        logger.warn(
          `[permissions] Permission request timed out: ${request.permission}`,
        );
        resolve(false);
      }, 30_000);

      // Emit request
      permissionEvents.emit("permission:request", request, (approved: boolean) => {
        clearTimeout(timeout);
        resolve(approved);
      });

      // If no listeners, auto-approve non-dangerous, auto-deny dangerous
      if (permissionEvents.listenerCount("permission:request") === 0) {
        clearTimeout(timeout);
        if (request.isDangerous) {
          logger.warn(
            `[permissions] Auto-denying dangerous permission: ${request.permission}`,
          );
          resolve(false);
        } else {
          logger.info(
            `[permissions] Auto-approving non-dangerous permission: ${request.permission}`,
          );
          resolve(true);
        }
      }
    });
  }
}

// ---------- Permission Registry ----------

const pluginGuards = new Map<string, PermissionGuard>();

/**
 * Get or create a permission guard for a plugin.
 */
export function getPermissionGuard(
  pluginName: string,
  initialPermissions?: PluginPermission[],
): PermissionGuard {
  let guard = pluginGuards.get(pluginName);

  if (!guard) {
    guard = new PermissionGuard(pluginName, initialPermissions);
    pluginGuards.set(pluginName, guard);
  }

  return guard;
}

/**
 * Remove permission guard for a plugin (on unload).
 */
export function removePermissionGuard(pluginName: string): void {
  pluginGuards.delete(pluginName);
}

/**
 * Validate a plugin manifest.
 */
export function validateManifest(manifest: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof manifest !== "object" || manifest === null) {
    return { valid: false, errors: ["Manifest must be an object"] };
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.name !== "string" || !m.name.trim()) {
    errors.push("Manifest must have a name");
  }

  if (typeof m.version !== "string" || !m.version.trim()) {
    errors.push("Manifest must have a version");
  }

  if (typeof m.permissions !== "object" || m.permissions === null) {
    errors.push("Manifest must have permissions object");
  } else {
    const perms = m.permissions as Record<string, unknown>;

    if (!Array.isArray(perms.required)) {
      errors.push("permissions.required must be an array");
    }

    if (!Array.isArray(perms.optional)) {
      errors.push("permissions.optional must be an array");
    }

    // Validate permission values
    const allPermissions = [
      ...(Array.isArray(perms.required) ? perms.required : []),
      ...(Array.isArray(perms.optional) ? perms.optional : []),
    ];

    const validPermissions = new Set(Object.keys(PERMISSION_DESCRIPTIONS));

    for (const perm of allPermissions) {
      if (typeof perm !== "string" || !validPermissions.has(perm)) {
        errors.push(`Invalid permission: ${perm}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the category for a permission.
 */
export function getPermissionCategory(permission: PluginPermission): string {
  for (const [category, config] of Object.entries(PERMISSION_CATEGORIES)) {
    if (config.permissions.includes(permission)) {
      return category;
    }
  }
  return "unknown";
}
