import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";

type GltfAnimationInput = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

const ALICE_RAW_RIG_MAP = {
  hips: "Hips",
  spine: "Spine",
  spine01: "Spine01",
  spine02: "Spine02",
  neck: "neck",
  head: "Head",
  leftshoulder: "LeftShoulder",
  leftarm: "LeftArm",
  leftforearm: "LeftForeArm",
  lefthand: "LeftHand",
  rightshoulder: "RightShoulder",
  rightarm: "RightArm",
  rightforearm: "RightForeArm",
  righthand: "RightHand",
  leftupleg: "LeftUpLeg",
  leftleg: "LeftLeg",
  leftfoot: "LeftFoot",
  lefttoebase: "LeftToeBase",
  rightupleg: "RightUpLeg",
  rightleg: "RightLeg",
  rightfoot: "RightFoot",
  righttoebase: "RightToeBase",
} as const;

function normalizeNodeName(name: string): string {
  const pipe = name.lastIndexOf("|");
  const base = pipe >= 0 ? name.slice(pipe + 1) : name;
  const colon = base.indexOf(":");
  const withoutNamespace = colon >= 0 ? base.slice(colon + 1) : base;
  return withoutNamespace.trim().toLowerCase();
}

function findRawRigNode(scene: THREE.Object3D, rawName: string): THREE.Object3D | null {
  const exact = scene.getObjectByName(rawName);
  if (exact) return exact;

  const pipe = rawName.lastIndexOf("|");
  const base = pipe >= 0 ? rawName.slice(pipe + 1) : rawName;
  if (base !== rawName) {
    const baseNode = scene.getObjectByName(base);
    if (baseNode) return baseNode;
  }

  const colon = base.indexOf(":");
  if (colon >= 0) {
    const withoutNamespace = base.slice(colon + 1);
    const namespacedNode = scene.getObjectByName(withoutNamespace);
    if (namespacedNode) return namespacedNode;
  }

  const normalizedNeedle = normalizeNodeName(rawName);
  let normalizedMatch: THREE.Object3D | null = null;
  scene.traverse((child) => {
    if (normalizedMatch) return;
    if (normalizeNodeName(child.name) === normalizedNeedle) {
      normalizedMatch = child;
    }
  });
  return normalizedMatch;
}

export function inspectAliceTrackCoverage(
  animation: GltfAnimationInput,
  vrm: VRM,
): { mappedTrackCount: number; mappedBones: Set<string> } {
  const sourceClip = animation.animations[0];
  const mappedBones = new Set<string>();
  let mappedTrackCount = 0;

  if (!sourceClip) {
    return { mappedTrackCount, mappedBones };
  }

  for (const track of sourceClip.tracks) {
    const [rawNodeName, propertyName] = track.name.split(".");
    if (!rawNodeName || propertyName !== "quaternion") continue;
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;

    const mappedNodeName = ALICE_RAW_RIG_MAP[normalizeNodeName(rawNodeName) as keyof typeof ALICE_RAW_RIG_MAP];
    if (!mappedNodeName) continue;

    if (
      !findRawRigNode(animation.scene, rawNodeName) ||
      !findRawRigNode(vrm.scene, mappedNodeName)
    ) {
      continue;
    }

    mappedTrackCount += 1;
    mappedBones.add(mappedNodeName);
  }

  return { mappedTrackCount, mappedBones };
}

/**
 * Alice raw-rig clips already match the raw armature hierarchy in alice.vrm.
 * We keep them in-place by copying quaternion tracks directly onto the raw
 * bones and rejecting translation/scale/root tracks.
 */
export function retargetAliceGltfToVrm(
  animation: GltfAnimationInput,
  vrm: VRM,
): THREE.AnimationClip {
  vrm.scene.updateMatrixWorld(true);

  const sourceClip = animation.animations[0];
  if (!sourceClip) {
    throw new Error("alice animation contains no clips");
  }

  const tracks: Array<THREE.QuaternionKeyframeTrack> = [];

  for (const track of sourceClip.tracks) {
    const [rawNodeName, propertyName] = track.name.split(".");
    if (!rawNodeName || propertyName !== "quaternion") continue;
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;

    const mappedNodeName = ALICE_RAW_RIG_MAP[normalizeNodeName(rawNodeName) as keyof typeof ALICE_RAW_RIG_MAP];
    if (!mappedNodeName) continue;

    const targetNode = findRawRigNode(vrm.scene, mappedNodeName);
    if (!targetNode) continue;

    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${targetNode.name}.quaternion`,
        track.times.slice(),
        track.values.slice(),
      ),
    );
  }

  if (tracks.length < 10) {
    throw new Error(
      `Alice retargeting mapped too few tracks (${tracks.length}). Expected raw Alice rig names like Hips/Spine/LeftArm...`,
    );
  }

  const clip = new THREE.AnimationClip(
    sourceClip.name || "alice-raw",
    sourceClip.duration,
    tracks,
  );
  clip.optimize();
  return clip;
}
