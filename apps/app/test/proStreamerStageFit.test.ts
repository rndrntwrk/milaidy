import { describe, expect, it } from "vitest";

import { computeStageCoverFit } from "../src/proStreamerStageFit";

describe("proStreamerStageFit", () => {
  it("recreates the full stage composition for 16:9 full-stage", () => {
    const result = computeStageCoverFit({
      backdropWidth: 17.6,
      backdropHeight: 9.9,
      viewportAspect: 16 / 9,
      cameraToPlaneDistance: 16.7,
      overscan: 1,
    });

    expect(result.fitAxis).toBe("height");
    expect(result.visibleHeight).toBeCloseTo(9.9, 4);
    expect(result.visibleWidth).toBeCloseTo(17.6, 4);
    expect(result.fovDegrees).toBeCloseTo(33.02, 2);
  });

  it("keeps full height for narrower viewports and crops the sides only", () => {
    const result = computeStageCoverFit({
      backdropWidth: 17.6,
      backdropHeight: 9.9,
      viewportAspect: 1.25,
      cameraToPlaneDistance: 16.7,
    });

    expect(result.fitAxis).toBe("height");
    expect(result.visibleHeight).toBeLessThan(9.9);
    expect(result.visibleWidth).toBeLessThan(17.6);
  });

  it("keeps full width for wider viewports and crops top and bottom", () => {
    const result = computeStageCoverFit({
      backdropWidth: 17.6,
      backdropHeight: 9.9,
      viewportAspect: 2.4,
      cameraToPlaneDistance: 16.7,
    });

    expect(result.fitAxis).toBe("width");
    expect(result.visibleWidth).toBeLessThan(17.6);
    expect(result.visibleHeight).toBeLessThan(9.9);
  });

  it("uses overscan to slightly reduce the visible frustum and prevent leaks", () => {
    const exact = computeStageCoverFit({
      backdropWidth: 17.6,
      backdropHeight: 9.9,
      viewportAspect: 16 / 9,
      cameraToPlaneDistance: 16.7,
      overscan: 1,
    });
    const overscanned = computeStageCoverFit({
      backdropWidth: 17.6,
      backdropHeight: 9.9,
      viewportAspect: 16 / 9,
      cameraToPlaneDistance: 16.7,
      overscan: 1.01,
    });

    expect(overscanned.visibleHeight).toBeLessThan(exact.visibleHeight);
    expect(overscanned.visibleWidth).toBeLessThan(exact.visibleWidth);
    expect(overscanned.fovDegrees).toBeLessThan(exact.fovDegrees);
  });
});
