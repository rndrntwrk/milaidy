#!/usr/bin/env -S node --import tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BaselineMetrics } from "../../src/autonomy/metrics/types.js";

interface CliArgs {
  snapshotsFile: string;
  baselineLabel: string;
  currentLabel: string;
  outDir: string;
  outLabel: string;
  violationThreshold: number;
  psdTarget: number;
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

  return {
    snapshotsFile: resolve(
      args.get("snapshots-file") ??
        "docs/ops/autonomy/reports/state/baseline-snapshots.json",
    ),
    baselineLabel: args.get("baseline") ?? "baseline-sprint1-smoke",
    currentLabel: args.get("current") ?? "phase3-long-horizon-2026-02-17",
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    outLabel: args.get("label") ?? "phase3-reduction-2026-02-17",
    violationThreshold: Number(args.get("violation-threshold") ?? "0.15"),
    psdTarget: Number(args.get("psd-target") ?? "0.05"),
  };
}

function loadSnapshots(path: string): Record<string, BaselineMetrics> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, BaselineMetrics>;
}

function pctReduction(baseline: number, current: number): number {
  if (baseline === 0) return current === 0 ? 0 : -1;
  return (baseline - current) / baseline;
}

function renderMarkdown(report: {
  baselineLabel: string;
  currentLabel: string;
  measuredAt: string;
  baselinePsd: number;
  currentPsd: number;
  baselineViolation: number;
  currentViolation: number;
  psdAbsReduction: number;
  psdPctReduction: number;
  violationAbsReduction: number;
  violationPctReduction: number;
  psdTargetMet: boolean;
  violationTargetMet: boolean;
  reductionsObserved: boolean;
  psdTarget: number;
  violationThreshold: number;
}): string {
  return [
    "# Phase 3 Reduction Demonstration",
    "",
    `- Baseline label: \`${report.baselineLabel}\``,
    `- Current label: \`${report.currentLabel}\``,
    `- Measured at: \`${report.measuredAt}\``,
    "",
    "## Reduction Summary",
    "",
    "| Metric | Baseline | Current | Abs Reduction | % Reduction |",
    "|---|---:|---:|---:|---:|",
    `| Persona Drift Score (PSD) | ${report.baselinePsd.toFixed(4)} | ${report.currentPsd.toFixed(4)} | ${report.psdAbsReduction.toFixed(4)} | ${(report.psdPctReduction * 100).toFixed(2)}% |`,
    `| Identity Violation Index* | ${report.baselineViolation.toFixed(4)} | ${report.currentViolation.toFixed(4)} | ${report.violationAbsReduction.toFixed(4)} | ${(report.violationPctReduction * 100).toFixed(2)}% |`,
    "",
    "## Targets",
    "",
    `- PSD target (\`${report.psdTarget.toFixed(2)}\`) met: \`${report.psdTargetMet}\``,
    `- Identity-violation threshold (\`${report.violationThreshold.toFixed(2)}\`) met: \`${report.violationTargetMet}\``,
    `- Reductions observed in both dimensions: \`${report.reductionsObserved}\``,
    "",
    "*Identity Violation Index uses `max(0, personaDriftScore - violationThreshold)` as the current proxy.",
    "",
  ].join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const snapshots = loadSnapshots(cli.snapshotsFile);
  const baseline = snapshots[cli.baselineLabel];
  const current = snapshots[cli.currentLabel];
  if (!baseline) throw new Error(`Baseline snapshot not found: ${cli.baselineLabel}`);
  if (!current) throw new Error(`Current snapshot not found: ${cli.currentLabel}`);

  const baselineViolation = Math.max(
    0,
    baseline.personaDriftScore - cli.violationThreshold,
  );
  const currentViolation = Math.max(
    0,
    current.personaDriftScore - cli.violationThreshold,
  );
  const psdAbsReduction = baseline.personaDriftScore - current.personaDriftScore;
  const violationAbsReduction = baselineViolation - currentViolation;
  const psdPctReduction = pctReduction(
    baseline.personaDriftScore,
    current.personaDriftScore,
  );
  const violationPctReduction = pctReduction(baselineViolation, currentViolation);

  const report = {
    baselineLabel: cli.baselineLabel,
    currentLabel: cli.currentLabel,
    measuredAt: new Date().toISOString(),
    baselinePsd: baseline.personaDriftScore,
    currentPsd: current.personaDriftScore,
    baselineViolation,
    currentViolation,
    psdAbsReduction,
    psdPctReduction,
    violationAbsReduction,
    violationPctReduction,
    psdTargetMet: current.personaDriftScore <= cli.psdTarget,
    violationTargetMet: currentViolation <= 0,
    reductionsObserved: psdAbsReduction > 0 && violationAbsReduction > 0,
    psdTarget: cli.psdTarget,
    violationThreshold: cli.violationThreshold,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.outLabel}.phase3-reduction.json`);
  const mdPath = join(cli.outDir, `${cli.outLabel}.phase3-reduction.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(mdPath, renderMarkdown(report), "utf8");

  console.log(`[phase3-reduction] wrote ${jsonPath}`);
  console.log(`[phase3-reduction] wrote ${mdPath}`);
}

void main();
