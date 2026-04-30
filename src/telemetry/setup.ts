/**
 * OpenTelemetry instrumentation setup.
 *
 * Provides distributed tracing, metrics, and log correlation for
 * production observability. Exports to OTLP-compatible backends
 * (Jaeger, Honeycomb, Grafana, Datadog, etc.).
 *
 * @module telemetry/setup
 */

import os from "node:os";
import type { MilaidyConfig } from "../config/types.js";

// Types for OpenTelemetry (optional dependency)
interface TelemetrySDK {
  start(): void;
  shutdown(): Promise<void>;
}

interface OTelConfig {
  enabled: boolean;
  endpoint?: string;
  headers?: Record<string, string>;
  flushIntervalMs?: number;
  serviceName?: string;
}

/**
 * No-op SDK for when telemetry is disabled or dependencies are missing.
 */
class NoOpTelemetrySDK implements TelemetrySDK {
  start(): void {
    // No-op
  }
  async shutdown(): Promise<void> {
    // No-op
  }
}

/**
 * Initialize OpenTelemetry SDK with the provided configuration.
 *
 * This function dynamically imports OTEL dependencies to avoid
 * requiring them when telemetry is disabled.
 */
export async function initTelemetry(
  config: MilaidyConfig,
): Promise<TelemetrySDK> {
  const otelConfig = config.diagnostics?.otel as OTelConfig | undefined;

  if (!otelConfig?.enabled) {
    return new NoOpTelemetrySDK();
  }

  try {
    // Dynamic imports to avoid requiring OTEL when disabled
    const [
      { NodeSDK },
      { getNodeAutoInstrumentations },
      { OTLPTraceExporter },
      { OTLPMetricExporter },
      { Resource },
      { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
      { BatchSpanProcessor },
      { PeriodicExportingMetricReader },
    ] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/auto-instrumentations-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/exporter-metrics-otlp-http"),
      import("@opentelemetry/resources"),
      import("@opentelemetry/semantic-conventions"),
      import("@opentelemetry/sdk-trace-base"),
      import("@opentelemetry/sdk-metrics"),
    ]);

    const serviceName = otelConfig.serviceName ?? "milaidy";
    const endpoint = otelConfig.endpoint ?? "http://localhost:4318";

    const resource = new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "unknown",
      "service.instance.id": process.env.HOSTNAME ?? os.hostname(),
      "deployment.environment": process.env.NODE_ENV ?? "production",
    });

    const traceExporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers: otelConfig.headers,
    });

    const metricExporter = new OTLPMetricExporter({
      url: `${endpoint}/v1/metrics`,
      headers: otelConfig.headers,
    });

    const sdk = new NodeSDK({
      resource,
      spanProcessor: new BatchSpanProcessor(traceExporter, {
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: otelConfig.flushIntervalMs ?? 10000,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": { enabled: false },
          "@opentelemetry/instrumentation-http": {
            ignoreIncomingPaths: ["/health", "/health/live", "/health/ready", "/metrics"],
          },
        }),
      ],
    });

    sdk.start();

    // Graceful shutdown handler
    const shutdownHandler = async () => {
      try {
        await sdk.shutdown();
        console.log("[telemetry] Shutdown complete");
      } catch (err) {
        console.error("[telemetry] Shutdown error:", err);
      }
    };

    process.on("SIGTERM", shutdownHandler);
    process.on("SIGINT", shutdownHandler);

    console.log(`[telemetry] OpenTelemetry initialized, exporting to ${endpoint}`);

    return sdk;
  } catch (err) {
    console.warn(
      "[telemetry] Failed to initialize OpenTelemetry (missing dependencies?):",
      err,
    );
    return new NoOpTelemetrySDK();
  }
}

/**
 * Create a simple metrics client for manual instrumentation.
 */
export function createMetricsClient() {
  const counters = new Map<string, number>();
  const histograms = new Map<string, number[]>();

  return {
    counter(name: string, value: number = 1, tags?: Record<string, string>) {
      const key = `${name}:${JSON.stringify(tags ?? {})}`;
      counters.set(key, (counters.get(key) ?? 0) + value);
    },

    histogram(name: string, value: number, tags?: Record<string, string>) {
      const key = `${name}:${JSON.stringify(tags ?? {})}`;
      const values = histograms.get(key) ?? [];
      values.push(value);
      histograms.set(key, values);
    },

    gauge(name: string, value: number, _tags?: Record<string, string>) {
      // Gauges are just latest values
      counters.set(name, value);
    },

    getSnapshot() {
      return {
        counters: Object.fromEntries(counters),
        histograms: Object.fromEntries(
          Array.from(histograms.entries()).map(([k, v]) => [
            k,
            {
              count: v.length,
              min: Math.min(...v),
              max: Math.max(...v),
              avg: v.reduce((a, b) => a + b, 0) / v.length,
              p50: percentile(v, 50),
              p95: percentile(v, 95),
              p99: percentile(v, 99),
            },
          ]),
        ),
      };
    },
  };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// Singleton metrics client
export const metrics = createMetricsClient();
