#!/usr/bin/env -S node --import tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ApprovalGate } from "../../src/autonomy/approval/approval-gate.js";
import { KernelStateMachine } from "../../src/autonomy/state-machine/kernel-state-machine.js";
import { ToolRegistry } from "../../src/autonomy/tools/registry.js";
import { registerBuiltinToolContracts } from "../../src/autonomy/tools/schemas/index.js";
import type { ProposedToolCall } from "../../src/autonomy/tools/types.js";
import { PostConditionVerifier } from "../../src/autonomy/verification/postcondition-verifier.js";
import { registerBuiltinPostConditions } from "../../src/autonomy/verification/postconditions/index.js";
import { SchemaValidator } from "../../src/autonomy/verification/schema-validator.js";
import { CompensationRegistry } from "../../src/autonomy/workflow/compensation-registry.js";
import { registerBuiltinCompensations } from "../../src/autonomy/workflow/compensations/index.js";
import { InMemoryEventStore } from "../../src/autonomy/workflow/event-store.js";
import { ToolExecutionPipeline } from "../../src/autonomy/workflow/execution-pipeline.js";

interface CliArgs {
  outDir: string;
  label: string;
  iterations: number;
}

interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const eq = key.indexOf("=");
    if (eq > -1) {
      args.set(key.slice(0, eq), key.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i++;
      continue;
    }
    args.set(key, "true");
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    label: args.get("label") ?? `pipeline-latency-${now}`,
    iterations: Math.max(1, Number(args.get("iterations") ?? "200")),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[Math.max(0, idx)];
}

function summarize(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: total / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function makePipeline(): ToolExecutionPipeline {
  const registry = new ToolRegistry();
  registerBuiltinToolContracts(registry);

  const verifier = new PostConditionVerifier();
  registerBuiltinPostConditions(verifier);

  const compensation = new CompensationRegistry();
  registerBuiltinCompensations(compensation);

  return new ToolExecutionPipeline({
    schemaValidator: new SchemaValidator(registry),
    approvalGate: new ApprovalGate({ timeoutMs: 5_000 }),
    postConditionVerifier: verifier,
    compensationRegistry: compensation,
    stateMachine: new KernelStateMachine(),
    eventStore: new InMemoryEventStore({ maxEvents: 50_000 }),
  });
}

function makeCall(i: number): ProposedToolCall {
  return {
    tool: "PLAY_EMOTE",
    params: { emote: "wave" },
    source: "system",
    requestId: `latency-${i}`,
  };
}

async function measureDirect(iterations: number): Promise<LatencyStats> {
  const samples: number[] = [];
  const handler = async () => ({ result: { ok: true }, durationMs: 1 });
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await handler();
    samples.push(Date.now() - start);
  }
  return summarize(samples);
}

async function measurePipeline(iterations: number): Promise<LatencyStats> {
  const samples: number[] = [];
  const pipeline = makePipeline();
  for (let i = 0; i < iterations; i++) {
    const call = makeCall(i);
    const start = Date.now();
    const result = await pipeline.execute(call, async () => ({
      result: { ok: true },
      durationMs: 1,
    }));
    if (!result.success) {
      throw new Error(result.error ?? `pipeline execution failed for ${call.requestId}`);
    }
    samples.push(Date.now() - start);
  }
  return summarize(samples);
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  iterations: number;
  direct: LatencyStats;
  pipeline: LatencyStats;
  delta: {
    avgMs: number;
    p95Ms: number;
    p99Ms: number;
  };
}): string {
  const lines: string[] = [];
  lines.push("# Pipeline Latency Impact Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Iterations: \`${input.iterations}\``);
  lines.push("");
  lines.push("| Path | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Min (ms) | Max (ms) |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  lines.push(
    `| Direct handler | ${input.direct.avg.toFixed(2)} | ${input.direct.p50.toFixed(2)} | ${input.direct.p95.toFixed(2)} | ${input.direct.p99.toFixed(2)} | ${input.direct.min.toFixed(2)} | ${input.direct.max.toFixed(2)} |`,
  );
  lines.push(
    `| Full pipeline | ${input.pipeline.avg.toFixed(2)} | ${input.pipeline.p50.toFixed(2)} | ${input.pipeline.p95.toFixed(2)} | ${input.pipeline.p99.toFixed(2)} | ${input.pipeline.min.toFixed(2)} | ${input.pipeline.max.toFixed(2)} |`,
  );
  lines.push("");
  lines.push("## Overhead");
  lines.push("");
  lines.push(`- Average overhead: \`${input.delta.avgMs.toFixed(2)} ms\``);
  lines.push(`- P95 overhead: \`${input.delta.p95Ms.toFixed(2)} ms\``);
  lines.push(`- P99 overhead: \`${input.delta.p99Ms.toFixed(2)} ms\``);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const [direct, pipeline] = await Promise.all([
    measureDirect(cli.iterations),
    measurePipeline(cli.iterations),
  ]);

  const delta = {
    avgMs: pipeline.avg - direct.avg,
    p95Ms: pipeline.p95 - direct.p95,
    p99Ms: pipeline.p99 - direct.p99,
  };

  const payload = {
    label: cli.label,
    createdAt: new Date().toISOString(),
    iterations: cli.iterations,
    direct,
    pipeline,
    delta,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.pipeline-latency.json`);
  const mdPath = join(cli.outDir, `${cli.label}.pipeline-latency.md`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    mdPath,
    renderMarkdown({
      label: payload.label,
      createdAt: payload.createdAt,
      iterations: payload.iterations,
      direct: payload.direct,
      pipeline: payload.pipeline,
      delta: payload.delta,
    }),
    "utf8",
  );

  console.log(`[pipeline-latency] wrote ${jsonPath}`);
  console.log(`[pipeline-latency] wrote ${mdPath}`);
}

void main();
