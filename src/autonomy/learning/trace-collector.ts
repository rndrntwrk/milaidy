/**
 * Trace Collector — converts orchestrated results into training episodes.
 *
 * Collects tool execution traces from the event store and pipeline results,
 * computes rewards, and exports episodes as JSONL datasets.
 *
 * @module autonomy/learning/trace-collector
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  OrchestratedRequest,
  OrchestratedResult,
} from "../roles/types.js";
import type { EventStoreInterface, PipelineResult } from "../workflow/types.js";
import type { CheckpointReward, EpisodeReward } from "./reward.js";
import type {
  DatasetStatistics,
  Episode,
  TrainingExample,
} from "./types.js";
import { Deidentifier, type DeidentificationOptions } from "./deidentification.js";
import {
  applyQualityFilters,
  type QualityFilterConfig,
} from "./quality-filters.js";

// ---------- Trace Collector ----------

let _stepCounter = 0;
let _episodeCounter = 0;

/**
 * Converts OrchestratedResults into structured Episode training data.
 */
export class TraceCollector {
  private readonly eventStore: EventStoreInterface;
  private readonly checkpointReward: CheckpointReward;
  private readonly episodeReward: EpisodeReward;

  constructor(
    eventStore: EventStoreInterface,
    checkpointReward: CheckpointReward,
    episodeReward: EpisodeReward,
  ) {
    this.eventStore = eventStore;
    this.checkpointReward = checkpointReward;
    this.episodeReward = episodeReward;
  }

  /**
   * Collect a full episode from an orchestrated result.
   */
  async collectEpisode(
    result: OrchestratedResult,
    request: OrchestratedRequest,
  ): Promise<Episode> {
    const steps: TrainingExample[] = await Promise.all(
      result.executions.map((pipelineResult) =>
        this.collectStep(pipelineResult, request.agentId),
      ),
    );

    const totalReward = this.episodeReward.compute(result);

    const driftScore = result.auditReport?.driftReport?.driftScore ?? 0;
    const auditAnomalies = result.auditReport?.anomalies ?? [];

    return {
      id: `episode-${++_episodeCounter}`,
      description: request.description,
      steps,
      planSteps: result.plan?.steps?.length ?? 0,
      totalReward,
      driftScore,
      auditAnomalies,
      durationMs: result.durationMs,
      success: result.success,
      completedAt: Date.now(),
    };
  }

  /**
   * Collect a single training example from a pipeline result.
   */
  async collectStep(
    pipelineResult: PipelineResult,
    agentId: string = "unknown",
  ): Promise<TrainingExample> {
    // Try to enrich from event store
    const events = await this.eventStore.getByRequestId(pipelineResult.requestId);

    // Extract source from tool:proposed event
    const proposedEvent = events.find((e) => e.type === "tool:proposed");
    const source = (proposedEvent?.payload?.["source"] as string) ?? "unknown";

    // Extract verification checks
    const verifiedEvent = events.find((e) => e.type === "tool:verified");
    const checks = (
      (verifiedEvent?.payload?.["checks"] as Array<{
        conditionId: string;
        passed: boolean;
        severity: string;
      }>) ?? []
    ).map((c) => ({
      id: c.conditionId,
      passed: c.passed,
      severity: c.severity,
    }));

    const reward = this.checkpointReward.compute(pipelineResult);

    const verificationPassed = pipelineResult.verification
      ? !pipelineResult.verification.hasCriticalFailure
      : true;

    return {
      id: `step-${++_stepCounter}`,
      toolName: pipelineResult.toolName,
      input: {
        params:
          (proposedEvent?.payload?.["params"] as Record<string, unknown>) ?? {},
        source: source as import("../tools/types.js").ToolCallSource,
      },
      output: {
        result: pipelineResult.result ?? null,
        durationMs: pipelineResult.durationMs,
      },
      verification: {
        passed: verificationPassed,
        checks,
      },
      reward,
      metadata: {
        agentId,
        requestId: pipelineResult.requestId,
        timestamp: Date.now(),
      },
    };
  }
}

// ---------- Dataset Exporter ----------

/**
 * Exports episodes as JSONL files and computes dataset statistics.
 */
export class DatasetExporter {
  /**
   * Serialize a single episode to a JSONL line.
   */
  toJSONL(episode: Episode): string {
    return JSON.stringify(episode);
  }

  /**
   * Export episodes to a JSONL file.
   */
  exportJSONL(
    episodes: Episode[],
    outputPath: string,
    options: {
      deidentify?: boolean;
      deidentification?: DeidentificationOptions;
      qualityFilter?: Partial<QualityFilterConfig>;
    } = {},
  ): void {
    mkdirSync(dirname(outputPath), { recursive: true });
    const qualityFilteredEpisodes = options.qualityFilter
      ? applyQualityFilters(episodes, options.qualityFilter).accepted
      : episodes;
    const normalizedEpisodes = options.deidentify
      ? new Deidentifier(options.deidentification).deidentifyEpisodes(
          qualityFilteredEpisodes,
        )
      : qualityFilteredEpisodes;
    const lines = normalizedEpisodes.map((ep) => this.toJSONL(ep)).join("\n");
    writeFileSync(outputPath, lines + "\n", "utf-8");
  }

  /**
   * Compute aggregate statistics for a collection of episodes.
   */
  exportStatistics(episodes: Episode[]): DatasetStatistics {
    if (episodes.length === 0) {
      return {
        episodeCount: 0,
        totalSteps: 0,
        meanReward: 0,
        meanDrift: 0,
        successRate: 0,
        meanDurationMs: 0,
      };
    }

    const totalSteps = episodes.reduce((sum, ep) => sum + ep.steps.length, 0);
    const meanReward =
      episodes.reduce((sum, ep) => sum + ep.totalReward.total, 0) /
      episodes.length;
    const meanDrift =
      episodes.reduce((sum, ep) => sum + ep.driftScore, 0) / episodes.length;
    const successRate =
      episodes.filter((ep) => ep.success).length / episodes.length;
    const meanDurationMs =
      episodes.reduce((sum, ep) => sum + ep.durationMs, 0) / episodes.length;

    return {
      episodeCount: episodes.length,
      totalSteps,
      meanReward,
      meanDrift,
      successRate,
      meanDurationMs,
    };
  }
}
