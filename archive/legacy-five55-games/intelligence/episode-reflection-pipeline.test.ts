import { describe, expect, it, vi } from "vitest";
import { EpisodeReflectionPipeline } from "./episode-reflection-pipeline.js";
import type { EpisodeSummary, LearningProfile, PolicyProfile } from "./types.js";

function buildProfile(input?: Partial<LearningProfile>): LearningProfile {
  return {
    exists: true,
    id: "profile-1",
    policyVersion: 1,
    confidence: 0.5,
    policySnapshot: {
      riskTolerance: 0.4,
    },
    provenance: {
      source: "test",
    },
    lastTelemetryAt: null,
    lastEpisodeId: null,
    lastEpisodeAt: null,
    updatedAt: new Date(0).toISOString(),
    ...input,
  };
}

function buildResolvedProfile(input?: Partial<PolicyProfile>): PolicyProfile {
  return {
    policyVersion: 1,
    confidence: 0.5,
    policySnapshot: {
      riskTolerance: 0.4,
    },
    policyFamily: "runner_survival",
    source: "learning_profile",
    ...input,
  };
}

describe("EpisodeReflectionPipeline", () => {
  it("skips reflection when latest episode is present but not qualified", async () => {
    const applyRuntimePolicy = vi.fn();
    const resolvedProfile = buildResolvedProfile();
    const pipeline = new EpisodeReflectionPipeline({
      learningClient: {
        applyRuntimePolicy,
      } as never,
      policyEngine: {
        resolveLaunchProfile: vi.fn(() => resolvedProfile),
      } as never,
      outcomeAnalyzer: {
        proposeReflection: vi.fn(() => ({
          applied: true,
          reason: "should_not_apply",
          nextProfile: buildResolvedProfile({ policyVersion: 2 }),
        })),
      } as never,
      writebackEnabled: true,
    });

    const result = await pipeline.applyIfNeeded({
      sessionId: "session-1",
      agentId: "alice",
      gameId: "knighthood",
      profile: buildProfile(),
      latestEpisode: {
        id: "episode-1",
        finalQualified: false,
      } as EpisodeSummary,
    });

    expect(result.reflectionApplied).toBe(false);
    expect(result.reflectionReason).toBe("latest_episode_not_qualified");
    expect(applyRuntimePolicy).not.toHaveBeenCalled();
  });

  it("fails closed when qualification metadata is missing", async () => {
    const applyRuntimePolicy = vi.fn();
    const resolvedProfile = buildResolvedProfile();
    const pipeline = new EpisodeReflectionPipeline({
      learningClient: {
        applyRuntimePolicy,
      } as never,
      policyEngine: {
        resolveLaunchProfile: vi.fn(() => resolvedProfile),
      } as never,
      outcomeAnalyzer: {
        proposeReflection: vi.fn(),
      } as never,
      writebackEnabled: true,
    });

    const result = await pipeline.applyIfNeeded({
      sessionId: "session-1",
      agentId: "alice",
      gameId: "ninja",
      profile: buildProfile(),
      latestEpisode: {
        id: "episode-2",
      },
    });

    expect(result.reflectionApplied).toBe(false);
    expect(result.reflectionReason).toBe("latest_episode_not_qualified");
    expect(applyRuntimePolicy).not.toHaveBeenCalled();
  });

  it("applies reflection only when latest episode is qualified", async () => {
    const persistedProfile = buildProfile({
      policyVersion: 2,
      confidence: 0.62,
      policySnapshot: {
        riskTolerance: 0.36,
      },
      lastEpisodeId: "episode-3",
    });
    const applyRuntimePolicy = vi.fn(async () => persistedProfile);
    const resolvedProfile = buildResolvedProfile();
    const nextProfile = buildResolvedProfile({
      policyVersion: 2,
      confidence: 0.62,
      policySnapshot: {
        riskTolerance: 0.36,
      },
      source: "episode_reflection",
    });
    const pipeline = new EpisodeReflectionPipeline({
      learningClient: {
        applyRuntimePolicy,
      } as never,
      policyEngine: {
        resolveLaunchProfile: vi.fn((_gameId, profile) => ({
          policyVersion: Number(profile.policyVersion || resolvedProfile.policyVersion),
          confidence: Number(profile.confidence || resolvedProfile.confidence),
          policySnapshot: profile.policySnapshot || resolvedProfile.policySnapshot,
          policyFamily: "runner_survival",
          source: "learning_profile",
        })),
      } as never,
      outcomeAnalyzer: {
        proposeReflection: vi.fn(() => ({
          applied: true,
          reason: "qualified_episode_reflection",
          nextProfile,
        })),
      } as never,
      writebackEnabled: true,
    });

    const result = await pipeline.applyIfNeeded({
      sessionId: "session-1",
      agentId: "alice",
      gameId: "sector-13",
      profile: buildProfile(),
      latestEpisode: {
        id: "episode-3",
        metrics: {
          mastery: {
            finalQualified: true,
          },
        },
      },
    });

    expect(result.reflectionApplied).toBe(true);
    expect(result.reflectionReason).toBe("qualified_episode_reflection");
    expect(applyRuntimePolicy).toHaveBeenCalledTimes(1);
  });
});
