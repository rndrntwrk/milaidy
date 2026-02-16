/**
 * Tests for FileBaselineHarness disk persistence.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { BaselineMetrics, EvaluationScenario } from "./types.js";

// Mock fs modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock telemetry and event bus
vi.mock("../../telemetry/setup.js", () => ({
  metrics: {
    histogram: vi.fn(),
    gauge: vi.fn(),
  },
}));
vi.mock("../../events/event-bus.js", () => ({
  emit: vi.fn(),
  getEventBus: vi.fn(() => ({ emit: vi.fn() })),
}));

const fs = await import("node:fs");
const { FileBaselineHarness } = await import("./file-harness.js");

// ---------- Helpers ----------

function makeMetrics(
  overrides: Partial<BaselineMetrics> = {},
): BaselineMetrics {
  return {
    preferenceFollowingAccuracy: 0.9,
    instructionCompletionRate: 0.85,
    personaDriftScore: 0.05,
    memoryPoisoningResistance: 0.95,
    compoundingErrorRate: 0.03,
    sycophancyScore: 0.1,
    turnCount: 10,
    measuredAt: Date.now(),
    ...overrides,
  };
}

// ---------- Tests ----------

describe("FileBaselineHarness", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts fresh when no snapshot file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const harness = new FileBaselineHarness("/tmp/metrics");

    expect(harness.listSnapshots()).toHaveLength(0);
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it("loads existing snapshots from disk on construction", () => {
    const diskData = {
      "baseline-v1": makeMetrics({ label: "baseline-v1" }),
      "post-phase1": makeMetrics({
        preferenceFollowingAccuracy: 0.95,
        label: "post-phase1",
      }),
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(diskData));

    const harness = new FileBaselineHarness("/tmp/metrics");

    expect(harness.listSnapshots()).toEqual(["baseline-v1", "post-phase1"]);
  });

  it("writes snapshots to disk as JSON", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const harness = new FileBaselineHarness("/tmp/metrics");
    const m = makeMetrics();

    await harness.snapshot(m, "v1");

    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    const [filePath, content] = vi.mocked(fs.writeFileSync).mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(filePath).toContain("baseline-snapshots.json");

    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty("v1");
    expect(parsed.v1.preferenceFollowingAccuracy).toBe(0.9);
  });

  it("survives corrupt file gracefully", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("not valid json {{{");

    // Should not throw — logs warning and starts fresh
    const harness = new FileBaselineHarness("/tmp/metrics");
    expect(harness.listSnapshots()).toHaveLength(0);
  });

  it("measure() delegates to inner harness", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const harness = new FileBaselineHarness("/tmp/metrics");
    const scenarios: EvaluationScenario[] = [
      {
        id: "test:scenario",
        metric: "preferenceFollowingAccuracy",
        description: "Test",
        prompts: ["test"],
        expectedBehavior: "test",
        turns: 1,
      },
    ];

    const result = await harness.measure("agent-1", scenarios);

    // Without evaluator, should return 0 (stub behavior)
    expect(result.preferenceFollowingAccuracy).toBe(0);
    expect(result.turnCount).toBe(1);
  });

  it("compare() works with disk-loaded snapshots", async () => {
    const diskData = {
      v1: makeMetrics({
        preferenceFollowingAccuracy: 0.8,
        label: "v1",
      }),
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(diskData));

    const harness = new FileBaselineHarness("/tmp/metrics");

    const current = makeMetrics({ preferenceFollowingAccuracy: 0.95 });
    const delta = await harness.compare(current, "v1");

    expect(delta).not.toBeNull();
    expect(delta!.baselineLabel).toBe("v1");

    const prefDelta = delta!.deltas.find(
      (d) => d.metric === "preferenceFollowingAccuracy",
    )!;
    expect(prefDelta.baseline).toBe(0.8);
    expect(prefDelta.current).toBe(0.95);
    expect(prefDelta.direction).toBe("improved");
  });

  it("creates directory if it does not exist", async () => {
    // First call (constructor): path doesn't exist
    // Second call (saveToDisk): dir doesn't exist
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const harness = new FileBaselineHarness("/new/dir/path");
    await harness.snapshot(makeMetrics(), "v1");

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("/new/dir/path"),
      { recursive: true },
    );
  });
});
