#!/usr/bin/env -S node --import tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { InMemoryGoalManager } from "../../src/autonomy/goals/manager.js";
import { RuleBasedDriftMonitor } from "../../src/autonomy/identity/drift-monitor.js";
import { FileBaselineHarness } from "../../src/autonomy/metrics/file-harness.js";
import { KernelScenarioEvaluator } from "../../src/autonomy/metrics/kernel-evaluator.js";
import { BUILTIN_SCENARIOS } from "../../src/autonomy/metrics/scenarios.js";
import {
  SOW_TARGETS,
  type BaselineMetrics,
  type MetricsDelta,
} from "../../src/autonomy/metrics/types.js";
import { MemoryGateImpl } from "../../src/autonomy/memory/gate.js";
import { RuleBasedTrustScorer } from "../../src/autonomy/trust/scorer.js";

interface CliArgs {
  outDir: string;
  storeDir: string;
  label: string;
  agentId: string;
  compareLabel?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const [, keyRaw] = token.split("--");
    if (!keyRaw) continue;
    const eq = keyRaw.indexOf("=");
    if (eq > -1) {
      args.set(keyRaw.slice(0, eq), keyRaw.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(keyRaw, next);
      i++;
      continue;
    }
    args.set(keyRaw, "true");
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    storeDir: resolve(args.get("store-dir") ?? "docs/ops/autonomy/reports/state"),
    label: args.get("label") ?? `baseline-${now}`,
    agentId: args.get("agent-id") ?? "autonomy-baseline-agent",
    compareLabel: args.get("compare"),
  };
}

function evaluateTargets(metrics: BaselineMetrics): Array<{
  metric: keyof typeof SOW_TARGETS;
  value: number;
  target: number;
  direction: "higher" | "lower";
  met: boolean;
}> {
  const rows: Array<{
    metric: keyof typeof SOW_TARGETS;
    value: number;
    target: number;
    direction: "higher" | "lower";
    met: boolean;
  }> = [];

  for (const metric of Object.keys(SOW_TARGETS) as Array<keyof typeof SOW_TARGETS>) {
    const target = SOW_TARGETS[metric];
    const value = metrics[metric];
    const met =
      target.direction === "higher"
        ? value >= target.target
        : value <= target.target;
    rows.push({
      metric,
      value,
      target: target.target,
      direction: target.direction,
      met,
    });
  }
  return rows;
}

function renderReportMarkdown(input: {
  label: string;
  agentId: string;
  metrics: BaselineMetrics;
  targets: ReturnType<typeof evaluateTargets>;
  compare?: MetricsDelta | null;
}): string {
  const lines: string[] = [];
  lines.push("# Baseline Measurement Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Agent ID: \`${input.agentId}\``);
  lines.push(`- Measured at: \`${new Date(input.metrics.measuredAt).toISOString()}\``);
  lines.push(`- Scenario count: \`${BUILTIN_SCENARIOS.length}\``);
  lines.push(`- Turn count: \`${input.metrics.turnCount}\``);
  lines.push("");
  lines.push("## Metric Results");
  lines.push("");
  lines.push("| Metric | Value | Target | Direction | Target Met |");
  lines.push("|---|---:|---:|---|---|");
  for (const row of input.targets) {
    lines.push(
      `| ${row.metric} | ${row.value.toFixed(4)} | ${row.target.toFixed(4)} | ${row.direction} | ${row.met ? "yes" : "no"} |`,
    );
  }

  if (input.compare) {
    lines.push("");
    lines.push("## Baseline Delta");
    lines.push("");
    lines.push(`- Compared against: \`${input.compare.baselineLabel}\``);
    lines.push(`- Overall improvement score: \`${input.compare.overallImprovement.toFixed(4)}\``);
    lines.push("");
    lines.push("| Metric | Baseline | Current | Delta | Direction | Target Met |");
    lines.push("|---|---:|---:|---:|---|---|");
    for (const delta of input.compare.deltas) {
      lines.push(
        `| ${delta.metric} | ${delta.baseline.toFixed(4)} | ${delta.current.toFixed(4)} | ${delta.delta.toFixed(4)} | ${delta.direction} | ${delta.targetMet ? "yes" : "no"} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This report is generated from kernel component evaluations without LLM calls.");
  lines.push("- Use repeated runs over a fixed window for stable baseline comparisons.");
  lines.push("- Mark SOW tasks done only after attaching this artifact plus dashboard and alert evidence.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const trustScorer = new RuleBasedTrustScorer();
  const memoryGate = new MemoryGateImpl(trustScorer);
  const driftMonitor = new RuleBasedDriftMonitor();
  const goalManager = new InMemoryGoalManager();
  const evaluator = new KernelScenarioEvaluator();
  const harness = new FileBaselineHarness(cli.storeDir, evaluator, {
    trustScorer,
    memoryGate,
    driftMonitor,
    goalManager,
  });

  const metrics = await harness.measure(cli.agentId, BUILTIN_SCENARIOS);
  await harness.snapshot(metrics, cli.label);

  const compare = cli.compareLabel
    ? await harness.compare(metrics, cli.compareLabel)
    : null;
  const targets = evaluateTargets(metrics);

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.baseline.json`);
  const mdPath = join(cli.outDir, `${cli.label}.baseline.md`);

  const payload = {
    label: cli.label,
    agentId: cli.agentId,
    scenarios: BUILTIN_SCENARIOS.map((s) => ({
      id: s.id,
      metric: s.metric,
      turns: s.turns,
    })),
    metrics,
    targets,
    compare,
  };

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    mdPath,
    renderReportMarkdown({
      label: cli.label,
      agentId: cli.agentId,
      metrics,
      targets,
      compare,
    }),
    "utf8",
  );

  console.log(`[baseline] wrote ${jsonPath}`);
  console.log(`[baseline] wrote ${mdPath}`);
  if (cli.compareLabel && !compare) {
    console.warn(
      `[baseline] compare label "${cli.compareLabel}" was not found in snapshots`,
    );
  }
}

void main();
