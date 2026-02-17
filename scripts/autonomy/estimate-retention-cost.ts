#!/usr/bin/env -S node --import tsx

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface CliArgs {
  cardinalityFile: string;
  out?: string;
  scrapeIntervalSeconds: number;
  retentionDays: number;
  bytesPerSample: number;
  bytesPerSeries: number;
}

interface CardinalityReportEntry {
  metric: string;
  seriesCount: number;
}

interface CardinalityReport {
  measuredAt: string;
  report: CardinalityReportEntry[];
}

interface RetentionCostEstimate {
  measuredAt: string;
  assumptions: {
    scrapeIntervalSeconds: number;
    retentionDays: number;
    bytesPerSample: number;
    bytesPerSeries: number;
  };
  totals: {
    metricsAnalyzed: number;
    totalSeries: number;
    samplesPerSeriesPerDay: number;
    projectedSamples: number;
    projectedBytes: number;
    projectedMiB: number;
  };
  breakdown: Array<{
    metric: string;
    seriesCount: number;
    projectedSamples: number;
    projectedBytes: number;
    projectedMiB: number;
  }>;
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

  return {
    cardinalityFile:
      args.get("cardinality-file") ?? "docs/ops/autonomy/reports/cardinality.sample.json",
    out: args.get("out"),
    scrapeIntervalSeconds: Number(args.get("scrape-interval-seconds") ?? "15"),
    retentionDays: Number(args.get("retention-days") ?? "30"),
    bytesPerSample: Number(args.get("bytes-per-sample") ?? "2"),
    bytesPerSeries: Number(args.get("bytes-per-series") ?? "1024"),
  };
}

function loadCardinalityReport(path: string): CardinalityReport {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as CardinalityReport;
}

function toMiB(bytes: number): number {
  return bytes / (1024 * 1024);
}

function estimateRetentionCost(
  report: CardinalityReport,
  cli: CliArgs,
): RetentionCostEstimate {
  const samplesPerSeriesPerDay = Math.floor(86_400 / cli.scrapeIntervalSeconds);
  const metrics = report.report ?? [];

  const breakdown = metrics.map((entry) => {
    const projectedSamples =
      entry.seriesCount * samplesPerSeriesPerDay * cli.retentionDays;
    const projectedBytes =
      projectedSamples * cli.bytesPerSample +
      entry.seriesCount * cli.bytesPerSeries;
    return {
      metric: entry.metric,
      seriesCount: entry.seriesCount,
      projectedSamples,
      projectedBytes,
      projectedMiB: Number(toMiB(projectedBytes).toFixed(4)),
    };
  });

  const totalSeries = breakdown.reduce((acc, row) => acc + row.seriesCount, 0);
  const projectedSamples = breakdown.reduce(
    (acc, row) => acc + row.projectedSamples,
    0,
  );
  const projectedBytes = breakdown.reduce(
    (acc, row) => acc + row.projectedBytes,
    0,
  );

  return {
    measuredAt: new Date().toISOString(),
    assumptions: {
      scrapeIntervalSeconds: cli.scrapeIntervalSeconds,
      retentionDays: cli.retentionDays,
      bytesPerSample: cli.bytesPerSample,
      bytesPerSeries: cli.bytesPerSeries,
    },
    totals: {
      metricsAnalyzed: metrics.length,
      totalSeries,
      samplesPerSeriesPerDay,
      projectedSamples,
      projectedBytes,
      projectedMiB: Number(toMiB(projectedBytes).toFixed(4)),
    },
    breakdown,
  };
}

function main() {
  const cli = parseArgs(process.argv.slice(2));
  const report = loadCardinalityReport(cli.cardinalityFile);
  const estimate = estimateRetentionCost(report, cli);
  const output = JSON.stringify(estimate, null, 2);

  if (cli.out) {
    writeFileSync(resolve(cli.out), output, "utf8");
    console.log(`[retention-cost] wrote ${resolve(cli.out)}`);
  } else {
    console.log(output);
  }
}

main();
