/**
 * Baseline Data Collection Scheduler.
 *
 * Periodically runs the BaselineHarness measure() + snapshot()
 * cycle to track agent performance over time. Each snapshot is
 * labeled with an ISO timestamp for time-series analysis.
 *
 * @module autonomy/metrics/baseline-scheduler
 */

import { logger } from "@elizaos/core";
import type { BaselineHarness } from "./baseline-harness.js";
import type { EvaluationScenario } from "./types.js";

// ---------- Types ----------

export interface BaselineSchedulerConfig {
  /** Interval between measurements in ms. Must be > 0. */
  intervalMs: number;
  /** Agent ID for measurement context. */
  agentId: string;
  /** Scenarios to run each cycle. If empty, runs measure with []. */
  scenarios?: EvaluationScenario[];
}

// ---------- Implementation ----------

export class BaselineScheduler {
  private harness: BaselineHarness;
  private config: BaselineSchedulerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(harness: BaselineHarness, config: BaselineSchedulerConfig) {
    this.harness = harness;
    this.config = config;
  }

  /**
   * Start the periodic measurement cycle.
   */
  start(): void {
    if (this.timer) return;

    const intervalMs = Math.max(1000, this.config.intervalMs);
    logger.info(
      `[autonomy:baseline-scheduler] Starting auto-measure every ${intervalMs}ms`,
    );

    this.timer = setInterval(() => {
      void this.runCycle();
    }, intervalMs);

    // Run first measurement immediately
    void this.runCycle();
  }

  /**
   * Stop the periodic measurement cycle.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("[autonomy:baseline-scheduler] Stopped");
    }
  }

  /**
   * Whether the scheduler is currently active.
   */
  get isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Run a single measurement + snapshot cycle.
   */
  async runCycle(): Promise<void> {
    if (this.running) return; // Prevent overlapping runs
    this.running = true;

    try {
      const scenarios = this.config.scenarios ?? [];
      const result = await this.harness.measure(
        this.config.agentId,
        scenarios,
      );
      const label = `auto-${new Date().toISOString()}`;
      await this.harness.snapshot(result, label);
      logger.debug(
        `[autonomy:baseline-scheduler] Snapshot "${label}" — trust=${result.trustAccuracy.toFixed(3)}, drift=${result.driftScore.toFixed(3)}`,
      );
    } catch (err) {
      logger.error(
        `[autonomy:baseline-scheduler] Cycle failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }
}
