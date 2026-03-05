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
    const latestEpisodeQualified = isEpisodeQualifiedForLearning(latestEpisode);
    const shouldReflect =
      Boolean(latestEpisodeId)
      && latestEpisodeId !== lastAppliedEpisodeId
      && latestEpisodeQualified
      && this.writebackEnabled;

    if (Boolean(latestEpisodeId) && !latestEpisodeQualified) {
      return {
        profile: initialProfile,
        reflectionApplied: false,
        reflectionReason: "latest_episode_not_qualified",
      };
    }

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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readNestedBoolean(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function isEpisodeQualifiedForLearning(episode: EpisodeSummary | null): boolean {
  if (!episode) return false;

  if (episode.finalQualified === true) return true;
  if (episode.finalQualified === false) return false;

  const outcome = asRecord(episode.outcome);
  const outcomeQualified = readNestedBoolean(outcome.finalQualified);
  if (outcomeQualified != null) return outcomeQualified;

  const metrics = asRecord(episode.metrics);
  const mastery = asRecord(metrics.mastery);
  const qualification = asRecord(metrics.qualification);

  const masteryQualified = readNestedBoolean(mastery.finalQualified);
  if (masteryQualified != null) return masteryQualified;

  const qualificationQualified = readNestedBoolean(qualification.finalQualified);
  if (qualificationQualified != null) return qualificationQualified;

  return false;
}
