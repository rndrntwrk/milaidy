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

  return [
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
