#!/usr/bin/env -S node --import tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  extractLearningTraceDatasetFromEvents,
  type EventLogEntry,
} from "../../src/autonomy/learning/event-log-extractor.js";

interface CliArgs {
  eventsFile: string;
  outDir: string;
  label: string;
  datasetId?: string;
  createdAt?: number;
  includeFailed: boolean;
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

  const eventsFile = args.get("events-file");
  if (!eventsFile) {
    throw new Error("Missing required argument: --events-file <path>");
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const createdAtRaw = Number(args.get("created-at") ?? "NaN");

  return {
    eventsFile: resolve(eventsFile),
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    label: args.get("label") ?? `learning-dataset-${now}`,
    datasetId: args.get("dataset-id"),
    createdAt: Number.isFinite(createdAtRaw) ? createdAtRaw : undefined,
    includeFailed: args.get("include-failed") !== "false",
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toTimestamp(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric !== undefined) return numeric;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

function normalizeEvent(value: unknown): EventLogEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const requestId = asString(record.requestId) ?? asString(record.request_id);
  const type = asString(record.type);
  if (!requestId || !type) return null;

  const payloadValue = record.payload;
  let payload: Record<string, unknown> | undefined = asRecord(payloadValue);
  if (!payload && typeof payloadValue === "string" && payloadValue.length > 0) {
    try {
      payload = asRecord(JSON.parse(payloadValue));
    } catch {
      payload = undefined;
    }
  }

  return {
    requestId,
    type,
    payload,
    timestamp:
      toTimestamp(record.timestamp) ??
      toTimestamp(record.createdAt) ??
      toTimestamp(record.created_at),
    correlationId:
      asString(record.correlationId) ?? asString(record.correlation_id),
  };
}

function parseEventFile(raw: string): EventLogEntry[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeEvent).filter((event) => event !== null);
    }
    const wrapper = asRecord(parsed);
    const wrappedEvents = wrapper?.events;
    if (Array.isArray(wrappedEvents)) {
      return wrappedEvents
        .map(normalizeEvent)
        .filter((event) => event !== null);
    }
  } catch {
    // Fall back to JSONL parsing.
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return normalizeEvent(JSON.parse(line));
      } catch {
        return null;
      }
    })
    .filter((event) => event !== null);
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  sourceFile: string;
  sourceEventCount: number;
  dataset: ReturnType<typeof extractLearningTraceDatasetFromEvents>;
}): string {
  const successCount = input.dataset.examples.filter(
    (example) => example.labels.taskOutcome === "success",
  ).length;
  const partialCount = input.dataset.examples.filter(
    (example) => example.labels.taskOutcome === "partial",
  ).length;
  const failCount = input.dataset.examples.filter(
    (example) => example.labels.taskOutcome === "fail",
  ).length;
  const meanReward =
    input.dataset.examples.length === 0
      ? 0
      : input.dataset.examples.reduce((sum, example) => sum + example.reward, 0) /
        input.dataset.examples.length;

  const lines: string[] = [];
  lines.push("# Learning Dataset Extraction Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Source file: \`${input.sourceFile}\``);
  lines.push(`- Source events parsed: \`${input.sourceEventCount}\``);
  lines.push(`- Dataset id: \`${input.dataset.id}\``);
  lines.push(`- Extracted examples: \`${input.dataset.examples.length}\``);
  lines.push(`- Mean reward: \`${meanReward.toFixed(4)}\``);
  lines.push(`- Outcomes: success=\`${successCount}\`, partial=\`${partialCount}\`, fail=\`${failCount}\``);
  lines.push("");
  lines.push("| Example ID | Request ID | Tool | Outcome | Verification | Policy | Safety | Reward |");
  lines.push("|---|---|---|---|---|---|---|---:|");
  for (const example of input.dataset.examples) {
    lines.push(
      `| ${example.id} | ${example.requestId} | ${example.toolName} | ${example.labels.taskOutcome} | ${example.labels.verificationAlignment} | ${example.labels.policyCompliance} | ${example.labels.safetyRisk} | ${example.reward.toFixed(4)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const rawEvents = parseEventFile(readFileSync(cli.eventsFile, "utf8"));
  const dataset = extractLearningTraceDatasetFromEvents(rawEvents, {
    label: cli.label,
    datasetId: cli.datasetId,
    createdAt: cli.createdAt,
    includeFailed: cli.includeFailed,
  });

  const payload = {
    label: cli.label,
    createdAt: new Date().toISOString(),
    sourceFile: cli.eventsFile,
    sourceEventCount: rawEvents.length,
    dataset,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.learning-dataset.json`);
  const mdPath = join(cli.outDir, `${cli.label}.learning-dataset.md`);

  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(
    mdPath,
    `${renderMarkdown({
      label: payload.label,
      createdAt: payload.createdAt,
      sourceFile: payload.sourceFile,
      sourceEventCount: payload.sourceEventCount,
      dataset,
    })}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        label: payload.label,
        sourceEventCount: payload.sourceEventCount,
        extractedExamples: payload.dataset.examples.length,
        datasetId: payload.dataset.id,
        json: jsonPath,
        report: mdPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[learning-dataset] ${message}`);
  process.exitCode = 1;
});
