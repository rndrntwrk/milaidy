import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  FileCheckpointRegistry,
  InMemoryCheckpointRegistry,
} from "./checkpoint-registry.js";

describe("InMemoryCheckpointRegistry", () => {
  it("selects rollback candidate that improves current metrics", () => {
    const registry = new InMemoryCheckpointRegistry();
    registry.register({
      id: "ckpt-a",
      label: "A",
      artifactPath: "/tmp/a.ckpt",
      createdAt: 100,
      metrics: {
        finalAverageReward: 0.7,
        evaluationAverageReward: 0.65,
      },
    });
    registry.register({
      id: "ckpt-b",
      label: "B",
      artifactPath: "/tmp/b.ckpt",
      createdAt: 200,
      metrics: {
        finalAverageReward: 0.9,
        evaluationAverageReward: 0.85,
      },
    });

    const candidate = registry.selectRollbackCandidate({
      currentMetrics: {
        finalAverageReward: 0.6,
        evaluationAverageReward: 0.55,
      },
    });

    expect(candidate?.id).toBe("ckpt-b");
  });

  it("returns null when no candidate improves metrics", () => {
    const registry = new InMemoryCheckpointRegistry();
    registry.register({
      id: "ckpt-low",
      label: "Low",
      artifactPath: "/tmp/low.ckpt",
      createdAt: 100,
      metrics: {
        finalAverageReward: 0.2,
        evaluationAverageReward: 0.2,
      },
    });

    const candidate = registry.selectRollbackCandidate({
      currentMetrics: {
        finalAverageReward: 0.8,
        evaluationAverageReward: 0.75,
      },
    });
    expect(candidate).toBeNull();
  });

  it("builds rollback plan for selected checkpoint", () => {
    const registry = new InMemoryCheckpointRegistry();
    registry.register({
      id: "ckpt-plan",
      label: "Plan",
      artifactPath: "/tmp/plan.ckpt",
      createdAt: 100,
      metrics: { finalAverageReward: 0.9 },
    });

    const plan = registry.buildRollbackPlan({
      fromCheckpointId: "current-1",
      toCheckpointId: "ckpt-plan",
      reason: "Regression detected",
      createdAt: 200,
    });

    expect(plan.toCheckpointId).toBe("ckpt-plan");
    expect(plan.reason).toBe("Regression detected");
    expect(plan.steps.length).toBeGreaterThan(0);
  });
});

describe("FileCheckpointRegistry", () => {
  it("persists checkpoint records to disk and reloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "ckpt-registry-"));
    const file = join(dir, "checkpoints.json");

    const writer = new FileCheckpointRegistry(file);
    writer.register({
      id: "ckpt-file",
      label: "File",
      artifactPath: "/tmp/file.ckpt",
      createdAt: 123,
      metrics: { finalAverageReward: 0.88 },
    });

    const reader = new FileCheckpointRegistry(file);
    const restored = reader.get("ckpt-file");
    expect(restored).toBeDefined();
    expect(restored?.metrics.finalAverageReward).toBe(0.88);
  });
});
