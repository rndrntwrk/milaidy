export class NodeSDK {
  constructor(_config?: unknown) {}
  start(): void {}
  async shutdown(): Promise<void> {}
}

export function getNodeAutoInstrumentations(
  _config?: unknown,
): Record<string, never> {
  return {};
}

export class OTLPTraceExporter {
  constructor(_config?: unknown) {}
}

export class OTLPMetricExporter {
  constructor(_config?: unknown) {}
}

export class Resource {
  attributes: Record<string, unknown>;

  constructor(attributes: Record<string, unknown>) {
    this.attributes = attributes;
  }
}

export const ATTR_SERVICE_NAME = "service.name";
export const ATTR_SERVICE_VERSION = "service.version";

export class BatchSpanProcessor {
  constructor(_exporter?: unknown, _config?: unknown) {}
}

export class PeriodicExportingMetricReader {
  constructor(_config?: unknown) {}
}
