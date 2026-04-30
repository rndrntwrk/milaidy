import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  FileExperimentRegistry,
  InMemoryExperimentRegistry,
} from "./experiment-registry.js";

describe("InMemoryExperimentRegistry", () => {
  it("tracks run lifecycle, metrics, and artifacts", () => {
    const registry = new InMemoryExperimentRegistry();
    registry.createRun({
      id: "run-1",
      label: "baseline",
      startedAt: 100,
      configFingerprint: "abc123",
      parameters: { learningRate: 1e-5 },
    });
    registry.updateMetrics("run-1", { finalAverageReward: 0.8 });
    registry.addArtifact("run-1", {
      id: "report-1",
      kind: "report",
      path: "/tmp/report.md",
      createdAt: 120,
    });
    const completed = registry.completeRun("run-1", "succeeded", {
      completedAt: 130,
    });

    expect(completed.status).toBe("succeeded");
    expect(completed.metrics.finalAverageReward).toBe(0.8);
    expect(completed.artifacts).toHaveLength(1);
  });

  it("returns best run by metric direction", () => {
    const registry = new InMemoryExperimentRegistry();
    registry.createRun({
      id: "run-a",
      label: "A",
      configFingerprint: "a",
      metrics: { score: 0.7 },
    });
    registry.createRun({
      id: "run-b",
      label: "B",
      configFingerprint: "b",
      metrics: { score: 0.9 },
    });

    expect(registry.bestRun("score", "higher")?.id).toBe("run-b");
    expect(registry.bestRun("score", "lower")?.id).toBe("run-a");
  });
});

describe("FileExperimentRegistry", () => {
  it("persists runs to disk and reloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "exp-registry-"));
    const file = join(dir, "registry.json");

    const writer = new FileExperimentRegistry(file);
    writer.createRun({
      id: "run-file",
      label: "file",
      startedAt: 200,
      configFingerprint: "file-fp",
      metrics: { reward: 0.5 },
    });
    writer.completeRun("run-file", "succeeded", { completedAt: 210 });

    const reader = new FileExperimentRegistry(file);
    const run = reader.getRun("run-file");
    expect(run).toBeDefined();
    expect(run?.status).toBe("succeeded");
    expect(run?.metrics.reward).toBe(0.5);
  });
});
