import type { JsonRecord, LearningProfile, PolicyProfile } from "./types.js";
import { GamePolicyRegistry } from "./game-policy-registry.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class PolicyEngine {
  constructor(private readonly registry = new GamePolicyRegistry()) {}

  resolveLaunchProfile(gameId: string, profile: LearningProfile): PolicyProfile {
    const confidence = Number.isFinite(profile.confidence)
      ? clamp(profile.confidence, 0, 1)
      : 0.5;
    const snapshot = this.registry.sanitizeSnapshot(
      gameId,
      profile.policySnapshot || {},
    );
    const policyVersion = Math.max(1, Number(profile.policyVersion) || 1);
    return {
      policyVersion,
      confidence,
      policySnapshot: snapshot,
      policyFamily: this.registry.getFamily(gameId),
      source: "learning_profile",
    };
  }
}
