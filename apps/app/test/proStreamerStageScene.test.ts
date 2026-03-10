import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  PRO_STREAMER_STAGE_NODE_NAMES,
  deriveFullStageMark,
  derivePortraitStageMark,
  extractProStreamerStageScene,
} from "../src/proStreamerStageScene";

function forwardVector(quaternion: THREE.Quaternion): THREE.Vector3 {
  return new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
}

function buildStageScene(options?: {
  includeAnchor?: boolean;
  includeBackdrop?: boolean;
  includeStageCamera?: boolean;
}) {
  const {
    includeAnchor = true,
    includeBackdrop = true,
    includeStageCamera = true,
  } = options ?? {};
  const sceneRoot = new THREE.Group();

  if (includeBackdrop) {
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 2),
      new THREE.MeshBasicMaterial(),
    );
    backdrop.name = PRO_STREAMER_STAGE_NODE_NAMES.backdrop;
    backdrop.position.set(0, 1.8, -1.4);
    sceneRoot.add(backdrop);
  }

  if (includeAnchor) {
    const anchor = new THREE.Object3D();
    anchor.name = PRO_STREAMER_STAGE_NODE_NAMES.avatarAnchor;
    anchor.position.set(0, 0.28, -0.8);
    anchor.userData = {
      target_height_m: 1.8,
      shadow_plane_width: 2.6,
      shadow_plane_depth: 2.2,
    };
    sceneRoot.add(anchor);
  }

  if (includeStageCamera) {
    const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 500);
    camera.name = PRO_STREAMER_STAGE_NODE_NAMES.stageCamera;
    camera.position.set(0.8, 1.9, 5.7);
    sceneRoot.add(camera);
  }

  sceneRoot.updateMatrixWorld(true);
  return sceneRoot;
}

describe("proStreamerStageScene", () => {
  it("extracts backdrop metrics, parsed anchor metadata, and authored marks", () => {
    const sceneRoot = buildStageScene();
    const contract = extractProStreamerStageScene(sceneRoot);
    const cameraPosition = contract.stageCamera.getWorldPosition(new THREE.Vector3());
    const stageTowardCamera = new THREE.Vector3(
      cameraPosition.x - contract.stageMark.position.x,
      0,
      cameraPosition.z - contract.stageMark.position.z,
    ).normalize();
    const portraitTowardCamera = new THREE.Vector3(
      cameraPosition.x - contract.portraitMark.position.x,
      0,
      cameraPosition.z - contract.portraitMark.position.z,
    ).normalize();

    expect(contract.backdrop.name).toBe(PRO_STREAMER_STAGE_NODE_NAMES.backdrop);
    expect(contract.avatarAnchor.name).toBe(PRO_STREAMER_STAGE_NODE_NAMES.avatarAnchor);
    expect(contract.stageCamera.name).toBe(PRO_STREAMER_STAGE_NODE_NAMES.stageCamera);
    expect(contract.anchorMetadata.targetHeightM).toBeCloseTo(1.8, 5);
    expect(contract.anchorMetadata.shadowPlaneWidth).toBeCloseTo(2.6, 5);
    expect(contract.anchorMetadata.shadowPlaneDepth).toBeCloseTo(2.2, 5);
    expect(contract.backdropMetrics.width).toBeCloseTo(4, 5);
    expect(contract.backdropMetrics.height).toBeCloseTo(2, 5);
    expect(contract.backdropMetrics.aspect).toBeCloseTo(2, 5);
    expect(contract.backdropMetrics.cameraToPlaneDistance).toBeGreaterThan(0);
    expect(contract.stageMark.position.y).toBeCloseTo(contract.portraitMark.position.y, 5);
    expect(contract.stageMark.position.x).toBeCloseTo(0, 5);
    expect(contract.stageMark.position.y).toBeCloseTo(0.28, 5);
    expect(contract.stageMark.position.z).toBeCloseTo(-0.8, 5);
    expect(contract.portraitMark.position.z).toBeGreaterThan(contract.stageMark.position.z);
    expect(forwardVector(contract.stageMark.quaternion).dot(stageTowardCamera)).toBeGreaterThan(0.99);
    expect(forwardVector(contract.portraitMark.quaternion).dot(portraitTowardCamera)).toBeGreaterThan(0.99);
  });

  it("rejects a stage scene missing required nodes", () => {
    expect(() =>
      extractProStreamerStageScene(buildStageScene({ includeBackdrop: false })),
    ).toThrow("StageBackdrop");
    expect(() =>
      extractProStreamerStageScene(buildStageScene({ includeAnchor: false })),
    ).toThrow("AvatarAnchor");
    expect(() =>
      extractProStreamerStageScene(buildStageScene({ includeStageCamera: false })),
    ).toThrow("StageCamera");
  });

  it("keeps the full-stage mark at the anchor and moves the portrait mark toward camera", () => {
    const anchorPosition = new THREE.Vector3(0, 0.42, -1.4);
    const cameraPosition = new THREE.Vector3(0.9, 1.8, 6.2);
    const anchorQuaternion = new THREE.Quaternion();
    const stage = deriveFullStageMark(
      anchorPosition,
      cameraPosition,
      anchorQuaternion,
    );

    const portrait = derivePortraitStageMark(
      stage.position,
      cameraPosition,
      stage.quaternion,
    );

    expect(stage.position.y).toBeCloseTo(anchorPosition.y, 5);
    expect(stage.position.x).toBeCloseTo(anchorPosition.x, 5);
    expect(stage.position.z).toBeCloseTo(anchorPosition.z, 5);
    expect(portrait.position.y).toBeCloseTo(anchorPosition.y, 5);
    expect(portrait.position.distanceTo(stage.position)).toBeGreaterThan(0);
    expect(portrait.position.distanceTo(stage.position)).toBeLessThanOrEqual(2.4);
    expect(portrait.position.z).toBeGreaterThan(stage.position.z);
  });
});
