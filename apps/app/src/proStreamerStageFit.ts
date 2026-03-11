import * as THREE from "three";

export const PRO_STREAMER_STAGE_COVER_OVERSCAN = 1.01;

export type StageCoverFitAxis = "height" | "width";

export type StageCoverFitInput = {
  backdropWidth: number;
  backdropHeight: number;
  viewportAspect: number;
  cameraToPlaneDistance: number;
  overscan?: number;
};

export type StageCoverFitResult = {
  fitAxis: StageCoverFitAxis;
  visibleWidth: number;
  visibleHeight: number;
  fovRadians: number;
  fovDegrees: number;
};

export function computeStageCoverFit({
  backdropWidth,
  backdropHeight,
  viewportAspect,
  cameraToPlaneDistance,
  overscan = PRO_STREAMER_STAGE_COVER_OVERSCAN,
}: StageCoverFitInput): StageCoverFitResult {
  const safeBackdropWidth = Math.max(1e-3, backdropWidth);
  const safeBackdropHeight = Math.max(1e-3, backdropHeight);
  const safeAspect = Math.max(1e-3, viewportAspect);
  const safeDistance = Math.max(1e-3, cameraToPlaneDistance);
  const safeOverscan = Math.max(1, overscan);
  const backdropAspect = safeBackdropWidth / safeBackdropHeight;

  let fitAxis: StageCoverFitAxis = "height";
  let visibleHeight = safeBackdropHeight / safeOverscan;

  if (safeAspect > backdropAspect) {
    fitAxis = "width";
    visibleHeight = safeBackdropWidth / safeAspect / safeOverscan;
  }

  const visibleWidth = visibleHeight * safeAspect;
  const fovRadians = 2 * Math.atan((visibleHeight * 0.5) / safeDistance);

  return {
    fitAxis,
    visibleWidth,
    visibleHeight,
    fovRadians,
    fovDegrees: THREE.MathUtils.radToDeg(fovRadians),
  };
}
