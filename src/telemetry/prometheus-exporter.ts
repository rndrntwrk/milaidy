/**
 * Prometheus text exposition format exporter.
 *
 * Converts the internal metrics client snapshot into the Prometheus
 * text format (v0.0.4) for scraping via GET /metrics.
 *
 * @module telemetry/prometheus-exporter
 */

// ---------- Types ----------

export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<
    string,
    {
      count: number;
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    }
  >;
}

export interface PrometheusExporterOptions {
  /** Prefix for all metric names (default: "milaidy_"). */
  prefix?: string;
}

// ---------- Implementation ----------

/**
 * Format a metric name to be Prometheus-compatible.
 * Replaces invalid characters with underscores.
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_:]/g, "_").replace(/^[^a-zA-Z_:]/, "_");
}

/**
 * Parse the key format "name:{tags}" from the internal metrics client.
 * Returns [metricName, labels].
 */
function parseKey(key: string): { name: string; labels: string } {
  const colonIdx = key.indexOf(":");
  if (colonIdx === -1) return { name: key, labels: "" };

  const name = key.slice(0, colonIdx);
  const tagsJson = key.slice(colonIdx + 1);

  try {
    const tags = JSON.parse(tagsJson) as Record<string, string>;
    const entries = Object.entries(tags);
    if (entries.length === 0) return { name, labels: "" };

    const labelParts = entries.map(
      ([k, v]) => `${sanitizeName(k)}="${escapeLabel(String(v))}"`,
    );
    return { name, labels: `{${labelParts.join(",")}}` };
  } catch {
    return { name, labels: "" };
  }
}

/**
 * Escape a Prometheus label value.
 */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Export a metrics snapshot in Prometheus text exposition format.
 */
export function exportPrometheusText(
  snapshot: MetricsSnapshot,
  options?: PrometheusExporterOptions,
): string {
  const prefix = options?.prefix ?? "milaidy_";
  const lines: string[] = [];
  const seenTypes = new Set<string>();

  // Counters and gauges
  for (const [key, value] of Object.entries(snapshot.counters)) {
    const { name, labels } = parseKey(key);
    const fullName = sanitizeName(`${prefix}${name}`);

    if (!seenTypes.has(fullName)) {
      lines.push(`# TYPE ${fullName} gauge`);
      seenTypes.add(fullName);
    }

    lines.push(`${fullName}${labels} ${value}`);
  }

  // Histograms (exported as summary-style metrics with quantiles)
  for (const [key, stats] of Object.entries(snapshot.histograms)) {
    const { name, labels } = parseKey(key);
    const fullName = sanitizeName(`${prefix}${name}`);

    if (!seenTypes.has(fullName)) {
      lines.push(`# TYPE ${fullName} summary`);
      seenTypes.add(fullName);
    }

    const labelSuffix = labels
      ? labels.slice(0, -1) + "," // Remove closing }, add comma
      : "{";
    const closeBrace = "}";

    lines.push(`${fullName}${labelSuffix}quantile="0.5"${closeBrace} ${stats.p50}`);
    lines.push(`${fullName}${labelSuffix}quantile="0.95"${closeBrace} ${stats.p95}`);
    lines.push(`${fullName}${labelSuffix}quantile="0.99"${closeBrace} ${stats.p99}`);
    lines.push(`${fullName}_count${labels} ${stats.count}`);
    lines.push(`${fullName}_min${labels} ${stats.min}`);
    lines.push(`${fullName}_max${labels} ${stats.max}`);
  }

  // Trailing newline required by Prometheus
  lines.push("");
  return lines.join("\n");
}

/**
 * Create a handler function for the /metrics endpoint.
 * Takes a metrics client with getSnapshot() and returns text/plain response.
 */
export function createMetricsHandler(
  getSnapshot: () => MetricsSnapshot,
  options?: PrometheusExporterOptions,
): () => string {
  return () => exportPrometheusText(getSnapshot(), options);
}
