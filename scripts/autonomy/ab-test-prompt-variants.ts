#!/usr/bin/env -S node --import tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDefaultAutonomyIdentity } from "../../src/autonomy/identity/schema.js";
import { BUILTIN_SCENARIOS } from "../../src/autonomy/metrics/scenarios.js";
import {
  evaluatePromptVariantsOnHeldOutScenarios,
} from "../../src/autonomy/learning/prompt-variant-evaluator.js";

interface CliArgs {
  outDir: string;
  label: string;
  holdoutRatio: number;
  seed: string;
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
  const holdoutRatioRaw = Number(args.get("holdout-ratio") ?? "0.3");
  const holdoutRatio = Number.isFinite(holdoutRatioRaw)
    ? Math.max(0.1, Math.min(0.9, holdoutRatioRaw))
    : 0.3;

  return {
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    label: args.get("label") ?? `prompt-ab-${now}`,
    holdoutRatio,
    seed: args.get("seed") ?? "prompt-ab",
  };
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  holdoutScenarioIds: string[];
  winner: string;
  variantScores: Array<{
    variant: string;
    overallScore: number;
    scenarioCount: number;
    metricScores: Record<string, number>;
  }>;
}): string {
  const lines: string[] = [];
  lines.push("# Prompt Variant A/B Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Held-out scenarios: \`${input.holdoutScenarioIds.length}\``);
  lines.push(`- Winner: \`${input.winner}\``);
  lines.push("");
  lines.push("## Variant Scores");
  lines.push("");
  lines.push("| Variant | Overall Score | Scenario Count |");
  lines.push("|---|---:|---:|");
  for (const score of input.variantScores) {
    lines.push(
      `| ${score.variant} | ${score.overallScore.toFixed(4)} | ${score.scenarioCount} |`,
    );
  }
  lines.push("");
  lines.push("## Held-Out Scenario IDs");
  lines.push("");
  for (const scenarioId of input.holdoutScenarioIds) {
    lines.push(`- \`${scenarioId}\``);
  }
  lines.push("");
  lines.push("## Metric Breakdown");
  lines.push("");
  const metricKeys = Array.from(
    new Set(
      input.variantScores.flatMap((score) => Object.keys(score.metricScores)),
    ),
  ).sort();
  lines.push(`| Variant | ${metricKeys.join(" | ")} |`);
  lines.push(`|---|${metricKeys.map(() => "---:").join("|")}|`);
  for (const score of input.variantScores) {
    const values = metricKeys.map((metric) => {
      const value = score.metricScores[metric];
      return typeof value === "number" ? value.toFixed(4) : "n/a";
    });
    lines.push(`| ${score.variant} | ${values.join(" | ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const identity = createDefaultAutonomyIdentity({
    name: "autonomy-prompt-eval",
  });
  const result = evaluatePromptVariantsOnHeldOutScenarios({
    identity,
    scenarios: BUILTIN_SCENARIOS,
    options: {
      holdoutRatio: cli.holdoutRatio,
      seed: cli.seed,
    },
  });
  const createdAt = new Date().toISOString();

  const payload = {
    label: cli.label,
    createdAt,
    holdoutRatio: cli.holdoutRatio,
    scenarioUniverse: BUILTIN_SCENARIOS.length,
    ...result,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.prompt-ab.json`);
  const mdPath = join(cli.outDir, `${cli.label}.prompt-ab.md`);
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(
    mdPath,
    `${renderMarkdown({
      label: cli.label,
      createdAt,
      holdoutScenarioIds: result.holdOutScenarioIds,
      winner: result.winner,
      variantScores: result.variantScores.map((score) => ({
        variant: score.variant,
        overallScore: score.overallScore,
        scenarioCount: score.scenarioCount,
        metricScores: score.metricScores,
      })),
    })}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        label: cli.label,
        holdoutRatio: cli.holdoutRatio,
        holdoutCount: result.holdOutScenarioIds.length,
        winner: result.winner,
        report: mdPath,
        json: jsonPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[prompt-ab] ${message}`);
  process.exitCode = 1;
});
