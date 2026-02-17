import { describe, expect, it } from "vitest";
import {
  buildTrainingEnvironmentManifest,
  computeTrainingEnvironmentFingerprint,
  createTrainingEnvironmentConfig,
  DEFAULT_HYPERPARAM_SPACE,
  DEFAULT_RLVR_CONFIG,
} from "./environment.js";

describe("createTrainingEnvironmentConfig", () => {
  it("builds environment config with defaults", () => {
    const config = createTrainingEnvironmentConfig({
      id: "env-1",
      datasetFile: "/tmp/dataset.json",
      outputDir: "/tmp/out",
    });

    expect(config.id).toBe("env-1");
    expect(config.rlvr.learningRate).toBe(DEFAULT_RLVR_CONFIG.learningRate);
    expect(config.hyperparameterSpace.learningRate).toEqual(
      DEFAULT_HYPERPARAM_SPACE.learningRate,
    );
  });
});

describe("computeTrainingEnvironmentFingerprint", () => {
  it("is deterministic for the same config", () => {
    const config = createTrainingEnvironmentConfig({
      id: "env-2",
      datasetFile: "/tmp/dataset.json",
      outputDir: "/tmp/out",
      createdAt: 123,
      metadata: { a: 1, b: 2 },
    });

    const first = computeTrainingEnvironmentFingerprint(config);
    const second = computeTrainingEnvironmentFingerprint(config);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("buildTrainingEnvironmentManifest", () => {
  it("includes computed fingerprint and optional job metadata", () => {
    const environment = createTrainingEnvironmentConfig({
      id: "env-3",
      datasetFile: "/tmp/dataset.json",
      outputDir: "/tmp/out",
      createdAt: 123,
    });

    const manifest = buildTrainingEnvironmentManifest({
      environment,
      job: { jobId: "job-1", status: "completed" },
    });

    expect(typeof manifest.fingerprint).toBe("string");
    expect(manifest.environment).toBe(environment);
    expect(manifest.job).toEqual({ jobId: "job-1", status: "completed" });
  });
});
