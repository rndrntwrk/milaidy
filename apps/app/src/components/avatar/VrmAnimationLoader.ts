import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { classifyIdleGltfAnimationClipForVrm } from "./resolveGltfAnimationClipForVrm";

/**
 * Context needed by the animation loader to check whether the owning engine
 * is still alive / relevant for the load request.
 */
export type AnimationLoaderContext = {
  /** Returns `true` if the loading sequence was aborted (engine disposed). */
  isAborted: () => boolean;
  /** Returns `true` if `vrm` is still the active model in the engine. */
  isCurrentVrm: (vrm: VRM) => boolean;
};

function createFallbackIdleClip(vrm: VRM): THREE.AnimationClip {
  const times = [0, 1, 2, 3, 4];
  const tracks: Array<THREE.KeyframeTrack> = [];
  const basePosition = vrm.scene.position.clone();
  const baseQuaternion = vrm.scene.quaternion.clone();

  tracks.push(
    new THREE.VectorKeyframeTrack(".position", times, [
      basePosition.x,
      basePosition.y,
      basePosition.z,
      basePosition.x + 0.004,
      basePosition.y + 0.012,
      basePosition.z,
      basePosition.x,
      basePosition.y,
      basePosition.z,
      basePosition.x - 0.004,
      basePosition.y - 0.008,
      basePosition.z,
      basePosition.x,
      basePosition.y,
      basePosition.z,
    ]),
  );

  const quaternionValues: number[] = [];
  for (const [x, y, z] of [
    [0, 0, 0],
    [-0.01, 0.02, 0.008],
    [0, 0, 0],
    [0.008, -0.018, -0.006],
    [0, 0, 0],
  ] as const) {
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
    const value = baseQuaternion.clone().multiply(delta);
    quaternionValues.push(value.x, value.y, value.z, value.w);
  }
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      ".quaternion",
      times,
      quaternionValues,
    ),
  );

  return new THREE.AnimationClip("procedural-idle", 4, tracks);
}

/**
 * Load and return an idle {@link THREE.AnimationClip} for the given VRM.
 *
 * Loads the GLB idle animation and retargets it to VRM bones.
 * Returns `null` when the load was aborted (engine disposed / VRM replaced).
 * Throws when the idle clip cannot be loaded.
 */
export async function loadIdleClip(
  vrm: VRM,
  idleGlbUrl: string,
  ctx: AnimationLoaderContext,
): Promise<THREE.AnimationClip | null> {
  if (ctx.isAborted() || !ctx.isCurrentVrm(vrm)) return null;

  try {
    const gltfLoader = new GLTFLoader();
    const gltf = await gltfLoader.loadAsync(idleGlbUrl);
    if (ctx.isAborted() || !ctx.isCurrentVrm(vrm)) return null;

    gltf.scene.updateMatrixWorld(true);
    vrm.scene.updateMatrixWorld(true);
    const classified = classifyIdleGltfAnimationClipForVrm(
      { scene: gltf.scene, animations: gltf.animations },
      vrm,
    );
    if (classified.status === "accepted") {
      return classified.clip;
    }
    console.warn(
      `[VrmEngine] Idle clip rejected (${idleGlbUrl}): ${classified.reason}. Using procedural fallback.`,
    );
  } catch (error) {
    console.warn(
      `[VrmEngine] Failed to load idle clip (${idleGlbUrl}). Using procedural fallback.`,
      error,
    );
  }

  if (ctx.isAborted() || !ctx.isCurrentVrm(vrm)) return null;
  return createFallbackIdleClip(vrm);
}

/**
 * Load a single emote animation clip (GLB/FBX) and retarget it to
 * the supplied VRM. Returns `null` when the load was aborted or the file
 * format could not be processed.
 *
 * Supports both `.glb` / `.gltf` files (retargeted via retargetMixamoGltfToVrm)
 * and Mixamo `.fbx` files (retargeted via retargetMixamoFbxToVrm).
 */
export async function loadEmoteClip(
  path: string,
  vrm: VRM,
  ctx: AnimationLoaderContext,
): Promise<THREE.AnimationClip | null> {
  try {
    if (!ctx.isCurrentVrm(vrm)) return null;

    const isFbx = path.toLowerCase().endsWith(".fbx");

    if (isFbx) {
      const { retargetMixamoFbxToVrm } = await import(
        "./retargetMixamoFbxToVrm"
      );
      const fbxLoader = new FBXLoader();
      const fbx = await fbxLoader.loadAsync(path);
      if (!ctx.isCurrentVrm(vrm)) return null;

      const sourceClip = fbx.animations[0];
      if (!sourceClip) {
        console.warn(`[VrmEngine] FBX has no animations: ${path}`);
        return null;
      }
      return retargetMixamoFbxToVrm(fbx, sourceClip, vrm);
    }

    const { retargetMixamoGltfToVrm } = await import(
      "./retargetMixamoGltfToVrm"
    );
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(path);
    if (!ctx.isCurrentVrm(vrm)) return null;

    gltf.scene.updateMatrixWorld(true);
    vrm.scene.updateMatrixWorld(true);
    return retargetMixamoGltfToVrm(
      { scene: gltf.scene, animations: gltf.animations },
      vrm,
    );
  } catch (err) {
    console.error(`[VrmEngine] Failed to load emote: ${path}`, err);
    return null;
  }
}
