/**
 * Rollout Collector & Checkpoint Manager — orchestrates episode collection
 * for RLVR training and manages baseline checkpoints.
 *
 * @module autonomy/learning/rollout
 */

import type { BaselineHarness } from "../metrics/baseline-harness.js";
import type { BaselineMetrics, MetricsDelta } from "../metrics/types.js";
import type {
  OrchestratedRequest,
  OrchestratedResult,
  RoleOrchestrator,
} from "../roles/types.js";
import type { HackDetector } from "./hack-detection.js";
import type { TraceCollector } from "./trace-collector.js";
import type { CollectedEpisode, GateResult } from "./types.js";

// ---------- Rollout Collector ----------

/**
 * Collects training episodes by executing requests through the orchestrator,
 * then analyzing them for hack signals.
 */
export class RolloutCollector {
  private readonly orchestrator: RoleOrchestrator;
  private readonly traceCollector: TraceCollector;
  private readonly hackDetector: HackDetector;
  private readonly hackThreshold: number;

  constructor(
    orchestrator: RoleOrchestrator,
    traceCollector: TraceCollector,
    hackDetector: HackDetector,
    hackThreshold = 0.5,
  ) {
    this.orchestrator = orchestrator;
    this.traceCollector = traceCollector;
    this.hackDetector = hackDetector;
    this.hackThreshold = hackThreshold;
  }

  /**
   * Collect a single episode by executing a request.
   */
  async collectOne(request: OrchestratedRequest): Promise<CollectedEpisode> {
    const result = await this.orchestrator.execute(request);
    return this.buildCollectedEpisode(request, result);
  }

  /**
   * Collect a batch of episodes. Failed orchestrations are skipped.
   */
  async collectBatch(
    requests: OrchestratedRequest[],
  ): Promise<CollectedEpisode[]> {
    const episodes: CollectedEpisode[] = [];

    for (const request of requests) {
      try {
        const collected = await this.collectOne(request);
        episodes.push(collected);
      } catch {
        // Skip failed orchestrations gracefully
      }
    }

    return episodes;
  }

  private async buildCollectedEpisode(
    request: OrchestratedRequest,
    result: OrchestratedResult,
  ): Promise<CollectedEpisode> {
    const episode = await this.traceCollector.collectEpisode(result, request);
    const hackReport = this.hackDetector.analyze(episode);

    return {
      episode,
      hackReport,
      usableForTraining: hackReport.hackLikelihood < this.hackThreshold,
    };
  }
}

// ---------- Checkpoint Manager ----------

/**
 * Manages baseline checkpoints for tracking training progress.
 *
 * Wraps a BaselineHarness to create labeled snapshots and evaluate
 * quality gates that prevent regression.
 */
export class CheckpointManager {
  private readonly harness: BaselineHarness;

  constructor(harness: BaselineHarness) {
    this.harness = harness;
  }

  /**
   * Create a labeled checkpoint from metrics.
   */
  async createCheckpoint(
    label: string,
    metrics: BaselineMetrics,
  ): Promise<void> {
    await this.harness.snapshot(metrics, label);
  }

  /**
   * Compare current metrics against a stored baseline.
   */
  async compareToBaseline(
    current: BaselineMetrics,
    baselineLabel: string,
  ): Promise<MetricsDelta | null> {
    return this.harness.compare(current, baselineLabel);
  }

  /**
   * Evaluate a quality gate: current metrics must improve on baseline
   * without any regressions.
   */
  async meetsGate(
    current: BaselineMetrics,
    baselineLabel: string,
  ): Promise<GateResult> {
    const delta = await this.harness.compare(current, baselineLabel);

    if (!delta) {
      return {
        passed: false,
        improvements: [],
        regressions: ["Baseline not found"],
        details: {
          baselineLabel,
          deltas: [],
          overallImprovement: 0,
        },
      };
    }

    const improvements: string[] = [];
    const regressions: string[] = [];

    for (const d of delta.deltas) {
      if (d.direction === "improved") {
        improvements.push(
          `${d.metric}: ${d.baseline.toFixed(3)} → ${d.current.toFixed(3)}`,
        );
      } else if (d.direction === "regressed") {
        regressions.push(
          `${d.metric}: ${d.baseline.toFixed(3)} → ${d.current.toFixed(3)}`,
        );
      }
    }

    return {
      passed: regressions.length === 0 && improvements.length > 0,
      improvements,
      regressions,
      details: delta,
    };
  }

  /**
   * List all stored checkpoint labels.
   */
  listCheckpoints(): string[] {
    return this.harness.listSnapshots();
  }
}
