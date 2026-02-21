import { describe, expect, it } from "vitest";

import {
  computeQuickLayerRetryDelayMs,
  getHttpStatusFromError,
  shouldRetryQuickLayerError,
} from "../../src/components/quickLayerRetry";

describe("quickLayerRetry helpers", () => {
  it("extracts HTTP status from error objects", () => {
    expect(getHttpStatusFromError({ status: 429 })).toBe(429);
    expect(getHttpStatusFromError({ status: "429" })).toBeNull();
    expect(getHttpStatusFromError(null)).toBeNull();
  });

  it("retries only on retryable status codes before max attempts", () => {
    expect(shouldRetryQuickLayerError({ status: 429 }, 1, 3)).toBe(true);
    expect(shouldRetryQuickLayerError({ status: 503 }, 2, 3)).toBe(true);
    expect(shouldRetryQuickLayerError({ status: 404 }, 1, 3)).toBe(false);
    expect(shouldRetryQuickLayerError({ status: 429 }, 3, 3)).toBe(false);
  });

  it("computes bounded exponential delay with jitter", () => {
    expect(computeQuickLayerRetryDelayMs(1, () => 0)).toBe(450);
    expect(computeQuickLayerRetryDelayMs(2, () => 0)).toBe(900);
    expect(computeQuickLayerRetryDelayMs(20, () => 0)).toBe(3600);
    expect(computeQuickLayerRetryDelayMs(1, () => 0.5)).toBe(575);
  });
});
