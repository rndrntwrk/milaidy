/**
 * Performance load testing for the autonomy kernel pipeline.
 *
 * Measures throughput, latency, and concurrency behavior
 * of the execution pipeline under controlled load.
 *
 * @module autonomy/benchmarks/performance/load-test
 */

// ---------- Types ----------

export interface LoadTestConfig {
  /** Total number of requests to run. */
  totalRequests: number;
  /** Maximum concurrent requests. */
  concurrency: number;
  /** Per-request timeout in ms. */
  timeoutMs: number;
}

export interface LoadTestResult {
  /** Total requests completed (success + failure). */
  totalCompleted: number;
  /** Successful requests. */
  successes: number;
  /** Failed requests. */
  failures: number;
  /** Total duration in ms. */
  durationMs: number;
  /** Requests per second. */
  throughput: number;
  /** Latency percentiles in ms. */
  latency: {
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    avg: number;
  };
}

// ---------- Helpers ----------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------- Runner ----------

/**
 * Run a load test against an async workload function.
 *
 * The workload function should throw on failure. Each call is
 * measured independently for latency tracking.
 */
export async function runLoadTest(
  config: LoadTestConfig,
  workload: () => Promise<void>,
): Promise<LoadTestResult> {
  const latencies: number[] = [];
  let successes = 0;
  let failures = 0;
  let pending = 0;
  let dispatched = 0;

  const start = Date.now();

  await new Promise<void>((resolve) => {
    function tryDispatch() {
      while (pending < config.concurrency && dispatched < config.totalRequests) {
        pending++;
        dispatched++;
        const reqStart = Date.now();

        workload()
          .then(() => {
            successes++;
            latencies.push(Date.now() - reqStart);
          })
          .catch(() => {
            failures++;
            latencies.push(Date.now() - reqStart);
          })
          .finally(() => {
            pending--;
            if (dispatched >= config.totalRequests && pending === 0) {
              resolve();
            } else {
              tryDispatch();
            }
          });
      }
    }
    tryDispatch();

    // Safety: if totalRequests is 0
    if (config.totalRequests === 0) resolve();
  });

  const durationMs = Date.now() - start;
  const sorted = latencies.slice().sort((a, b) => a - b);

  return {
    totalCompleted: successes + failures,
    successes,
    failures,
    durationMs,
    throughput: durationMs > 0 ? (successes / durationMs) * 1000 : 0,
    latency: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
    },
  };
}
