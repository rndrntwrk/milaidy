/**
 * Telemetry module exports.
 *
 * @module telemetry
 */

export { initTelemetry, createMetricsClient, metrics } from "./setup.js";
export { AgentInstrumentation } from "./agent-instrumentation.js";
export { exportPrometheusText, createMetricsHandler, type MetricsSnapshot } from "./prometheus-exporter.js";
