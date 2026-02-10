/**
 * Plugin System — sandboxed plugin execution with permissions.
 *
 * @module plugins
 */

export {
  // Permission types
  type PluginPermission,
  type FilesystemPermission,
  type NetworkPermission,
  type ProcessPermission,
  type SystemPermission,
  type AIPermission,
  type DataPermission,

  // Manifest types
  type PluginManifest,
  type ResourceLimits,
  type IsolationLevel,
  type IsolationConfig,
  type IntegrityConfig,
  type NetworkIsolation,
  type FilesystemIsolation,

  // Permission utilities
  PERMISSION_CATEGORIES,
  PERMISSION_DESCRIPTIONS,
  DANGEROUS_PERMISSIONS,
  getPermissionCategory,

  // Error class
  PermissionDeniedError,

  // Permission guard
  PermissionGuard,
  getPermissionGuard,
  removePermissionGuard,
  permissionEvents,
  type PermissionRequest,

  // Validation
  validateManifest,
} from "./permissions.js";

export {
  // Worker pool
  PluginWorkerPool,
  PluginWorker,
  getWorkerPool,
  resetWorkerPool,
  type WorkerConfig,
  type WorkerMessage,
  type PluginWorkerStats,
} from "./worker-pool.js";

export {
  // Container sandbox
  ContainerSandbox,
  isDockerAvailable,
  type ContainerSandboxConfig,
  type ContainerStatus,
} from "./container-sandbox.js";
