#!/usr/bin/env -S node --import tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILTIN_CONTRACTS } from "../../src/autonomy/tools/schemas/index.js";
import {
  listBuiltinCompensationEligibility,
  listBuiltinCompensationTools,
} from "../../src/autonomy/workflow/compensations/index.js";

interface CliArgs {
  outDir: string;
  label: string;
  failOnMissing: boolean;
}

interface CoverageEntry {
  toolName: string;
  riskClass: string;
  strategy: "automated" | "manual" | "none";
  registered: boolean;
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
    label: args.get("label") ?? `compensations-${now}`,
    failOnMissing: parseBoolean(args.get("fail-on-missing"), true),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return fallback;
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  reversibleCount: number;
  coveredCount: number;
  coveragePercent: number;
  missingTools: string[];
  missingEligibility: string[];
  entries: CoverageEntry[];
}): string {
  const lines: string[] = [];
  lines.push("# Compensation Coverage Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Reversible tools: \`${input.reversibleCount}\``);
  lines.push(`- Covered tools: \`${input.coveredCount}\``);
  lines.push(`- Coverage: \`${input.coveragePercent.toFixed(2)}%\``);
  lines.push("");
  lines.push("| Tool | Risk | Strategy | Registered |");
  lines.push("|---|---|---|---|");
  for (const entry of input.entries) {
    lines.push(
      `| ${entry.toolName} | ${entry.riskClass} | ${entry.strategy} | ${entry.registered ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  lines.push("## Missing Eligibility");
  lines.push("");
  if (input.missingEligibility.length === 0) {
    lines.push("- none");
  } else {
    for (const toolName of input.missingEligibility) {
      lines.push(`- ${toolName}`);
    }
  }
  lines.push("");
  lines.push("## Missing Coverage");
  lines.push("");
  if (input.missingTools.length === 0) {
    lines.push("- none");
  } else {
    for (const toolName of input.missingTools) {
      lines.push(`- ${toolName}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const eligibility = listBuiltinCompensationEligibility();
  const eligibilityByTool = new Map(
    eligibility.map((entry) => [entry.toolName, entry]),
  );
  const registered = new Set(listBuiltinCompensationTools());
  const reversibleTools = BUILTIN_CONTRACTS
    .filter((contract) => contract.riskClass === "reversible")
    .map((contract) => contract.name)
    .sort((a, b) => a.localeCompare(b));

  const entries: CoverageEntry[] = reversibleTools.map((toolName) => ({
    toolName,
    riskClass: "reversible",
    strategy: eligibilityByTool.get(toolName)?.strategy ?? "none",
    registered: registered.has(toolName),
  }));

  const missingTools = entries
    .filter((entry) => !entry.registered)
    .map((entry) => entry.toolName);
  const missingEligibility = entries
    .filter((entry) => entry.strategy === "none")
    .map((entry) => entry.toolName);
  const coveredCount = entries.length - missingTools.length;
  const coveragePercent =
    entries.length === 0 ? 100 : (coveredCount / entries.length) * 100;

  const payload = {
    label: cli.label,
    createdAt: new Date().toISOString(),
    reversibleCount: entries.length,
    coveredCount,
    coveragePercent: Number(coveragePercent.toFixed(2)),
    missingTools,
    missingEligibility,
    entries,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.compensations.json`);
  const mdPath = join(cli.outDir, `${cli.label}.compensations.md`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    mdPath,
    renderMarkdown({
      label: payload.label,
      createdAt: payload.createdAt,
      reversibleCount: payload.reversibleCount,
      coveredCount: payload.coveredCount,
      coveragePercent: payload.coveragePercent,
      missingTools: payload.missingTools,
      missingEligibility: payload.missingEligibility,
      entries: payload.entries,
    }),
    "utf8",
  );

  console.log(`[compensations] wrote ${jsonPath}`);
  console.log(`[compensations] wrote ${mdPath}`);

  if (cli.failOnMissing && (missingTools.length > 0 || missingEligibility.length > 0)) {
    if (missingEligibility.length > 0) {
      console.error(
        `[compensations] missing eligibility for ${missingEligibility.length} reversible tool(s): ${missingEligibility.join(", ")}`,
      );
    }
    console.error(
      `[compensations] missing coverage for ${missingTools.length} reversible tool(s): ${missingTools.join(", ")}`,
    );
    process.exitCode = 1;
  }
}

void main();
