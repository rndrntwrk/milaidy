/**
 * File-backed baseline harness with JSON disk persistence.
 *
 * Wraps InMemoryBaselineHarness and adds snapshot persistence
 * to a JSON file on disk. Hydrates from disk on construction.
 *
 * @module autonomy/metrics/file-harness
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { logger } from "@elizaos/core";
import type { BaselineHarness } from "./baseline-harness.js";
import { InMemoryBaselineHarness } from "./baseline-harness.js";
import type { KernelComponents, ScenarioEvaluator } from "./evaluator-types.js";
import type {
  BaselineMetrics,
  EvaluationScenario,
  MetricsDelta,
} from "./types.js";

const SNAPSHOT_FILENAME = "baseline-snapshots.json";

/**
 * File-backed baseline harness.
 *
 * Composition over InMemoryBaselineHarness — delegates measure()
 * and compare(), adds disk persistence for snapshot() and listSnapshots().
 */
export class FileBaselineHarness implements BaselineHarness {
  private inner: InMemoryBaselineHarness;
  private filePath: string;
  /** Local cache of all snapshots for disk serialization. */
  private snapshotCache: Record<string, BaselineMetrics> = {};

  constructor(
    storagePath: string,
    evaluator?: ScenarioEvaluator,
    components?: KernelComponents,
  ) {
    this.filePath = join(storagePath, SNAPSHOT_FILENAME);
    this.snapshotCache = this.readFromDisk();
    const initialSnapshots = new Map(Object.entries(this.snapshotCache));
    this.inner = new InMemoryBaselineHarness(
      evaluator,
      components,
      initialSnapshots,
    );
  }

  async measure(
    agentId: string,
    scenarios: EvaluationScenario[],
  ): Promise<BaselineMetrics> {
    return this.inner.measure(agentId, scenarios);
  }

  async snapshot(
    baselineMetrics: BaselineMetrics,
    label: string,
  ): Promise<void> {
    await this.inner.snapshot(baselineMetrics, label);
    this.snapshotCache[label] = { ...baselineMetrics, label };
    this.saveToDisk();
  }

  async compare(
    current: BaselineMetrics,
    baselineLabel: string,
  ): Promise<MetricsDelta | null> {
    return this.inner.compare(current, baselineLabel);
  }

  listSnapshots(): string[] {
    return this.inner.listSnapshots();
  }

  /**
   * Read snapshots from disk and return them as a record.
   * Returns an empty record if no file exists or on parse error.
   */
  private readFromDisk(): Record<string, BaselineMetrics> {
    try {
      if (!existsSync(this.filePath)) {
        logger.debug(
          `[file-harness] No snapshot file at ${this.filePath}, starting fresh`,
        );
        return {};
      }

      const raw = readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, BaselineMetrics>;
      const count = Object.keys(data).length;

      logger.info(
        `[file-harness] Loaded ${count} snapshots from ${this.filePath}`,
      );
      return data;
    } catch (err) {
      logger.warn(
        `[file-harness] Failed to load snapshots from ${this.filePath}: ${err instanceof Error ? err.message : err}`,
      );
      return {};
    }
  }

  /**
   * Save all current snapshots to disk as JSON.
   */
  private saveToDisk(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(
        this.filePath,
        JSON.stringify(this.snapshotCache, null, 2),
        "utf-8",
      );

      logger.debug(
        `[file-harness] Saved ${Object.keys(this.snapshotCache).length} snapshots to ${this.filePath}`,
      );
    } catch (err) {
      logger.warn(
        `[file-harness] Failed to save snapshots to ${this.filePath}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
