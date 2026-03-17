/**
 * TaobotBridgeService — long-lived service that coordinates
 * between 555stream and 555arcade for unified TaoBot operations.
 *
 * Handles: session continuity, cross-platform state sync,
 * philanthropy tracking, and event routing.
 */
import type { IAgentRuntime, Service } from '../types/index.js';
import { loadConfig } from '../config.js';

export class TaobotBridgeService implements Service {
  serviceType = 'taobot-bridge';

  private runtime: IAgentRuntime | null = null;
  private philanthropyTotal = 0;

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;
    const config = loadConfig();
    console.log('[taobot] Bridge service initializing...');
    console.log(`[taobot] Stream: ${config.streamBaseUrl}`);
    console.log(`[taobot] Arcade: ${config.arcadeBaseUrl}`);
    console.log(`[taobot] Philanthropy: ${config.philanthropyPercent}%`);
    console.log(`[taobot] Theme: ${config.themeName}`);
    console.log('[taobot] Bridge service ready');
  }

  async stop(): Promise<void> {
    console.log(`[taobot] Bridge service stopping. Total philanthropy routed: $${this.philanthropyTotal}`);
    this.runtime = null;
  }

  /** Track philanthropy contributions */
  addPhilanthropyContribution(amount: number): void {
    this.philanthropyTotal += amount;
  }

  getPhilanthropyTotal(): number {
    return this.philanthropyTotal;
  }

  getRuntime(): IAgentRuntime | null {
    return this.runtime;
  }
}
