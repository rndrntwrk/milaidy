import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import type {
  OrchestratedRequest,
  OrchestratedResult,
} from "../roles/types.js";
import type { EventStoreInterface, PipelineResult } from "../workflow/types.js";
import { CheckpointReward, EpisodeReward } from "./reward.js";
import { DatasetExporter, TraceCollector } from "./trace-collector.js";

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// ---------- Helpers ----------

function createMockEventStore(
  events: Array<{
    requestId: string;
    type: string;
    payload: Record<string, unknown>;
  }> = [],
): EventStoreInterface {
  return {
    append: vi.fn(async () => 0),
    getByRequestId: vi.fn(async (reqId: string) =>
      events
        .filter((e) => e.requestId === reqId)
        .map((e, i) => ({
          sequenceId: i,
          requestId: e.requestId,
          type: e.type as import("../workflow/types.js").ExecutionEventType,
          payload: e.payload,
          timestamp: Date.now(),
        })),
    ),
    getByCorrelationId: vi.fn(async () => []),
    getRecent: vi.fn(async () => []),
    get size() {
      return events.length;
    },
    clear: vi.fn(),
  };
}

function makePipelineResult(
  overrides?: Partial<PipelineResult>,
): PipelineResult {
  return {
    requestId: "req-1",
    toolName: "test-tool",
    success: true,
    result: { data: "ok" },
    validation: { valid: true, errors: [] },
    verification: { status: "passed", hasCriticalFailure: false },
    durationMs: 1000,
    ...overrides,
  };
}

function makeOrchestratedResult(
  overrides?: Partial<OrchestratedResult>,
): OrchestratedResult {
  return {
    plan: {
      id: "plan-1",
      goals: [],
      steps: [{ id: "s1", toolName: "test-tool", params: {} }],
      createdAt: Date.now(),
      status: "complete",
    },
    executions: [makePipelineResult()],
    auditReport: {
      driftReport: {
        driftScore: 0.05,
        dimensions: {
          valueAlignment: 0.95,
          styleConsistency: 0.9,
          boundaryRespect: 1.0,
          topicFocus: 0.85,
        },
        windowSize: 20,
        severity: "none" as const,
        corrections: [],
        analyzedAt: Date.now(),
      },
      eventCount: 5,
      anomalies: [],
      recommendations: [],
      auditedAt: Date.now(),
    },
    durationMs: 2000,
    success: true,
    ...overrides,
  };
}

function makeRequest(): OrchestratedRequest {
  return {
    description: "Test request",
    source: "user" as import("../tools/types.js").ToolCallSource,
    sourceTrust: 0.9,
    agentId: "agent-1",
    actionHandler: vi.fn(async () => ({ result: "ok", durationMs: 100 })),
    identityConfig: {
      coreValues: ["honesty"],
      communicationStyle: {
        tone: "neutral",
        verbosity: "normal",
        personaVoice: "assistant",
      },
      hardBoundaries: [],
    },
  };
}

// ---------- TraceCollector ----------

describe("TraceCollector", () => {
  const cr = new CheckpointReward();
  const er = new EpisodeReward(cr);

  it("collectStep builds TrainingExample from PipelineResult", async () => {
    const store = createMockEventStore([
      {
        requestId: "req-1",
        type: "tool:proposed",
        payload: { source: "user", params: { key: "value" } },
      },
    ]);
    const tc = new TraceCollector(store, cr, er);
    const step = await tc.collectStep(makePipelineResult(), "agent-1");

    expect(step.toolName).toBe("test-tool");
    expect(step.input.params).toEqual({ key: "value" });
    expect(step.output.result).toEqual({ data: "ok" });
    expect(step.output.durationMs).toBe(1000);
    expect(step.metadata.agentId).toBe("agent-1");
    expect(step.metadata.requestId).toBe("req-1");
  });

  it("collectStep includes reward signal", async () => {
    const store = createMockEventStore();
    const tc = new TraceCollector(store, cr, er);
    const step = await tc.collectStep(makePipelineResult());

    expect(step.reward.total).toBeGreaterThan(0);
    expect(step.reward.breakdown).toBeDefined();
    expect(step.reward.dimensions.length).toBeGreaterThan(0);
  });

  it("collectEpisode aggregates all steps", async () => {
    const store = createMockEventStore();
    const tc = new TraceCollector(store, cr, er);
    const result = makeOrchestratedResult({
      executions: [
        makePipelineResult(),
        makePipelineResult({ requestId: "req-2" }),
      ],
    });
    const episode = await tc.collectEpisode(result, makeRequest());

    expect(episode.steps).toHaveLength(2);
    expect(episode.description).toBe("Test request");
    expect(episode.success).toBe(true);
    expect(episode.planSteps).toBe(1);
  });

  it("collectEpisode includes drift from audit report", async () => {
    const store = createMockEventStore();
    const tc = new TraceCollector(store, cr, er);
    const episode = await tc.collectEpisode(makeOrchestratedResult(), makeRequest());

    expect(episode.driftScore).toBe(0.05);
    expect(episode.auditAnomalies).toEqual([]);
  });

  it("collectEpisode handles failed executions", async () => {
    const store = createMockEventStore();
    const tc = new TraceCollector(store, cr, er);
    const result = makeOrchestratedResult({
      success: false,
      executions: [makePipelineResult({ success: false, error: "failed" })],
    });
    const episode = await tc.collectEpisode(result, makeRequest());

    expect(episode.success).toBe(false);
    expect(episode.steps[0].reward.breakdown["completion"]).toBe(0);
  });
});

// ---------- DatasetExporter ----------

describe("DatasetExporter", () => {
  const cr = new CheckpointReward();
  const er = new EpisodeReward(cr);

  function makeEpisode(
    overrides?: Partial<import("./types.js").Episode>,
  ): import("./types.js").Episode {
    return {
      id: "ep-1",
      description: "test",
      steps: [],
      planSteps: 1,
      totalReward: {
        total: 0.8,
        breakdown: {},
        dimensions: [],
        computedAt: Date.now(),
      },
      driftScore: 0.05,
      auditAnomalies: [],
      durationMs: 1000,
      success: true,
      completedAt: Date.now(),
      ...overrides,
    };
  }

  it("exportJSONL deidentifies sensitive values when enabled", () => {
    const exporter = new DatasetExporter();
    const episode = makeEpisode({
      description: "Reach me at alice@example.com with token sk-abc123456789",
      auditAnomalies: ["ip=10.0.0.5"],
    });

    exporter.exportJSONL([episode], "/tmp/episode.jsonl", {
      deidentify: true,
      deidentification: { salt: "test-redaction" },
    });

    const lastCall = vi
      .mocked(writeFileSync)
      .mock
      .calls.at(-1);
    const payload = String(lastCall?.[1] ?? "");
    expect(payload).toContain("<EMAIL_");
    expect(payload).toContain("<SECRET_");
    expect(payload).toContain("<IP_");
    expect(payload).not.toContain("alice@example.com");
    expect(payload).not.toContain("sk-abc123456789");
    expect(payload).not.toContain("10.0.0.5");
  });

  it("exportJSONL applies quality filters before writing", () => {
    const exporter = new DatasetExporter();
    const qualityStep: import("./types.js").TrainingExample = {
      id: "step-good",
      toolName: "SAY",
      input: { params: {}, source: "user" },
      output: { result: { ok: true }, durationMs: 1000 },
      verification: { passed: true, checks: [] },
      reward: {
        total: 0.8,
        breakdown: {},
        dimensions: [],
        computedAt: Date.now(),
      },
      metadata: {
        agentId: "agent-1",
        requestId: "req-1",
        timestamp: Date.now(),
      },
    };
    const highQuality = makeEpisode({
      id: "ep-good",
      description: "High-quality export candidate episode",
      steps: [qualityStep],
    });
    const lowQuality = makeEpisode({
      id: "ep-bad",
      description: "Low-quality export candidate episode",
      steps: [qualityStep],
      totalReward: {
        total: 0.01,
        breakdown: {},
        dimensions: [],
        computedAt: Date.now(),
      },
    });

    exporter.exportJSONL([highQuality, lowQuality], "/tmp/episode.jsonl", {
      qualityFilter: {
        minEpisodeReward: 0.2,
      },
    });

    const lastCall = vi
      .mocked(writeFileSync)
      .mock
      .calls.at(-1);
    const payload = String(lastCall?.[1] ?? "");
    expect(payload).toContain("\"id\":\"ep-good\"");
    expect(payload).not.toContain("\"id\":\"ep-bad\"");
  });

  it("toJSONL produces valid JSON", () => {
    const exporter = new DatasetExporter();
    const line = exporter.toJSONL(makeEpisode());
    const parsed = JSON.parse(line);
    expect(parsed.id).toBe("ep-1");
    expect(parsed.success).toBe(true);
  });

  it("exportStatistics computes correct stats", () => {
    const exporter = new DatasetExporter();
    const stats = exporter.exportStatistics([
      makeEpisode({ durationMs: 1000, driftScore: 0.1, success: true }),
      makeEpisode({ durationMs: 3000, driftScore: 0.3, success: false }),
    ]);

    expect(stats.episodeCount).toBe(2);
    expect(stats.meanDurationMs).toBe(2000);
    expect(stats.meanDrift).toBeCloseTo(0.2, 5);
    expect(stats.successRate).toBe(0.5);
  });

  it("handles empty episode list", () => {
    const exporter = new DatasetExporter();
    const stats = exporter.exportStatistics([]);

    expect(stats.episodeCount).toBe(0);
    expect(stats.totalSteps).toBe(0);
    expect(stats.meanReward).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  it("round-trip: Episode → JSONL → parseable", async () => {
    const store = createMockEventStore();
    const tc = new TraceCollector(store, cr, er);
    const episode = await tc.collectEpisode(makeOrchestratedResult(), makeRequest());

    const exporter = new DatasetExporter();
    const line = exporter.toJSONL(episode);
    const parsed = JSON.parse(line);

    expect(parsed.description).toBe("Test request");
    expect(parsed.success).toBe(true);
    expect(parsed.totalReward.total).toBeGreaterThan(0);
    expect(parsed.steps).toHaveLength(1);
  });
});
