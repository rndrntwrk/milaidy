export type JsonRecord = Record<string, unknown>;

export interface LearningProfile {
  exists: boolean;
  id?: string;
  policyVersion: number;
  confidence: number;
  policySnapshot: JsonRecord;
  provenance: JsonRecord;
  lastTelemetryAt?: string | null;
  lastEpisodeId?: string | null;
  lastEpisodeAt?: string | null;
  updatedAt?: string | null;
}

export interface EpisodeSummary {
  id: string;
  sessionId?: string;
  score?: number;
  tier?: number;
  seed?: number;
  survivalMs?: number;
  causeOfDeath?: string;
  policyVersion?: number;
  createdAt?: string;
  metrics?: JsonRecord;
  hazardsSeen?: JsonRecord;
  hazardsCleared?: JsonRecord;
}

export interface SessionLearningSnapshot {
  sessionId: string;
  agentId: string;
  gameId: string;
  profile: LearningProfile;
  latestEpisode?: EpisodeSummary | null;
}

export interface PolicyProfile {
  policyVersion: number;
  confidence: number;
  policySnapshot: JsonRecord;
  source: string;
}

export interface ReflectionDecision {
  applied: boolean;
  reason?: string;
  nextProfile?: PolicyProfile;
}

export interface LaunchPolicyContext {
  agentId: string;
  gameId: string;
  controlAuthority: "milaidy";
  policyVersion: number;
  policySnapshot: JsonRecord;
  confidence: number;
  reflectionApplied: boolean;
  reflectionReason?: string;
  latestEpisodeId?: string;
}
