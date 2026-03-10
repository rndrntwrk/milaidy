import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveAppAssetUrl } from "./asset-url";

export const PRO_STREAMER_STAGE_ASSET_PATH = "stages/pro-streamer-stage.glb";
export const PRO_STREAMER_STAGE_ASSET_URL = resolveAppAssetUrl(
  PRO_STREAMER_STAGE_ASSET_PATH,
);

export const PRO_STREAMER_STAGE_NODE_NAMES = {
  backdrop: "StageBackdrop",
  avatarAnchor: "AvatarAnchor",
  stageCamera: "StageCamera",
} as const;

export type StageScenePreset = "default" | "pro-streamer-stage";
export type StageSceneMark = "stage" | "portrait";

export type StageMarkTransform = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

export type ProStreamerStageAnchorMetadata = {
  targetHeightM: number;
  shadowPlaneWidth: number | null;
  shadowPlaneDepth: number | null;
};

export type ProStreamerStageBackdropMetrics = {
  width: number;
  height: number;
  aspect: number;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  cameraToPlaneDistance: number;
};

export type ProStreamerStageSceneContract = {
  backdrop: THREE.Object3D;
  avatarAnchor: THREE.Object3D;
  sceneRoot: THREE.Object3D;
  stageCamera: THREE.PerspectiveCamera;
  stageCameraNode: THREE.Object3D;
  anchorMetadata: ProStreamerStageAnchorMetadata;
  backdropMetrics: ProStreamerStageBackdropMetrics;
  stageMark: StageMarkTransform;
  portraitMark: StageMarkTransform;
};

let stageScenePromise: Promise<THREE.Group> | null = null;

function cloneVector3(value: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function cloneQuaternion(value: THREE.Quaternion): THREE.Quaternion {
  return new THREE.Quaternion(value.x, value.y, value.z, value.w);
}

function findPerspectiveCamera(root: THREE.Object3D): THREE.PerspectiveCamera | null {
  const named = root.getObjectByName(PRO_STREAMER_STAGE_NODE_NAMES.stageCamera);
  if (named instanceof THREE.PerspectiveCamera) {
    return named;
  }

  let found: THREE.PerspectiveCamera | null = null;
  root.traverse((child) => {
    if (found) return;
    if (
      child instanceof THREE.PerspectiveCamera &&
      child.name === PRO_STREAMER_STAGE_NODE_NAMES.stageCamera
    ) {
      found = child;
    }
  });
  return found;
}

function yawFacingQuaternion(
  from: THREE.Vector3,
  to: THREE.Vector3,
  fallback: THREE.Quaternion,
): THREE.Quaternion {
  const delta = new THREE.Vector3(
    to.x - from.x,
    0,
    to.z - from.z,
  );
  if (delta.lengthSq() < 1e-6) {
    return cloneQuaternion(fallback);
  }

  const yaw = Math.atan2(delta.x, delta.z);
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
}

function parseNumericUserData(
  value: unknown,
  fallback: number | null = null,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function extractAnchorMetadata(
  avatarAnchor: THREE.Object3D,
): ProStreamerStageAnchorMetadata {
  const source = (avatarAnchor.userData ?? {}) as Record<string, unknown>;
  const extras =
    source.extras && typeof source.extras === "object"
      ? (source.extras as Record<string, unknown>)
      : null;

  const targetHeightM =
    parseNumericUserData(source.target_height_m) ??
    parseNumericUserData(extras?.target_height_m) ??
    1.7;

  return {
    targetHeightM,
    shadowPlaneWidth:
      parseNumericUserData(source.shadow_plane_width) ??
      parseNumericUserData(extras?.shadow_plane_width),
    shadowPlaneDepth:
      parseNumericUserData(source.shadow_plane_depth) ??
      parseNumericUserData(extras?.shadow_plane_depth),
  };
}

function collectBackdropWorldVertices(backdrop: THREE.Object3D): THREE.Vector3[] {
  const vertices: THREE.Vector3[] = [];

  backdrop.updateWorldMatrix(true, true);
  backdrop.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    if (!(geometry instanceof THREE.BufferGeometry)) return;

    const position = geometry.getAttribute("position");
    if (!position || position.itemSize < 3) return;

    for (let index = 0; index < position.count; index += 1) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, index);
      vertex.applyMatrix4(child.matrixWorld);
      vertices.push(vertex);
    }
  });

  if (vertices.length === 0) {
    throw new Error("Pro streamer stage backdrop has no measurable geometry");
  }

  return vertices;
}

function measureBackdropMetrics(
  backdrop: THREE.Object3D,
  stageCameraNode: THREE.Object3D,
): ProStreamerStageBackdropMetrics {
  const vertices = collectBackdropWorldVertices(backdrop);
  const center = new THREE.Vector3();
  for (const vertex of vertices) {
    center.add(vertex);
  }
  center.multiplyScalar(1 / vertices.length);

  const origin = vertices[0]!;
  let tangentA: THREE.Vector3 | null = null;
  let tangentB: THREE.Vector3 | null = null;
  for (let index = 1; index < vertices.length; index += 1) {
    const candidate = vertices[index]!.clone().sub(origin);
    if (candidate.lengthSq() < 1e-6) continue;
    if (!tangentA) {
      tangentA = candidate.normalize();
      continue;
    }

    const orthogonal = candidate.clone().projectOnPlane(tangentA);
    if (orthogonal.lengthSq() < 1e-6) continue;
    tangentB = orthogonal.normalize();
    break;
  }

  if (!tangentA || !tangentB) {
    throw new Error("Pro streamer stage backdrop does not define a valid plane");
  }

  const normal = new THREE.Vector3().crossVectors(tangentA, tangentB).normalize();
  const cameraPosition = stageCameraNode.getWorldPosition(new THREE.Vector3());
  const cameraQuaternion = stageCameraNode.getWorldQuaternion(new THREE.Quaternion());
  const toCamera = cameraPosition.clone().sub(center);
  if (normal.dot(toCamera) < 0) {
    normal.negate();
    tangentB.negate();
  }

  let minA = Number.POSITIVE_INFINITY;
  let maxA = Number.NEGATIVE_INFINITY;
  let minB = Number.POSITIVE_INFINITY;
  let maxB = Number.NEGATIVE_INFINITY;

  for (const vertex of vertices) {
    const delta = vertex.clone().sub(center);
    const a = delta.dot(tangentA);
    const b = delta.dot(tangentB);
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
    minB = Math.min(minB, b);
    maxB = Math.max(maxB, b);
  }

  const extentA = Math.max(1e-3, maxA - minA);
  const extentB = Math.max(1e-3, maxB - minB);
  const width = Math.max(extentA, extentB);
  const height = Math.min(extentA, extentB);
  const cameraForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(cameraQuaternion)
    .normalize();
  const numerator = Math.abs(center.clone().sub(cameraPosition).dot(normal));
  const denominator = Math.abs(cameraForward.dot(normal));
  const cameraToPlaneDistance =
    denominator > 1e-6
      ? numerator / denominator
      : Math.abs(center.clone().sub(cameraPosition).dot(cameraForward));

  return {
    width,
    height,
    aspect: width / height,
    center,
    normal,
    cameraToPlaneDistance,
  };
}

export function deriveFullStageMark(
  anchorPosition: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  anchorQuaternion: THREE.Quaternion,
  retreatDistance = 0,
): StageMarkTransform {
  const groundDelta = new THREE.Vector3(
    cameraPosition.x - anchorPosition.x,
    0,
    cameraPosition.z - anchorPosition.z,
  );
  const groundDistance = groundDelta.length();
  const position = cloneVector3(anchorPosition);

  if (groundDistance > 1e-6 && retreatDistance > 0) {
    position.add(
      groundDelta.normalize().multiplyScalar(-Math.min(retreatDistance, groundDistance)),
    );
    position.y = anchorPosition.y;
  }

  return {
    position,
    quaternion: yawFacingQuaternion(
      position,
      cameraPosition,
      anchorQuaternion,
    ),
  };
}

export function derivePortraitStageMark(
  anchorPosition: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  anchorQuaternion: THREE.Quaternion,
): StageMarkTransform {
  const groundDelta = new THREE.Vector3(
    cameraPosition.x - anchorPosition.x,
    0,
    cameraPosition.z - anchorPosition.z,
  );
  const groundDistance = groundDelta.length();

  if (groundDistance < 1e-6) {
    return {
      position: cloneVector3(anchorPosition),
      quaternion: cloneQuaternion(anchorQuaternion),
    };
  }

  const stepDistance = Math.min(2.4, groundDistance * 0.33);
  const position = cloneVector3(anchorPosition).add(
    groundDelta.normalize().multiplyScalar(stepDistance),
  );
  position.y = anchorPosition.y;

  return {
    position,
    quaternion: yawFacingQuaternion(position, cameraPosition, anchorQuaternion),
  };
}

export function extractProStreamerStageScene(
  sceneRoot: THREE.Object3D,
): ProStreamerStageSceneContract {
  const backdrop = sceneRoot.getObjectByName(PRO_STREAMER_STAGE_NODE_NAMES.backdrop);
  if (!backdrop) {
    throw new Error("Pro streamer stage is missing StageBackdrop");
  }

  const avatarAnchor = sceneRoot.getObjectByName(
    PRO_STREAMER_STAGE_NODE_NAMES.avatarAnchor,
  );
  if (!avatarAnchor) {
    throw new Error("Pro streamer stage is missing AvatarAnchor");
  }

  const stageCamera = findPerspectiveCamera(sceneRoot);
  if (!stageCamera) {
    throw new Error("Pro streamer stage is missing StageCamera");
  }

  const stageCameraNode = sceneRoot.getObjectByName(
    PRO_STREAMER_STAGE_NODE_NAMES.stageCamera,
  ) ?? stageCamera;

  const anchorPosition = avatarAnchor.getWorldPosition(new THREE.Vector3());
  const anchorQuaternion = avatarAnchor.getWorldQuaternion(new THREE.Quaternion());
  const cameraPosition = stageCamera.getWorldPosition(new THREE.Vector3());
  const backdropMetrics = measureBackdropMetrics(backdrop, stageCameraNode);
  const anchorMetadata = extractAnchorMetadata(avatarAnchor);
  const fullStageRetreat = Math.max(
    anchorMetadata.shadowPlaneDepth ?? 0,
    Math.min(
      backdropMetrics.cameraToPlaneDistance * 0.25,
      anchorMetadata.targetHeightM * 2.5,
    ),
  );

  const stageMark = deriveFullStageMark(
    anchorPosition,
    cameraPosition,
    anchorQuaternion,
    fullStageRetreat,
  );

  return {
    backdrop,
    avatarAnchor,
    sceneRoot,
    stageCamera,
    stageCameraNode,
    anchorMetadata,
    backdropMetrics,
    stageMark,
    portraitMark: derivePortraitStageMark(
      stageMark.position,
      cameraPosition,
      stageMark.quaternion,
    ),
  };
}

export async function instantiateProStreamerStageScene(): Promise<ProStreamerStageSceneContract> {
  const loadPromise =
    stageScenePromise ??
    (stageScenePromise = new GLTFLoader()
      .loadAsync(PRO_STREAMER_STAGE_ASSET_URL)
      .then((gltf: GLTF) => gltf.scene));

  const cachedScene = await loadPromise;
  const sceneRoot = cachedScene.clone(true);
  sceneRoot.updateMatrixWorld(true);
  return extractProStreamerStageScene(sceneRoot);
}
