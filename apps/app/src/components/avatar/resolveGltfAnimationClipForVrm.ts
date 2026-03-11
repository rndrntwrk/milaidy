import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { mixamoVRMRigMap } from "./mixamoVRMRigMap";
import { retargetMixamoGltfToVrm } from "./retargetMixamoGltfToVrm";

type GltfAnimationInput = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

export type VrmAnimationClipSource = "alice-native" | "mixamo-retargeted";

export type ResolvedVrmAnimationClip = {
  clip: THREE.AnimationClip;
  source: VrmAnimationClipSource;
};

export type IdleVrmAnimationClipClassification =
  | {
      status: "accepted";
      clip: THREE.AnimationClip;
      source: VrmAnimationClipSource;
    }
  | {
      status: "rejected";
      reason: string;
    };

function normalizeNodeName(name: string): string {
  const pipe = name.lastIndexOf("|");
  const base = pipe >= 0 ? name.slice(pipe + 1) : name;
  const colon = base.indexOf(":");
  const withoutNamespace = colon >= 0 ? base.slice(colon + 1) : base;
  return withoutNamespace.trim().toLowerCase();
}

function directPropertyName(propertyName: string): string | null {
  switch (propertyName) {
    case "position":
    case "translation":
      return "position";
    case "quaternion":
    case "rotation":
      return "quaternion";
    case "scale":
      return "scale";
    default:
      return null;
  }
}

function normalizeMixamoRigName(name: string): string {
  const pipe = name.lastIndexOf("|");
  const base = pipe >= 0 ? name.slice(pipe + 1) : name;
  const colon = base.indexOf(":");
  if (colon >= 0) {
    const ns = base.slice(0, colon);
    const rest = base.slice(colon + 1);
    if (ns === "mixamorig") return `mixamorig${rest}`;
    return rest;
  }
  return base;
}

function inspectMixamoTrackCoverage(
  animation: GltfAnimationInput,
): { mappedTrackCount: number; mappedBones: Set<string> } {
  const sourceClip = animation.animations[0];
  const mappedBones = new Set<string>();
  let mappedTrackCount = 0;

  if (!sourceClip) {
    return { mappedTrackCount, mappedBones };
  }

  for (const track of sourceClip.tracks) {
    const [rawRigName, propertyName] = track.name.split(".");
    if (!rawRigName || propertyName !== "quaternion") continue;

    const normalizedRigName = normalizeMixamoRigName(rawRigName);
    const vrmBoneName = mixamoVRMRigMap[normalizedRigName];
    if (!vrmBoneName) continue;

    mappedTrackCount += 1;
    mappedBones.add(vrmBoneName);
  }

  return { mappedTrackCount, mappedBones };
}

function resolveMixamoRetargetedClip(
  animation: GltfAnimationInput,
  vrm: VRM,
): ResolvedVrmAnimationClip {
  return {
    clip: retargetMixamoGltfToVrm(animation, vrm),
    source: "mixamo-retargeted",
  };
}

function resolveDirectBindingClip(
  animation: GltfAnimationInput,
  vrm: VRM,
): THREE.AnimationClip | null {
  const sourceClip = animation.animations[0];
  if (!sourceClip) {
    throw new Error("animation contains no clips");
  }

  vrm.scene.updateMatrixWorld(true);

  const targetNodes = new Map<string, string>();
  vrm.scene.traverse((child) => {
    if (!child.name) return;
    const normalizedName = normalizeNodeName(child.name);
    if (!normalizedName || targetNodes.has(normalizedName)) return;
    targetNodes.set(normalizedName, child.name);
  });

  const tracks: THREE.KeyframeTrack[] = [];
  const matchedNodes = new Set<string>();

  for (const track of sourceClip.tracks) {
    const lastDot = track.name.lastIndexOf(".");
    if (lastDot <= 0) continue;

    const rawNodeName = track.name.slice(0, lastDot);
    const rawPropertyName = track.name.slice(lastDot + 1);
    const propertyName = directPropertyName(rawPropertyName);
    if (!propertyName) continue;

    const targetNodeName = targetNodes.get(normalizeNodeName(rawNodeName));
    if (!targetNodeName) continue;

    const clonedTrack = track.clone();
    clonedTrack.name = `${targetNodeName}.${propertyName}`;
    tracks.push(clonedTrack);
    matchedNodes.add(targetNodeName);
  }

  if (tracks.length < 12 || matchedNodes.size < 8) {
    return null;
  }

  const clip = new THREE.AnimationClip(sourceClip.name || "alice", sourceClip.duration, tracks);
  clip.optimize();
  return clip;
}

export function resolveGltfAnimationClipForVrm(
  animation: GltfAnimationInput,
  vrm: VRM,
): ResolvedVrmAnimationClip {
  const directClip = resolveDirectBindingClip(animation, vrm);
  if (directClip) {
    return {
      clip: directClip,
      source: "alice-native",
    };
  }

  return resolveMixamoRetargetedClip(animation, vrm);
}

export function classifyIdleGltfAnimationClipForVrm(
  animation: GltfAnimationInput,
  vrm: VRM,
): IdleVrmAnimationClipClassification {
  const sourceClip = animation.animations[0];
  if (!sourceClip) {
    return {
      status: "rejected",
      reason: "animation contains no clips",
    };
  }

  const directClip = resolveDirectBindingClip(animation, vrm);
  if (directClip) {
    return {
      status: "accepted",
      clip: directClip,
      source: "alice-native",
    };
  }

  const { mappedTrackCount, mappedBones } = inspectMixamoTrackCoverage(animation);
  if (mappedTrackCount < 10 || mappedBones.size < 8) {
    return {
      status: "rejected",
      reason:
        "clip did not provide enough confident Mixamo rig bindings for idle admission",
    };
  }

  try {
    const resolved = resolveMixamoRetargetedClip(animation, vrm);
    return {
      status: "accepted",
      clip: resolved.clip,
      source: resolved.source,
    };
  } catch (err) {
    return {
      status: "rejected",
      reason: err instanceof Error ? err.message : "failed to retarget idle clip",
    };
  }
}
