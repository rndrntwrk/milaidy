#!/usr/bin/env -S node --import tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildBaselineRetrievalQualityTasks,
  evaluateRetrievalQuality,
  type RetrievalQualitySummary,
} from "../../src/autonomy/memory/retrieval-quality.js";

interface CliArgs {
  outDir: string;
  label: string;
  topN: number;
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
  const topNRaw = Number(args.get("top-n") ?? "2");
  const topN = Number.isFinite(topNRaw) ? Math.max(1, Math.floor(topNRaw)) : 2;

  return {
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    label: args.get("label") ?? `retrieval-quality-${now}`,
    topN,
  };
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  summary: RetrievalQualitySummary;
}): string {
  const { summary } = input;
  const lines: string[] = [];
  lines.push("# Retrieval Quality Validation Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Top N: \`${summary.topN}\``);
  lines.push(`- Tasks: \`${summary.taskCount}\``);
  lines.push(
    `- Trust-aware average Recall@N: \`${summary.averageRecallAtN.toFixed(4)}\``,
  );
  lines.push(
    `- Baseline average Recall@N: \`${summary.baselineAverageRecallAtN.toFixed(4)}\``,
  );
  lines.push(
    `- Delta vs baseline: \`${summary.deltaFromBaseline >= 0 ? "+" : ""}${summary.deltaFromBaseline.toFixed(4)}\``,
  );
  lines.push("");
  lines.push("| Task | Trust-Aware Recall@N | Baseline Recall@N | Delta |");
  lines.push("|---|---:|---:|---:|");
  for (const task of summary.taskResults) {
    const delta = task.recallAtN - task.baselineRecallAtN;
    lines.push(
      `| ${task.taskId} | ${task.recallAtN.toFixed(4)} | ${task.baselineRecallAtN.toFixed(4)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(4)} |`,
    );
  }
  lines.push("");
  lines.push("## Task Details");
  lines.push("");
  for (const task of summary.taskResults) {
    lines.push(`### ${task.taskId}`);
    lines.push("");
    lines.push(`- Description: ${task.description}`);
    lines.push(`- Relevant IDs: \`${task.relevantMemoryIds.join(", ")}\``);
    lines.push(`- Trust-aware top IDs: \`${task.topMemoryIds.join(", ")}\``);
    lines.push(
      `- Baseline top IDs: \`${task.baselineTopMemoryIds.join(", ")}\``,
    );
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const tasks = buildBaselineRetrievalQualityTasks();
  const summary = await evaluateRetrievalQuality(tasks, { topN: cli.topN });

  const createdAt = new Date().toISOString();
  const payload = {
    label: cli.label,
    createdAt,
    summary,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.retrieval-quality.json`);
  const mdPath = join(cli.outDir, `${cli.label}.retrieval-quality.md`);
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(
    mdPath,
    `${renderMarkdown({
      label: cli.label,
      createdAt,
      summary,
    })}\n`,
    "utf8",
  );

  if (summary.deltaFromBaseline < 0) {
    throw new Error(
      `Retrieval quality regressed vs baseline (delta=${summary.deltaFromBaseline.toFixed(4)})`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        label: cli.label,
        topN: summary.topN,
        taskCount: summary.taskCount,
        recallAtN: summary.averageRecallAtN,
        baselineRecallAtN: summary.baselineAverageRecallAtN,
        delta: summary.deltaFromBaseline,
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
  console.error(`[retrieval-quality] ${message}`);
  process.exitCode = 1;
});
