import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  classifyIdleGltfAnimationClipForVrm,
  resolveGltfAnimationClipForVrm,
} from "../../src/components/avatar/resolveGltfAnimationClipForVrm";

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

function makeDirectBindVrm() {
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

  return { scene: vrmScene } as never;
}

function makeMixamoAnimationScene() {
  const root = new THREE.Group();
  const hips = new THREE.Object3D();
  hips.name = "mixamorig:Hips";
  root.add(hips);

  const spine = new THREE.Object3D();
  spine.name = "mixamorig:Spine";
  hips.add(spine);

  const spine1 = new THREE.Object3D();
  spine1.name = "mixamorig:Spine1";
  spine.add(spine1);

  const spine2 = new THREE.Object3D();
  spine2.name = "mixamorig:Spine2";
  spine1.add(spine2);

  const neck = new THREE.Object3D();
  neck.name = "mixamorig:Neck";
  spine2.add(neck);

  const head = new THREE.Object3D();
  head.name = "mixamorig:Head";
  neck.add(head);

  const leftShoulder = new THREE.Object3D();
  leftShoulder.name = "mixamorig:LeftShoulder";
  spine2.add(leftShoulder);

  const leftArm = new THREE.Object3D();
  leftArm.name = "mixamorig:LeftArm";
  leftShoulder.add(leftArm);

  const leftForeArm = new THREE.Object3D();
  leftForeArm.name = "mixamorig:LeftForeArm";
  leftArm.add(leftForeArm);

  const leftHand = new THREE.Object3D();
  leftHand.name = "mixamorig:LeftHand";
  leftForeArm.add(leftHand);

  const rightShoulder = new THREE.Object3D();
  rightShoulder.name = "mixamorig:RightShoulder";
  spine2.add(rightShoulder);

  const rightArm = new THREE.Object3D();
  rightArm.name = "mixamorig:RightArm";
  rightShoulder.add(rightArm);

  const rightForeArm = new THREE.Object3D();
  rightForeArm.name = "mixamorig:RightForeArm";
  rightArm.add(rightForeArm);

  const rightHand = new THREE.Object3D();
  rightHand.name = "mixamorig:RightHand";
  rightForeArm.add(rightHand);

  return root;
}

function makeMixamoVrm() {
  const vrmScene = new THREE.Group();
  const bones = new Map<string, THREE.Object3D>();
  for (const [boneName, nodeName] of [
    ["hips", "Hips"],
    ["spine", "Spine"],
    ["chest", "Chest"],
    ["upperChest", "UpperChest"],
    ["neck", "Neck"],
    ["head", "Head"],
    ["leftShoulder", "LeftShoulder"],
    ["leftUpperArm", "LeftUpperArm"],
    ["leftLowerArm", "LeftLowerArm"],
    ["leftHand", "LeftHand"],
    ["rightShoulder", "RightShoulder"],
    ["rightUpperArm", "RightUpperArm"],
    ["rightLowerArm", "RightLowerArm"],
    ["rightHand", "RightHand"],
  ]) {
    const bone = new THREE.Object3D();
    bone.name = nodeName;
    vrmScene.add(bone);
    bones.set(boneName, bone);
  }

  return {
    scene: vrmScene,
    meta: { metaVersion: "1" },
    humanoid: {
      getNormalizedBoneNode(name: string) {
        return bones.get(name) ?? null;
      },
    },
  } as never;
}

describe("resolveGltfAnimationClipForVrm", () => {
  it("keeps direct Alice bindings permissive for non-idle emotes", () => {
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
        scene: new THREE.Group(),
        animations: [clip],
      },
      makeDirectBindVrm(),
    );

    expect(resolved.source).toBe("alice-native");
    expect(resolved.clip.tracks).toHaveLength(15);
    expect(resolved.clip.tracks[0]?.name).toBe("Hips.position");
    expect(
      resolved.clip.tracks.some((track) => track.name === "Head.quaternion"),
    ).toBe(true);
  });

  it("sanitizes Alice-native idle clips to in-place quaternion bindings", () => {
    const clip = new THREE.AnimationClip("Idle_09", 1, [
      makeVectorTrack("Hips.position"),
      makeVectorTrack("Hips.scale"),
      makeVectorTrack("Armature.scale"),
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

    const classification = classifyIdleGltfAnimationClipForVrm(
      {
        scene: new THREE.Group(),
        animations: [clip],
      },
      makeDirectBindVrm(),
    );

    expect(classification.status).toBe("accepted");
    if (classification.status !== "accepted") {
      throw new Error("expected accepted Alice idle classification");
    }
    expect(classification.source).toBe("alice-native");
    expect(
      classification.clip.tracks.every((track) =>
        track.name.endsWith(".quaternion"),
      ),
    ).toBe(true);
    expect(
      classification.clip.tracks.some((track) => track.name === "Hips.position"),
    ).toBe(false);
    expect(
      classification.clip.tracks.some((track) => track.name.endsWith(".scale")),
    ).toBe(false);
  });

  it("accepts Mixamo-retargeted idle clips through the strict classifier", () => {
    const clip = new THREE.AnimationClip("mixamo-idle", 1, [
      makeQuaternionTrack("mixamorig:Hips.quaternion"),
      makeQuaternionTrack("mixamorig:Spine.quaternion"),
      makeQuaternionTrack("mixamorig:Spine1.quaternion"),
      makeQuaternionTrack("mixamorig:Spine2.quaternion"),
      makeQuaternionTrack("mixamorig:Neck.quaternion"),
      makeQuaternionTrack("mixamorig:Head.quaternion"),
      makeQuaternionTrack("mixamorig:LeftShoulder.quaternion"),
      makeQuaternionTrack("mixamorig:LeftArm.quaternion"),
      makeQuaternionTrack("mixamorig:LeftForeArm.quaternion"),
      makeQuaternionTrack("mixamorig:LeftHand.quaternion"),
      makeQuaternionTrack("mixamorig:RightShoulder.quaternion"),
      makeQuaternionTrack("mixamorig:RightArm.quaternion"),
      makeQuaternionTrack("mixamorig:RightForeArm.quaternion"),
      makeQuaternionTrack("mixamorig:RightHand.quaternion"),
    ]);

    const classification = classifyIdleGltfAnimationClipForVrm(
      {
        scene: makeMixamoAnimationScene(),
        animations: [clip],
      },
      makeMixamoVrm(),
    );

    expect(classification.status).toBe("accepted");
    if (classification.status !== "accepted") {
      throw new Error("expected accepted Mixamo classification");
    }
    expect(classification.source).toBe("mixamo-retargeted");
    expect(classification.clip.tracks.length).toBeGreaterThanOrEqual(10);
  });

  it("rejects uncertain idle clips before they enter the live idle pool", () => {
    const classification = classifyIdleGltfAnimationClipForVrm(
      {
        scene: makeMixamoAnimationScene(),
        animations: [
          new THREE.AnimationClip("uncertain", 1, [
            makeQuaternionTrack("mixamorig:Hips.quaternion"),
            makeQuaternionTrack("mixamorig:Spine.quaternion"),
          ]),
        ],
      },
      makeMixamoVrm(),
    );

    expect(classification).toMatchObject({
      status: "rejected",
    });
    if (classification.status !== "rejected") {
      throw new Error("expected rejected classification");
    }
    expect(classification.reason).toContain("confident Mixamo rig bindings");
  });

  it("keeps the permissive resolver path for non-idle emotes", () => {
    const resolved = resolveGltfAnimationClipForVrm(
      {
        scene: makeMixamoAnimationScene(),
        animations: [
          new THREE.AnimationClip("wave", 1, [
            makeQuaternionTrack("mixamorig:Hips.quaternion"),
            makeQuaternionTrack("mixamorig:Spine.quaternion"),
            makeQuaternionTrack("mixamorig:Spine1.quaternion"),
            makeQuaternionTrack("mixamorig:Spine2.quaternion"),
            makeQuaternionTrack("mixamorig:Neck.quaternion"),
            makeQuaternionTrack("mixamorig:Head.quaternion"),
            makeQuaternionTrack("mixamorig:LeftShoulder.quaternion"),
            makeQuaternionTrack("mixamorig:LeftArm.quaternion"),
            makeQuaternionTrack("mixamorig:LeftForeArm.quaternion"),
            makeQuaternionTrack("mixamorig:LeftHand.quaternion"),
            makeQuaternionTrack("mixamorig:RightShoulder.quaternion"),
            makeQuaternionTrack("mixamorig:RightArm.quaternion"),
            makeQuaternionTrack("mixamorig:RightForeArm.quaternion"),
            makeQuaternionTrack("mixamorig:RightHand.quaternion"),
          ]),
        ],
      },
      makeMixamoVrm(),
    );

    expect(resolved.source).toBe("mixamo-retargeted");
    expect(resolved.clip.tracks.length).toBeGreaterThanOrEqual(10);
  });
});
