import { LearningClient } from "./learning-client.js";
import { EpisodeReflectionPipeline } from "./episode-reflection-pipeline.js";
import { OutcomeAnalyzer } from "./outcome-analyzer.js";
import { PolicyEngine } from "./policy-engine.js";
import type { LaunchPolicyContext } from "./types.js";

interface AutonomySupervisorConfig {
  learningClient: LearningClient;
  policyEngine: PolicyEngine;
  outcomeAnalyzer: OutcomeAnalyzer;
  learningWritebackEnabled: boolean;
}

export class AutonomySupervisor {
  private readonly learningClient: LearningClient;
  private readonly reflectionPipeline: EpisodeReflectionPipeline;

  constructor(config: AutonomySupervisorConfig) {
    this.learningClient = config.learningClient;
    this.reflectionPipeline = new EpisodeReflectionPipeline({
      learningClient: config.learningClient,
      policyEngine: config.policyEngine,
      outcomeAnalyzer: config.outcomeAnalyzer,
      writebackEnabled: config.learningWritebackEnabled,
    });
  }

  async prepareLaunchContext(
    sessionId: string,
    gameId: string,
  ): Promise<LaunchPolicyContext> {
    const sessionLearning = await this.learningClient.fetchSessionLearning(
      sessionId,
      gameId,
    );
    const pipelineResult = await this.reflectionPipeline.applyIfNeeded({
      sessionId,
      agentId: sessionLearning.agentId,
      gameId,
      profile: sessionLearning.profile,
      latestEpisode: sessionLearning.latestEpisode || null,
    });
    const latestEpisodeId = sessionLearning.latestEpisode?.id;

    return {
      agentId: sessionLearning.agentId,
      gameId,
      policyFamily: pipelineResult.profile.policyFamily,
      controlAuthority: "milaidy",
      policyVersion: pipelineResult.profile.policyVersion,
      policySnapshot: pipelineResult.profile.policySnapshot,
      confidence: pipelineResult.profile.confidence,
      reflectionApplied: pipelineResult.reflectionApplied,
      reflectionReason: pipelineResult.reflectionReason,
      latestEpisodeId: latestEpisodeId || undefined,
    };
  }
}
