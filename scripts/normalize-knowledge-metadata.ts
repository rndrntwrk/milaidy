import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import yaml from "yaml";

type Frontmatter = Record<string, unknown>;

type FileAnalysis = {
  relPath: string;
  hasFrontmatter: boolean;
  parseError: string | null;
  missingKeys: string[];
  invalidKeys: string[];
  status: string | null;
};

const REQUIRED_KEYS = [
  "doc_id",
  "title",
  "domain",
  "source_repo",
  "owner",
  "status",
  "updated_at",
  "freshness_sla_days",
  "audience",
  "confidentiality",
] as const;

const KNOWN_STATUS_VALUES = new Set([
  "draft",
  "authoritative",
  "canonical",
  "active",
  "verified",
  "complete",
  "superseded",
  "archived",
]);

const DOMAIN_BY_DIRECTORY: Record<string, string> = {
  "00_ecosystem": "ecosystem",
  "05_milaidy": "milaidy",
  "10_555": "five55",
  "15_555_mono": "five55-mono",
  "20_stream": "stream",
  "25_555x402": "five55x402",
  "30_sw4p": "sw4p",
  "35_backend": "backend",
  "40_product_publication": "product-publication",
  "50_operations": "operations",
  "60_security": "security",
  "70_historical": "historical",
  "80_glossary": "glossary",
};

const DEFAULT_FRESHNESS_BY_DOMAIN: Record<string, number> = {
  historical: 30,
  glossary: 30,
  security: 14,
};

const DEFAULT_AUDIENCE_BY_DOMAIN: Record<string, string> = {
  ecosystem: "executive",
  "product-publication": "engineering-exec",
};

const OPTIONAL_KEY_ORDER = ["source_paths", "superseded_by"] as const;

function usage(): void {
  console.log(
    [
      "Usage:",
      "  node --import tsx scripts/normalize-knowledge-metadata.ts [--write] [--knowledge-root <dir>] [--report-path <file>]",
      "",
      "Defaults:",
      "  --knowledge-root  ./knowledge",
      "  --report-path     ./docs/SEED_READY_COMPLIANCE_REPORT_<YYYY-MM-DD>.md",
    ].join("\n"),
  );
}

function readFlagValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function inferDomain(relPath: string, frontmatter: Frontmatter): string {
  const existing = frontmatter.domain;
  if (typeof existing === "string" && existing.trim().length > 0) {
    return existing.trim();
  }
  const first = relPath.split(path.sep)[0] ?? "";
  return DOMAIN_BY_DIRECTORY[first] ?? "knowledge";
}

function inferTitle(body: string, relPath: string, frontmatter: Frontmatter): string {
  const existing = frontmatter.title;
  if (typeof existing === "string" && existing.trim().length > 0) {
    return existing.trim();
  }

  for (const line of body.split("\n")) {
    const match = /^#\s+(.+)\s*$/.exec(line.trim());
    if (match?.[1]) return match[1].trim();
  }

  const base = path.basename(relPath, path.extname(relPath));
  return base
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeStatus(frontmatter: Frontmatter): string {
  if (frontmatter.superseded_by) return "superseded";

  const raw = frontmatter.status;
  if (typeof raw !== "string") return "draft";
  const normalized = raw.trim().toLowerCase();
  if (KNOWN_STATUS_VALUES.has(normalized)) return normalized;
  return "draft";
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function normalizeFreshness(frontmatter: Frontmatter, domain: string): number {
  const raw = frontmatter.freshness_sla_days;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_FRESHNESS_BY_DOMAIN[domain] ?? 7;
}

function normalizeAudience(frontmatter: Frontmatter, domain: string): string {
  const raw = frontmatter.audience;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return DEFAULT_AUDIENCE_BY_DOMAIN[domain] ?? "internal";
}

function normalizeConfidentiality(frontmatter: Frontmatter): string {
  const raw = frontmatter.confidentiality;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return "internal";
}

function splitFrontmatter(content: string): {
  frontmatterRaw: string | null;
  body: string;
  hasFrontmatter: boolean;
} {
  if (!content.startsWith("---\n")) {
    return { frontmatterRaw: null, body: content, hasFrontmatter: false };
  }

  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatterRaw: null, body: content, hasFrontmatter: false };
  }

  const frontmatterRaw = content.slice(4, end);
  const body = content.slice(end + 5);
  return { frontmatterRaw, body, hasFrontmatter: true };
}

function parseFrontmatter(raw: string | null): {
  value: Frontmatter;
  error: string | null;
} {
  if (!raw) return { value: {}, error: null };

  try {
    // uniqueKeys=false allows us to recover malformed blocks and normalize them.
    const doc = yaml.parseDocument(raw, { uniqueKeys: false });
    const parsed = (doc.toJS({ maxAliasCount: 1000 }) ?? {}) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: {}, error: "frontmatter is not a map" };
    }
    return { value: parsed as Frontmatter, error: null };
  } catch (err) {
    return {
      value: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalizeDocId(existing: unknown, relPath: string): string {
  if (typeof existing === "string" && existing.trim().length > 0) {
    return toSlug(existing.trim());
  }
  const parts = relPath.split(path.sep);
  const dir = parts.length > 1 ? parts[0] : "knowledge";
  const stem = path.basename(relPath, path.extname(relPath));
  return toSlug(`${dir}-${stem}-v1`);
}

function stringifyFrontmatter(frontmatter: Frontmatter): string {
  const yamlText = yaml.stringify(frontmatter, {
    lineWidth: 0,
    simpleKeys: true,
  });
  return `---\n${yamlText.trimEnd()}\n---\n\n`;
}

function normalizeBody(body: string): string {
  const trimmedLeading = body.replace(/^\n+/, "");
  return trimmedLeading.endsWith("\n") ? trimmedLeading : `${trimmedLeading}\n`;
}

function analyzeFrontmatter(relPath: string, frontmatter: Frontmatter, hasFrontmatter: boolean, parseError: string | null): FileAnalysis {
  const missingKeys: string[] = [];
  const invalidKeys: string[] = [];

  for (const key of REQUIRED_KEYS) {
    if (!(key in frontmatter)) missingKeys.push(key);
  }

  if (frontmatter.updated_at && !isIsoDate(frontmatter.updated_at)) {
    invalidKeys.push("updated_at");
  }

  const freshness = frontmatter.freshness_sla_days;
  if (
    freshness !== undefined &&
    !(typeof freshness === "number" && Number.isFinite(freshness) && freshness > 0) &&
    !(typeof freshness === "string" && Number.parseInt(freshness, 10) > 0)
  ) {
    invalidKeys.push("freshness_sla_days");
  }

  const status =
    typeof frontmatter.status === "string" && frontmatter.status.trim()
      ? frontmatter.status.trim().toLowerCase()
      : null;

  return {
    relPath,
    hasFrontmatter,
    parseError,
    missingKeys,
    invalidKeys,
    status,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const write = args.includes("--write");
  const knowledgeRootArg = readFlagValue(args, "--knowledge-root");
  const reportPathArg = readFlagValue(args, "--report-path");
  const cwd = process.cwd();
  const knowledgeRoot = path.resolve(cwd, knowledgeRootArg ?? "knowledge");
  const today = new Date().toISOString().slice(0, 10);
  const reportPath = path.resolve(
    cwd,
    reportPathArg ?? `docs/SEED_READY_COMPLIANCE_REPORT_${today}.md`,
  );

  const entries = await fs.readdir(knowledgeRoot, { withFileTypes: true });
  if (!entries.length) {
    throw new Error(`Knowledge root is empty: ${knowledgeRoot}`);
  }

  const markdownFiles: string[] = [];
  async function walk(dir: string): Promise<void> {
    const dirEntries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && full.endsWith(".md")) {
        markdownFiles.push(full);
      }
    }
  }
  await walk(knowledgeRoot);
  markdownFiles.sort();

  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const usedDocIds = new Map<string, string>();
  const changedFiles: string[] = [];
  const preAnalyses: FileAnalysis[] = [];
  const postAnalyses: FileAnalysis[] = [];

  for (const filePath of markdownFiles) {
    const relPath = path.relative(knowledgeRoot, filePath);
    const content = await fs.readFile(filePath, "utf8");
    const split = splitFrontmatter(content);
    const parsed = parseFrontmatter(split.frontmatterRaw);
    const pre = analyzeFrontmatter(
      relPath,
      parsed.value,
      split.hasFrontmatter,
      parsed.error,
    );
    preAnalyses.push(pre);

    const normalizedBody = normalizeBody(split.body);
    const domain = inferDomain(relPath, parsed.value);
    const title = inferTitle(normalizedBody, relPath, parsed.value);
    const baseDocId = normalizeDocId(parsed.value.doc_id, relPath);

    let docId = baseDocId;
    let dupSuffix = 2;
    while (usedDocIds.has(docId) && usedDocIds.get(docId) !== relPath) {
      docId = `${baseDocId}-${dupSuffix}`;
      dupSuffix += 1;
    }
    usedDocIds.set(docId, relPath);

    const normalized: Frontmatter = {
      doc_id: docId,
      title,
      domain,
      source_repo:
        typeof parsed.value.source_repo === "string" &&
        parsed.value.source_repo.trim()
          ? parsed.value.source_repo.trim()
          : "rndrntwrk/555",
      owner:
        typeof parsed.value.owner === "string" && parsed.value.owner.trim()
          ? parsed.value.owner.trim()
          : "enoomian",
      status: normalizeStatus(parsed.value),
      updated_at: isIsoDate(parsed.value.updated_at) ? parsed.value.updated_at : nowIso,
      freshness_sla_days: normalizeFreshness(parsed.value, domain),
      audience: normalizeAudience(parsed.value, domain),
      confidentiality: normalizeConfidentiality(parsed.value),
    };

    for (const key of OPTIONAL_KEY_ORDER) {
      if (parsed.value[key] !== undefined) normalized[key] = parsed.value[key];
    }

    const requiredSet = new Set(REQUIRED_KEYS);
    const optionalSet = new Set(OPTIONAL_KEY_ORDER);
    const remainingKeys = Object.keys(parsed.value)
      .filter((key) => !requiredSet.has(key as (typeof REQUIRED_KEYS)[number]))
      .filter((key) => !optionalSet.has(key as (typeof OPTIONAL_KEY_ORDER)[number]))
      .sort((a, b) => a.localeCompare(b));
    for (const key of remainingKeys) {
      normalized[key] = parsed.value[key];
    }

    const nextContent = stringifyFrontmatter(normalized) + normalizedBody;
    if (nextContent !== content) {
      changedFiles.push(relPath);
      if (write) {
        await fs.writeFile(filePath, nextContent, "utf8");
      }
    }

    const post = analyzeFrontmatter(relPath, normalized, true, null);
    postAnalyses.push(post);
  }

  const summarize = (analyses: FileAnalysis[]) => {
    const statusCounts = new Map<string, number>();
    let noFrontmatter = 0;
    let parseErrors = 0;
    let missingKeys = 0;
    let invalidKeys = 0;
    const failingFiles: Array<{ relPath: string; reasons: string[] }> = [];

    for (const item of analyses) {
      if (!item.hasFrontmatter) noFrontmatter += 1;
      if (item.parseError) parseErrors += 1;
      if (item.missingKeys.length > 0) missingKeys += 1;
      if (item.invalidKeys.length > 0) invalidKeys += 1;
      if (item.status) {
        statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);
      }

      const reasons: string[] = [];
      if (!item.hasFrontmatter) reasons.push("missing_frontmatter");
      if (item.parseError) reasons.push(`parse_error:${item.parseError}`);
      if (item.missingKeys.length) reasons.push(`missing_keys:${item.missingKeys.join(",")}`);
      if (item.invalidKeys.length) reasons.push(`invalid_keys:${item.invalidKeys.join(",")}`);
      if (reasons.length) failingFiles.push({ relPath: item.relPath, reasons });
    }

    return {
      total: analyses.length,
      noFrontmatter,
      parseErrors,
      missingKeys,
      invalidKeys,
      statusCounts: Object.fromEntries([...statusCounts.entries()].sort()),
      failingFiles,
      passCount: analyses.length - failingFiles.length,
    };
  };

  const preSummary = summarize(preAnalyses);
  const postSummary = summarize(postAnalyses);

  const reportLines: string[] = [];
  reportLines.push("---");
  reportLines.push(`doc_id: seed-ready-compliance-${today}`);
  reportLines.push("title: Seed-Ready Knowledge Metadata Compliance Report");
  reportLines.push("domain: knowledge");
  reportLines.push("source_repo: rndrntwrk/555");
  reportLines.push("owner: codex");
  reportLines.push("status: complete");
  reportLines.push(`updated_at: ${nowIso}`);
  reportLines.push("freshness_sla_days: 1");
  reportLines.push("audience: engineering");
  reportLines.push("confidentiality: internal");
  reportLines.push("---");
  reportLines.push("");
  reportLines.push("# Seed-Ready Knowledge Metadata Compliance Report");
  reportLines.push("");
  reportLines.push("## Scope");
  reportLines.push("");
  reportLines.push(`- Knowledge root: \`${knowledgeRoot}\``);
  reportLines.push(`- Markdown documents analyzed: **${markdownFiles.length}**`);
  reportLines.push(`- Run mode: **${write ? "write (auto-fix applied)" : "read-only"}**`);
  reportLines.push("");
  reportLines.push("## Pre-Fix Compliance");
  reportLines.push("");
  reportLines.push(`- Pass: **${preSummary.passCount}/${preSummary.total}**`);
  reportLines.push(`- Missing frontmatter: **${preSummary.noFrontmatter}**`);
  reportLines.push(`- Parse errors: **${preSummary.parseErrors}**`);
  reportLines.push(`- Missing required keys (per-file): **${preSummary.missingKeys}**`);
  reportLines.push(`- Invalid key values (per-file): **${preSummary.invalidKeys}**`);
  reportLines.push("- Status distribution:");
  for (const [status, count] of Object.entries(preSummary.statusCounts)) {
    reportLines.push(`  - \`${status}\`: ${count}`);
  }
  reportLines.push("");
  reportLines.push("## Post-Fix Compliance");
  reportLines.push("");
  reportLines.push(`- Pass: **${postSummary.passCount}/${postSummary.total}**`);
  reportLines.push(`- Missing frontmatter: **${postSummary.noFrontmatter}**`);
  reportLines.push(`- Parse errors: **${postSummary.parseErrors}**`);
  reportLines.push(`- Missing required keys (per-file): **${postSummary.missingKeys}**`);
  reportLines.push(`- Invalid key values (per-file): **${postSummary.invalidKeys}**`);
  reportLines.push("- Status distribution:");
  for (const [status, count] of Object.entries(postSummary.statusCounts)) {
    reportLines.push(`  - \`${status}\`: ${count}`);
  }
  reportLines.push("");
  reportLines.push("## Auto-Fix Patch Summary");
  reportLines.push("");
  reportLines.push(`- Files modified: **${changedFiles.length}**`);
  if (changedFiles.length) {
    reportLines.push("- Modified files:");
    for (const relPath of changedFiles) {
      reportLines.push(`  - \`${relPath}\``);
    }
  }
  reportLines.push("");
  reportLines.push("## Strict Seed-Readiness Verdict");
  reportLines.push("");
  if (postSummary.passCount === postSummary.total) {
    reportLines.push("- **PASS**: all knowledge markdown files satisfy required seed metadata fields.");
  } else {
    reportLines.push("- **FAIL**: unresolved metadata compliance issues remain.");
    for (const item of postSummary.failingFiles) {
      reportLines.push(`  - \`${item.relPath}\` -> ${item.reasons.join(" | ")}`);
    }
  }
  reportLines.push("");

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${reportLines.join("\n")}\n`, "utf8");

  console.log(`Knowledge files analyzed: ${markdownFiles.length}`);
  console.log(`Files modified: ${changedFiles.length}`);
  console.log(`Report written: ${reportPath}`);
  console.log(
    `Post-fix compliance: ${postSummary.passCount}/${postSummary.total} (${postSummary.passCount === postSummary.total ? "PASS" : "FAIL"})`,
  );

  if (postSummary.passCount !== postSummary.total) {
    process.exitCode = 2;
  }
}

void main();
