#!/usr/bin/env -S node --import tsx

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import yaml from "yaml";

type SplitName = "train" | "val" | "test";

type ExampleRole = "system" | "user" | "assistant";

interface SftMessage {
  role: ExampleRole;
  content: string;
}

interface SftExampleRecord {
  id: string;
  messages: [SftMessage, SftMessage, SftMessage];
  metadata: {
    kind: "doc_summary" | "section_summary";
    sourcePath: string;
    sourceRoot: string;
    docId: string;
    title: string;
    domain: string;
    heading?: string;
    generatedAt: string;
    splitKey: string;
  };
}

interface SectionSummary {
  heading: string;
  body: string;
}

interface MarkdownDocument {
  absPath: string;
  relPath: string;
  sourceRoot: string;
  docId: string;
  title: string;
  domain: string;
  status: string;
  body: string;
  sections: SectionSummary[];
}

interface SplitManifest {
  path: string;
  count: number;
  sha256: string;
}

interface DatasetManifest {
  version: string;
  label: string;
  seed: string;
  generatedAt: string;
  sourceRoots: string[];
  documentsAnalyzed: number;
  examplesGenerated: number;
  examplesDeduplicated: number;
  splitRatios: {
    train: number;
    val: number;
    test: number;
  };
  splits: Record<SplitName, SplitManifest>;
  policyRefs: string[];
}

interface CliArgs {
  inputs: string[];
  outDir: string;
  label: string;
  seed: string;
  maxSectionsPerDoc: number;
  minSectionChars: number;
  trainRatio: number;
  valRatio: number;
  testRatio: number;
  manifestPath?: string;
}

const SYSTEM_PROMPT =
  "You are Alice, an exacting operator assistant. Use only provided canonical context. Never invent missing facts. Cite sources with [source: path#anchor].";

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const inputs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      inputs.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i++;
      continue;
    }
    args.set(key, "true");
  }

  const outDir = resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports");
  const label =
    args.get("label") ??
    `knowledge-sft-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const seed = args.get("seed") ?? "alice-knowledge-sft-v1";

  const maxSectionsPerDoc = parsePositiveInt(args.get("max-sections"), 8);
  const minSectionChars = parsePositiveInt(args.get("min-section-chars"), 160);
  const trainRatio = parsePositiveFloat(args.get("train-ratio"), 0.8);
  const valRatio = parsePositiveFloat(args.get("val-ratio"), 0.1);
  const testRatio = parsePositiveFloat(args.get("test-ratio"), 0.1);

  const ratioSum = trainRatio + valRatio + testRatio;
  if (Math.abs(ratioSum - 1) > 0.0001) {
    throw new Error(
      `Split ratios must sum to 1.0 (got ${ratioSum.toFixed(4)}).`,
    );
  }

  return {
    inputs: inputs.length > 0 ? inputs : ["knowledge"],
    outDir,
    label,
    seed,
    maxSectionsPerDoc,
    minSectionChars,
    trainRatio,
    valRatio,
    testRatio,
    manifestPath: args.get("manifest-path")
      ? resolve(args.get("manifest-path") as string)
      : undefined,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePositiveFloat(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function splitFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---\n")) return { frontmatter: {}, body: content };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: {}, body: content };
  const raw = content.slice(4, end);
  const body = content.slice(end + 5);
  try {
    const parsed = yaml.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { frontmatter: parsed as Record<string, unknown>, body };
    }
  } catch {
    // Keep body even when frontmatter is invalid.
  }
  return { frontmatter: {}, body };
}

function compactWhitespace(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/!\[(.*?)\]\((.*?)\)/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferTitle(
  relPath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const fmTitle = frontmatter.title;
  if (typeof fmTitle === "string" && fmTitle.trim().length > 0) {
    return fmTitle.trim();
  }
  const heading = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));
  if (heading) return heading.replace(/^#\s+/, "").trim();
  const stem = basename(relPath, extname(relPath));
  return stem
    .split(/[_-]+/g)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function inferDomain(
  relPath: string,
  frontmatter: Record<string, unknown>,
): string {
  const fmDomain = frontmatter.domain;
  if (typeof fmDomain === "string" && fmDomain.trim().length > 0) {
    return fmDomain.trim();
  }
  const first = relPath.split(/[\\/]/)[0] ?? "knowledge";
  return first.replace(/^\d+_/, "") || "knowledge";
}

function inferDocId(
  relPath: string,
  frontmatter: Record<string, unknown>,
): string {
  const fmDocId = frontmatter.doc_id;
  if (typeof fmDocId === "string" && fmDocId.trim().length > 0) {
    return slugify(fmDocId.trim());
  }
  return slugify(relPath.replace(/[\\/]/g, "-").replace(/\.md$/i, ""));
}

function inferStatus(frontmatter: Record<string, unknown>): string {
  const status = frontmatter.status;
  if (typeof status === "string" && status.trim().length > 0) {
    return status.trim().toLowerCase();
  }
  return "draft";
}

function parseSections(body: string): SectionSummary[] {
  const normalized = compactWhitespace(body);
  const lines = normalized.split("\n");
  const sections: SectionSummary[] = [];
  let currentHeading = "Overview";
  let chunk: string[] = [];

  const flush = () => {
    const text = compactWhitespace(chunk.join("\n"));
    if (!text) return;
    sections.push({ heading: currentHeading, body: text });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2].trim();
      chunk = [];
      continue;
    }
    chunk.push(line);
  }
  flush();
  return sections;
}

async function collectMarkdownFiles(root: string): Promise<string[]> {
  const stats = statSync(root);
  if (stats.isFile()) {
    return root.endsWith(".md") ? [root] : [];
  }
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const next = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(next)));
      continue;
    }
    if (entry.isFile() && next.endsWith(".md")) files.push(next);
  }
  return files;
}

function stableSplit(seed: string, key: string, ratios: CliArgs): SplitName {
  const hash = createHash("sha256").update(`${seed}:${key}`).digest("hex");
  const value = Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  if (value < ratios.trainRatio) return "train";
  if (value < ratios.trainRatio + ratios.valRatio) return "val";
  return "test";
}

function hashFileContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function buildDocSummary(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => compactWhitespace(block))
    .filter(Boolean);
  return truncate(paragraphs.slice(0, 2).join("\n\n"), 900);
}

function sectionResponse(text: string): string {
  return truncate(text, 1000);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const sourceRoots = cli.inputs.map((input) => resolve(input));
  const docs: MarkdownDocument[] = [];

  for (const root of sourceRoots) {
    const files = await collectMarkdownFiles(root);
    for (const absPath of files) {
      const raw = readFileSync(absPath, "utf8");
      const relPath = relative(root, absPath);
      const { frontmatter, body } = splitFrontmatter(raw);
      const normalizedBody = compactWhitespace(body);
      const sections = parseSections(body);
      docs.push({
        absPath,
        relPath,
        sourceRoot: root,
        docId: inferDocId(relPath, frontmatter),
        title: inferTitle(relPath, frontmatter, body),
        domain: inferDomain(relPath, frontmatter),
        status: inferStatus(frontmatter),
        body: normalizedBody,
        sections,
      });
    }
  }

  docs.sort((a, b) => a.absPath.localeCompare(b.absPath));

  const records: SftExampleRecord[] = [];
  const dedupe = new Set<string>();

  for (const doc of docs) {
    const sourcePath = `${relative(process.cwd(), doc.sourceRoot)}/${doc.relPath}`.replace(
      /\\/g,
      "/",
    );
    const docCitation = `[source: ${sourcePath}]`;
    const summary = buildDocSummary(doc.body);
    if (summary.length > 0) {
      const user = `Produce an operator-facing summary of "${doc.title}" with domain, status, and key operating implications.`;
      const assistant = [
        `Title: ${doc.title}`,
        `Domain: ${doc.domain}`,
        `Status: ${doc.status}`,
        "",
        summary,
        "",
        docCitation,
      ].join("\n");
      const key = `${doc.docId}:doc_summary:${user}:${assistant}`;
      if (!dedupe.has(key)) {
        dedupe.add(key);
        records.push({
          id: randomUUID(),
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: user },
            { role: "assistant", content: assistant },
          ],
          metadata: {
            kind: "doc_summary",
            sourcePath,
            sourceRoot: doc.sourceRoot,
            docId: doc.docId,
            title: doc.title,
            domain: doc.domain,
            generatedAt,
            splitKey: `${doc.docId}:doc_summary`,
          },
        });
      }
    }

    let sectionCount = 0;
    for (const section of doc.sections) {
      if (sectionCount >= cli.maxSectionsPerDoc) break;
      const cleaned = compactWhitespace(section.body);
      if (cleaned.length < cli.minSectionChars) continue;
      sectionCount++;
      const headingAnchor = slugify(section.heading || "section");
      const citation = `[source: ${sourcePath}#${headingAnchor}]`;
      const user = `Explain the "${section.heading}" section from "${doc.title}" for an internal operator, with direct operational implications.`;
      const assistant = `${sectionResponse(cleaned)}\n\n${citation}`;
      const key = `${doc.docId}:section:${section.heading}:${assistant}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      records.push({
        id: randomUUID(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
          { role: "assistant", content: assistant },
        ],
        metadata: {
          kind: "section_summary",
          sourcePath,
          sourceRoot: doc.sourceRoot,
          docId: doc.docId,
          title: doc.title,
          domain: doc.domain,
          heading: section.heading,
          generatedAt,
          splitKey: `${doc.docId}:section:${section.heading}`,
        },
      });
    }
  }

  const splits: Record<SplitName, SftExampleRecord[]> = {
    train: [],
    val: [],
    test: [],
  };

  for (const record of records) {
    const split = stableSplit(cli.seed, record.metadata.splitKey, cli);
    splits[split].push(record);
  }

  mkdirSync(cli.outDir, { recursive: true });

  const splitManifest: Record<SplitName, SplitManifest> = {
    train: { path: "", count: 0, sha256: "" },
    val: { path: "", count: 0, sha256: "" },
    test: { path: "", count: 0, sha256: "" },
  };

  for (const splitName of ["train", "val", "test"] as const) {
    const rows = splits[splitName].map((row) => JSON.stringify(row));
    const payload = rows.length > 0 ? `${rows.join("\n")}\n` : "";
    const filePath = resolve(cli.outDir, `${cli.label}.${splitName}.jsonl`);
    writeFileSync(filePath, payload, "utf8");
    splitManifest[splitName] = {
      path: filePath,
      count: rows.length,
      sha256: hashFileContent(payload),
    };
  }

  const manifest: DatasetManifest = {
    version: "1.0.0",
    label: cli.label,
    seed: cli.seed,
    generatedAt,
    sourceRoots,
    documentsAnalyzed: docs.length,
    examplesGenerated: records.length,
    examplesDeduplicated: records.length,
    splitRatios: {
      train: cli.trainRatio,
      val: cli.valRatio,
      test: cli.testRatio,
    },
    splits: splitManifest,
    policyRefs: [
      "docs/DATASET_POLICY.md",
      "docs/EVAL_GATE_SPEC.md",
      "docs/MODEL_PROMOTION_POLICY.md",
    ],
  };

  const manifestPath =
    cli.manifestPath ?? resolve(cli.outDir, `${cli.label}.manifest.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const reportLines = [
    "# Knowledge SFT Build Report",
    "",
    `- Label: \`${manifest.label}\``,
    `- Generated at: \`${manifest.generatedAt}\``,
    `- Documents analyzed: \`${manifest.documentsAnalyzed}\``,
    `- Examples generated: \`${manifest.examplesGenerated}\``,
    "",
    "## Split Summary",
    "",
    `- Train: \`${manifest.splits.train.count}\``,
    `- Val: \`${manifest.splits.val.count}\``,
    `- Test: \`${manifest.splits.test.count}\``,
    "",
    "## Artifacts",
    "",
    `- Manifest: \`${manifestPath}\``,
    `- Train: \`${manifest.splits.train.path}\``,
    `- Val: \`${manifest.splits.val.path}\``,
    `- Test: \`${manifest.splits.test.path}\``,
    "",
  ];
  const reportPath = resolve(cli.outDir, `${cli.label}.report.md`);
  writeFileSync(reportPath, `${reportLines.join("\n")}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        label: manifest.label,
        manifest: manifestPath,
        report: reportPath,
        documentsAnalyzed: manifest.documentsAnalyzed,
        examplesGenerated: manifest.examplesGenerated,
        splits: {
          train: manifest.splits.train.count,
          val: manifest.splits.val.count,
          test: manifest.splits.test.count,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[knowledge-sft-build] ${message}`);
  process.exitCode = 1;
});

