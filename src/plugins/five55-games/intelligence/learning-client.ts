import type {
  EpisodeSummary,
  JsonRecord,
  LearningProfile,
  PolicyProfile,
  SessionLearningSnapshot,
} from "./types.js";

type HttpMethod = "GET" | "POST" | "PUT";

interface RequestResult {
  ok: boolean;
  status: number;
  data?: JsonRecord;
  rawBody: string;
}

export type AgentRequest = (
  method: HttpMethod,
  endpoint: string,
  body?: JsonRecord,
) => Promise<RequestResult>;

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readInt(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readFloat(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asLearningProfile(value: unknown): LearningProfile {
  const profile = asRecord(value);
  return {
    exists: profile?.exists === true,
    id: readNonEmptyString(profile?.id),
    policyVersion: Math.max(1, readInt(profile?.policyVersion, 1)),
    confidence: Math.max(0, Math.min(1, readFloat(profile?.confidence, 0.5))),
    policySnapshot: asRecord(profile?.policySnapshot) || {},
    provenance: asRecord(profile?.provenance) || {},
    lastTelemetryAt: readNonEmptyString(profile?.lastTelemetryAt) ?? null,
    lastEpisodeId: readNonEmptyString(profile?.lastEpisodeId) ?? null,
    lastEpisodeAt: readNonEmptyString(profile?.lastEpisodeAt) ?? null,
    updatedAt: readNonEmptyString(profile?.updatedAt) ?? null,
  };
}

function asEpisodeSummary(value: unknown): EpisodeSummary | null {
  const episode = asRecord(value);
  const id = readNonEmptyString(episode?.id);
  if (!id) return null;
  return {
    id,
    sessionId: readNonEmptyString(episode?.sessionId),
    score: Number.isFinite(Number(episode?.score)) ? Number(episode?.score) : undefined,
    tier: Number.isFinite(Number(episode?.tier)) ? Number(episode?.tier) : undefined,
    seed: Number.isFinite(Number(episode?.seed)) ? Number(episode?.seed) : undefined,
    survivalMs: Number.isFinite(Number(episode?.survivalMs))
      ? Number(episode?.survivalMs)
      : undefined,
    causeOfDeath: readNonEmptyString(episode?.causeOfDeath),
    policyVersion: Number.isFinite(Number(episode?.policyVersion))
      ? Number(episode?.policyVersion)
      : undefined,
    createdAt: readNonEmptyString(episode?.createdAt),
    metrics: asRecord(episode?.metrics) || {},
    hazardsSeen: asRecord(episode?.hazardsSeen) || {},
    hazardsCleared: asRecord(episode?.hazardsCleared) || {},
  };
}

function responseError(prefix: string, response: RequestResult): Error {
  const detail =
    readNonEmptyString(response.data?.error) ??
    readNonEmptyString(response.rawBody) ??
    "upstream request failed";
  return new Error(`${prefix} (${response.status}): ${detail}`);
}

export class LearningClient {
  constructor(private readonly request: AgentRequest) {}

  async fetchSessionLearning(
    sessionId: string,
    gameId: string,
  ): Promise<SessionLearningSnapshot> {
    const response = await this.request(
      "GET",
      `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/${encodeURIComponent(gameId)}/learning`,
    );
    if (!response.ok) {
      throw responseError("session learning fetch failed", response);
    }

    const agentId = readNonEmptyString(response.data?.agentId);
    if (!agentId) {
      throw new Error("session learning response missing agentId");
    }

    return {
      sessionId,
      agentId,
      gameId,
      profile: asLearningProfile(response.data?.profile),
      latestEpisode: asEpisodeSummary(response.data?.latestEpisode),
    };
  }

  async updateAgentLearning(
    agentId: string,
    gameId: string,
    profile: PolicyProfile,
    provenance?: JsonRecord,
  ): Promise<LearningProfile> {
    const response = await this.request(
      "PUT",
      `/api/agent/v1/agents/${encodeURIComponent(agentId)}/games/${encodeURIComponent(gameId)}/learning`,
      {
        source: profile.source,
        policyVersion: profile.policyVersion,
        confidence: profile.confidence,
        policySnapshot: profile.policySnapshot,
        policyFamily: profile.policyFamily,
        provenance: provenance || {},
      },
    );
    if (!response.ok) {
      throw responseError("learning profile update failed", response);
    }

    return asLearningProfile(response.data?.profile);
  }

  async applyRuntimePolicy(
    sessionId: string,
    gameId: string,
    profile: PolicyProfile,
    provenance?: JsonRecord,
  ): Promise<LearningProfile> {
    const response = await this.request(
      "POST",
      `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/${encodeURIComponent(gameId)}/policy/apply`,
      {
        source: profile.source,
        policyVersion: profile.policyVersion,
        confidence: profile.confidence,
        policySnapshot: profile.policySnapshot,
        policyFamily: profile.policyFamily,
        provenance: provenance || {},
      },
    );
    if (!response.ok) {
      throw responseError("runtime policy apply failed", response);
    }
    return asLearningProfile(response.data?.profile);
  }
}
