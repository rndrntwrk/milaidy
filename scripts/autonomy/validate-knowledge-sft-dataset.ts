#!/usr/bin/env -S node --import tsx

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

const RecordSchema = z.object({
  id: z.string().min(1),
  messages: z.tuple([MessageSchema, MessageSchema, MessageSchema]),
  metadata: z.object({
    kind: z.enum(["doc_summary", "section_summary"]),
    sourcePath: z.string().min(1),
    sourceRoot: z.string().min(1),
    docId: z.string().min(1),
    title: z.string().min(1),
    domain: z.string().min(1),
    heading: z.string().optional(),
    generatedAt: z.string().min(1),
    splitKey: z.string().min(1),
  }),
});

const SplitManifestSchema = z.object({
  path: z.string().min(1),
  count: z.number().int().min(0),
  sha256: z.string().min(1),
});

const ManifestSchema = z.object({
  version: z.string().min(1),
  label: z.string().min(1),
  seed: z.string().min(1),
  generatedAt: z.string().min(1),
  sourceRoots: z.array(z.string().min(1)),
  documentsAnalyzed: z.number().int().min(0),
  examplesGenerated: z.number().int().min(0),
  examplesDeduplicated: z.number().int().min(0),
  splitRatios: z.object({
    train: z.number().min(0),
    val: z.number().min(0),
    test: z.number().min(0),
  }),
  splits: z.object({
    train: SplitManifestSchema,
    val: SplitManifestSchema,
    test: SplitManifestSchema,
  }),
  policyRefs: z.array(z.string()),
});

type SplitName = "train" | "val" | "test";

interface CliArgs {
  manifestPath: string;
  reportDir: string;
  minDocuments: number;
  minExamples: number;
  minAttributionCoverage: number;
  maxCrossSplitDuplicateRate: number;
  maxLongResponseRate: number;
  maxAssistantChars: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i++;
      continue;
    }
    args.set(key, "true");
  }

  const manifestArg = args.get("manifest");
  if (!manifestArg) {
    throw new Error("Missing required argument: --manifest <path>");
  }

  const manifestPath = resolve(manifestArg);
  const reportDir = resolve(args.get("report-dir") ?? dirname(manifestPath));

  return {
    manifestPath,
    reportDir,
    minDocuments: parsePositiveInt(args.get("min-documents"), 25),
    minExamples: parsePositiveInt(args.get("min-examples"), 100),
    minAttributionCoverage: parseBoundedFloat(
      args.get("min-attribution-coverage"),
      0.95,
      0,
      1,
    ),
    maxCrossSplitDuplicateRate: parseBoundedFloat(
      args.get("max-cross-split-duplicate-rate"),
      0.01,
      0,
      1,
    ),
    maxLongResponseRate: parseBoundedFloat(
      args.get("max-long-response-rate"),
      0.02,
      0,
      1,
    ),
    maxAssistantChars: parsePositiveInt(args.get("max-assistant-chars"), 3500),
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoundedFloat(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sha256(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function loadManifest(path: string): z.infer<typeof ManifestSchema> {
  const raw = readFileSync(path, "utf8");
  return ManifestSchema.parse(JSON.parse(raw));
}

function readSplitRows(path: string): string[] {
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function ensureFileIntegrity(
  split: SplitName,
  splitManifest: z.infer<typeof SplitManifestSchema>,
): { rows: z.infer<typeof RecordSchema>[]; errors: string[] } {
  const rows = readSplitRows(splitManifest.path);
  const payload = rows.length > 0 ? `${rows.join("\n")}\n` : "";
  const digest = sha256(payload);
  const errors: string[] = [];

  if (rows.length !== splitManifest.count) {
    errors.push(
      `${split}: count mismatch (manifest=${splitManifest.count}, actual=${rows.length})`,
    );
  }
  if (digest !== splitManifest.sha256) {
    errors.push(`${split}: sha256 mismatch`);
  }

  const parsed: z.infer<typeof RecordSchema>[] = [];
  rows.forEach((line, index) => {
    try {
      const value = JSON.parse(line);
      const record = RecordSchema.parse(value);
      if (record.messages[0].role !== "system") {
        errors.push(`${split}: row ${index + 1} first role must be system`);
      }
      if (record.messages[1].role !== "user") {
        errors.push(`${split}: row ${index + 1} second role must be user`);
      }
      if (record.messages[2].role !== "assistant") {
        errors.push(`${split}: row ${index + 1} third role must be assistant`);
      }
      parsed.push(record);
    } catch (err) {
      errors.push(
        `${split}: row ${index + 1} parse/schema error (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  });

  return { rows: parsed, errors };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(cli.manifestPath);

  const splitResults: Record<
    SplitName,
    { rows: z.infer<typeof RecordSchema>[]; errors: string[] }
  > = {
    train: ensureFileIntegrity("train", manifest.splits.train),
    val: ensureFileIntegrity("val", manifest.splits.val),
    test: ensureFileIntegrity("test", manifest.splits.test),
  };

  const integrityErrors = [
    ...splitResults.train.errors,
    ...splitResults.val.errors,
    ...splitResults.test.errors,
  ];

  const allRows = [
    ...splitResults.train.rows.map((row) => ({ split: "train" as const, row })),
    ...splitResults.val.rows.map((row) => ({ split: "val" as const, row })),
    ...splitResults.test.rows.map((row) => ({ split: "test" as const, row })),
  ];

  const totalExamples = allRows.length;
  const attributionCount = allRows.filter((entry) =>
    entry.row.messages[2].content.includes("[source:"),
  ).length;
  const attributionCoverage =
    totalExamples === 0 ? 0 : attributionCount / totalExamples;

  const longAssistantCount = allRows.filter(
    (entry) => entry.row.messages[2].content.length > cli.maxAssistantChars,
  ).length;
  const longAssistantRate =
    totalExamples === 0 ? 0 : longAssistantCount / totalExamples;

  const promptSplitMap = new Map<string, Set<SplitName>>();
  for (const entry of allRows) {
    const prompt = entry.row.messages[1].content.trim();
    const set = promptSplitMap.get(prompt) ?? new Set<SplitName>();
    set.add(entry.split);
    promptSplitMap.set(prompt, set);
  }
  let crossSplitDuplicateCount = 0;
  for (const splitSet of promptSplitMap.values()) {
    if (splitSet.size > 1) crossSplitDuplicateCount++;
  }
  const crossSplitDuplicateRate =
    promptSplitMap.size === 0
      ? 0
      : crossSplitDuplicateCount / promptSplitMap.size;

  const gateChecks = [
    {
      name: "min_documents",
      pass: manifest.documentsAnalyzed >= cli.minDocuments,
      actual: manifest.documentsAnalyzed,
      threshold: cli.minDocuments,
    },
    {
      name: "min_examples",
      pass: totalExamples >= cli.minExamples,
      actual: totalExamples,
      threshold: cli.minExamples,
    },
    {
      name: "attribution_coverage",
      pass: attributionCoverage >= cli.minAttributionCoverage,
      actual: attributionCoverage,
      threshold: cli.minAttributionCoverage,
    },
    {
      name: "cross_split_duplicate_rate",
      pass: crossSplitDuplicateRate <= cli.maxCrossSplitDuplicateRate,
      actual: crossSplitDuplicateRate,
      threshold: cli.maxCrossSplitDuplicateRate,
    },
    {
      name: "long_response_rate",
      pass: longAssistantRate <= cli.maxLongResponseRate,
      actual: longAssistantRate,
      threshold: cli.maxLongResponseRate,
    },
    {
      name: "integrity_errors",
      pass: integrityErrors.length === 0,
      actual: integrityErrors.length,
      threshold: 0,
    },
    {
      name: "non_empty_splits",
      pass:
        manifest.splits.train.count > 0 &&
        manifest.splits.val.count > 0 &&
        manifest.splits.test.count > 0,
      actual: {
        train: manifest.splits.train.count,
        val: manifest.splits.val.count,
        test: manifest.splits.test.count,
      },
      threshold: "> 0 for each split",
    },
  ];

  const failed = gateChecks.filter((gate) => !gate.pass);
  const verdict = failed.length === 0 ? "pass" : "fail";

  mkdirSync(cli.reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonReportPath = resolve(
    cli.reportDir,
    `${manifest.label}.gate-report.${stamp}.json`,
  );
  const markdownReportPath = resolve(
    cli.reportDir,
    `${manifest.label}.gate-report.${stamp}.md`,
  );

  const jsonReport = {
    verdict,
    manifest: cli.manifestPath,
    generatedAt: new Date().toISOString(),
    gates: gateChecks,
    metrics: {
      documentsAnalyzed: manifest.documentsAnalyzed,
      totalExamples,
      attributionCoverage,
      crossSplitDuplicateRate,
      longAssistantRate,
      integrityErrorCount: integrityErrors.length,
    },
    integrityErrors,
  };
  writeFileSync(jsonReportPath, `${JSON.stringify(jsonReport, null, 2)}\n`, "utf8");

  const mdLines = [
    "# Knowledge SFT Gate Report",
    "",
    `- Verdict: **${verdict.toUpperCase()}**`,
    `- Manifest: \`${cli.manifestPath}\``,
    `- Generated at: \`${jsonReport.generatedAt}\``,
    "",
    "## Metrics",
    "",
    `- Documents analyzed: \`${manifest.documentsAnalyzed}\``,
    `- Total examples: \`${totalExamples}\``,
    `- Attribution coverage: \`${(attributionCoverage * 100).toFixed(2)}%\``,
    `- Cross-split duplicate rate: \`${(crossSplitDuplicateRate * 100).toFixed(2)}%\``,
    `- Long response rate: \`${(longAssistantRate * 100).toFixed(2)}%\``,
    `- Integrity errors: \`${integrityErrors.length}\``,
    "",
    "## Gate Checks",
    "",
    "| Gate | Pass | Actual | Threshold |",
    "|---|---|---|---|",
    ...gateChecks.map(
      (gate) =>
        `| ${gate.name} | ${gate.pass ? "yes" : "no"} | \`${typeof gate.actual === "number" ? gate.actual : JSON.stringify(gate.actual)}\` | \`${typeof gate.threshold === "number" ? gate.threshold : String(gate.threshold)}\` |`,
    ),
  ];

  if (integrityErrors.length > 0) {
    mdLines.push("", "## Integrity Errors", "");
    for (const err of integrityErrors) mdLines.push(`- ${err}`);
  }

  writeFileSync(markdownReportPath, `${mdLines.join("\n")}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: verdict === "pass",
        verdict,
        manifest: cli.manifestPath,
        report: {
          json: jsonReportPath,
          markdown: markdownReportPath,
        },
      },
      null,
      2,
    ),
  );

  if (verdict !== "pass") process.exitCode = 2;
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[knowledge-sft-validate] ${message}`);
  process.exitCode = 1;
});

