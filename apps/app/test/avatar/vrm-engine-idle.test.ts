import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { VrmEngine } from "../../src/components/avatar/VrmEngine";

function makeClip(name: string, trackCount = 12, duration = 3) {
  const tracks = Array.from({ length: trackCount }, (_, index) =>
    new THREE.QuaternionKeyframeTrack(
      `Bone${index}.quaternion`,
      [0, duration],
      [0, 0, 0, 1, 0, 0, 0, 1],
    ),
  );
  return new THREE.AnimationClip(name, duration, tracks);
}

class MockAction {
  time = 0;
  clampWhenFinished = false;
  private running = false;

  constructor(private readonly clip: THREE.AnimationClip) {}

  reset = vi.fn(() => {
    this.time = 0;
    return this;
  });

  setLoop = vi.fn(() => this);
  fadeIn = vi.fn(() => this);
  fadeOut = vi.fn(() => this);

  play = vi.fn(() => {
    this.running = true;
    return this;
  });

  stop = vi.fn(() => {
    this.running = false;
    return this;
  });

  isRunning = vi.fn(() => this.running);
  getClip = vi.fn(() => this.clip);
}

class MockMixer {
  private readonly actions = new Map<THREE.AnimationClip, MockAction>();

  clipAction = vi.fn((clip: THREE.AnimationClip) => {
    let action = this.actions.get(clip);
    if (!action) {
      action = new MockAction(clip);
      this.actions.set(clip, action);
    }
    return action as unknown as THREE.AnimationAction;
  });
}

function makeVrm() {
  return {
    scene: new THREE.Group(),
    humanoid: {
      autoUpdateHumanBones: true,
      getNormalizedBoneNode() {
        return null;
      },
    },
  } as never;
}

function makeEngineHarness() {
  return makeEngineHarnessForPreset("pro-streamer-stage");
}

function makeEngineHarnessForPreset(
  preset: "pro-streamer-stage" | "default" = "pro-streamer-stage",
) {
  const engine = new VrmEngine() as any;
  const vrm = makeVrm();
  const mixer = new MockMixer();

  engine.vrm = vrm;
  engine.mixer = mixer;
  engine.currentScenePreset = preset;
  engine.currentSceneMark = "portrait";
  engine.loadingAborted = false;
  engine.elapsedTime = 10;

  return { engine, mixer, vrm };
}

describe("VrmEngine stage idle runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses procedural neutral idle on the pro streamer stage", async () => {
    const { engine, mixer, vrm } = makeEngineHarness();
    const classifyConfiguredIdleCandidates = vi.spyOn(
      engine,
      "classifyConfiguredIdleCandidates",
    );
    const loadEmoteClip = vi.spyOn(engine, "loadEmoteClip");

    await engine.loadAndPlayIdle(vrm);

    const state = engine.getState();
    expect(state.activeAnimationState).toBe("idle");
    expect(state.activeIdleSource).toBe("procedural-fallback");
    expect(state.idleFallbackActive).toBe(true);
    expect(state.idleHealthy).toBe(true);
    expect(state.idleTracks).toBe(0);
    expect(engine.proceduralIdleActive).toBe(true);
    expect(engine.idleAction).toBeNull();
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(true);
    expect(classifyConfiguredIdleCandidates).not.toHaveBeenCalled();
    expect(loadEmoteClip).not.toHaveBeenCalled();
    expect(mixer.clipAction).not.toHaveBeenCalled();
  });

  it("switches humanoid auto updates based on non-stage idle clip source", async () => {
    const { engine, vrm } = makeEngineHarnessForPreset("default");
    const firstUrl = "/idle-a.glb";
    const secondUrl = "/idle-b.glb";
    const firstClip = makeClip("idle-a");
    const secondClip = makeClip("idle-b");

    engine.idleGlbUrls = [firstUrl, secondUrl];
    vi.spyOn(engine, "classifyConfiguredIdleCandidates").mockImplementation(
      async () => {
        engine.verifiedIdleGlbUrls = new Set([firstUrl, secondUrl]);
        engine.emoteClipCache.set(firstUrl, {
          clip: firstClip,
          source: "alice-raw",
        });
        engine.emoteClipCache.set(secondUrl, {
          clip: secondClip,
          source: "mixamo-retargeted",
        });
      },
    );
    vi.spyOn(engine, "loadEmoteClip").mockImplementation(async (url: string) => {
      return engine.emoteClipCache.get(url) ?? null;
    });

    await engine.loadAndPlayIdle(vrm);
    expect(engine.activeIdleGlbUrl).toBe(firstUrl);
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(false);

    await engine.loadAndPlayIdle(vrm);
    expect(engine.activeIdleGlbUrl).toBe(secondUrl);
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(true);
  });

  it("drops failed verified candidates once and does not retry them on the next rotation", async () => {
    const { engine, vrm } = makeEngineHarnessForPreset("default");
    const badUrl = "/idle-bad.glb";
    const goodUrl = "/idle-good.glb";
    const goodClip = makeClip("idle-good");
    const loadEmoteClip = vi.spyOn(engine, "loadEmoteClip").mockImplementation(
      async (url: string) => {
        if (url === badUrl) return null;
        if (url === goodUrl) {
          return {
            clip: goodClip,
            source: "alice-raw",
          };
        }
        return null;
      },
    );

    engine.idleGlbUrls = [badUrl, goodUrl];
    vi.spyOn(engine, "classifyConfiguredIdleCandidates").mockImplementation(
      async () => {
        if (engine.verifiedIdleGlbUrls.size === 0) {
          engine.verifiedIdleGlbUrls = new Set([badUrl, goodUrl]);
        }
      },
    );

    await engine.loadAndPlayIdle(vrm);
    expect(engine.failedIdleGlbUrls.has(badUrl)).toBe(true);
    expect(engine.verifiedIdleGlbUrls.has(badUrl)).toBe(false);
    expect(engine.activeIdleGlbUrl).toBe(goodUrl);
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(false);

    loadEmoteClip.mockClear();
    await engine.loadAndPlayIdle(vrm);
    expect(loadEmoteClip).not.toHaveBeenCalledWith(badUrl, vrm);
  });

  it("falls back to the legacy idle clip before procedural fallback", async () => {
    const { engine, vrm } = makeEngineHarnessForPreset("default");
    const legacyClip = makeClip("legacy-idle", 10, 5);
    const guaranteedUrl = engine.guaranteedIdleFallbackGlbUrl;
    const legacyUrl = engine.idleFallbackGlbUrl;

    vi.spyOn(engine, "classifyConfiguredIdleCandidates").mockResolvedValue(undefined);
    vi.spyOn(engine, "loadEmoteClip").mockImplementation(async (url: string) => {
      if (url === guaranteedUrl) return null;
      if (url === legacyUrl) {
        return {
          clip: legacyClip,
          source: "mixamo-retargeted",
        };
      }
      return null;
    });

    await engine.loadAndPlayIdle(vrm);

    const state = engine.getState();
    expect(state.activeIdleSource).toBe("legacy-fallback");
    expect(state.idleFallbackActive).toBe(true);
    expect(state.idleHealthy).toBe(true);
    expect(engine.proceduralIdleActive).toBe(false);
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(true);
  });

  it("returns to static fallback when no non-stage idle clip is available", async () => {
    const { engine, vrm } = makeEngineHarnessForPreset("default");

    vi.spyOn(engine, "classifyConfiguredIdleCandidates").mockResolvedValue(undefined);
    vi.spyOn(engine, "loadEmoteClip").mockResolvedValue(null);

    await engine.loadAndPlayIdle(vrm);

    const state = engine.getState();
    expect(state.activeIdleSource).toBeNull();
    expect(state.idleFallbackActive).toBe(false);
    expect(state.idleHealthy).toBe(false);
    expect(state.idlePlaying).toBe(false);
    expect(engine.proceduralIdleActive).toBe(false);
    expect(engine.idleAction).toBeNull();
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(true);
  });

  it("returns to procedural neutral idle after stopping an Alice raw emote on stage", async () => {
    const { engine, vrm } = makeEngineHarness();
    const emoteAction = new MockAction(makeClip("walk", 8, 2));

    emoteAction.play();
    engine.emoteAction = emoteAction as unknown as THREE.AnimationAction;
    engine.activeIdleSource = null;
    engine.idleFallbackActive = false;
    vrm.humanoid.autoUpdateHumanBones = false;

    await engine.stopEmote();

    const state = engine.getState();
    expect(state.activeAnimationState).toBe("idle");
    expect(state.activeIdleSource).toBe("procedural-fallback");
    expect(state.idleFallbackActive).toBe(true);
    expect(state.idleHealthy).toBe(true);
    expect(engine.proceduralIdleActive).toBe(true);
    expect(engine.idleAction).toBeNull();
    expect(engine.emoteAction).toBeNull();
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(true);
  });

  it("toggles humanoid auto updates per emote source", async () => {
    const { engine, vrm } = makeEngineHarness();
    engine.activeIdleSource = "procedural-fallback";

    vi.spyOn(engine, "loadEmoteClip")
      .mockResolvedValueOnce({
        clip: makeClip("backflip", 14, 2),
        source: "alice-raw",
      })
      .mockResolvedValueOnce({
        clip: makeClip("dance", 14, 2),
        source: "mixamo-retargeted",
      });

    await engine.playEmote("/backflip.glb", 2, false);
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(false);

    engine.stopEmote();
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(true);

    await engine.playEmote("/dance.glb", 2, false);
    expect(vrm.humanoid.autoUpdateHumanBones).toBe(true);
  });
});
