import { afterEach, describe, expect, it } from "vitest";

import { shouldEnableTrajectoryLoggingByDefault } from "../src/runtime/trajectory-persistence";

describe("shouldEnableTrajectoryLoggingByDefault", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMiladyCloudProvisioned = process.env.MILADY_CLOUD_PROVISIONED;
  const originalElizaCloudProvisioned = process.env.ELIZA_CLOUD_PROVISIONED;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalMiladyCloudProvisioned === undefined) {
      delete process.env.MILADY_CLOUD_PROVISIONED;
    } else {
      process.env.MILADY_CLOUD_PROVISIONED = originalMiladyCloudProvisioned;
    }

    if (originalElizaCloudProvisioned === undefined) {
      delete process.env.ELIZA_CLOUD_PROVISIONED;
    } else {
      process.env.ELIZA_CLOUD_PROVISIONED = originalElizaCloudProvisioned;
    }
  });

  it("stays enabled in development", () => {
    process.env.NODE_ENV = "development";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });

  it("remains disabled for non-cloud production runtimes", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(false);
  });

  it("enables trajectory logging by default for Milady cloud-provisioned production containers", () => {
    process.env.NODE_ENV = "production";
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    delete process.env.ELIZA_CLOUD_PROVISIONED;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });

  it("enables trajectory logging by default for legacy Eliza cloud-provisioned production containers", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    process.env.ELIZA_CLOUD_PROVISIONED = "1";

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });
});
