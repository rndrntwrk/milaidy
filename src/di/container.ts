/**
 * Service Container — lightweight dependency injection.
 *
 * A simple but effective DI container that:
 * - Supports singleton and transient scopes
 * - Uses factory functions (no decorators/reflect-metadata needed)
 * - Provides type-safe service resolution
 * - Supports hierarchical containers (scopes)
 *
 * @module di/container
 */

import { logger } from "@elizaos/core";

// ---------- Types ----------

/**
 * Service scope determines instance lifecycle.
 */
export type ServiceScope = "singleton" | "transient";

/**
 * Factory function for creating service instances.
 */
export type ServiceFactory<T> = (container: ServiceContainer) => T;

/**
 * Service registration metadata.
 */
interface ServiceRegistration<T = unknown> {
  factory: ServiceFactory<T>;
  scope: ServiceScope;
  instance?: T;
}

/**
 * Service token for type-safe resolution.
 */
export type ServiceToken<T> = symbol & { __type?: T };

/**
 * Create a typed service token.
 */
export function createToken<T>(name: string): ServiceToken<T> {
  return Symbol.for(name) as ServiceToken<T>;
}

// ---------- Service Tokens ----------

/**
 * Standard service tokens for Milaidy.
 */
export const TOKENS = {
  // Configuration
  Config: createToken<import("../config/types.milaidy.js").MilaidyConfig>("Config"),
  ConfigWatcher: createToken<import("../config/config-watcher.js").ConfigWatcher>("ConfigWatcher"),

  // Core services
  EventBus: createToken<import("../events/event-bus.js").TypedEventBus>("EventBus"),
  Logger: createToken<typeof logger>("Logger"),

  // Data layer
  Database: createToken<unknown>("Database"),
  Cache: createToken<unknown>("Cache"),
  SecureStorage: createToken<import("../auth/secure-storage.js").SecureStorageBackend>("SecureStorage"),

  // Runtime
  AgentRuntime: createToken<unknown>("AgentRuntime"),
  PluginLoader: createToken<unknown>("PluginLoader"),
  PluginWorkerPool: createToken<import("../plugins/worker-pool.js").PluginWorkerPool>("PluginWorkerPool"),

  // API
  ApiServer: createToken<unknown>("ApiServer"),
  RateLimiter: createToken<import("../api/middleware/rate-limiter.js").RateLimitMiddleware>("RateLimiter"),

  // Auth
  AuthService: createToken<unknown>("AuthService"),

  // Autonomy Kernel
  TrustScorer: createToken<import("../autonomy/trust/scorer.js").TrustScorer>("TrustScorer"),
  MemoryGate: createToken<import("../autonomy/memory/gate.js").MemoryGate>("MemoryGate"),
  DriftMonitor: createToken<import("../autonomy/identity/drift-monitor.js").PersonaDriftMonitor>("DriftMonitor"),
  GoalManager: createToken<import("../autonomy/goals/manager.js").GoalManager>("GoalManager"),
  TrustAwareRetriever: createToken<import("../autonomy/memory/retriever.js").TrustAwareRetriever>("TrustAwareRetriever"),

  // Autonomy Tool Contracts & Verification
  ToolRegistry: createToken<import("../autonomy/tools/types.js").ToolRegistryInterface>("ToolRegistry"),
  SchemaValidator: createToken<import("../autonomy/verification/schema-validator.js").SchemaValidator>("SchemaValidator"),
  PostConditionVerifier: createToken<import("../autonomy/verification/postcondition-verifier.js").PostConditionVerifier>("PostConditionVerifier"),
} as const;

// ---------- Service Container ----------

/**
 * Lightweight dependency injection container.
 */
export class ServiceContainer {
  private services = new Map<symbol, ServiceRegistration>();
  private parent?: ServiceContainer;
  private disposed = false;

  constructor(parent?: ServiceContainer) {
    this.parent = parent;
  }

  /**
   * Register a service with a factory function.
   */
  register<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
    scope: ServiceScope = "singleton",
  ): this {
    this.assertNotDisposed();

    if (this.services.has(token)) {
      logger.warn(`[container] Overwriting service: ${token.toString()}`);
    }

    this.services.set(token, { factory, scope });
    return this;
  }

  /**
   * Register a constant value (always singleton).
   */
  registerValue<T>(token: ServiceToken<T>, value: T): this {
    this.assertNotDisposed();
    this.services.set(token, {
      factory: () => value,
      scope: "singleton",
      instance: value,
    });
    return this;
  }

  /**
   * Register a service class with automatic instantiation.
   */
  registerClass<T>(
    token: ServiceToken<T>,
    ctor: new (container: ServiceContainer) => T,
    scope: ServiceScope = "singleton",
  ): this {
    return this.register(token, (container) => new ctor(container), scope);
  }

  /**
   * Check if a service is registered.
   */
  has<T>(token: ServiceToken<T>): boolean {
    if (this.services.has(token)) return true;
    return this.parent?.has(token) ?? false;
  }

  /**
   * Resolve a service by token.
   */
  get<T>(token: ServiceToken<T>): T {
    this.assertNotDisposed();

    // Check local registrations first
    const registration = this.services.get(token) as ServiceRegistration<T> | undefined;

    if (registration) {
      // Return existing singleton instance
      if (registration.scope === "singleton" && registration.instance !== undefined) {
        return registration.instance;
      }

      // Create new instance
      const instance = registration.factory(this);

      // Cache singleton instances
      if (registration.scope === "singleton") {
        registration.instance = instance;
      }

      return instance;
    }

    // Check parent container
    if (this.parent) {
      return this.parent.get(token);
    }

    throw new Error(`Service not registered: ${token.toString()}`);
  }

  /**
   * Try to resolve a service, returning undefined if not found.
   */
  tryGet<T>(token: ServiceToken<T>): T | undefined {
    try {
      return this.get(token);
    } catch {
      return undefined;
    }
  }

  /**
   * Create a child container (for scoped services).
   */
  createScope(): ServiceContainer {
    this.assertNotDisposed();
    return new ServiceContainer(this);
  }

  /**
   * Dispose of singleton instances and mark container as disposed.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;

    for (const [token, registration] of this.services) {
      if (registration.instance && typeof (registration.instance as { dispose?: () => Promise<void> }).dispose === "function") {
        try {
          await (registration.instance as { dispose: () => Promise<void> }).dispose();
        } catch (err) {
          logger.error(
            `[container] Error disposing ${token.toString()}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    this.services.clear();
    this.disposed = true;
  }

  /**
   * Get all registered tokens.
   */
  getRegisteredTokens(): symbol[] {
    const tokens = new Set<symbol>(this.services.keys());
    if (this.parent) {
      for (const token of this.parent.getRegisteredTokens()) {
        tokens.add(token);
      }
    }
    return Array.from(tokens);
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("Container has been disposed");
    }
  }
}

// ---------- Container Builder ----------

/**
 * Fluent builder for creating service containers.
 */
export class ContainerBuilder {
  private registrations: Array<(container: ServiceContainer) => void> = [];

  /**
   * Register a service with a factory.
   */
  addService<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
    scope: ServiceScope = "singleton",
  ): this {
    this.registrations.push((container) => {
      container.register(token, factory, scope);
    });
    return this;
  }

  /**
   * Register a constant value.
   */
  addValue<T>(token: ServiceToken<T>, value: T): this {
    this.registrations.push((container) => {
      container.registerValue(token, value);
    });
    return this;
  }

  /**
   * Register a service class.
   */
  addClass<T>(
    token: ServiceToken<T>,
    ctor: new (container: ServiceContainer) => T,
    scope: ServiceScope = "singleton",
  ): this {
    this.registrations.push((container) => {
      container.registerClass(token, ctor, scope);
    });
    return this;
  }

  /**
   * Build the container with all registrations.
   */
  build(): ServiceContainer {
    const container = new ServiceContainer();
    for (const register of this.registrations) {
      register(container);
    }
    return container;
  }
}

// ---------- Global Container ----------

let _globalContainer: ServiceContainer | null = null;

/**
 * Get the global service container.
 */
export function getContainer(): ServiceContainer {
  if (!_globalContainer) {
    _globalContainer = new ServiceContainer();
  }
  return _globalContainer;
}

/**
 * Set the global service container.
 */
export function setContainer(container: ServiceContainer): void {
  _globalContainer = container;
}

/**
 * Reset the global container (for testing).
 */
export async function resetContainer(): Promise<void> {
  if (_globalContainer) {
    await _globalContainer.dispose();
    _globalContainer = null;
  }
}

// ---------- Helper Functions ----------

/**
 * Create a configured container for Milaidy.
 */
export function createMilaidyContainer(
  config: import("../config/types.milaidy.js").MilaidyConfig,
): ServiceContainer {
  const builder = new ContainerBuilder();

  // Register config
  builder.addValue(TOKENS.Config, config);

  // Register core services
  builder.addService(TOKENS.EventBus, () => {
    const { TypedEventBus } = require("../events/event-bus.js");
    return new TypedEventBus();
  });

  builder.addValue(TOKENS.Logger, logger);

  // Register config watcher (depends on event bus)
  builder.addService(TOKENS.ConfigWatcher, (container) => {
    const { ConfigWatcher } = require("../config/config-watcher.js");
    const eventBus = container.tryGet(TOKENS.EventBus);
    return new ConfigWatcher({ eventBus });
  });

  // Register auth services
  builder.addService(TOKENS.SecureStorage, async () => {
    const { getSecureStorage } = await import("../auth/secure-storage.js");
    return getSecureStorage();
  });

  // Register rate limiter
  builder.addService(TOKENS.RateLimiter, () => {
    const { createRateLimitMiddleware } = require("../api/middleware/rate-limiter.js");
    return createRateLimitMiddleware();
  });

  // Register plugin worker pool
  builder.addService(TOKENS.PluginWorkerPool, () => {
    const { PluginWorkerPool } = require("../plugins/worker-pool.js");
    return new PluginWorkerPool();
  });

  // NOTE: Autonomy Kernel components (TrustScorer, MemoryGate, DriftMonitor,
  // GoalManager) are registered into the DI container by MilaidyAutonomyService
  // during start(). The service is the single owner of component instances.

  return builder.build();
}
