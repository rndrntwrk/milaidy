/**
 * Telemetry module exports.
 *
 * @module telemetry
 */

export { AgentInstrumentation } from "./agent-instrumentation.js";
export {
  createMetricsHandler,
  exportPrometheusText,
  type MetricsSnapshot,
} from "./prometheus-exporter.js";
export { createMetricsClient, initTelemetry, metrics } from "./setup.js";
