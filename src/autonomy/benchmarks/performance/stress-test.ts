/**
 * Stress testing for autonomy kernel components.
 *
 * Tests behavior under extreme conditions: high volume,
 * concurrent access, and resource exhaustion scenarios.
 *
 * @module autonomy/benchmarks/performance/stress-test
 */

// ---------- Types ----------

export interface StressTestConfig {
  /** Duration to run the stress test in ms. */
  durationMs: number;
  /** Rate of operations per second (0 = as fast as possible). */
  opsPerSecond: number;
  /** Maximum buffer/queue size to test. */
  maxBufferSize: number;
}

export interface StressTestResult {
  /** Total operations attempted. */
  totalOps: number;
  /** Operations that succeeded. */
  successOps: number;
  /** Operations that failed or were rejected. */
  failedOps: number;
  /** Whether the system remained stable (no crashes, no data loss). */
  stable: boolean;
  /** Duration in ms. */
  durationMs: number;
  /** Peak memory usage delta in bytes (approximate). */
  peakMemoryDeltaBytes: number;
  /** Notes about observed behavior. */
  notes: string[];
}

// ---------- Runner ----------

/**
 * Run a time-bounded stress test.
 *
 * Calls the operation function repeatedly for the specified duration,
 * tracking success/failure rates and memory usage.
 */
export async function runStressTest(
  config: StressTestConfig,
  operation: () => Promise<void>,
): Promise<StressTestResult> {
  const notes: string[] = [];
  let totalOps = 0;
  let successOps = 0;
  let failedOps = 0;

  const memBefore = process.memoryUsage().heapUsed;
  let peakMemory = memBefore;

  const deadline = Date.now() + config.durationMs;
  const intervalMs = config.opsPerSecond > 0 ? 1000 / config.opsPerSecond : 0;

  while (Date.now() < deadline) {
    totalOps++;
    try {
      await operation();
      successOps++;
    } catch {
      failedOps++;
    }

    const currentMem = process.memoryUsage().heapUsed;
    if (currentMem > peakMemory) peakMemory = currentMem;

    if (intervalMs > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  const stable = failedOps === 0 || failedOps / totalOps < 0.05;
  if (!stable) {
    notes.push(`High failure rate: ${((failedOps / totalOps) * 100).toFixed(1)}%`);
  }

  return {
    totalOps,
    successOps,
    failedOps,
    stable,
    durationMs: config.durationMs,
    peakMemoryDeltaBytes: peakMemory - memBefore,
    notes,
  };
}
