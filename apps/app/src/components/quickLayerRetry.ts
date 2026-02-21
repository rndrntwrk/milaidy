export const QUICK_LAYER_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function getHttpStatusFromError(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

export function shouldRetryQuickLayerError(
  err: unknown,
  attempt: number,
  maxAttempts: number,
): boolean {
  const status = getHttpStatusFromError(err);
  return (
    attempt < maxAttempts &&
    status !== null &&
    QUICK_LAYER_RETRYABLE_STATUS.has(status)
  );
}

export function computeQuickLayerRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const normalizedAttempt = Math.max(1, attempt);
  const backoffMs = Math.min(3600, 450 * 2 ** (normalizedAttempt - 1));
  const jitterMs = Math.floor(random() * 250);
  return backoffMs + jitterMs;
}
