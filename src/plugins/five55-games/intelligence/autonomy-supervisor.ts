import { LearningClient } from "./learning-client.js";
import { OutcomeAnalyzer } from "./outcome-analyzer.js";
import { PolicyEngine } from "./policy-engine.js";
import type { JsonRecord, LaunchPolicyContext } from "./types.js";

interface AutonomySupervisorConfig {
  learningClient: LearningClient;
  policyEngine: PolicyEngine;
  outcomeAnalyzer: OutcomeAnalyzer;
  learningWritebackEnabled: boolean;
}

export class AutonomySupervisor {
  private readonly learningClient: LearningClient;
  private readonly policyEngine: PolicyEngine;
  private readonly outcomeAnalyzer: OutcomeAnalyzer;
  private readonly learningWritebackEnabled: boolean;

  constructor(config: AutonomySupervisorConfig) {
    this.learningClient = config.learningClient;
    this.policyEngine = config.policyEngine;
    this.outcomeAnalyzer = config.outcomeAnalyzer;
    this.learningWritebackEnabled = config.learningWritebackEnabled;
  }

  async prepareLaunchContext(
    sessionId: string,
    gameId: string,
  ): Promise<LaunchPolicyContext> {
    const sessionLearning = await this.learningClient.fetchSessionLearning(
      sessionId,
      gameId,
    );
    const latestEpisode = sessionLearning.latestEpisode || null;
    let profile = this.policyEngine.resolveLaunchProfile(
      gameId,
      sessionLearning.profile,
    );
    let reflectionApplied = false;
    let reflectionReason: string | undefined;

    const lastAppliedEpisodeId = sessionLearning.profile.lastEpisodeId || null;
    const latestEpisodeId = latestEpisode?.id;
    const shouldReflect =
      Boolean(latestEpisodeId) &&
      latestEpisodeId !== lastAppliedEpisodeId &&
      this.learningWritebackEnabled;

    if (shouldReflect) {
      const decision = this.outcomeAnalyzer.proposeReflection(
        gameId,
        profile,
        latestEpisode,
      );
      if (decision.applied && decision.nextProfile) {
        const persistedProfile = await this.learningClient.updateAgentLearning(
          sessionLearning.agentId,
          gameId,
          decision.nextProfile,
          this.buildReflectionProvenance(
            latestEpisodeId as string,
            decision.reason,
            sessionId,
          ),
        );

        profile = this.policyEngine.resolveLaunchProfile(gameId, persistedProfile);
        reflectionApplied = true;
        reflectionReason = decision.reason;
      }
    }

    return {
      agentId: sessionLearning.agentId,
      gameId,
      controlAuthority: "milaidy",
      policyVersion: profile.policyVersion,
      policySnapshot: profile.policySnapshot,
      confidence: profile.confidence,
      reflectionApplied,
      reflectionReason,
      latestEpisodeId: latestEpisodeId || undefined,
    };
  }

  private buildReflectionProvenance(
    latestEpisodeId: string,
    reason: string | undefined,
    sessionId: string,
  ): JsonRecord {
    return {
      source: "milaidy_reflection",
      latestEpisodeId,
      reason: reason || "unspecified",
      triggerSessionId: sessionId,
      occurredAt: new Date().toISOString(),
    };
  }
}
