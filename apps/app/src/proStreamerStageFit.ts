import * as THREE from "three";

export const PRO_STREAMER_STAGE_COVER_OVERSCAN = 1.01;
export const PRO_STREAMER_STAGE_SAFE_FRAME = {
  stage: {
    maxHeightRatio: 0.8,
    maxWidthRatio: 0.56,
  },
  portrait: {
    maxHeightRatio: 0.86,
    maxWidthRatio: 0.78,
  },
} as const;

export type StageCoverFitAxis = "height" | "width";
export type StageAvatarSafeFrameMark = keyof typeof PRO_STREAMER_STAGE_SAFE_FRAME;

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

export type StageAvatarSafeFrame = {
  maxHeightRatio: number;
  maxWidthRatio: number;
};

export type StageAvatarSafeScaleInput = {
  projectedHeightRatio: number;
  projectedWidthRatio: number;
  safeFrame: StageAvatarSafeFrame;
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

export function getStageAvatarSafeFrame(
  mark: StageAvatarSafeFrameMark,
): StageAvatarSafeFrame {
  return PRO_STREAMER_STAGE_SAFE_FRAME[mark];
}

export function computeStageAvatarSafeScale({
  projectedHeightRatio,
  projectedWidthRatio,
  safeFrame,
}: StageAvatarSafeScaleInput): number {
  const safeHeightRatio = Math.max(1e-3, safeFrame.maxHeightRatio);
  const safeWidthRatio = Math.max(1e-3, safeFrame.maxWidthRatio);
  const safeProjectedHeightRatio = Math.max(0, projectedHeightRatio);
  const safeProjectedWidthRatio = Math.max(0, projectedWidthRatio);

  const heightScale =
    safeProjectedHeightRatio > 0
      ? safeHeightRatio / safeProjectedHeightRatio
      : 1;
  const widthScale =
    safeProjectedWidthRatio > 0
      ? safeWidthRatio / safeProjectedWidthRatio
      : 1;

  return Math.max(0.05, Math.min(1, heightScale, widthScale));
}
