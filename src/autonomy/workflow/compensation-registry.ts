/**
 * Compensation Registry — manages compensation functions for tool rollback.
 *
 * Compensation functions are best-effort: failures are caught and reported
 * rather than propagated.
 *
 * @module autonomy/workflow/compensation-registry
 */

import type {
  CompensationContext,
  CompensationFn,
  CompensationRegistryInterface,
} from "./types.js";

export class CompensationRegistry implements CompensationRegistryInterface {
  private compensations = new Map<string, CompensationFn>();

  register(toolName: string, fn: CompensationFn): void {
    this.compensations.set(toolName, fn);
  }

  has(toolName: string): boolean {
    return this.compensations.has(toolName);
  }

  async compensate(
    ctx: CompensationContext,
  ): Promise<{ success: boolean; detail?: string }> {
    const fn = this.compensations.get(ctx.toolName);
    if (!fn) {
      return {
        success: false,
        detail: `No compensation registered for tool: ${ctx.toolName}`,
      };
    }

    try {
      return await fn(ctx);
    } catch (err) {
      return {
        success: false,
        detail: `Compensation error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
