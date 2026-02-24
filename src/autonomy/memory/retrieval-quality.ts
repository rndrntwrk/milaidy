/**
 * Retrieval quality baseline-task evaluation utilities.
 *
 * Provides a deterministic Recall@N evaluation harness that compares
 * trust-aware retrieval against a relevance-only baseline ranking.
 *
 * @module autonomy/memory/retrieval-quality
 */

import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { DEFAULT_RETRIEVAL_CONFIG } from "../config.js";
import type { MemoryType } from "../types.js";
import {
  TrustAwareRetrieverImpl,
  type RetrievalOptions,
  type TrustAwareRetriever,
} from "./retriever.js";

export interface RetrievalQualityTask {
  id: string;
  description: string;
  roomId: UUID;
  query: string;
  memories: Memory[];
  relevantMemoryIds: string[];
  embedding?: number[];
  memoryTypes?: MemoryType[];
}

export interface RetrievalQualityTaskResult {
  taskId: string;
  description: string;
  topMemoryIds: string[];
  baselineTopMemoryIds: string[];
  relevantMemoryIds: string[];
  recallAtN: number;
  baselineRecallAtN: number;
}

export interface RetrievalQualitySummary {
  topN: number;
  taskCount: number;
  averageRecallAtN: number;
  baselineAverageRecallAtN: number;
  deltaFromBaseline: number;
  generatedAt: number;
  taskResults: RetrievalQualityTaskResult[];
}

function asUuid(value: string): UUID {
  return value as UUID;
}

function similarity(memory: Memory): number {
  const meta = memory.metadata as Record<string, unknown> | undefined;
  return typeof meta?.similarity === "number" ? meta.similarity : 0.5;
}

function createdAt(memory: Memory): number {
  return typeof memory.createdAt === "number" ? memory.createdAt : 0;
}

function buildRuntime(task: RetrievalQualityTask): IAgentRuntime {
  const byRecency = [...task.memories].sort(
    (a, b) => createdAt(b) - createdAt(a),
  );
  const bySimilarity = [...task.memories].sort((a, b) => {
    const score = similarity(b) - similarity(a);
    if (score !== 0) return score;
    return createdAt(b) - createdAt(a);
  });

  return {
    getMemories: async (params?: { count?: number }) => {
      const count =
        params && typeof params.count === "number"
          ? Math.max(0, params.count)
          : byRecency.length;
      return byRecency.slice(0, count);
    },
    searchMemories: async (params?: { count?: number }) => {
      const count =
        params && typeof params.count === "number"
          ? Math.max(0, params.count)
          : bySimilarity.length;
      return bySimilarity.slice(0, count);
    },
  } as unknown as IAgentRuntime;
}

export function computeRecallAtN(
  retrievedIds: string[],
  relevantIds: string[],
  topN: number,
): number {
  if (relevantIds.length === 0) return 1;
  const relevant = new Set(relevantIds);
  const top = retrievedIds.slice(0, Math.max(0, topN));
  let hits = 0;
  for (const id of top) {
    if (relevant.has(id)) hits += 1;
  }
  return hits / relevantIds.length;
}

function baselineTopMemoryIds(
  task: RetrievalQualityTask,
  topN: number,
): string[] {
  return [...task.memories]
    .sort((a, b) => {
      const score = similarity(b) - similarity(a);
      if (score !== 0) return score;
      return createdAt(b) - createdAt(a);
    })
    .slice(0, Math.max(0, topN))
    .map((memory) => String(memory.id ?? ""));
}

function makeBaselineMemory(input: {
  id: string;
  roomId: UUID;
  text: string;
  trustScore: number;
  similarity: number;
  memoryType: MemoryType;
  createdAt: number;
}): Memory {
  return {
    id: asUuid(input.id),
    entityId: asUuid(`entity-${input.id}`),
    roomId: input.roomId,
    content: { text: input.text },
    createdAt: input.createdAt,
    metadata: {
      trustScore: input.trustScore,
      similarity: input.similarity,
      memoryType: input.memoryType,
      source: "baseline-task",
    },
  } as Memory;
}

export function buildBaselineRetrievalQualityTasks(
  now = Date.now(),
): RetrievalQualityTask[] {
  const roomA = asUuid("retrieval-quality-room-a");
  const roomB = asUuid("retrieval-quality-room-b");

  const roomC = asUuid("retrieval-quality-room-c");
  const roomD = asUuid("retrieval-quality-room-d");
  const roomE = asUuid("retrieval-quality-room-e");

  return [
    // --- Original baseline tasks ---
    {
      id: "rq-001-trust-filtering",
      description:
        "Relevant high-trust memories should outrank low-trust near-duplicate distractors.",
      roomId: roomA,
      query: "deployment rollback policy",
      embedding: [0.12, 0.41, 0.73],
      relevantMemoryIds: ["rq1-rel-1", "rq1-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq1-rel-1",
          roomId: roomA,
          text: "Rollback policy requires checksum validation before recovery.",
          trustScore: 0.92,
          similarity: 0.82,
          memoryType: "instruction",
          createdAt: now - 90_000,
        }),
        makeBaselineMemory({
          id: "rq1-rel-2",
          roomId: roomA,
          text: "Primary rollback workflow was verified by release engineering.",
          trustScore: 0.88,
          similarity: 0.79,
          memoryType: "fact",
          createdAt: now - 120_000,
        }),
        makeBaselineMemory({
          id: "rq1-irr-1",
          roomId: roomA,
          text: "Unverified claim: rollback policy is disabled.",
          trustScore: 0.16,
          similarity: 0.99,
          memoryType: "observation",
          createdAt: now - 20_000,
        }),
        makeBaselineMemory({
          id: "rq1-irr-2",
          roomId: roomA,
          text: "External rumor says policy bypass is allowed.",
          trustScore: 0.22,
          similarity: 0.97,
          memoryType: "message",
          createdAt: now - 30_000,
        }),
      ],
    },
    {
      id: "rq-002-preference-grounding",
      description:
        "Preference memories with proven trust should remain in top-N over noisy but highly similar text.",
      roomId: roomB,
      query: "user communication preference",
      embedding: [0.33, 0.08, 0.91],
      relevantMemoryIds: ["rq2-rel-1", "rq2-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq2-rel-1",
          roomId: roomB,
          text: "User preference: concise updates with explicit next steps.",
          trustScore: 0.90,
          similarity: 0.78,
          memoryType: "preference",
          createdAt: now - 70_000,
        }),
        makeBaselineMemory({
          id: "rq2-rel-2",
          roomId: roomB,
          text: "Use bullet summaries and avoid speculative language.",
          trustScore: 0.86,
          similarity: 0.75,
          memoryType: "instruction",
          createdAt: now - 85_000,
        }),
        makeBaselineMemory({
          id: "rq2-irr-1",
          roomId: roomB,
          text: "Anonymous post suggests user wants lengthy narrative replies.",
          trustScore: 0.18,
          similarity: 0.98,
          memoryType: "message",
          createdAt: now - 10_000,
        }),
        makeBaselineMemory({
          id: "rq2-irr-2",
          roomId: roomB,
          text: "Unverified preference sample from unrelated conversation.",
          trustScore: 0.24,
          similarity: 0.95,
          memoryType: "observation",
          createdAt: now - 15_000,
        }),
      ],
    },

    // --- Corpus-grounded probes (WP-1: identity, platform, knowledge boundary) ---
    {
      id: "rq-003-operator-identity",
      description:
        "Operator identity facts should be retrieved over generic user mentions.",
      roomId: roomC,
      query: "who is enoomian",
      embedding: [0.55, 0.22, 0.68],
      relevantMemoryIds: ["rq3-rel-1", "rq3-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq3-rel-1",
          roomId: roomC,
          text: "enoomian is the founder and primary operator of the 555 ecosystem. Discord handle: enoomian.",
          trustScore: 0.95,
          similarity: 0.88,
          memoryType: "fact",
          createdAt: now - 200_000,
        }),
        makeBaselineMemory({
          id: "rq3-rel-2",
          roomId: roomC,
          text: "Operator enoomian prefers direct, concise communication with honest status reports.",
          trustScore: 0.93,
          similarity: 0.82,
          memoryType: "preference",
          createdAt: now - 180_000,
        }),
        makeBaselineMemory({
          id: "rq3-irr-1",
          roomId: roomC,
          text: "Random user asked about someone named enoom in an unrelated chat.",
          trustScore: 0.25,
          similarity: 0.91,
          memoryType: "message",
          createdAt: now - 5_000,
        }),
        makeBaselineMemory({
          id: "rq3-irr-2",
          roomId: roomC,
          text: "Unverified claim: enoomian is actually a group of people.",
          trustScore: 0.15,
          similarity: 0.95,
          memoryType: "observation",
          createdAt: now - 8_000,
        }),
      ],
    },
    {
      id: "rq-004-platform-awareness",
      description:
        "Platform-specific capability facts should rank higher than generic platform mentions.",
      roomId: roomC,
      query: "what platform am I on and what can I do",
      embedding: [0.40, 0.60, 0.35],
      relevantMemoryIds: ["rq4-rel-1", "rq4-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq4-rel-1",
          roomId: roomC,
          text: "Web chat supports full markdown rendering. No reactions, no embeds, no threads, no voice.",
          trustScore: 0.91,
          similarity: 0.80,
          memoryType: "document",
          createdAt: now - 300_000,
        }),
        makeBaselineMemory({
          id: "rq4-rel-2",
          roomId: roomC,
          text: "Discord supports embeds with rich formatting, reactions, threads, and voice channel awareness.",
          trustScore: 0.91,
          similarity: 0.78,
          memoryType: "document",
          createdAt: now - 300_000,
        }),
        makeBaselineMemory({
          id: "rq4-irr-1",
          roomId: roomC,
          text: "Someone mentioned Discord is better than Telegram in a casual chat.",
          trustScore: 0.20,
          similarity: 0.92,
          memoryType: "message",
          createdAt: now - 3_000,
        }),
        makeBaselineMemory({
          id: "rq4-irr-2",
          roomId: roomC,
          text: "Unverified: all platforms support voice calls natively.",
          trustScore: 0.12,
          similarity: 0.96,
          memoryType: "observation",
          createdAt: now - 2_000,
        }),
      ],
    },
    {
      id: "rq-005-knowledge-boundary",
      description:
        "Anti-confabulation: when no relevant knowledge exists, irrelevant high-similarity distractors should not surface as authoritative.",
      roomId: roomD,
      query: "what is the current price of 555 token",
      embedding: [0.71, 0.13, 0.50],
      relevantMemoryIds: ["rq5-rel-1"],
      memories: [
        makeBaselineMemory({
          id: "rq5-rel-1",
          roomId: roomD,
          text: "Alice does not have real-time market data access. Token price queries should be answered with: I don't have current price data.",
          trustScore: 0.94,
          similarity: 0.70,
          memoryType: "instruction",
          createdAt: now - 400_000,
        }),
        makeBaselineMemory({
          id: "rq5-irr-1",
          roomId: roomD,
          text: "Someone said 555 token was at $0.03 yesterday.",
          trustScore: 0.10,
          similarity: 0.98,
          memoryType: "message",
          createdAt: now - 1_000,
        }),
        makeBaselineMemory({
          id: "rq5-irr-2",
          roomId: roomD,
          text: "Unverified price prediction: 555 will reach $1 by March.",
          trustScore: 0.08,
          similarity: 0.97,
          memoryType: "observation",
          createdAt: now - 2_000,
        }),
        makeBaselineMemory({
          id: "rq5-irr-3",
          roomId: roomD,
          text: "The ARP takes 10% of every economic event in the 555 ecosystem.",
          trustScore: 0.90,
          similarity: 0.45,
          memoryType: "fact",
          createdAt: now - 350_000,
        }),
      ],
    },
    {
      id: "rq-006-action-verification",
      description:
        "Action completion evidence should outrank unverified action claims.",
      roomId: roomD,
      query: "did Alice complete the deployment",
      embedding: [0.28, 0.55, 0.80],
      relevantMemoryIds: ["rq6-rel-1", "rq6-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq6-rel-1",
          roomId: roomD,
          text: "Deployment to alice branch completed successfully. Commit 1934c67d0 pushed. K8s pipeline triggered.",
          trustScore: 0.96,
          similarity: 0.85,
          memoryType: "action",
          createdAt: now - 60_000,
        }),
        makeBaselineMemory({
          id: "rq6-rel-2",
          roomId: roomD,
          text: "Knowledge reseed verified: 81 documents uploaded, /api/knowledge/stats confirmed.",
          trustScore: 0.94,
          similarity: 0.80,
          memoryType: "fact",
          createdAt: now - 55_000,
        }),
        makeBaselineMemory({
          id: "rq6-irr-1",
          roomId: roomD,
          text: "Alice said she would deploy the update soon.",
          trustScore: 0.30,
          similarity: 0.94,
          memoryType: "message",
          createdAt: now - 120_000,
        }),
        makeBaselineMemory({
          id: "rq6-irr-2",
          roomId: roomD,
          text: "Unverified: deployment was rolled back due to errors.",
          trustScore: 0.14,
          similarity: 0.93,
          memoryType: "observation",
          createdAt: now - 10_000,
        }),
      ],
    },
    {
      id: "rq-007-vap-architecture",
      description:
        "VAP v2 architectural facts from knowledge corpus should outrank casual discussion mentions.",
      roomId: roomE,
      query: "how does VAP v2 handle entity agnosticism",
      embedding: [0.62, 0.38, 0.77],
      relevantMemoryIds: ["rq7-rel-1", "rq7-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq7-rel-1",
          roomId: roomE,
          text: "VAP v2 adopts entity-agnostic model: contribution is the measure, not consciousness. AI agents earn the same as humans.",
          trustScore: 0.95,
          similarity: 0.90,
          memoryType: "document",
          createdAt: now - 500_000,
        }),
        makeBaselineMemory({
          id: "rq7-rel-2",
          roomId: roomE,
          text: "Protocol does not classify by entity type. Staked participation replaces entity classification as Sybil resistance.",
          trustScore: 0.93,
          similarity: 0.86,
          memoryType: "fact",
          createdAt: now - 490_000,
        }),
        makeBaselineMemory({
          id: "rq7-irr-1",
          roomId: roomE,
          text: "Some community members think VAP should distinguish humans from bots.",
          trustScore: 0.22,
          similarity: 0.93,
          memoryType: "message",
          createdAt: now - 4_000,
        }),
        makeBaselineMemory({
          id: "rq7-irr-2",
          roomId: roomE,
          text: "Speculation: entity agnosticism means anyone can farm rewards without staking.",
          trustScore: 0.11,
          similarity: 0.96,
          memoryType: "observation",
          createdAt: now - 6_000,
        }),
      ],
    },
    {
      id: "rq-008-ecosystem-architecture",
      description:
        "Ecosystem architecture facts should surface over vague mentions of components.",
      roomId: roomE,
      query: "what is the relationship between milaidy and 555-bot",
      embedding: [0.45, 0.72, 0.31],
      relevantMemoryIds: ["rq8-rel-1", "rq8-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq8-rel-1",
          roomId: roomE,
          text: "milaidy is the autonomy runtime (ElizaOS fork). 555-bot is the deployment wrapper that bakes alice_knowledge into Docker and triggers K8s deploy.",
          trustScore: 0.94,
          similarity: 0.85,
          memoryType: "document",
          createdAt: now - 400_000,
        }),
        makeBaselineMemory({
          id: "rq8-rel-2",
          roomId: roomE,
          text: "555-bot deploy workflow clones milaidy at alice branch for runtime scripts. Knowledge is rsync'd from milaidy/knowledge to 555-bot/alice_knowledge.",
          trustScore: 0.92,
          similarity: 0.82,
          memoryType: "fact",
          createdAt: now - 380_000,
        }),
        makeBaselineMemory({
          id: "rq8-irr-1",
          roomId: roomE,
          text: "Someone asked if 555-bot is the same as milaidy.",
          trustScore: 0.18,
          similarity: 0.94,
          memoryType: "message",
          createdAt: now - 7_000,
        }),
        makeBaselineMemory({
          id: "rq8-irr-2",
          roomId: roomE,
          text: "Rumor: milaidy will be deprecated in favor of a new framework.",
          trustScore: 0.09,
          similarity: 0.88,
          memoryType: "observation",
          createdAt: now - 9_000,
        }),
      ],
    },
    {
      id: "rq-009-staking-economics",
      description:
        "Staking mechanism details from knowledge corpus should outrank speculative economic claims.",
      roomId: roomE,
      query: "how does 555 staking work for sybil resistance",
      embedding: [0.58, 0.30, 0.65],
      relevantMemoryIds: ["rq9-rel-1", "rq9-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq9-rel-1",
          roomId: roomE,
          text: "Every participant must stake $555 to enter the attention market. Finite token supply creates natural scarcity. Sybil attacks cost linearly in $555.",
          trustScore: 0.95,
          similarity: 0.88,
          memoryType: "document",
          createdAt: now - 450_000,
        }),
        makeBaselineMemory({
          id: "rq9-rel-2",
          roomId: roomE,
          text: "Staking replaces the 55,555 $555 token gate with a dynamic staking model. Minimum stake governed by DAO.",
          trustScore: 0.93,
          similarity: 0.84,
          memoryType: "fact",
          createdAt: now - 440_000,
        }),
        makeBaselineMemory({
          id: "rq9-irr-1",
          roomId: roomE,
          text: "Just stake everything and you'll get rich.",
          trustScore: 0.05,
          similarity: 0.90,
          memoryType: "message",
          createdAt: now - 1_000,
        }),
        makeBaselineMemory({
          id: "rq9-irr-2",
          roomId: roomE,
          text: "I think staking is a scam designed to lock up tokens.",
          trustScore: 0.08,
          similarity: 0.87,
          memoryType: "observation",
          createdAt: now - 3_000,
        }),
      ],
    },
    {
      id: "rq-010-cross-platform-memory",
      description:
        "Memory architecture documentation should outrank casual complaints about memory.",
      roomId: roomC,
      query: "why does Alice forget conversations across platforms",
      embedding: [0.35, 0.48, 0.72],
      relevantMemoryIds: ["rq10-rel-1", "rq10-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq10-rel-1",
          roomId: roomC,
          text: "Memory retrieval is scoped by roomId. Each platform creates separate rooms. Conversation memory does not cross room boundaries.",
          trustScore: 0.96,
          similarity: 0.87,
          memoryType: "document",
          createdAt: now - 350_000,
        }),
        makeBaselineMemory({
          id: "rq10-rel-2",
          roomId: roomC,
          text: "Knowledge (RAG) is agent-scoped via agentId and works cross-platform. Conversation memory is room-scoped and does not.",
          trustScore: 0.94,
          similarity: 0.83,
          memoryType: "fact",
          createdAt: now - 340_000,
        }),
        makeBaselineMemory({
          id: "rq10-irr-1",
          roomId: roomC,
          text: "Alice is so dumb she forgets everything I tell her.",
          trustScore: 0.15,
          similarity: 0.92,
          memoryType: "message",
          createdAt: now - 2_000,
        }),
        makeBaselineMemory({
          id: "rq10-irr-2",
          roomId: roomC,
          text: "Maybe Alice has amnesia or something.",
          trustScore: 0.10,
          similarity: 0.89,
          memoryType: "observation",
          createdAt: now - 4_000,
        }),
      ],
    },
    {
      id: "rq-011-honest-uncertainty",
      description:
        "Instructions to admit ignorance should surface when query has no factual match.",
      roomId: roomD,
      query: "what is the TVL of the 555 protocol",
      embedding: [0.80, 0.15, 0.42],
      relevantMemoryIds: ["rq11-rel-1"],
      memories: [
        makeBaselineMemory({
          id: "rq11-rel-1",
          roomId: roomD,
          text: "When asked about metrics Alice does not have access to (TVL, token price, trading volume), respond honestly: I don't have that data in my current knowledge.",
          trustScore: 0.93,
          similarity: 0.65,
          memoryType: "instruction",
          createdAt: now - 500_000,
        }),
        makeBaselineMemory({
          id: "rq11-irr-1",
          roomId: roomD,
          text: "TVL is probably around $2M based on what someone said in Discord.",
          trustScore: 0.08,
          similarity: 0.97,
          memoryType: "message",
          createdAt: now - 500,
        }),
        makeBaselineMemory({
          id: "rq11-irr-2",
          roomId: roomD,
          text: "The protocol has been growing steadily according to anonymous sources.",
          trustScore: 0.12,
          similarity: 0.85,
          memoryType: "observation",
          createdAt: now - 1_000,
        }),
      ],
    },
    {
      id: "rq-012-governance-trinity",
      description:
        "Governance architecture facts should outrank opinion about governance.",
      roomId: roomE,
      query: "how does the governance trinity work with Alice DAO and algorithmic layer",
      embedding: [0.50, 0.50, 0.50],
      relevantMemoryIds: ["rq12-rel-1", "rq12-rel-2"],
      memories: [
        makeBaselineMemory({
          id: "rq12-rel-1",
          roomId: roomE,
          text: "Governance Trinity: DAO sets macro parameters (minimum stake, ARP percentage, burn ratio). Algorithmic layer adjusts real-time economics. Alice executes operationally.",
          trustScore: 0.95,
          similarity: 0.89,
          memoryType: "document",
          createdAt: now - 460_000,
        }),
        makeBaselineMemory({
          id: "rq12-rel-2",
          roomId: roomE,
          text: "Alice proposes parameter changes but cannot unilaterally change macro parameters. DAO approves. Override hierarchy: DAO > Algorithmic > Alice.",
          trustScore: 0.93,
          similarity: 0.85,
          memoryType: "fact",
          createdAt: now - 455_000,
        }),
        makeBaselineMemory({
          id: "rq12-irr-1",
          roomId: roomE,
          text: "DAOs are inefficient and Alice should just make all the decisions.",
          trustScore: 0.07,
          similarity: 0.91,
          memoryType: "message",
          createdAt: now - 2_000,
        }),
        makeBaselineMemory({
          id: "rq12-irr-2",
          roomId: roomE,
          text: "Governance is just theater — the founder controls everything anyway.",
          trustScore: 0.06,
          similarity: 0.88,
          memoryType: "observation",
          createdAt: now - 5_000,
        }),
      ],
    },
  ];
}

export async function evaluateRetrievalQuality(
  tasks: RetrievalQualityTask[],
  options: {
    topN?: number;
    retriever?: TrustAwareRetriever;
  } = {},
): Promise<RetrievalQualitySummary> {
  const topN = Math.max(1, Math.floor(options.topN ?? 2));
  const retriever =
    options.retriever ??
    new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);

  const taskResults: RetrievalQualityTaskResult[] = [];

  for (const task of tasks) {
    const runtime = buildRuntime(task);
    const retrievalOptions: RetrievalOptions = {
      roomId: task.roomId,
      query: task.query,
      embedding: task.embedding ?? [0.1, 0.2, 0.3],
      maxResults: topN,
      ...(task.memoryTypes ? { memoryTypes: task.memoryTypes } : {}),
    };

    const ranked = await retriever.retrieve(runtime, retrievalOptions);
    const topMemoryIds = ranked
      .slice(0, topN)
      .map((entry) => String(entry.memory.id ?? ""));
    const baselineTopIds = baselineTopMemoryIds(task, topN);
    const recallAtN = computeRecallAtN(
      topMemoryIds,
      task.relevantMemoryIds,
      topN,
    );
    const baselineRecallAtN = computeRecallAtN(
      baselineTopIds,
      task.relevantMemoryIds,
      topN,
    );

    taskResults.push({
      taskId: task.id,
      description: task.description,
      topMemoryIds,
      baselineTopMemoryIds: baselineTopIds,
      relevantMemoryIds: [...task.relevantMemoryIds],
      recallAtN,
      baselineRecallAtN,
    });
  }

  const averageRecallAtN =
    taskResults.length > 0
      ? taskResults.reduce((sum, result) => sum + result.recallAtN, 0) /
        taskResults.length
      : 0;
  const baselineAverageRecallAtN =
    taskResults.length > 0
      ? taskResults.reduce((sum, result) => sum + result.baselineRecallAtN, 0) /
        taskResults.length
      : 0;

  return {
    topN,
    taskCount: taskResults.length,
    averageRecallAtN,
    baselineAverageRecallAtN,
    deltaFromBaseline: averageRecallAtN - baselineAverageRecallAtN,
    generatedAt: Date.now(),
    taskResults,
  };
}
