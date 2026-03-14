import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const sizeScratch = new THREE.Vector3();

export type CameraProfile = "chat" | "companion" | "companion_close";
export type InteractionMode = "free" | "orbitZoom";

export type CameraAnimationConfig = {
  enabled: boolean;
  swayAmplitude: number;
  bobAmplitude: number;
  rotationAmplitude: number;
  speed: number;
};

/**
 * Handles VRM avatar framing, camera profile application, companion-mode
 * bounds-based camera fitting, camera sway animation, interaction modes,
 * and VRM face-orientation correction.
 */
export class VrmCameraManager {
  private readonly tempBoundsSize = new THREE.Vector3();
  private readonly tempBoundsCenter = new THREE.Vector3();
  private readonly tempWorldPosition = new THREE.Vector3();
  private readonly tempSecondaryWorldPosition = new THREE.Vector3();
  private readonly tempTertiaryWorldPosition = new THREE.Vector3();

  /**
   * Position and scale the VRM for the active camera profile, then place the
   * camera accordingly. Updates `lookAtTarget` and `baseCameraPosition` in place.
   */
  centerAndFrame(
    vrm: VRM,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls | null,
    cameraProfile: CameraProfile,
    lookAtTarget: THREE.Vector3,
    baseCameraPosition: THREE.Vector3,
    applyInteractionMode: (controls: OrbitControls) => void,
  ): void {
    this.normalizeAvatarToStage(vrm, cameraProfile);
    vrm.scene.updateMatrixWorld(true);
    camera.near = 0.1;
    camera.far = 100.0;
    this.applyCameraProfileToCamera(camera, controls, cameraProfile);
    this.adjustCompanionCameraForAvatarBounds(
      vrm,
      camera,
      controls,
      cameraProfile,
      lookAtTarget,
    );
    camera.updateProjectionMatrix();
    baseCameraPosition.copy(camera.position);

    if (controls) {
      controls.target.copy(lookAtTarget);
      applyInteractionMode(controls);
      controls.update();
    }
  }

  private normalizeAvatarToStage(vrm: VRM, cameraProfile: CameraProfile): void {
    vrm.scene.scale.setScalar(1);
    vrm.scene.position.set(0, 0, 0);
    vrm.scene.updateMatrixWorld(true);

    const initialBounds = new THREE.Box3().setFromObject(vrm.scene);
    if (initialBounds.isEmpty()) return;

    const initialSize = initialBounds.getSize(this.tempBoundsSize);
    const avatarHeight = Math.max(initialSize.y, 1e-3);
    const targetHeight =
      cameraProfile === "chat"
        ? 1.62
        : cameraProfile === "companion_close"
          ? 1.72
          : 1.76;
    const normalizedScale = THREE.MathUtils.clamp(
      targetHeight / avatarHeight,
      0.75,
      2.35,
    );

    vrm.scene.scale.setScalar(normalizedScale);
    vrm.scene.updateMatrixWorld(true);

    const normalizedBounds = new THREE.Box3().setFromObject(vrm.scene);
    if (normalizedBounds.isEmpty()) return;

    const feetAnchor = this.getAvatarFeetAnchor(vrm, normalizedBounds);
    normalizedBounds.getCenter(this.tempBoundsCenter);
    vrm.scene.position.set(
      -this.tempBoundsCenter.x,
      -feetAnchor.y,
      -this.tempBoundsCenter.z,
    );
    vrm.scene.updateMatrixWorld(true);
  }

  /**
   * For the companion profile, adapt camera distance so the full avatar
   * body stays in frame regardless of model dimensions.
   */
  adjustCompanionCameraForAvatarBounds(
    vrm: VRM,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls | null,
    cameraProfile: CameraProfile,
    lookAtTarget: THREE.Vector3,
  ): void {
    const bounds = new THREE.Box3().setFromObject(vrm.scene);
    if (bounds.isEmpty()) return;

    const size = this.tempBoundsSize;
    const center = this.tempBoundsCenter;
    bounds.getSize(size);
    bounds.getCenter(center);

    if (
      !Number.isFinite(size.x) ||
      !Number.isFinite(size.y) ||
      !Number.isFinite(size.z)
    ) {
      return;
    }

    const verticalPadding = cameraProfile === "chat" ? 1.18 : 1.1;
    const horizontalPadding = cameraProfile === "chat" ? 1.18 : 1.08;
    const halfHeight = Math.max((size.y * verticalPadding) / 2, 0.58);
    const halfWidth = Math.max((size.x * horizontalPadding) / 2, 0.4);

    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov =
      2 * Math.atan(Math.max(1e-4, Math.tan(verticalFov / 2) * camera.aspect));

    const distanceByHeight =
      halfHeight / Math.max(1e-4, Math.tan(verticalFov / 2));
    const distanceByWidth =
      halfWidth / Math.max(1e-4, Math.tan(horizontalFov / 2));
    const fitDistance = Math.max(distanceByHeight, distanceByWidth);
    const neckY = this.getAvatarNeckHeight(vrm, bounds);
    let lookAtY = neckY;
    let distance = fitDistance;
    let cameraY = neckY + Math.min(size.y * 0.08, 0.18);

    if (cameraProfile === "companion_close") {
      lookAtY = neckY;
      distance = Math.max(0.92, fitDistance * 0.42);
      cameraY = neckY;
    } else if (cameraProfile === "companion") {
      lookAtY = neckY;
      distance = Math.max(2.2, fitDistance * 0.76);
      cameraY = neckY + Math.min(size.y * 0.06, 0.14);
    } else {
      lookAtY = THREE.MathUtils.clamp(
        neckY - size.y * 0.08,
        bounds.min.y + size.y * 0.38,
        bounds.max.y - size.y * 0.16,
      );
      distance = Math.max(2.8, fitDistance * 1.02);
      cameraY = lookAtY + Math.min(size.y * 0.12, 0.24);
    }

    lookAtTarget.set(center.x, lookAtY, center.z);
    camera.position.set(center.x, cameraY, center.z + distance);

    if (controls) {
      controls.minDistance =
        cameraProfile === "companion_close"
          ? Math.max(0.7, distance * 0.78)
          : Math.max(1.4, distance * 0.7);
      controls.maxDistance = Math.max(6.4, distance * 1.8);
    }
  }

  private getAvatarFeetAnchor(vrm: VRM, bounds: THREE.Box3): THREE.Vector3 {
    const leftFoot = vrm.humanoid?.getNormalizedBoneNode("leftFoot");
    const rightFoot = vrm.humanoid?.getNormalizedBoneNode("rightFoot");
    if (leftFoot && rightFoot) {
      leftFoot.getWorldPosition(this.tempWorldPosition);
      rightFoot.getWorldPosition(this.tempSecondaryWorldPosition);
      return this.tempTertiaryWorldPosition
        .copy(this.tempWorldPosition)
        .add(this.tempSecondaryWorldPosition)
        .multiplyScalar(0.5);
    }

    const center = bounds.getCenter(this.tempTertiaryWorldPosition);
    return center.set(center.x, bounds.min.y, center.z);
  }

  private getAvatarNeckHeight(vrm: VRM, bounds: THREE.Box3): number {
    const neckNode = vrm.humanoid?.getNormalizedBoneNode("neck");
    if (neckNode) {
      neckNode.getWorldPosition(this.tempWorldPosition);
      if (Number.isFinite(this.tempWorldPosition.y)) {
        return this.tempWorldPosition.y;
      }
    }

    const headNode = vrm.humanoid?.getNormalizedBoneNode("head");
    const chestNode =
      vrm.humanoid?.getNormalizedBoneNode("upperChest") ??
      vrm.humanoid?.getNormalizedBoneNode("chest") ??
      vrm.humanoid?.getNormalizedBoneNode("spine");
    if (headNode && chestNode) {
      headNode.getWorldPosition(this.tempWorldPosition);
      chestNode.getWorldPosition(this.tempSecondaryWorldPosition);
      const averagedY =
        (this.tempWorldPosition.y + this.tempSecondaryWorldPosition.y) / 2;
      if (Number.isFinite(averagedY)) {
        return averagedY;
      }
    }

    return bounds.min.y + Math.max(bounds.getSize(sizeScratch).y * 0.72, 0.9);
  }

  /**
   * Apply preset camera position, FOV and orbit constraints for the given
   * camera profile.
   */
  applyCameraProfileToCamera(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls | null,
    cameraProfile: CameraProfile,
  ): void {
    if (cameraProfile === "companion" || cameraProfile === "companion_close") {
      camera.position.set(
        0,
        1.24,
        cameraProfile === "companion_close" ? 1.1 : 3,
      );
      camera.fov = cameraProfile === "companion_close" ? 22 : 28;
      if (controls) {
        controls.minDistance = cameraProfile === "companion_close" ? 0.7 : 1.4;
        controls.maxDistance = 7.0;
        controls.minPolarAngle = Math.PI * 0.16;
        controls.maxPolarAngle = Math.PI * 0.86;
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
      }
      return;
    }

    camera.position.set(0, 1.1, 3.6);
    camera.fov = 34;
    if (controls) {
      controls.minDistance = 2.0;
      controls.maxDistance = 8.0;
      controls.minPolarAngle = Math.PI * 0.06;
      controls.maxPolarAngle = Math.PI * 0.94;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
    }
  }

  /**
   * Apply camera sway animation when not in manual interaction mode.
   * Applies layered sine-wave offsets to position and rotation.
   */
  applyCameraSway(
    camera: THREE.PerspectiveCamera,
    baseCameraPosition: THREE.Vector3,
    cameraAnimation: CameraAnimationConfig,
    elapsedTime: number,
  ): void {
    const t = elapsedTime * cameraAnimation.speed;

    const swayX =
      Math.sin(t * 0.5) * 0.6 +
      Math.sin(t * 0.8 + 1.2) * 0.25 +
      Math.sin(t * 1.3 + 2.5) * 0.15;

    const bobY =
      Math.sin(t * 0.7 + 0.5) * 0.5 +
      Math.sin(t * 1.1 + 1.8) * 0.3 +
      Math.sin(t * 0.3) * 0.2;

    const swayZ = Math.sin(t * 0.4 + 1.0) * 0.4 + Math.sin(t * 0.9 + 2.0) * 0.3;

    camera.position.x =
      baseCameraPosition.x + swayX * cameraAnimation.swayAmplitude;
    camera.position.y =
      baseCameraPosition.y + bobY * cameraAnimation.bobAmplitude;
    camera.position.z =
      baseCameraPosition.z + swayZ * cameraAnimation.swayAmplitude * 0.5;

    const rotX =
      Math.sin(t * 0.6 + 0.3) * cameraAnimation.rotationAmplitude * 0.5;
    const rotY = Math.sin(t * 0.4) * cameraAnimation.rotationAmplitude;

    camera.rotation.x = rotX;
    camera.rotation.y = rotY;
  }

  /** Configure OrbitControls for the given interaction mode. */
  applyInteractionMode(
    controls: OrbitControls,
    interactionMode: InteractionMode,
  ): void {
    if (interactionMode === "orbitZoom") {
      controls.enablePan = false;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.screenSpacePanning = false;
      controls.rotateSpeed = 1.15;
      controls.zoomSpeed = 0.85;
      return;
    }

    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.9;
  }

  /**
   * Detect whether the VRM is facing away from the camera using eye-bone
   * heuristics, and rotate it 180 degrees if needed.
   */
  ensureFacingCamera(vrm: VRM, camera: THREE.PerspectiveCamera): void {
    vrm.scene.updateMatrixWorld(true);

    const forward = new THREE.Vector3();
    const leftEye = vrm.humanoid?.getNormalizedBoneNode("leftEye");
    const rightEye = vrm.humanoid?.getNormalizedBoneNode("rightEye");

    if (leftEye && rightEye) {
      const left = new THREE.Vector3();
      const right = new THREE.Vector3();
      leftEye.getWorldPosition(left);
      rightEye.getWorldPosition(right);

      const eyeRight = right.sub(left);
      if (eyeRight.lengthSq() > 1e-6) {
        // Up x Right best matches this VRM rig orientation in our current scene setup.
        forward
          .copy(new THREE.Vector3(0, 1, 0))
          .cross(eyeRight)
          .normalize();
      }
    }

    if (forward.lengthSq() < 1e-6) {
      // Fallback when eye bones are unavailable.
      vrm.scene.getWorldDirection(forward);
    }

    const anchor =
      vrm.humanoid?.getNormalizedBoneNode("head") ??
      vrm.humanoid?.getNormalizedBoneNode("hips") ??
      vrm.scene;
    const anchorPos = new THREE.Vector3();
    anchor.getWorldPosition(anchorPos);
    const toCamera = new THREE.Vector3().subVectors(camera.position, anchorPos);

    forward.y = 0;
    toCamera.y = 0;
    if (forward.lengthSq() < 1e-6 || toCamera.lengthSq() < 1e-6) return;

    forward.normalize();
    toCamera.normalize();

    if (forward.dot(toCamera) < 0) {
      vrm.scene.rotateY(Math.PI);
      vrm.scene.updateMatrixWorld(true);
    }
  }
}
