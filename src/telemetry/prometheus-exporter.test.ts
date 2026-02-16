/**
 * Tests for Prometheus text exporter.
 */

import { describe, expect, it } from "vitest";

import {
  exportPrometheusText,
  createMetricsHandler,
  type MetricsSnapshot,
} from "./prometheus-exporter.js";

// ---------- Helpers ----------

function emptySnapshot(): MetricsSnapshot {
  return { counters: {}, histograms: {} };
}

function sampleSnapshot(): MetricsSnapshot {
  return {
    counters: {
      'requests_total:{"method":"GET"}': 42,
      'requests_total:{"method":"POST"}': 10,
      "active_connections:{}": 5,
      "trust_score": 0.85,
    },
    histograms: {
      'response_time_ms:{"endpoint":"/api"}': {
        count: 100,
        min: 1,
        max: 500,
        avg: 50,
        p50: 30,
        p95: 200,
        p99: 450,
      },
    },
  };
}

// ---------- Tests ----------

describe("exportPrometheusText", () => {
  it("returns empty string for empty snapshot", () => {
    const result = exportPrometheusText(emptySnapshot());
    expect(result).toBe("");
  });

  it("exports counters with default prefix", () => {
    const result = exportPrometheusText({
      counters: { "requests_total:{}": 42 },
      histograms: {},
    });

    expect(result).toContain("# TYPE milaidy_requests_total gauge");
    expect(result).toContain("milaidy_requests_total 42");
  });

  it("exports counters with custom prefix", () => {
    const result = exportPrometheusText(
      { counters: { "up:{}": 1 }, histograms: {} },
      { prefix: "app_" },
    );
    expect(result).toContain("app_up 1");
  });

  it("exports counters with labels", () => {
    const result = exportPrometheusText(sampleSnapshot());
    expect(result).toContain('milaidy_requests_total{method="GET"} 42');
    expect(result).toContain('milaidy_requests_total{method="POST"} 10');
  });

  it("exports counters without tags as bare metrics", () => {
    const result = exportPrometheusText(sampleSnapshot());
    expect(result).toContain("milaidy_trust_score 0.85");
  });

  it("exports histograms as summary with quantiles", () => {
    const result = exportPrometheusText(sampleSnapshot());
    expect(result).toContain('milaidy_response_time_ms{endpoint="/api",quantile="0.5"} 30');
    expect(result).toContain('milaidy_response_time_ms{endpoint="/api",quantile="0.95"} 200');
    expect(result).toContain('milaidy_response_time_ms{endpoint="/api",quantile="0.99"} 450');
    expect(result).toContain('milaidy_response_time_ms_count{endpoint="/api"} 100');
    expect(result).toContain('milaidy_response_time_ms_min{endpoint="/api"} 1');
    expect(result).toContain('milaidy_response_time_ms_max{endpoint="/api"} 500');
  });

  it("includes TYPE annotations", () => {
    const result = exportPrometheusText(sampleSnapshot());
    expect(result).toContain("# TYPE milaidy_requests_total gauge");
    expect(result).toContain("# TYPE milaidy_response_time_ms summary");
  });

  it("deduplicates TYPE annotations for same metric", () => {
    const result = exportPrometheusText(sampleSnapshot());
    const typeLines = result.split("\n").filter((l) => l.includes("# TYPE milaidy_requests_total"));
    expect(typeLines).toHaveLength(1);
  });

  it("sanitizes invalid characters in metric names", () => {
    const result = exportPrometheusText({
      counters: { "my-metric.name:{}": 1 },
      histograms: {},
    });
    expect(result).toContain("milaidy_my_metric_name 1");
  });

  it("escapes label values", () => {
    const result = exportPrometheusText({
      counters: { 'test:{"path":"/api/\\"test\\""}': 1 },
      histograms: {},
    });
    expect(result).toContain("milaidy_test");
  });

  it("handles histogram without labels", () => {
    const result = exportPrometheusText({
      counters: {},
      histograms: {
        "latency_ms:{}": { count: 10, min: 1, max: 100, avg: 50, p50: 40, p95: 90, p99: 99 },
      },
    });
    expect(result).toContain('milaidy_latency_ms{quantile="0.5"} 40');
    expect(result).toContain("milaidy_latency_ms_count 10");
  });
});

describe("createMetricsHandler", () => {
  it("returns a function that exports text", () => {
    const handler = createMetricsHandler(() => sampleSnapshot());
    const text = handler();
    expect(text).toContain("milaidy_requests_total");
    expect(text).toContain("milaidy_response_time_ms");
  });

  it("uses provided options", () => {
    const handler = createMetricsHandler(() => sampleSnapshot(), { prefix: "custom_" });
    const text = handler();
    expect(text).toContain("custom_requests_total");
  });
});
