import { type VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveAppAssetUrl } from "../../asset-url";
import { computeStageCoverFit } from "../../proStreamerStageFit";
import {
  type VRMHumanBoneName,
  instantiateProStreamerStageScene,
  type ProStreamerStageSceneContract,
  type StageMarkTransform,
  type StageSceneMark,
  type StageScenePreset,
} from "../../proStreamerStageScene";

export type VrmEngineState = {
  vrmLoaded: boolean;
  vrmName: string | null;
  idlePlaying: boolean;
  idleTime: number;
  idleTracks: number;
  activeAnimationState: "idle" | "emote" | "static-fallback";
  activeIdleSource:
    | "alice-native"
    | "mixamo-retargeted"
    | "legacy-fallback"
    | "procedural-fallback"
    | null;
  idleFallbackActive: boolean;
  idleHealthy: boolean;
};

type UpdateCallback = () => void;

type VrmFrameMetrics = {
  distance: number;
  shoulderHeight: number;
};

type MarkTransition = {
  duration: number;
  elapsed: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromQuaternion: THREE.Quaternion;
  toQuaternion: THREE.Quaternion;
  walkQuaternion: THREE.Quaternion;
};

type ResolvedAnimationSource = "alice-native" | "mixamo-retargeted";

type IdleCandidatePlan = {
  glbUrl: string;
  fallbackActive: boolean;
};

export type CameraAnimationConfig = {
  enabled: boolean;
  swayAmplitude: number;
  bobAmplitude: number;
  rotationAmplitude: number;
  speed: number;
};

const DEFAULT_CAMERA_ANIMATION: CameraAnimationConfig = {
  enabled: true,
  swayAmplitude: 0.06,
  bobAmplitude: 0.03,
  rotationAmplitude: 0.01,
  speed: 0.8,
};

type BlinkPhase = "idle" | "closing" | "closed" | "opening";

function cloneVector3(value: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function cloneQuaternion(value: THREE.Quaternion): THREE.Quaternion {
  return new THREE.Quaternion(value.x, value.y, value.z, value.w);
}

function quaternionsClose(
  left: THREE.Quaternion,
  right: THREE.Quaternion,
  epsilon = 1e-4,
): boolean {
  return 1 - Math.abs(left.dot(right)) < epsilon;
}

function yawFacingQuaternion(
  from: THREE.Vector3,
  to: THREE.Vector3,
  fallback: THREE.Quaternion,
): THREE.Quaternion {
  const direction = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  if (direction.lengthSq() < 1e-6) {
    return cloneQuaternion(fallback);
  }

  const yaw = Math.atan2(direction.x, direction.z);
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class VrmEngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private characterRoot: THREE.Group | null = null;
  private clock = new THREE.Clock();
  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private animationFrameId: number | null = null;
  private onUpdate: UpdateCallback | null = null;
  private initialized = false;
  private loadingAborted = false;

  private mouthValue = 0;
  private mouthSmoothed = 0;
  private vrmName: string | null = null;
  private lookAtTarget = new THREE.Vector3(0, 1, 0);
  private readonly idleFallbackGlbUrl = resolveAppAssetUrl("animations/idle.glb");
  private readonly guaranteedIdleFallbackGlbUrl = resolveAppAssetUrl(
    "animations/alice/idle/catching-breath.glb",
  );
  private readonly defaultStageIdleGlbUrls = [
    this.guaranteedIdleFallbackGlbUrl,
    resolveAppAssetUrl("animations/alice/idle/idle-03.glb"),
    resolveAppAssetUrl("animations/alice/idle/idle-04.glb"),
    resolveAppAssetUrl("animations/alice/idle/idle-07.glb"),
    resolveAppAssetUrl("animations/alice/idle/idle-09.glb"),
    resolveAppAssetUrl("animations/alice/idle/idle-15.glb"),
  ];
  private readonly walkGlbUrl = resolveAppAssetUrl(
    "animations/alice/movement/walking.glb",
  );
  private idleGlbUrls: string[] = [];
  private activeIdleGlbUrl: string | null = null;
  private activeIdleSource: VrmEngineState["activeIdleSource"] = null;
  private idleRotationDeadline = Number.POSITIVE_INFINITY;
  private idleFallbackActive = false;
  private verifiedIdleGlbUrls = new Set<string>();
  private failedIdleGlbUrls = new Set<string>();
  private rejectedIdleReasons = new Map<string, string>();
  private forceFaceCameraFlip = true;

  private cameraAnimation: CameraAnimationConfig = {
    ...DEFAULT_CAMERA_ANIMATION,
  };
  private baseCameraPosition = new THREE.Vector3();
  private elapsedTime = 0;

  private speaking = false;
  private speakingStartTime = 0;

  private blinkPhase: BlinkPhase = "idle";
  private blinkTimer = 0;
  private blinkPhaseTimer = 0;
  private blinkValue = 0;
  private nextBlinkDelay = 2 + Math.random() * 3;

  private static readonly BLINK_CLOSE_DURATION = 0.06;
  private static readonly BLINK_HOLD_DURATION = 0.04;
  private static readonly BLINK_OPEN_DURATION = 0.12;
  private static readonly BLINK_MIN_INTERVAL = 1.8;
  private static readonly BLINK_MAX_INTERVAL = 5.5;
  private static readonly DOUBLE_BLINK_CHANCE = 0.15;

  private emoteAction: THREE.AnimationAction | null = null;
  private emoteTimeout: ReturnType<typeof setTimeout> | null = null;
  private emoteClipCache = new Map<
    string,
    { clip: THREE.AnimationClip; source: ResolvedAnimationSource }
  >();
  private emoteRequestId = 0;

  private currentScenePreset: StageScenePreset = "default";
  private currentSceneMark: StageSceneMark = "stage";
  private frameMetrics: VrmFrameMetrics | null = null;
  private stageScene: ProStreamerStageSceneContract | null = null;
  private stageLoadRequestId = 0;
  private markTransition: MarkTransition | null = null;
  private currentRigPosition = new THREE.Vector3();
  private currentRigQuaternion = new THREE.Quaternion();
  private viewportSize = new THREE.Vector2(1, 1);
  private baseVrmLocalPosition = new THREE.Vector3();
  private baseVrmLocalQuaternion = new THREE.Quaternion();
  private proceduralIdleActive = false;
  private proceduralIdleBoneBases = new Map<VRMHumanBoneName, THREE.Quaternion>();

  setup(canvas: HTMLCanvasElement, onUpdate: UpdateCallback): void {
    if (this.initialized && this.renderer?.domElement === canvas) {
      this.onUpdate = onUpdate;
      return;
    }

    if (this.initialized) {
      this.dispose();
    }

    this.onUpdate = onUpdate;
    this.loadingAborted = false;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(25, 1, 0.01, 1000);
    camera.position.set(0, 1.1, 2.8);
    this.camera = camera;

    const characterRoot = new THREE.Group();
    scene.add(characterRoot);
    this.characterRoot = characterRoot;

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(1.5, 2.0, 1.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-1.8, 1.0, 1.0);
    scene.add(fillLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    this.resize(canvas.clientWidth, canvas.clientHeight);
    this.initialized = true;
    this.loop();
  }

  isInitialized(): boolean {
    return this.initialized && this.renderer !== null;
  }

  dispose(): void {
    this.loadingAborted = true;
    this.initialized = false;
    this.markTransition = null;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.characterRoot && this.vrm) {
      this.characterRoot.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    if (this.scene && this.stageScene?.sceneRoot.parent === this.scene) {
      this.scene.remove(this.stageScene.sceneRoot);
    }
    this.vrm = null;
    this.vrmName = null;
    this.mixer = null;
    this.idleAction = null;
    this.activeIdleGlbUrl = null;
    this.activeIdleSource = null;
    this.idleRotationDeadline = Number.POSITIVE_INFINITY;
    this.idleFallbackActive = false;
    this.verifiedIdleGlbUrls.clear();
    this.failedIdleGlbUrls.clear();
    this.rejectedIdleReasons.clear();
    this.frameMetrics = null;
    this.stageScene = null;
    this.currentRigPosition.set(0, 0, 0);
    this.currentRigQuaternion.identity();
    this.baseVrmLocalPosition.set(0, 0, 0);
    this.baseVrmLocalQuaternion.identity();
    this.proceduralIdleActive = false;
    this.proceduralIdleBoneBases.clear();
    if (this.emoteTimeout !== null) {
      clearTimeout(this.emoteTimeout);
      this.emoteTimeout = null;
    }
    this.emoteAction = null;
    this.emoteClipCache.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.characterRoot = null;
    this.onUpdate = null;
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.viewportSize.set(width, height);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.currentScenePreset === "pro-streamer-stage") {
      this.applySceneLayout({ animateMark: false });
    }
  }

  getState(): VrmEngineState {
    const idlePlaying = this.idleAction?.isRunning() ?? false;
    const emotePlaying = this.emoteAction?.isRunning() ?? false;
    const proceduralIdlePlaying = this.proceduralIdleActive && !emotePlaying;
    return {
      vrmLoaded: this.vrm !== null,
      vrmName: this.vrmName,
      idlePlaying: idlePlaying || proceduralIdlePlaying,
      idleTime: this.idleAction?.time ?? 0,
      idleTracks: this.idleAction?.getClip()?.tracks.length ?? 0,
      activeAnimationState: emotePlaying
        ? "emote"
        : idlePlaying || proceduralIdlePlaying
          ? "idle"
          : "static-fallback",
      activeIdleSource: this.activeIdleSource,
      idleFallbackActive: this.idleFallbackActive,
      idleHealthy:
        (idlePlaying && (this.idleAction?.getClip()?.tracks.length ?? 0) > 0) ||
        proceduralIdlePlaying,
    };
  }

  setMouthOpen(value: number): void {
    this.mouthValue = Math.max(0, Math.min(1, value));
  }

  setSpeaking(speaking: boolean): void {
    if (speaking && !this.speaking) {
      this.speakingStartTime = this.elapsedTime;
    }
    this.speaking = speaking;
  }

  setCameraAnimation(config: Partial<CameraAnimationConfig>): void {
    this.cameraAnimation = { ...this.cameraAnimation, ...config };
  }

  setForceFaceCameraFlip(enabled: boolean): void {
    this.forceFaceCameraFlip = enabled;
  }

  setIdleGlbUrls(glbUrls: string[]): void {
    const nextUrls = Array.from(
      new Set(glbUrls.map((value) => value.trim()).filter(Boolean)),
    );
    const unchanged =
      nextUrls.length === this.idleGlbUrls.length &&
      nextUrls.every((url, index) => url === this.idleGlbUrls[index]);
    if (unchanged) return;

    this.idleGlbUrls = nextUrls;
    this.activeIdleGlbUrl = null;
    this.activeIdleSource = null;
    this.idleRotationDeadline = Number.POSITIVE_INFINITY;
    this.idleFallbackActive = false;
    this.verifiedIdleGlbUrls.clear();
    this.failedIdleGlbUrls.clear();
    this.rejectedIdleReasons.clear();

    if (this.vrm && !this.emoteAction) {
      void this.loadAndPlayIdle(this.vrm);
    }
  }

  async setScenePreset(preset: StageScenePreset): Promise<void> {
    this.currentScenePreset = preset;

    if (preset === "pro-streamer-stage") {
      await this.ensureStageSceneLoaded();
    } else {
      this.detachStageScene();
    }

    this.applySceneLayout({ animateMark: false });

    if (this.vrm && !this.emoteAction) {
      void this.loadAndPlayIdle(this.vrm);
    }
  }

  async setSceneMark(mark: StageSceneMark): Promise<void> {
    this.currentSceneMark = mark;
    this.applySceneLayout({ animateMark: true });
  }

  async playEmote(
    glbPath: string,
    duration: number,
    loop: boolean,
  ): Promise<void> {
    const vrm = this.vrm;
    const mixer = this.mixer;
    if (!vrm || !mixer) return;

    this.stopEmote();

    this.emoteRequestId += 1;
    const requestId = this.emoteRequestId;

    const resolvedClip = await this.loadEmoteClip(glbPath, vrm);
    if (!resolvedClip || this.vrm !== vrm || this.mixer !== mixer) return;
    if (this.emoteRequestId !== requestId) return;

    const action = mixer.clipAction(resolvedClip.clip);
    action.reset();
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
    action.clampWhenFinished = !loop;

    const fadeDuration = 0.3;
    if (this.idleAction) {
      this.idleAction.fadeOut(fadeDuration);
    }
    this.resetProceduralIdlePose();
    action.fadeIn(fadeDuration);
    action.play();
    this.emoteAction = action;
    this.idleRotationDeadline = Number.POSITIVE_INFINITY;

    if (!loop) {
      const safeDuration =
        Number.isFinite(duration) && duration > 0 ? duration : 3;
      const returnDelay = Math.max(0.5, safeDuration) * 1000;
      this.emoteTimeout = setTimeout(() => {
        if (this.emoteRequestId === requestId) {
          this.stopEmote();
        }
      }, returnDelay);
    }
  }

  stopEmote(): void {
    if (this.emoteTimeout !== null) {
      clearTimeout(this.emoteTimeout);
      this.emoteTimeout = null;
    }

    const fadeDuration = 0.3;
    if (this.emoteAction) {
      this.emoteAction.fadeOut(fadeDuration);
      this.emoteAction = null;
    }
    if (this.idleAction) {
      this.idleAction.reset();
      this.idleAction.fadeIn(fadeDuration);
      this.idleAction.play();
      const clipDuration = this.idleAction.getClip()?.duration ?? 6;
      this.scheduleNextIdleRotation(clipDuration);
    } else if (this.vrm) {
      void this.loadAndPlayIdle(this.vrm);
    }
  }

  async loadVrmFromUrl(url: string, name?: string): Promise<void> {
    if (!this.scene) throw new Error("VrmEngine not initialized");
    if (!this.camera) throw new Error("VrmEngine not initialized");
    if (this.loadingAborted) return;

    if (this.characterRoot && this.vrm) {
      this.characterRoot.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
      this.vrmName = null;
      this.mixer = null;
      this.idleAction = null;
      this.frameMetrics = null;
      this.stopEmote();
      this.emoteClipCache.clear();
      this.activeIdleGlbUrl = null;
      this.activeIdleSource = null;
      this.idleRotationDeadline = Number.POSITIVE_INFINITY;
      this.idleFallbackActive = false;
      this.verifiedIdleGlbUrls.clear();
      this.failedIdleGlbUrls.clear();
      this.rejectedIdleReasons.clear();
    }

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const originalWarn = console.warn;
    type ConsoleArg =
      | string
      | number
      | boolean
      | bigint
      | symbol
      | null
      | undefined
      | object;
    console.warn = (...args: ConsoleArg[]) => {
      const msg = args.map((arg) => String(arg)).join(" ");
      if (msg.includes("VRMExpressionLoaderPlugin: An expression preset")) {
        return;
      }
      originalWarn(...args);
    };

    let gltf: Awaited<ReturnType<typeof loader.loadAsync>>;
    try {
      gltf = await loader.loadAsync(url);
    } finally {
      console.warn = originalWarn;
    }

    if (this.loadingAborted || !this.scene || !this.characterRoot) return;

    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) {
      throw new Error("Loaded asset is not a VRM");
    }

    if (vrm.humanoid) {
      vrm.humanoid.autoUpdateHumanBones = true;
    }

    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    vrm.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.frustumCulled = false;
      }
    });

    this.frameMetrics = this.normalizeModel(vrm);
    if (this.currentScenePreset === "pro-streamer-stage") {
      this.ensureFacingCamera(vrm);
    } else if (this.forceFaceCameraFlip) {
      vrm.scene.rotateY(Math.PI);
      vrm.scene.updateMatrixWorld(true);
    } else {
      this.ensureFacingCamera(vrm);
    }

    if (this.loadingAborted || !this.scene || !this.characterRoot) return;

    this.baseVrmLocalPosition.copy(vrm.scene.position);
    this.baseVrmLocalQuaternion.copy(vrm.scene.quaternion);
    this.proceduralIdleActive = false;
    this.captureProceduralIdleBoneBases(vrm);
    vrm.scene.visible = true;
    this.characterRoot.add(vrm.scene);
    this.vrm = vrm;
    this.vrmName = name ?? null;
    this.resetBlink();
    this.applySceneLayout({ animateMark: false });
    void this.loadAndPlayIdle(vrm);
  }

  private async ensureStageSceneLoaded(): Promise<void> {
    if (!this.scene) return;
    if (this.stageScene) {
      if (this.stageScene.sceneRoot.parent !== this.scene) {
        this.scene.add(this.stageScene.sceneRoot);
      }
      return;
    }

    const requestId = ++this.stageLoadRequestId;
    try {
      const contract = await instantiateProStreamerStageScene();
      if (
        this.loadingAborted ||
        !this.scene ||
        this.currentScenePreset !== "pro-streamer-stage" ||
        requestId !== this.stageLoadRequestId
      ) {
        return;
      }
      this.stageScene = contract;
      this.scene.add(contract.sceneRoot);
      contract.sceneRoot.updateMatrixWorld(true);
    } catch (err) {
      console.error("[VrmEngine] Failed to load pro streamer stage:", err);
      this.stageScene = null;
    }
  }

  private detachStageScene(): void {
    if (this.scene && this.stageScene?.sceneRoot.parent === this.scene) {
      this.scene.remove(this.stageScene.sceneRoot);
    }
    this.stageScene = null;
  }

  private loop(): void {
    this.animationFrameId = requestAnimationFrame(() => this.loop());
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return;

    const delta = this.clock.getDelta();
    this.elapsedTime += delta;
    this.mixer?.update(delta);

    if (this.vrm) {
      this.applyMouthToVrm(this.vrm);
      this.updateBlink(delta);
      this.updateProceduralIdle();
      this.vrm.update(delta);
    }

    if (this.currentScenePreset === "pro-streamer-stage" && this.stageScene) {
      this.updateMarkTransition(delta);
    } else {
      this.updateDefaultCamera(camera);
      camera.lookAt(this.lookAtTarget);
    }

    if (
      this.vrm &&
      this.idleAction &&
      !this.emoteAction &&
      this.elapsedTime >= this.idleRotationDeadline
    ) {
      this.idleRotationDeadline = Number.POSITIVE_INFINITY;
      void this.loadAndPlayIdle(this.vrm);
    }

    renderer.render(scene, camera);
    this.onUpdate?.();
  }

  private updateDefaultCamera(camera: THREE.PerspectiveCamera): void {
    if (!this.cameraAnimation.enabled || this.baseCameraPosition.length() <= 0) {
      return;
    }

    const t = this.elapsedTime * this.cameraAnimation.speed;

    const swayX =
      Math.sin(t * 0.5) * 0.6 +
      Math.sin(t * 0.8 + 1.2) * 0.25 +
      Math.sin(t * 1.3 + 2.5) * 0.15;

    const bobY =
      Math.sin(t * 0.7 + 0.5) * 0.5 +
      Math.sin(t * 1.1 + 1.8) * 0.3 +
      Math.sin(t * 0.3) * 0.2;

    const swayZ =
      Math.sin(t * 0.4 + 1.0) * 0.4 + Math.sin(t * 0.9 + 2.0) * 0.3;

    camera.position.x =
      this.baseCameraPosition.x + swayX * this.cameraAnimation.swayAmplitude;
    camera.position.y =
      this.baseCameraPosition.y + bobY * this.cameraAnimation.bobAmplitude;
    camera.position.z =
      this.baseCameraPosition.z +
      swayZ * this.cameraAnimation.swayAmplitude * 0.5;

    const rotX =
      Math.sin(t * 0.6 + 0.3) * this.cameraAnimation.rotationAmplitude * 0.5;
    const rotY = Math.sin(t * 0.4) * this.cameraAnimation.rotationAmplitude;

    camera.rotation.x = rotX;
    camera.rotation.y = rotY;
  }

  private normalizeModel(vrm: VRM): VrmFrameMetrics {
    const camera = this.camera;
    if (!camera) {
      return {
        distance: 2.8,
        shoulderHeight: 0.42,
      };
    }

    const box = new THREE.Box3().setFromObject(vrm.scene);
    const initialSize = box.getSize(new THREE.Vector3());

    const height = Math.max(0.001, initialSize.y);
    const width = Math.max(0.001, initialSize.x);
    const depth = Math.max(0.001, initialSize.z);

    const standardHeight = 1.0;
    const scaleFactor = standardHeight / height;
    vrm.scene.scale.multiplyScalar(scaleFactor);
    vrm.scene.updateMatrixWorld(true);

    const box3 = new THREE.Box3().setFromObject(vrm.scene);
    const center3 = box3.getCenter(new THREE.Vector3());
    vrm.scene.position.x -= center3.x;
    vrm.scene.position.z -= center3.z;
    vrm.scene.position.y -= box3.min.y;
    vrm.scene.updateMatrixWorld(true);

    const scaledHeight = standardHeight;
    const scaledWidth = width * scaleFactor;
    const scaledDepth = depth * scaleFactor;
    const upperBodyHeight = Math.max(
      scaledWidth,
      scaledHeight * 0.55,
      scaledDepth,
    );
    const shoulderHeight = scaledHeight * 0.42;

    const fovRad = (camera.fov * Math.PI) / 180;
    const distance = (upperBodyHeight * 0.5) / Math.tan(fovRad * 0.5);

    return {
      distance,
      shoulderHeight,
    };
  }

  private getConfiguredIdleGlbUrls(): string[] {
    const configured =
      this.currentScenePreset === "pro-streamer-stage"
        ? [...this.defaultStageIdleGlbUrls, ...this.idleGlbUrls]
        : this.idleGlbUrls;
    return Array.from(
      new Set(configured.map((value) => value.trim()).filter(Boolean)),
    );
  }

  private getIdleFallbackGlbUrls(): string[] {
    return this.currentScenePreset === "pro-streamer-stage"
      ? [this.guaranteedIdleFallbackGlbUrl, this.idleFallbackGlbUrl]
      : [this.idleFallbackGlbUrl, this.guaranteedIdleFallbackGlbUrl];
  }

  private getIdleCandidatePlans(): IdleCandidatePlan[] {
    const ordered: IdleCandidatePlan[] = [];
    const seen = new Set<string>();
    const push = (
      glbUrl: string | null | undefined,
      fallbackActive = false,
    ) => {
      const trimmed = glbUrl?.trim();
      if (!trimmed || seen.has(trimmed) || this.failedIdleGlbUrls.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      ordered.push({
        glbUrl: trimmed,
        fallbackActive,
      });
    };

    const configuredChoices = this.getConfiguredIdleGlbUrls().filter(
      (glbUrl) =>
        this.verifiedIdleGlbUrls.has(glbUrl) &&
        !this.failedIdleGlbUrls.has(glbUrl),
    );
    const activeIndex = configuredChoices.indexOf(this.activeIdleGlbUrl ?? "");
    const rotatedChoices =
      activeIndex >= 0
        ? [
            ...configuredChoices.slice(activeIndex + 1),
            ...configuredChoices.slice(0, activeIndex),
          ]
        : configuredChoices;
    for (const glbUrl of rotatedChoices) {
      if (glbUrl === this.activeIdleGlbUrl) continue;
      push(glbUrl);
    }

    if (this.activeIdleGlbUrl && !this.failedIdleGlbUrls.has(this.activeIdleGlbUrl)) {
      push(this.activeIdleGlbUrl, this.idleFallbackActive);
    }

    for (const glbUrl of this.getIdleFallbackGlbUrls()) {
      push(glbUrl, true);
    }
    return ordered;
  }

  private rememberRejectedIdle(glbUrl: string, reason: string): void {
    this.failedIdleGlbUrls.add(glbUrl);
    this.verifiedIdleGlbUrls.delete(glbUrl);
    this.rejectedIdleReasons.set(glbUrl, reason);
  }

  private async loadAnimationAsset(
    glbPath: string,
    vrm: VRM,
  ): Promise<Awaited<ReturnType<GLTFLoader["loadAsync"]>> | null> {
    if (this.vrm !== vrm) return null;

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(glbPath);
    if (this.vrm !== vrm) return null;

    gltf.scene.updateMatrixWorld(true);
    vrm.scene.updateMatrixWorld(true);
    return gltf;
  }

  private async loadIdleClip(
    glbPath: string,
    vrm: VRM,
  ): Promise<{ clip: THREE.AnimationClip; source: ResolvedAnimationSource } | null> {
    const cached = this.emoteClipCache.get(glbPath);
    if (cached && this.verifiedIdleGlbUrls.has(glbPath)) return cached;

    try {
      const { classifyIdleGltfAnimationClipForVrm } = await import(
        "./resolveGltfAnimationClipForVrm"
      );
      const gltf = await this.loadAnimationAsset(glbPath, vrm);
      if (!gltf) return null;

      const classification = classifyIdleGltfAnimationClipForVrm(
        { scene: gltf.scene, animations: gltf.animations },
        vrm,
      );
      if (classification.status === "rejected") {
        this.rejectedIdleReasons.set(glbPath, classification.reason);
        return null;
      }

      const resolved = {
        clip: classification.clip,
        source: classification.source,
      };
      this.emoteClipCache.set(glbPath, resolved);
      this.rejectedIdleReasons.delete(glbPath);
      return resolved;
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Failed to load idle clip";
      console.error(`[VrmEngine] Failed to load idle: ${glbPath}`, err);
      this.rejectedIdleReasons.set(glbPath, reason);
      return null;
    }
  }

  private async classifyConfiguredIdleCandidates(vrm: VRM): Promise<void> {
    for (const glbUrl of this.getConfiguredIdleGlbUrls()) {
      if (
        this.verifiedIdleGlbUrls.has(glbUrl) ||
        this.failedIdleGlbUrls.has(glbUrl)
      ) {
        continue;
      }

      const resolved = await this.loadIdleClip(glbUrl, vrm);
      if (this.loadingAborted || this.vrm !== vrm) return;

      if (resolved) {
        this.failedIdleGlbUrls.delete(glbUrl);
        this.rejectedIdleReasons.delete(glbUrl);
        this.verifiedIdleGlbUrls.add(glbUrl);
        continue;
      }

      this.rememberRejectedIdle(
        glbUrl,
        this.rejectedIdleReasons.get(glbUrl) ??
          "idle clip failed classification or load",
      );
    }
  }

  private scheduleNextIdleRotation(clipDuration: number): void {
    const safeDuration =
      Number.isFinite(clipDuration) && clipDuration > 0 ? clipDuration : 6;
    this.idleRotationDeadline =
      this.elapsedTime + Math.max(12, safeDuration * 2);
  }

  private applySceneLayout(options: { animateMark: boolean }): void {
    const camera = this.camera;
    const characterRoot = this.characterRoot;
    if (!camera || !characterRoot) return;

    if (this.currentScenePreset === "pro-streamer-stage" && this.stageScene) {
      characterRoot.scale.setScalar(
        Math.max(0.1, this.stageScene.anchorMetadata.targetHeightM * 2.8),
      );
      this.applyStageCamera(this.stageScene);
      const targetMark =
        this.currentSceneMark === "portrait"
          ? this.stageScene.portraitMark
          : this.stageScene.stageMark;

      if (!this.vrm || !options.animateMark) {
        this.markTransition = null;
        this.applyMarkTransform(targetMark);
        if (this.vrm) {
          this.ensureFacingCamera(this.vrm);
        }
        return;
      }

      this.transitionToMark(targetMark);
      return;
    }

    this.markTransition = null;
    characterRoot.position.set(0, 0, 0);
    characterRoot.quaternion.identity();
    characterRoot.scale.setScalar(1);
    this.currentRigPosition.copy(characterRoot.position);
    this.currentRigQuaternion.copy(characterRoot.quaternion);

    if (!this.frameMetrics) return;

    this.lookAtTarget.set(0, this.frameMetrics.shoulderHeight, 0);
    camera.near = Math.max(0.01, this.frameMetrics.distance / 100);
    camera.far = Math.max(100, this.frameMetrics.distance * 100);
    camera.position.set(0, this.frameMetrics.shoulderHeight, this.frameMetrics.distance);
    this.baseCameraPosition.copy(camera.position);
    camera.updateProjectionMatrix();
  }

  private applyStageCamera(stageScene: ProStreamerStageSceneContract): void {
    const camera = this.camera;
    if (!camera) return;

    const authoredCamera = stageScene.stageCamera;
    const authoredPosition = stageScene.stageCameraNode.getWorldPosition(
      new THREE.Vector3(),
    );

    const viewportAspect =
      this.viewportSize.y > 0
        ? this.viewportSize.x / this.viewportSize.y
        : camera.aspect > 0
          ? camera.aspect
          : stageScene.backdropMetrics.aspect;
    const lookTarget = stageScene.backdropMetrics.center;

    camera.position.copy(authoredPosition);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld(true);

    const cameraForward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize();
    const numerator = Math.abs(
      lookTarget.clone().sub(camera.position).dot(stageScene.backdropMetrics.normal),
    );
    const denominator = Math.max(
      1e-6,
      Math.abs(cameraForward.dot(stageScene.backdropMetrics.normal)),
    );
    const cameraToPlaneDistance = numerator / denominator;

    const coverFit = computeStageCoverFit({
      backdropWidth: stageScene.backdropMetrics.width,
      backdropHeight: stageScene.backdropMetrics.height,
      viewportAspect,
      cameraToPlaneDistance,
    });

    camera.fov = coverFit.fovDegrees;
    camera.near = authoredCamera.near;
    camera.far = authoredCamera.far;
    camera.updateProjectionMatrix();
  }

  private applyMarkTransform(mark: StageMarkTransform): void {
    const characterRoot = this.characterRoot;
    if (!characterRoot) return;

    characterRoot.position.copy(mark.position);
    characterRoot.quaternion.copy(mark.quaternion);
    this.currentRigPosition.copy(mark.position);
    this.currentRigQuaternion.copy(mark.quaternion);
  }

  private transitionToMark(targetMark: StageMarkTransform): void {
    const characterRoot = this.characterRoot;
    if (!characterRoot) return;

    const currentPosition = cloneVector3(this.currentRigPosition);
    const currentQuaternion = cloneQuaternion(this.currentRigQuaternion);
    const targetPosition = cloneVector3(targetMark.position);
    const targetQuaternion = cloneQuaternion(targetMark.quaternion);
    const distance = currentPosition.distanceTo(targetPosition);
    const rotationClose = quaternionsClose(currentQuaternion, targetQuaternion);

    if (distance < 1e-3 && rotationClose) {
      this.markTransition = null;
      this.applyMarkTransform(targetMark);
      return;
    }

    this.markTransition = {
      duration: 0.9,
      elapsed: 0,
      fromPosition: currentPosition,
      toPosition: targetPosition,
      fromQuaternion: currentQuaternion,
      toQuaternion: targetQuaternion,
      walkQuaternion: yawFacingQuaternion(
        currentPosition,
        targetPosition,
        targetQuaternion,
      ),
    };

    if (distance >= 0.05) {
      void this.playEmote(this.walkGlbUrl, 0, true);
    }
  }

  private updateMarkTransition(delta: number): void {
    const transition = this.markTransition;
    const characterRoot = this.characterRoot;
    if (!transition || !characterRoot) return;

    transition.elapsed += delta;
    const progress = Math.min(1, transition.elapsed / transition.duration);
    const easedProgress = easeInOutQuad(progress);

    characterRoot.position.lerpVectors(
      transition.fromPosition,
      transition.toPosition,
      easedProgress,
    );

    if (progress < 0.7) {
      const facingT = Math.min(1, progress / 0.25);
      characterRoot.quaternion.copy(transition.fromQuaternion);
      characterRoot.quaternion.slerp(transition.walkQuaternion, facingT);
    } else {
      const settleT = Math.min(1, (progress - 0.7) / 0.3);
      characterRoot.quaternion.copy(transition.walkQuaternion);
      characterRoot.quaternion.slerp(transition.toQuaternion, settleT);
    }

    this.currentRigPosition.copy(characterRoot.position);
    this.currentRigQuaternion.copy(characterRoot.quaternion);

    if (progress >= 1) {
      this.applyMarkTransform({
        position: transition.toPosition,
        quaternion: transition.toQuaternion,
      });
      if (this.vrm) {
        this.ensureFacingCamera(this.vrm);
      }
      this.markTransition = null;
      this.stopEmote();
    }
  }

  private async loadAndPlayIdle(vrm: VRM): Promise<void> {
    if (this.loadingAborted) return;

    await this.classifyConfiguredIdleCandidates(vrm);
    if (this.loadingAborted || this.vrm !== vrm) return;

    const configuredIdleGlbUrls = this.getConfiguredIdleGlbUrls();
    const candidates = this.getIdleCandidatePlans();

    let clip: THREE.AnimationClip | null = null;
    let resolvedIdleGlbUrl: string | null = null;
    let resolvedIdleSource: VrmEngineState["activeIdleSource"] = null;
    let fallbackActive = false;
    for (const candidate of candidates) {
      const resolved = this.verifiedIdleGlbUrls.has(candidate.glbUrl)
        ? (this.emoteClipCache.get(candidate.glbUrl) ??
            (await this.loadEmoteClip(candidate.glbUrl, vrm)))
        : await this.loadEmoteClip(candidate.glbUrl, vrm);
      if (this.loadingAborted || this.vrm !== vrm) return;
      if (!resolved) {
        this.failedIdleGlbUrls.add(candidate.glbUrl);
        this.verifiedIdleGlbUrls.delete(candidate.glbUrl);
        continue;
      }
      clip = resolved.clip;
      resolvedIdleGlbUrl = candidate.glbUrl;
      fallbackActive = candidate.fallbackActive;
      resolvedIdleSource =
        candidate.glbUrl === this.idleFallbackGlbUrl
          ? "legacy-fallback"
          : resolved.source;
      if (configuredIdleGlbUrls.includes(candidate.glbUrl)) {
        this.failedIdleGlbUrls.delete(candidate.glbUrl);
        this.rejectedIdleReasons.delete(candidate.glbUrl);
        this.verifiedIdleGlbUrls.add(candidate.glbUrl);
      }
      break;
    }

    if (
      !clip ||
      !resolvedIdleGlbUrl ||
      !resolvedIdleSource ||
      this.loadingAborted ||
      this.vrm !== vrm
    ) {
      if (this.currentScenePreset === "pro-streamer-stage") {
        this.activateProceduralIdleFallback();
      } else {
        this.activeIdleGlbUrl = null;
        this.activeIdleSource = null;
        this.idleFallbackActive = false;
        this.idleRotationDeadline = Number.POSITIVE_INFINITY;
      }
      return;
    }

    let mixer = this.mixer;
    if (!mixer) {
      mixer = new THREE.AnimationMixer(vrm.scene);
      this.mixer = mixer;
    }

    const action = mixer.clipAction(clip);
    const previousIdleAction = this.idleAction;

    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;

    if (previousIdleAction && previousIdleAction !== action) {
      previousIdleAction.fadeOut(0.25);
    }

    this.resetProceduralIdlePose();
    action.fadeIn(0.25);
    action.play();

    this.idleAction = action;
    this.activeIdleGlbUrl = resolvedIdleGlbUrl;
    this.activeIdleSource = resolvedIdleSource;
    this.idleFallbackActive =
      fallbackActive || resolvedIdleSource === "legacy-fallback";
    this.scheduleNextIdleRotation(clip.duration);
  }

  private updateProceduralIdle(): void {
    const vrm = this.vrm;
    if (!vrm) return;

    if (
      this.currentScenePreset !== "pro-streamer-stage" ||
      this.emoteAction ||
      this.markTransition
    ) {
      if (this.proceduralIdleActive) {
        this.resetProceduralIdlePose();
      }
      return;
    }

    if (!this.proceduralIdleActive) {
      return;
    }

    const breathingLift =
      Math.sin(this.elapsedTime * 1.15) * 0.018 +
      Math.sin(this.elapsedTime * 0.45 + 0.8) * 0.006;
    const swayYaw = Math.sin(this.elapsedTime * 0.62) * 0.018;
    const swayRoll = Math.sin(this.elapsedTime * 0.74 + 0.4) * 0.01;

    vrm.scene.position.copy(this.baseVrmLocalPosition);
    vrm.scene.position.y += breathingLift;
    vrm.scene.quaternion.copy(this.baseVrmLocalQuaternion);
    vrm.scene.quaternion.multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, swayYaw, swayRoll),
      ),
    );
    this.applyProceduralIdleBonePose(vrm);
    vrm.scene.updateMatrixWorld(true);
  }

  private activateProceduralIdleFallback(): void {
    if (this.idleAction) {
      this.idleAction.stop();
      this.idleAction = null;
    }

    this.resetProceduralIdlePose();
    this.activeIdleGlbUrl = null;
    this.activeIdleSource = "procedural-fallback";
    this.idleFallbackActive = true;
    this.idleRotationDeadline = Number.POSITIVE_INFINITY;
    this.proceduralIdleActive = true;
  }

  private resetProceduralIdlePose(): void {
    const vrm = this.vrm;
    if (!vrm) return;

    vrm.scene.position.copy(this.baseVrmLocalPosition);
    vrm.scene.quaternion.copy(this.baseVrmLocalQuaternion);
    this.restoreProceduralIdleBoneBases(vrm);
    vrm.scene.updateMatrixWorld(true);
    this.proceduralIdleActive = false;
  }

  private captureProceduralIdleBoneBases(vrm: VRM): void {
    this.proceduralIdleBoneBases.clear();
    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    const boneNames: VRMHumanBoneName[] = [
      "chest",
      "neck",
      "leftUpperArm",
      "rightUpperArm",
      "leftLowerArm",
      "rightLowerArm",
    ];

    for (const boneName of boneNames) {
      const bone = humanoid.getNormalizedBoneNode(boneName);
      if (!bone) continue;
      this.proceduralIdleBoneBases.set(
        boneName,
        bone.quaternion.clone(),
      );
    }
  }

  private restoreProceduralIdleBoneBases(vrm: VRM): void {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    for (const [boneName, baseQuaternion] of this.proceduralIdleBoneBases) {
      const bone = humanoid.getNormalizedBoneNode(boneName);
      if (!bone) continue;
      bone.quaternion.copy(baseQuaternion);
    }
  }

  private applyProceduralIdleBonePose(vrm: VRM): void {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    const poseBone = (
      boneName: VRMHumanBoneName,
      euler: THREE.Euler,
    ) => {
      const bone = humanoid.getNormalizedBoneNode(boneName);
      const baseQuaternion = this.proceduralIdleBoneBases.get(boneName);
      if (!bone || !baseQuaternion) return;
      bone.quaternion.copy(baseQuaternion);
      bone.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(euler),
      );
    };

    const breathe = Math.sin(this.elapsedTime * 1.15);
    const drift = Math.sin(this.elapsedTime * 0.62 + 0.6);
    poseBone("chest", new THREE.Euler(0.03 * breathe, 0, 0.01 * drift));
    poseBone("neck", new THREE.Euler(-0.02 * breathe, 0.05 * drift, 0));
    poseBone("leftUpperArm", new THREE.Euler(-0.08, 0.04, -1.1 + 0.04 * drift));
    poseBone("rightUpperArm", new THREE.Euler(-0.08, -0.04, 1.1 - 0.04 * drift));
    poseBone("leftLowerArm", new THREE.Euler(0.06, 0, -0.14 + 0.02 * breathe));
    poseBone("rightLowerArm", new THREE.Euler(0.06, 0, 0.14 - 0.02 * breathe));
  }

  private async loadEmoteClip(
    glbPath: string,
    vrm: VRM,
  ): Promise<{ clip: THREE.AnimationClip; source: ResolvedAnimationSource } | null> {
    const cached = this.emoteClipCache.get(glbPath);
    if (cached) return cached;

    try {
      const { resolveGltfAnimationClipForVrm } = await import(
        "./resolveGltfAnimationClipForVrm"
      );
      const gltf = await this.loadAnimationAsset(glbPath, vrm);
      if (!gltf) return null;

      const resolved = resolveGltfAnimationClipForVrm(
        { scene: gltf.scene, animations: gltf.animations },
        vrm,
      );

      this.emoteClipCache.set(glbPath, resolved);
      return resolved;
    } catch (err) {
      console.error(`[VrmEngine] Failed to load emote: ${glbPath}`, err);
      return null;
    }
  }

  private applyMouthToVrm(vrm: VRM): void {
    const manager = vrm.expressionManager;
    if (!manager) return;

    let target: number;

    if (this.speaking) {
      const elapsed = this.elapsedTime - this.speakingStartTime;
      const base = Math.sin(elapsed * 12) * 0.3 + 0.4;
      const detail = Math.sin(elapsed * 18.7) * 0.15;
      const slow = Math.sin(elapsed * 4.2) * 0.1;
      target = Math.max(0, Math.min(1, base + detail + slow));
    } else {
      target = this.mouthValue;
    }

    const next = Math.max(0, Math.min(1, target));
    const alpha = next > this.mouthSmoothed ? 0.3 : 0.2;
    this.mouthSmoothed = this.mouthSmoothed * (1 - alpha) + next * alpha;
    manager.setValue("aa", this.mouthSmoothed);
  }

  private updateBlink(delta: number): void {
    const vrm = this.vrm;
    if (!vrm?.expressionManager) return;

    switch (this.blinkPhase) {
      case "idle":
        this.blinkTimer += delta;
        if (this.blinkTimer >= this.nextBlinkDelay) {
          this.blinkPhase = "closing";
          this.blinkPhaseTimer = 0;
        }
        break;

      case "closing": {
        this.blinkPhaseTimer += delta;
        const t = Math.min(
          1,
          this.blinkPhaseTimer / VrmEngine.BLINK_CLOSE_DURATION,
        );
        this.blinkValue = t * t;
        if (t >= 1) {
          this.blinkPhase = "closed";
          this.blinkPhaseTimer = 0;
          this.blinkValue = 1;
        }
        break;
      }

      case "closed":
        this.blinkPhaseTimer += delta;
        if (this.blinkPhaseTimer >= VrmEngine.BLINK_HOLD_DURATION) {
          this.blinkPhase = "opening";
          this.blinkPhaseTimer = 0;
        }
        break;

      case "opening": {
        this.blinkPhaseTimer += delta;
        const t = Math.min(
          1,
          this.blinkPhaseTimer / VrmEngine.BLINK_OPEN_DURATION,
        );
        const eased = 1 - (1 - t) * (1 - t);
        this.blinkValue = 1 - eased;
        if (t >= 1) {
          this.blinkPhase = "idle";
          this.blinkPhaseTimer = 0;
          this.blinkValue = 0;
          this.blinkTimer = 0;
          this.scheduleNextBlink();
        }
        break;
      }
    }

    vrm.expressionManager.setValue("blink", this.blinkValue);
  }

  private scheduleNextBlink(): void {
    const range = VrmEngine.BLINK_MAX_INTERVAL - VrmEngine.BLINK_MIN_INTERVAL;
    this.nextBlinkDelay = VrmEngine.BLINK_MIN_INTERVAL + Math.random() * range;

    if (Math.random() < VrmEngine.DOUBLE_BLINK_CHANCE) {
      this.nextBlinkDelay = 0.12 + Math.random() * 0.08;
    }
  }

  private resetBlink(): void {
    this.blinkPhase = "idle";
    this.blinkTimer = 0;
    this.blinkPhaseTimer = 0;
    this.blinkValue = 0;
    this.nextBlinkDelay = 1.5 + Math.random() * 2;
  }

  private ensureFacingCamera(vrm: VRM): void {
    const camera = this.camera;
    if (!camera) return;

    const probe = vrm.humanoid?.getNormalizedBoneNode("hips") ?? vrm.scene;
    vrm.scene.updateMatrixWorld(true);

    const forward = new THREE.Vector3();
    probe.getWorldDirection(forward);

    const vrmPos = new THREE.Vector3();
    vrm.scene.getWorldPosition(vrmPos);

    const toCamera = new THREE.Vector3().subVectors(camera.position, vrmPos);

    forward.y = 0;
    toCamera.y = 0;
    if (forward.lengthSq() < 1e-6 || toCamera.lengthSq() < 1e-6) return;

    forward.normalize();
    toCamera.normalize();

    if (forward.dot(toCamera) < 0) {
      vrm.scene.rotateY(Math.PI);
      vrm.scene.updateMatrixWorld(true);
    }
  }
}
