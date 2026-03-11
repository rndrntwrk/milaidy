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
      getNormalizedBoneNode() {
        return null;
      },
    },
  } as never;
}

function makeEngineHarness() {
  const engine = new VrmEngine() as any;
  const vrm = makeVrm();
  const mixer = new MockMixer();

  engine.vrm = vrm;
  engine.mixer = mixer;
  engine.currentScenePreset = "pro-streamer-stage";
  engine.currentSceneMark = "portrait";
  engine.loadingAborted = false;
  engine.elapsedTime = 10;

  return { engine, mixer, vrm };
}

describe("VrmEngine stage idle runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("plays verified stage idles and reports healthy portrait-hold diagnostics", async () => {
    const { engine, mixer, vrm } = makeEngineHarness();
    const idleUrl = "/idle-a.glb";
    const idleClip = makeClip("idle-a", 14, 4);

    engine.idleGlbUrls = [idleUrl];
    vi.spyOn(engine, "classifyConfiguredIdleCandidates").mockImplementation(
      async () => {
        engine.verifiedIdleGlbUrls = new Set([idleUrl]);
        engine.emoteClipCache.set(idleUrl, {
          clip: idleClip,
          source: "alice-native",
        });
      },
    );
    vi.spyOn(engine, "loadEmoteClip").mockResolvedValue({
      clip: idleClip,
      source: "alice-native",
    });

    await engine.loadAndPlayIdle(vrm);

    const state = engine.getState();
    expect(state.activeAnimationState).toBe("idle");
    expect(state.activeIdleSource).toBe("alice-native");
    expect(state.idleFallbackActive).toBe(false);
    expect(state.idleHealthy).toBe(true);
    expect(state.idleTracks).toBe(14);
    expect(engine.proceduralIdleActive).toBe(false);
    expect(mixer.clipAction).toHaveBeenCalledWith(idleClip);
  });

  it("rotates deterministically across verified stage clips", async () => {
    const { engine, vrm } = makeEngineHarness();
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
          source: "alice-native",
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

    await engine.loadAndPlayIdle(vrm);
    expect(engine.activeIdleGlbUrl).toBe(secondUrl);
  });

  it("drops failed verified candidates once and does not retry them on the next rotation", async () => {
    const { engine, vrm } = makeEngineHarness();
    const badUrl = "/idle-bad.glb";
    const goodUrl = "/idle-good.glb";
    const goodClip = makeClip("idle-good");
    const loadEmoteClip = vi.spyOn(engine, "loadEmoteClip").mockImplementation(
      async (url: string) => {
        if (url === badUrl) return null;
        if (url === goodUrl) {
          return {
            clip: goodClip,
            source: "alice-native",
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

    loadEmoteClip.mockClear();
    await engine.loadAndPlayIdle(vrm);
    expect(loadEmoteClip).not.toHaveBeenCalledWith(badUrl, vrm);
  });

  it("falls back to the legacy idle clip before procedural fallback", async () => {
    const { engine, vrm } = makeEngineHarness();
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
  });

  it("activates procedural fallback when every clip-based idle path fails", async () => {
    const { engine, vrm } = makeEngineHarness();

    vi.spyOn(engine, "classifyConfiguredIdleCandidates").mockResolvedValue(undefined);
    vi.spyOn(engine, "loadEmoteClip").mockResolvedValue(null);

    await engine.loadAndPlayIdle(vrm);

    const state = engine.getState();
    expect(state.activeIdleSource).toBe("procedural-fallback");
    expect(state.idleFallbackActive).toBe(true);
    expect(state.idleHealthy).toBe(true);
    expect(state.idlePlaying).toBe(true);
    expect(engine.proceduralIdleActive).toBe(true);
    expect(engine.idleAction).toBeNull();
  });

  it("returns from emotes to a healthy idle state", () => {
    const { engine } = makeEngineHarness();
    const idleClip = makeClip("idle-a");
    const idleAction = new MockAction(idleClip);
    const emoteAction = new MockAction(makeClip("walk", 8, 2));

    emoteAction.play();
    engine.idleAction = idleAction as unknown as THREE.AnimationAction;
    engine.emoteAction = emoteAction as unknown as THREE.AnimationAction;
    engine.activeIdleSource = "alice-native";
    engine.idleFallbackActive = false;

    engine.stopEmote();

    const state = engine.getState();
    expect(state.activeAnimationState).toBe("idle");
    expect(state.activeIdleSource).toBe("alice-native");
    expect(state.idleFallbackActive).toBe(false);
    expect(state.idleHealthy).toBe(true);
    expect(idleAction.play).toHaveBeenCalled();
    expect(engine.emoteAction).toBeNull();
  });
});
