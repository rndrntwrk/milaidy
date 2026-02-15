/**
 * Tool Registry — stores and retrieves tool contracts.
 *
 * Tools register their contracts at startup; plugins can register
 * additional contracts at runtime. The registry enforces name uniqueness
 * and provides lookup by name, risk class, and tags.
 *
 * @module autonomy/tools/registry
 */

import { logger } from "@elizaos/core";
import type {
  RiskClass,
  ToolContract,
  ToolRegistryInterface,
} from "./types.js";

/**
 * In-memory tool registry. Implements ToolRegistryInterface for DI.
 */
export class ToolRegistry implements ToolRegistryInterface {
  private contracts = new Map<string, ToolContract>();

  /**
   * Register a tool contract. Warns and overwrites on duplicate names.
   */
  register(contract: ToolContract): void {
    if (this.contracts.has(contract.name)) {
      logger.warn(
        `[tool-registry] Overwriting existing contract for "${contract.name}"`,
      );
    }
    this.contracts.set(contract.name, contract);
  }

  /**
   * Look up a contract by tool name.
   */
  get(name: string): ToolContract | undefined {
    return this.contracts.get(name);
  }

  /**
   * Return all registered contracts.
   */
  getAll(): ToolContract[] {
    return Array.from(this.contracts.values());
  }

  /**
   * Return contracts matching a specific risk class.
   */
  getByRiskClass(riskClass: RiskClass): ToolContract[] {
    return this.getAll().filter((c) => c.riskClass === riskClass);
  }

  /**
   * Return contracts that include a specific tag.
   */
  getByTag(tag: string): ToolContract[] {
    return this.getAll().filter((c) => c.tags?.includes(tag));
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.contracts.has(name);
  }

  /**
   * Remove a tool contract. Returns true if it was present.
   */
  unregister(name: string): boolean {
    return this.contracts.delete(name);
  }
}
