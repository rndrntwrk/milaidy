#!/usr/bin/env -S node --import tsx

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface CliArgs {
  url?: string;
  file?: string;
  out?: string;
  maxSeriesPerMetric: number;
  maxDistinctValuesPerLabel: number;
}

interface MetricStats {
  seriesCount: number;
  labels: Record<string, Set<string>>;
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
    url: args.get("url"),
    file: args.get("file"),
    out: args.get("out"),
    maxSeriesPerMetric: Number(args.get("max-series-per-metric") ?? "200"),
    maxDistinctValuesPerLabel: Number(args.get("max-distinct-values-per-label") ?? "100"),
  };
}

async function loadMetricsText(cli: CliArgs): Promise<string> {
  if (cli.file) {
    return readFileSync(resolve(cli.file), "utf8");
  }
  const url = cli.url ?? "http://127.0.0.1:2138/metrics";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch metrics: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function parseLabelPairs(raw: string): Array<[string, string]> {
  if (!raw.trim()) return [];
  return raw.split(",").flatMap((pair) => {
    const idx = pair.indexOf("=");
    if (idx < 0) return [];
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim().replace(/^"/, "").replace(/"$/, "");
    if (!key) return [];
    return [[key, value]];
  });
}

function analyze(text: string): Record<string, MetricStats> {
  const stats: Record<string, MetricStats> = {};
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const matched = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+/);
    if (!matched) continue;
    const metric = matched[1];
    const labelsRaw = matched[3] ?? "";
    const parsedLabels = parseLabelPairs(labelsRaw);

    if (!stats[metric]) {
      stats[metric] = {
        seriesCount: 0,
        labels: {},
      };
    }
    stats[metric].seriesCount += 1;

    for (const [labelName, labelValue] of parsedLabels) {
      if (!stats[metric].labels[labelName]) {
        stats[metric].labels[labelName] = new Set();
      }
      stats[metric].labels[labelName].add(labelValue);
    }
  }

  return stats;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const text = await loadMetricsText(cli);
  const analyzed = analyze(text);

  const violations: Array<{
    metric: string;
    type: "series_count" | "label_cardinality";
    detail: string;
  }> = [];

  const report = Object.entries(analyzed)
    .sort((a, b) => b[1].seriesCount - a[1].seriesCount)
    .map(([metric, stat]) => {
      if (stat.seriesCount > cli.maxSeriesPerMetric) {
        violations.push({
          metric,
          type: "series_count",
          detail: `${stat.seriesCount} > ${cli.maxSeriesPerMetric}`,
        });
      }
      const labels = Object.entries(stat.labels).map(([name, values]) => {
        const distinct = values.size;
        if (distinct > cli.maxDistinctValuesPerLabel) {
          violations.push({
            metric,
            type: "label_cardinality",
            detail: `${name}: ${distinct} > ${cli.maxDistinctValuesPerLabel}`,
          });
        }
        return { name, distinct };
      });
      return {
        metric,
        seriesCount: stat.seriesCount,
        labels,
      };
    });

  const payload = {
    measuredAt: new Date().toISOString(),
    limits: {
      maxSeriesPerMetric: cli.maxSeriesPerMetric,
      maxDistinctValuesPerLabel: cli.maxDistinctValuesPerLabel,
    },
    metricsAnalyzed: report.length,
    violations,
    report,
  };

  const output = JSON.stringify(payload, null, 2);
  if (cli.out) {
    writeFileSync(resolve(cli.out), output, "utf8");
    console.log(`[cardinality] wrote ${resolve(cli.out)}`);
  } else {
    console.log(output);
  }

  if (violations.length > 0) {
    console.error(`[cardinality] found ${violations.length} violation(s)`);
    process.exit(1);
  }
}

void main();

