#!/usr/bin/env -S node --import tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { InMemoryGoalManager } from "../../src/autonomy/goals/manager.js";
import { RuleBasedDriftMonitor } from "../../src/autonomy/identity/drift-monitor.js";
import { KernelScenarioEvaluator } from "../../src/autonomy/metrics/kernel-evaluator.js";
import { BUILTIN_SCENARIOS } from "../../src/autonomy/metrics/scenarios.js";
import { SOW_TARGETS } from "../../src/autonomy/metrics/types.js";
import { MemoryGateImpl } from "../../src/autonomy/memory/gate.js";
import { RuleBasedTrustScorer } from "../../src/autonomy/trust/scorer.js";

interface CliArgs {
  outDir: string;
  label: string;
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
    label: args.get("label") ?? `redteam-${now}`,
  };
}

function renderMarkdown(input: {
  label: string;
  measuredAt: string;
  target: number;
  overallResistance: number;
  rows: Array<{
    scenarioId: string;
    score: number;
    attackSuccessRate: number;
    details?: string;
  }>;
}): string {
  const lines: string[] = [];
  lines.push("# Memory Poisoning Red-Team Baseline");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Measured at: \`${input.measuredAt}\``);
  lines.push(`- SOW target (memoryPoisoningResistance): \`${input.target.toFixed(4)}\``);
  lines.push(`- Overall resistance: \`${input.overallResistance.toFixed(4)}\``);
  lines.push(`- Overall attack success rate: \`${(1 - input.overallResistance).toFixed(4)}\``);
  lines.push("");
  lines.push("| Scenario | Resistance Score | Attack Success Rate | Notes |");
  lines.push("|---|---:|---:|---|");
  for (const row of input.rows) {
    lines.push(
      `| ${row.scenarioId} | ${row.score.toFixed(4)} | ${row.attackSuccessRate.toFixed(4)} | ${row.details ?? ""} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- `Resistance Score` is the fraction of malicious memory writes blocked.");
  lines.push("- `Attack Success Rate` is `1 - Resistance Score`.");
  lines.push("- Track this report over time to detect regressions after kernel changes.");
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

  const scenarios = BUILTIN_SCENARIOS.filter(
    (s) => s.metric === "memoryPoisoningResistance",
  );
  if (scenarios.length === 0) {
    throw new Error("No memoryPoisoningResistance scenarios found");
  }

  const rows: Array<{
    scenarioId: string;
    score: number;
    attackSuccessRate: number;
    details?: string;
  }> = [];

  for (const scenario of scenarios) {
    const result = await evaluator.evaluate(scenario, {
      trustScorer,
      memoryGate,
      driftMonitor,
      goalManager,
    });
    rows.push({
      scenarioId: scenario.id,
      score: result.score,
      attackSuccessRate: 1 - result.score,
      details: result.details,
    });
  }

  const overallResistance =
    rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
  const measuredAt = new Date().toISOString();
  const target = SOW_TARGETS.memoryPoisoningResistance.target;

  const payload = {
    label: cli.label,
    measuredAt,
    target,
    overallResistance,
    overallAttackSuccessRate: 1 - overallResistance,
    scenarios: rows,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.redteam.json`);
  const mdPath = join(cli.outDir, `${cli.label}.redteam.md`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    mdPath,
    renderMarkdown({
      label: cli.label,
      measuredAt,
      target,
      overallResistance,
      rows,
    }),
    "utf8",
  );

  console.log(`[redteam] wrote ${jsonPath}`);
  console.log(`[redteam] wrote ${mdPath}`);
}

void main();

