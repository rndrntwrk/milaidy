import { LearningClient } from "./learning-client.js";
import { OutcomeAnalyzer } from "./outcome-analyzer.js";
import { PolicyEngine } from "./policy-engine.js";
import type {
  EpisodeSummary,
  JsonRecord,
  LearningProfile,
  PolicyProfile,
} from "./types.js";

export type ReflectionPipelineResult = {
  profile: PolicyProfile;
  reflectionApplied: boolean;
  reflectionReason?: string;
};

type ReflectionPipelineConfig = {
  learningClient: LearningClient;
  policyEngine: PolicyEngine;
  outcomeAnalyzer: OutcomeAnalyzer;
  writebackEnabled: boolean;
};

export class EpisodeReflectionPipeline {
  private readonly learningClient: LearningClient;
  private readonly policyEngine: PolicyEngine;
  private readonly outcomeAnalyzer: OutcomeAnalyzer;
  private readonly writebackEnabled: boolean;

  constructor(config: ReflectionPipelineConfig) {
    this.learningClient = config.learningClient;
    this.policyEngine = config.policyEngine;
    this.outcomeAnalyzer = config.outcomeAnalyzer;
    this.writebackEnabled = config.writebackEnabled;
  }

  async applyIfNeeded(input: {
    sessionId: string;
    agentId: string;
    gameId: string;
    profile: LearningProfile;
    latestEpisode?: EpisodeSummary | null;
  }): Promise<ReflectionPipelineResult> {
    const { sessionId, agentId, gameId } = input;
    const latestEpisode = input.latestEpisode || null;
    const initialProfile = this.policyEngine.resolveLaunchProfile(gameId, input.profile);

    const latestEpisodeId = latestEpisode?.id;
    const lastAppliedEpisodeId = input.profile.lastEpisodeId || null;
    const shouldReflect =
      Boolean(latestEpisodeId)
      && latestEpisodeId !== lastAppliedEpisodeId
      && this.writebackEnabled;

    if (!shouldReflect) {
      return {
        profile: initialProfile,
        reflectionApplied: false,
      };
    }

    const decision = this.outcomeAnalyzer.proposeReflection(
      gameId,
      initialProfile,
      latestEpisode,
    );

    if (!decision.applied || !decision.nextProfile) {
      return {
        profile: initialProfile,
        reflectionApplied: false,
      };
    }

    const persistedProfile = await this.learningClient.applyRuntimePolicy(
      sessionId,
      gameId,
      decision.nextProfile,
      this.buildReflectionProvenance({
        sessionId,
        agentId,
        latestEpisodeId: latestEpisodeId as string,
        reason: decision.reason,
      }),
    );

    return {
      profile: this.policyEngine.resolveLaunchProfile(gameId, persistedProfile),
      reflectionApplied: true,
      reflectionReason: decision.reason,
    };
  }

  private buildReflectionProvenance(input: {
    sessionId: string;
    agentId: string;
    latestEpisodeId: string;
    reason?: string;
  }): JsonRecord {
    return {
      source: "milaidy_episode_reflection_pipeline",
      sessionId: input.sessionId,
      agentId: input.agentId,
      latestEpisodeId: input.latestEpisodeId,
      reason: input.reason || "unspecified",
      occurredAt: new Date().toISOString(),
    };
  }
}

