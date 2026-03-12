import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  classifyIdleGltfAnimationClipForVrm,
  resolveGltfAnimationClipForVrm,
} from "../../src/components/avatar/resolveGltfAnimationClipForVrm";

function makeQuaternionTrack(
  name: string,
  values = [0, 0, 0, 1, 0.1, 0.2, 0, 0.97],
) {
  return new THREE.QuaternionKeyframeTrack(name, [0, 1], values);
}

function makeVectorTrack(name: string) {
  return new THREE.VectorKeyframeTrack(name, [0, 1], [0, 0, 0, 0.1, 0, 0]);
}

function addBone(parent: THREE.Object3D, name: string, rotation?: THREE.Euler) {
  const bone = new THREE.Object3D();
  bone.name = name;
  if (rotation) {
    bone.quaternion.setFromEuler(rotation);
  }
  parent.add(bone);
  return bone;
}

function makeAliceScene(restVariant: "source" | "target") {
  const root = new THREE.Group();
  const hips = addBone(root, "Hips");
  const spine = addBone(hips, "Spine");
  const spine01 = addBone(spine, "Spine01");
  const spine02 = addBone(spine01, "Spine02", restVariant === "target"
    ? new THREE.Euler(0.03, 0.08, -0.02)
    : undefined);
  const neck = addBone(
    spine02,
    "neck",
    restVariant === "target" ? new THREE.Euler(-0.04, 0.02, 0.01) : undefined,
  );
  addBone(neck, "Head", restVariant === "target" ? new THREE.Euler(0, -0.06, 0.02) : undefined);

  const leftShoulder = addBone(
    spine02,
    "LeftShoulder",
    restVariant === "target" ? new THREE.Euler(0.02, 0.01, -0.25) : undefined,
  );
  const leftArm = addBone(
    leftShoulder,
    "LeftArm",
    restVariant === "target" ? new THREE.Euler(0.1, 0.03, -0.45) : undefined,
  );
  const leftForeArm = addBone(
    leftArm,
    "LeftForeArm",
    restVariant === "target" ? new THREE.Euler(-0.08, 0.04, -0.2) : undefined,
  );
  addBone(leftForeArm, "LeftHand");

  const rightShoulder = addBone(
    spine02,
    "RightShoulder",
    restVariant === "target" ? new THREE.Euler(0.02, -0.01, 0.25) : undefined,
  );
  const rightArm = addBone(
    rightShoulder,
    "RightArm",
    restVariant === "target" ? new THREE.Euler(0.1, -0.03, 0.45) : undefined,
  );
  const rightForeArm = addBone(
    rightArm,
    "RightForeArm",
    restVariant === "target" ? new THREE.Euler(-0.08, -0.04, 0.2) : undefined,
  );
  addBone(rightForeArm, "RightHand");

  const leftUpLeg = addBone(hips, "LeftUpLeg");
  const leftLeg = addBone(leftUpLeg, "LeftLeg");
  const leftFoot = addBone(leftLeg, "LeftFoot");
  addBone(leftFoot, "LeftToeBase");

  const rightUpLeg = addBone(hips, "RightUpLeg");
  const rightLeg = addBone(rightUpLeg, "RightLeg");
  const rightFoot = addBone(rightLeg, "RightFoot");
  addBone(rightFoot, "RightToeBase");

  root.updateMatrixWorld(true);
  return root;
}

function makeAliceVrm() {
  const scene = new THREE.Group();
  const decoyHips = new THREE.Object3D();
  decoyHips.name = "hips";
  scene.add(decoyHips);
  const decoyLeftArm = new THREE.Object3D();
  decoyLeftArm.name = "leftarm";
  scene.add(decoyLeftArm);
  scene.add(makeAliceScene("target"));
  scene.updateMatrixWorld(true);
  return {
    scene,
    meta: { metaVersion: "1" },
    humanoid: {
      autoUpdateHumanBones: true,
      getNormalizedBoneNode() {
        return null;
      },
    },
  } as never;
}

function makeMixamoAnimationScene() {
  const root = new THREE.Group();
  const hips = addBone(root, "mixamorig:Hips");
  const spine = addBone(hips, "mixamorig:Spine");
  const spine1 = addBone(spine, "mixamorig:Spine1");
  const spine2 = addBone(spine1, "mixamorig:Spine2");
  const neck = addBone(spine2, "mixamorig:Neck");
  addBone(neck, "mixamorig:Head");
  const leftShoulder = addBone(spine2, "mixamorig:LeftShoulder");
  const leftArm = addBone(leftShoulder, "mixamorig:LeftArm");
  const leftForeArm = addBone(leftArm, "mixamorig:LeftForeArm");
  addBone(leftForeArm, "mixamorig:LeftHand");
  const rightShoulder = addBone(spine2, "mixamorig:RightShoulder");
  const rightArm = addBone(rightShoulder, "mixamorig:RightArm");
  const rightForeArm = addBone(rightArm, "mixamorig:RightForeArm");
  addBone(rightForeArm, "mixamorig:RightHand");
  root.updateMatrixWorld(true);
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
  ] as const) {
    const bone = new THREE.Object3D();
    bone.name = nodeName;
    vrmScene.add(bone);
    bones.set(boneName, bone);
  }

  return {
    scene: vrmScene,
    meta: { metaVersion: "1" },
    humanoid: {
      autoUpdateHumanBones: true,
      getNormalizedBoneNode(name: string) {
        return bones.get(name) ?? null;
      },
    },
  } as never;
}

describe("resolveGltfAnimationClipForVrm", () => {
  it("sanitizes Alice clips onto raw Alice VRM bones and strips transform tracks", () => {
    const clip = new THREE.AnimationClip("Backflip", 1, [
      makeVectorTrack("Hips.position"),
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
      makeQuaternionTrack("LeftUpLeg.quaternion"),
      makeQuaternionTrack("LeftLeg.quaternion"),
      makeQuaternionTrack("LeftFoot.quaternion"),
      makeQuaternionTrack("RightUpLeg.quaternion"),
      makeQuaternionTrack("RightLeg.quaternion"),
      makeQuaternionTrack("RightFoot.quaternion"),
    ]);

    const resolved = resolveGltfAnimationClipForVrm(
      {
        scene: makeAliceScene("source"),
        animations: [clip],
      },
      makeAliceVrm(),
    );

    expect(resolved.source).toBe("alice-raw");
    expect(
      resolved.clip.tracks.every((track) => track.name.endsWith(".quaternion")),
    ).toBe(true);
    expect(
      resolved.clip.tracks.some((track) => track.name === "Hips.position"),
    ).toBe(false);
    expect(
      resolved.clip.tracks.some((track) =>
        track.name.startsWith("Normalized"),
      ),
    ).toBe(false);
    expect(
      resolved.clip.tracks.some((track) => track.name === "LeftArm.quaternion"),
    ).toBe(true);

    const sourceTrack = clip.tracks.find(
      (track) => track.name === "Spine02.quaternion",
    ) as THREE.QuaternionKeyframeTrack | undefined;
    const resolvedTrack = resolved.clip.tracks.find(
      (track) => track.name === "Spine02.quaternion",
    ) as THREE.QuaternionKeyframeTrack | undefined;
    expect(sourceTrack).toBeDefined();
    expect(resolvedTrack).toBeDefined();
    expect(Array.from(resolvedTrack?.values ?? [])).toEqual(
      Array.from(sourceTrack?.values ?? []),
    );
  });

  it("accepts Alice idle clips as alice-raw and keeps them in-place", () => {
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
        scene: makeAliceScene("source"),
        animations: [clip],
      },
      makeAliceVrm(),
    );

    expect(classification.status).toBe("accepted");
    if (classification.status !== "accepted") {
      throw new Error("expected accepted Alice idle classification");
    }
    expect(classification.source).toBe("alice-raw");
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
    expect(
      classification.clip.tracks.some(
        (track) => track.name === "LeftArm.quaternion",
      ),
    ).toBe(true);
  });

  it("keeps Alice raw quaternions unchanged even when the target rest pose differs", () => {
    const clip = new THREE.AnimationClip("Cheer", 1, [
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
        scene: makeAliceScene("source"),
        animations: [clip],
      },
      makeAliceVrm(),
    );

    const leftArmTrack = resolved.clip.tracks.find(
      (track) => track.name === "LeftArm.quaternion",
    ) as THREE.QuaternionKeyframeTrack | undefined;
    const sourceLeftArmTrack = clip.tracks.find(
      (track) => track.name === "LeftArm.quaternion",
    ) as THREE.QuaternionKeyframeTrack | undefined;
    expect(leftArmTrack).toBeDefined();
    expect(Array.from(leftArmTrack?.values ?? [])).toEqual(
      Array.from(sourceLeftArmTrack?.values ?? []),
    );
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

  it("rejects uncertain clips before they enter the live idle pool", () => {
    const classification = classifyIdleGltfAnimationClipForVrm(
      {
        scene: makeAliceScene("source"),
        animations: [
          new THREE.AnimationClip("uncertain", 1, [
            makeQuaternionTrack("Hips.quaternion"),
            makeQuaternionTrack("Spine.quaternion"),
          ]),
        ],
      },
      makeAliceVrm(),
    );

    expect(classification).toMatchObject({
      status: "rejected",
    });
    if (classification.status !== "rejected") {
      throw new Error("expected rejected classification");
    }
    expect(classification.reason).toContain("confident Alice or Mixamo");
  });

  it("keeps the Mixamo resolver path for non-idle emotes", () => {
    const clip = new THREE.AnimationClip("dance", 1, [
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

    const resolved = resolveGltfAnimationClipForVrm(
      {
        scene: makeMixamoAnimationScene(),
        animations: [clip],
      },
      makeMixamoVrm(),
    );

    expect(resolved.source).toBe("mixamo-retargeted");
    expect(
      resolved.clip.tracks.some((track) => track.name === "Hips.quaternion"),
    ).toBe(true);
  });
});
