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
  type EvaluationScenario,
  type MetricsDelta,
} from "../../src/autonomy/metrics/types.js";
import { MemoryGateImpl } from "../../src/autonomy/memory/gate.js";
import { RuleBasedTrustScorer } from "../../src/autonomy/trust/scorer.js";

interface CliArgs {
  outDir: string;
  storeDir: string;
  label: string;
  agentId: string;
  cycles: number;
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
  const cycles = Math.max(1, Number(args.get("cycles") ?? "12"));

  return {
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    storeDir: resolve(args.get("store-dir") ?? "docs/ops/autonomy/reports/state"),
    label: args.get("label") ?? `long-horizon-${now}`,
    agentId: args.get("agent-id") ?? "autonomy-long-horizon-agent",
    cycles,
    compareLabel: args.get("compare") ?? "baseline-sprint1-smoke",
  };
}

function buildLongHorizonScenarios(cycles: number): EvaluationScenario[] {
  const expanded: EvaluationScenario[] = [];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    for (const scenario of BUILTIN_SCENARIOS) {
      expanded.push({
        ...scenario,
        id: `${scenario.id}::cycle-${cycle}`,
        description: `${scenario.description} [cycle ${cycle}/${cycles}]`,
      });
    }
  }
  return expanded;
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
  cycles: number;
  scenarioCount: number;
  metrics: BaselineMetrics;
  targets: ReturnType<typeof evaluateTargets>;
  compare?: MetricsDelta | null;
}): string {
  const lines: string[] = [];
  lines.push("# Long-Horizon Baseline Comparison");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Agent ID: \`${input.agentId}\``);
  lines.push(`- Measured at: \`${new Date(input.metrics.measuredAt).toISOString()}\``);
  lines.push(`- Cycles: \`${input.cycles}\``);
  lines.push(`- Scenario count: \`${input.scenarioCount}\``);
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
  lines.push("- Long-horizon runs replicate the full scenario catalog across multiple cycles.");
  lines.push("- Use fixed compare labels to track regressions against baseline over time.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const scenarios = buildLongHorizonScenarios(cli.cycles);

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

  const metrics = await harness.measure(cli.agentId, scenarios);
  await harness.snapshot(metrics, cli.label);
  const compare = cli.compareLabel
    ? await harness.compare(metrics, cli.compareLabel)
    : null;
  const targets = evaluateTargets(metrics);

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.long-horizon.json`);
  const mdPath = join(cli.outDir, `${cli.label}.long-horizon.md`);

  const payload = {
    label: cli.label,
    agentId: cli.agentId,
    cycles: cli.cycles,
    scenarioCount: scenarios.length,
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
      cycles: cli.cycles,
      scenarioCount: scenarios.length,
      metrics,
      targets,
      compare,
    }),
    "utf8",
  );

  console.log(`[long-horizon] wrote ${jsonPath}`);
  console.log(`[long-horizon] wrote ${mdPath}`);
  if (cli.compareLabel && !compare) {
    console.warn(
      `[long-horizon] compare label "${cli.compareLabel}" was not found in snapshots`,
    );
  }
}

void main();
