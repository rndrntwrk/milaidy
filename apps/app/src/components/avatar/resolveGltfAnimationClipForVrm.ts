import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { mixamoVRMRigMap } from "./mixamoVRMRigMap";
import { inspectAliceTrackCoverage, retargetAliceGltfToVrm } from "./retargetAliceGltfToVrm";
import { retargetMixamoGltfToVrm } from "./retargetMixamoGltfToVrm";

type GltfAnimationInput = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

export type VrmAnimationClipSource = "alice-raw" | "mixamo-retargeted";

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
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;

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

function resolveAliceRawClip(
  animation: GltfAnimationInput,
  vrm: VRM,
): ResolvedVrmAnimationClip {
  return {
    clip: retargetAliceGltfToVrm(animation, vrm),
    source: "alice-raw",
  };
}

function hasConfidentCoverage(
  coverage: { mappedTrackCount: number; mappedBones: Set<string> },
): boolean {
  return coverage.mappedTrackCount >= 10 && coverage.mappedBones.size >= 8;
}

export function resolveGltfAnimationClipForVrm(
  animation: GltfAnimationInput,
  vrm: VRM,
): ResolvedVrmAnimationClip {
  const mixamoCoverage = inspectMixamoTrackCoverage(animation);
  if (hasConfidentCoverage(mixamoCoverage)) {
    return resolveMixamoRetargetedClip(animation, vrm);
  }

  const aliceCoverage = inspectAliceTrackCoverage(animation, vrm);
  if (hasConfidentCoverage(aliceCoverage)) {
    return resolveAliceRawClip(animation, vrm);
  }

  throw new Error(
    "clip did not provide enough confident Alice or Mixamo rig bindings",
  );
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

  const mixamoCoverage = inspectMixamoTrackCoverage(animation);
  if (hasConfidentCoverage(mixamoCoverage)) {
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

  const aliceCoverage = inspectAliceTrackCoverage(animation, vrm);
  if (!hasConfidentCoverage(aliceCoverage)) {
    return {
      status: "rejected",
      reason:
        "clip did not provide enough confident Alice or Mixamo rig bindings for idle admission",
    };
  }

  try {
    // Idle clips must stay in-place. Any scene translation or root motion
    // belongs to stage orchestration, not the admitted idle clip itself.
    const resolved = resolveAliceRawClip(animation, vrm);
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
