/**
 * Domain Pack Registry — manages registration, loading, and unloading
 * of domain capability packs.
 *
 * @module autonomy/domains/registry
 */

import type { ToolRegistryInterface } from "../tools/types.js";
import type { InvariantCheckerInterface } from "../verification/invariants/types.js";
import type {
  DomainId,
  DomainPack,
  DomainPackInfo,
  DomainPackStatus,
} from "./types.js";

// ---------- Interface ----------

/**
 * Interface for the domain pack registry.
 */
export interface DomainPackRegistryInterface {
  /** Register a domain pack (does not load it). */
  register(pack: DomainPack): void;
  /** Load a registered pack: registers its tools and invariants into the kernel. */
  load(
    id: DomainId,
    toolRegistry: ToolRegistryInterface,
    invariantChecker: InvariantCheckerInterface,
  ): void;
  /** Unload a pack: removes its tools (invariants are additive-only). */
  unload(id: DomainId, toolRegistry: ToolRegistryInterface): void;
  /** Get a registered pack by ID. */
  get(id: DomainId): DomainPack | undefined;
  /** Get all currently loaded packs. */
  getLoaded(): DomainPack[];
  /** Get summary info for all registered packs. */
  getAll(): DomainPackInfo[];
  /** Check if a pack is registered. */
  has(id: DomainId): boolean;
}

// ---------- Implementation ----------

/**
 * In-memory domain pack registry.
 *
 * Manages registration, loading (registers tools + invariants into the
 * kernel), and unloading of domain packs.
 */
export class DomainPackRegistry implements DomainPackRegistryInterface {
  private readonly packs = new Map<DomainId, DomainPack>();
  private readonly status = new Map<DomainId, DomainPackStatus>();
  private readonly loadedAt = new Map<DomainId, number>();

  register(pack: DomainPack): void {
    if (this.packs.has(pack.id)) {
      // Overwrite with warning — callers should check has() first
    }
    this.packs.set(pack.id, pack);
    if (!this.status.has(pack.id)) {
      this.status.set(pack.id, "unloaded");
    }
  }

  load(
    id: DomainId,
    toolRegistry: ToolRegistryInterface,
    invariantChecker: InvariantCheckerInterface,
  ): void {
    const pack = this.packs.get(id);
    if (!pack) {
      throw new Error(`Domain pack "${id}" is not registered`);
    }

    // Register tool contracts
    for (const contract of pack.toolContracts) {
      toolRegistry.register(contract);
    }

    // Register invariants (additive-only — InvariantChecker has no unregister)
    if (pack.invariants.length > 0) {
      invariantChecker.registerMany(pack.invariants);
    }

    this.status.set(id, "loaded");
    this.loadedAt.set(id, Date.now());
  }

  unload(id: DomainId, toolRegistry: ToolRegistryInterface): void {
    const pack = this.packs.get(id);
    if (!pack) {
      throw new Error(`Domain pack "${id}" is not registered`);
    }

    // Remove tool contracts
    for (const contract of pack.toolContracts) {
      toolRegistry.unregister(contract.name);
    }

    // Note: invariants cannot be unregistered (InvariantCheckerInterface
    // has no unregister method). They remain active after unload.

    this.status.set(id, "unloaded");
    this.loadedAt.delete(id);
  }

  get(id: DomainId): DomainPack | undefined {
    return this.packs.get(id);
  }

  getLoaded(): DomainPack[] {
    const loaded: DomainPack[] = [];
    for (const [id, status] of this.status) {
      if (status === "loaded") {
        const pack = this.packs.get(id);
        if (pack) loaded.push(pack);
      }
    }
    return loaded;
  }

  getAll(): DomainPackInfo[] {
    const infos: DomainPackInfo[] = [];
    for (const [id, pack] of this.packs) {
      infos.push({
        id,
        name: pack.name,
        version: pack.version,
        status: this.status.get(id) ?? "unloaded",
        toolCount: pack.toolContracts.length,
        invariantCount: pack.invariants.length,
        benchmarkCount: pack.benchmarks.length,
        loadedAt: this.loadedAt.get(id),
      });
    }
    return infos;
  }

  has(id: DomainId): boolean {
    return this.packs.has(id);
  }
}
