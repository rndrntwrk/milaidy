import { describe, expect, it } from "vitest";
import type { RLVRTrainingDataset } from "./dataset.js";
import { createTrainingEnvironmentConfig } from "./environment.js";
import { TrainingJobOrchestrator } from "./job-orchestrator.js";

function makeDataset(
  examples: Array<{ id: string; toolName: string; reward: number }>,
): RLVRTrainingDataset {
  return {
    id: "dataset-train",
    label: "training",
    createdAt: Date.now(),
    examples: examples.map((example) => ({
      ...example,
      source: "autonomous",
      scenarioId: example.id,
    })),
  };
}

describe("TrainingJobOrchestrator", () => {
  it("runs tuning and training end-to-end", async () => {
    const orchestrator = new TrainingJobOrchestrator();
    const environment = createTrainingEnvironmentConfig({
      id: "env-train",
      datasetFile: "/tmp/dataset.json",
      outputDir: "/tmp/out",
      hyperparameterSpace: {
        learningRate: [1e-5, 2e-5],
        batchSize: [16, 32],
      },
      createdAt: 123,
    });

    const result = await orchestrator.run({
      dataset: makeDataset([
        { id: "e1", toolName: "READ_FILE", reward: 0.7 },
        { id: "e2", toolName: "WRITE_FILE", reward: 0.8 },
        { id: "e3", toolName: "SEARCH", reward: 0.9 },
      ]),
      environment,
    });

    expect(result.jobId).toMatch(/^train-[a-f0-9]{12}$/);
    expect(result.tuning.trials.length).toBe(12);
    expect(result.training.success).toBe(true);
    expect(result.evaluation.scores).toHaveLength(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fails fast when dataset has no examples", async () => {
    const orchestrator = new TrainingJobOrchestrator();
    const environment = createTrainingEnvironmentConfig({
      id: "env-empty",
      datasetFile: "/tmp/empty.json",
      outputDir: "/tmp/out",
      createdAt: 123,
    });

    await expect(
      orchestrator.run({
        dataset: makeDataset([]),
        environment,
      }),
    ).rejects.toThrow("Training dataset is empty");
  });
});
