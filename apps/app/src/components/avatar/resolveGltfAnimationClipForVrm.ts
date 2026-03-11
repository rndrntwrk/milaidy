import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { retargetMixamoGltfToVrm } from "./retargetMixamoGltfToVrm";

type GltfAnimationInput = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

export type ResolvedVrmAnimationClip = {
  clip: THREE.AnimationClip;
  source: "alice" | "mixamo";
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
      source: "alice",
    };
  }

  return {
    clip: retargetMixamoGltfToVrm(animation, vrm),
    source: "mixamo",
  };
}
