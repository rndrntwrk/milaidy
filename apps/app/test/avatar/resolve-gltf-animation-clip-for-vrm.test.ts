import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { resolveGltfAnimationClipForVrm } from "../../src/components/avatar/resolveGltfAnimationClipForVrm";

function makeQuaternionTrack(name: string) {
  return new THREE.QuaternionKeyframeTrack(
    name,
    [0, 1],
    [0, 0, 0, 1, 0, 0.2, 0, 0.98],
  );
}

function makeVectorTrack(name: string) {
  return new THREE.VectorKeyframeTrack(name, [0, 1], [0, 0, 0, 0.1, 0, 0]);
}

describe("resolveGltfAnimationClipForVrm", () => {
  it("binds Alice-native clips directly to matching VRM node names", () => {
    const vrmScene = new THREE.Group();
    for (const name of [
      "Hips",
      "Spine",
      "Spine01",
      "Spine02",
      "LeftShoulder",
      "LeftArm",
      "LeftForeArm",
      "LeftHand",
      "RightShoulder",
      "RightArm",
      "RightForeArm",
      "RightHand",
      "neck",
      "Head",
    ]) {
      const bone = new THREE.Object3D();
      bone.name = name;
      vrmScene.add(bone);
    }

    const animationScene = new THREE.Group();
    const clip = new THREE.AnimationClip("Idle_03", 1, [
      makeVectorTrack("Hips.position"),
      makeQuaternionTrack("Hips.quaternion"),
      makeQuaternionTrack("Spine.quaternion"),
      makeQuaternionTrack("Spine01.quaternion"),
      makeQuaternionTrack("Spine02.quaternion"),
      makeQuaternionTrack("LeftShoulder.quaternion"),
      makeQuaternionTrack("LeftArm.quaternion"),
      makeQuaternionTrack("LeftForeArm.quaternion"),
      makeQuaternionTrack("LeftHand.quaternion"),
      makeQuaternionTrack("RightShoulder.quaternion"),
      makeQuaternionTrack("RightArm.quaternion"),
      makeQuaternionTrack("RightForeArm.quaternion"),
      makeQuaternionTrack("RightHand.quaternion"),
      makeQuaternionTrack("neck.quaternion"),
      makeQuaternionTrack("Head.quaternion"),
    ]);

    const resolved = resolveGltfAnimationClipForVrm(
      {
        scene: animationScene,
        animations: [clip],
      },
      { scene: vrmScene } as never,
    );

    expect(resolved.source).toBe("alice");
    expect(resolved.clip.tracks).toHaveLength(15);
    expect(resolved.clip.tracks[0]?.name).toBe("Hips.position");
    expect(
      resolved.clip.tracks.some((track) => track.name === "Head.quaternion"),
    ).toBe(true);
  });
});
