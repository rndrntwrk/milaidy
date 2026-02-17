#!/usr/bin/env -S node --import tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parseLearningTraceDataset,
} from "../../src/autonomy/learning/dataset-schema.js";
import {
  fromLearningTraceDataset,
  parseRLVRTrainingDataset,
  type RLVRTrainingDataset,
} from "../../src/autonomy/learning/training/dataset.js";
import {
  buildTrainingEnvironmentManifest,
  createTrainingEnvironmentConfig,
} from "../../src/autonomy/learning/training/environment.js";
import { TrainingJobOrchestrator } from "../../src/autonomy/learning/training/job-orchestrator.js";

interface CliArgs {
  datasetFile: string;
  outDir: string;
  label: string;
  envId: string;
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

  const datasetFile = args.get("dataset-file");
  if (!datasetFile) {
    throw new Error("Missing required argument: --dataset-file <path>");
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const label = args.get("label") ?? `training-job-${now}`;
  return {
    datasetFile: resolve(datasetFile),
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    label,
    envId: args.get("env-id") ?? `${label}-env`,
    seed: args.get("seed") ?? "training-job-seed",
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseDatasetPayload(raw: string): RLVRTrainingDataset {
  const parsed = JSON.parse(raw) as unknown;
  const record = asRecord(parsed);
  const candidate = record?.dataset ?? parsed;

  try {
    return parseRLVRTrainingDataset(candidate);
  } catch {
    return fromLearningTraceDataset(parseLearningTraceDataset(candidate));
  }
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  datasetFile: string;
  dataset: RLVRTrainingDataset;
  result: Awaited<ReturnType<TrainingJobOrchestrator["run"]>>;
}): string {
  const lines: string[] = [];
  lines.push("# Training Job Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Dataset file: \`${input.datasetFile}\``);
  lines.push(`- Dataset id: \`${input.dataset.id}\``);
  lines.push(`- Dataset examples: \`${input.dataset.examples.length}\``);
  lines.push(`- Job id: \`${input.result.jobId}\``);
  lines.push(`- Environment fingerprint: \`${input.result.environmentFingerprint}\``);
  lines.push(`- Training success: \`${input.result.training.success}\``);
  lines.push(
    `- Final average reward: \`${input.result.training.finalAverageReward.toFixed(4)}\``,
  );
  lines.push(
    `- Evaluation average reward: \`${input.result.evaluation.averageReward.toFixed(4)}\``,
  );
  lines.push("");
  lines.push("## Best Params");
  lines.push("");
  for (const [key, value] of Object.entries(input.result.bestParams)) {
    lines.push(`- ${key}: \`${value}\``);
  }
  lines.push("");
  lines.push("## Tuning Trials");
  lines.push("");
  lines.push("| Params | Score | Duration (ms) |");
  lines.push("|---|---:|---:|");
  for (const trial of input.result.tuning.trials) {
    lines.push(
      `| \`${JSON.stringify(trial.params)}\` | ${trial.score.toFixed(4)} | ${trial.durationMs} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const dataset = parseDatasetPayload(readFileSync(cli.datasetFile, "utf8"));
  const environment = createTrainingEnvironmentConfig({
    id: cli.envId,
    datasetFile: cli.datasetFile,
    outputDir: cli.outDir,
    seed: cli.seed,
  });
  const orchestrator = new TrainingJobOrchestrator();
  const result = await orchestrator.run({
    dataset,
    environment,
  });
  const manifest = buildTrainingEnvironmentManifest({
    environment,
    fingerprint: result.environmentFingerprint,
    job: {
      jobId: result.jobId,
      status: result.training.success ? "success" : "failed",
      startedAt: result.startedAt,
      completedAt: result.completedAt,
    },
  });

  const createdAt = new Date().toISOString();
  const payload = {
    label: cli.label,
    createdAt,
    datasetFile: cli.datasetFile,
    dataset,
    result,
    manifest,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.training-job.json`);
  const mdPath = join(cli.outDir, `${cli.label}.training-job.md`);
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(
    mdPath,
    `${renderMarkdown({
      label: cli.label,
      createdAt,
      datasetFile: cli.datasetFile,
      dataset,
      result,
    })}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        label: cli.label,
        datasetId: dataset.id,
        examples: dataset.examples.length,
        jobId: result.jobId,
        success: result.training.success,
        finalAverageReward: result.training.finalAverageReward,
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
  console.error(`[training-job] ${message}`);
  process.exitCode = 1;
});
