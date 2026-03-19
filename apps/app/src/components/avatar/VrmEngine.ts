import { resolveAppAssetUrl } from "@milady/app-core/utils";
import {
  MToonMaterialLoaderPlugin,
  type VRM,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { computeStageCoverFit } from "../../proStreamerStageFit";
import {
  instantiateProStreamerStageScene,
  type ProStreamerStageSceneContract,
  type StageMarkTransform,
  type StageSceneMark,
  type StageScenePreset,
} from "../../proStreamerStageScene";
import {
  type AnimationLoaderContext,
  loadEmoteClip,
  loadIdleClip,
} from "./VrmAnimationLoader";
import { VrmBlinkController } from "./VrmBlinkController";
import {
  type CameraAnimationConfig,
  type CameraProfile,
  type InteractionMode,
  VrmCameraManager,
} from "./VrmCameraManager";
import { VrmFootShadow } from "./VrmFootShadow";

export type { CameraAnimationConfig, CameraProfile, InteractionMode };

export type VrmEngineState = {
  vrmLoaded: boolean;
  vrmName: string | null;
  idlePlaying: boolean;
  idleTime: number;
  idleTracks: number;
};

type UpdateCallback = () => void;
type RendererBackend = "webgl" | "webgpu";
type RendererLike = Pick<
  THREE.WebGLRenderer,
  | "dispose"
  | "domElement"
  | "render"
  | "setClearColor"
  | "setPixelRatio"
  | "setSize"
> & {
  forceContextLoss?: () => void;
  outputColorSpace?: string;
  shadowMap?: {
    enabled: boolean;
    type: THREE.ShadowMapType;
  };
  toneMapping?: THREE.ToneMapping;
  toneMappingExposure?: number;
};

const DEFAULT_CAMERA_ANIMATION: CameraAnimationConfig = {
  enabled: false,
  swayAmplitude: 0.06,
  bobAmplitude: 0.03,
  rotationAmplitude: 0.01,
  speed: 0.8,
};
const MAX_RENDERER_PIXEL_RATIO = 2;
const WEBGPU_RENDERER_ENABLED = false;

function getRendererPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(
    Math.max(window.devicePixelRatio || 1, 1),
    MAX_RENDERER_PIXEL_RATIO,
  );
}

function cloneVector3(value: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function cloneQuaternion(value: THREE.Quaternion): THREE.Quaternion {
  return new THREE.Quaternion(value.x, value.y, value.z, value.w);
}

/**
 * Create the best available renderer for the current platform.
 * Tries WebGPU first (better performance on macOS WKWebView and modern CEF).
 * Falls back to WebGL if WebGPU is unavailable or fails to initialize.
 * THREE.WebGPURenderer is async-init and requires await renderer.init().
 */
async function createRenderer(
  canvas: HTMLCanvasElement,
): Promise<{ backend: RendererBackend; renderer: RendererLike }> {
  // WebGPU currently renders the emissive pro-streamer backdrop black in the
  // production Alice shell. Keep the operator-facing renderer on WebGL until
  // that material path is proven stable again.
  if (WEBGPU_RENDERER_ENABLED && typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const { WebGPURenderer } = await import("three/webgpu");
      const renderer = new WebGPURenderer({
        canvas,
        alpha: true,
        antialias: true,
      }) as unknown as RendererLike & { init?: () => Promise<unknown> };
      await renderer.init?.();
      console.info("[VrmEngine] Using WebGPURenderer");
      return { backend: "webgpu", renderer };
    } catch (err) {
      console.warn(
        "[VrmEngine] WebGPURenderer failed, falling back to WebGL:",
        err,
      );
    }
  }
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  }) as unknown as RendererLike;
  console.info("[VrmEngine] Using WebGLRenderer");
  return { backend: "webgl", renderer };
}

export class VrmEngine {
  private renderer: RendererLike | null = null;
  private rendererBackend: RendererBackend = "webgl";
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
  private vrmLoadRequestId = 0;
  private vrmReady = false;
  private teleportProgress = 1.0;
  private teleportProgressUniform: { value: number } | null = null;
  private teleportDissolvedMaterials: THREE.Material[] = [];
  private mouthValue = 0;
  private mouthSmoothed = 0;
  private vrmName: string | null = null;
  private lookAtTarget = new THREE.Vector3(0, 0.5, 0);
  private readonly idleGlbUrl = resolveAppAssetUrl("animations/idle.glb");
  private idleGlbUrls: string[] = [];
  private cameraAnimation: CameraAnimationConfig = {
    ...DEFAULT_CAMERA_ANIMATION,
  };
  private baseCameraPosition = new THREE.Vector3();
  private elapsedTime = 0;
  private speaking = false;
  private speakingStartTime = 0;
  private readonly blinkController = new VrmBlinkController();
  private readonly footShadow = new VrmFootShadow();
  private readonly cameraManager = new VrmCameraManager();
  private emoteAction: THREE.AnimationAction | null = null;
  private emoteTimeout: ReturnType<typeof setTimeout> | null = null;
  private emoteClipCache = new Map<string, THREE.AnimationClip>();
  private emoteRequestId = 0;
  private controls: OrbitControls | null = null;
  private interactionEnabled = false;
  private interactionMode: InteractionMode = "free";
  private cameraProfile: CameraProfile = "chat";
  private currentScenePreset: StageScenePreset = "default";
  private currentSceneMark: StageSceneMark = "stage";
  private stageScene: ProStreamerStageSceneContract | null = null;
  private stageLoadRequestId = 0;
  private currentRigPosition = new THREE.Vector3();
  private currentRigQuaternion = new THREE.Quaternion();
  private readyPromise: Promise<void> = Promise.resolve();
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error?: unknown) => void) | null = null;

  // Transition state
  private isCameraTransitioning = false;
  private transitionStartFov = 0;
  private transitionTargetFov = 0;
  private transitionStartPos = new THREE.Vector3();
  private transitionTargetPos = new THREE.Vector3();
  private transitionStartLookAt = new THREE.Vector3();
  private transitionTargetLookAt = new THREE.Vector3();
  private transitionProgress = 0;
  private transitionDuration = 0.8; // seconds

  private handleControlStart = (): void => {
    if (!this.interactionEnabled) return;
  };
  private handleControlEnd = (): void => {
    if (!this.interactionEnabled) return;
    if (this.camera) {
      this.baseCameraPosition.copy(this.camera.position);
    }
    if (this.controls) {
      this.lookAtTarget.copy(this.controls.target);
    }
  };

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private resetReadyPromise(): void {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  private settleReady(error?: unknown): void {
    if (error) {
      this.rejectReady?.(error);
    } else {
      this.resolveReady?.();
    }
    this.resolveReady = null;
    this.rejectReady = null;
  }

  setup(canvas: HTMLCanvasElement, onUpdate: UpdateCallback): void {
    if (this.initialized && this.renderer?.domElement === canvas) {
      this.onUpdate = onUpdate;
      return;
    }
    if (this.initialized) this.dispose();
    this.onUpdate = onUpdate;
    this.loadingAborted = false;
    this.resetReadyPromise();
    // Async renderer creation: tries WebGPU, falls back to WebGL.
    // setup() remains synchronous for callers; the loop starts after init resolves.
    void (async () => {
      try {
        const { backend, renderer } = await createRenderer(canvas);
        // Guard: if dispose() was called while we were awaiting, abort.
        if (this.loadingAborted) {
          renderer.dispose();
          if (backend === "webgl") {
            renderer.forceContextLoss?.();
          }
          this.settleReady();
          return;
        }
        renderer.setPixelRatio(getRendererPixelRatio());
        renderer.setClearColor(0x000000, 0);
        if (backend === "webgl") {
          const webglRenderer = renderer as THREE.WebGLRenderer;
          webglRenderer.shadowMap.enabled = true;
          webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
          webglRenderer.toneMapping = THREE.NoToneMapping;
          webglRenderer.toneMappingExposure = 1.0;
          webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
        }
        this.renderer = renderer;
        this.rendererBackend = backend;
        const scene = new THREE.Scene();
        this.scene = scene;
        const characterRoot = new THREE.Group();
        scene.add(characterRoot);
        this.characterRoot = characterRoot;
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
        camera.position.set(0, 1.2, 5.0);
        this.camera = camera;
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.target.copy(this.lookAtTarget);
        controls.addEventListener("start", this.handleControlStart);
        controls.addEventListener("end", this.handleControlEnd);
        this.cameraManager.applyInteractionMode(controls, this.interactionMode);
        controls.update();
        this.controls = controls;
        this.setInteractionEnabled(this.interactionEnabled);
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambient);
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(1, 1, 1).normalize();
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.setScalar(1024);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-1, 0.5, -1).normalize();
        scene.add(fillLight);
        this.footShadow.create(scene);
        this.initialized = true;
        if (this.currentScenePreset === "pro-streamer-stage") {
          await this.ensureStageSceneLoaded();
          if (this.loadingAborted) {
            this.settleReady();
            return;
          }
        }
        this.resize(canvas.clientWidth, canvas.clientHeight);
        this.applySceneLayout();
        this.loop();
        this.settleReady();
      } catch (error) {
        this.initialized = false;
        this.renderer = null;
        this.rendererBackend = "webgl";
        this.scene = null;
        this.camera = null;
        this.characterRoot = null;
        this.controls = null;
        console.error("[VrmEngine] Failed to initialize renderer:", error);
        this.settleReady(error);
      }
    })();
  }

  isInitialized(): boolean {
    return this.initialized && this.renderer !== null;
  }
  dispose(): void {
    this.loadingAborted = true;
    this.initialized = false;
    this.settleReady();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.characterRoot && this.vrm && this.vrm.scene.parent === this.characterRoot) {
      this.characterRoot.remove(this.vrm.scene);
    } else if (this.scene && this.vrm && this.vrm.scene.parent === this.scene) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    this.detachStageScene();
    if (this.scene) {
      this.footShadow.dispose(this.scene);
    }
    if (this.controls) {
      this.controls.removeEventListener("start", this.handleControlStart);
      this.controls.removeEventListener("end", this.handleControlEnd);
      this.controls.dispose();
      this.controls = null;
    }
    this.vrm = null;
    this.vrmReady = false;
    this.vrmName = null;
    this.mixer = null;
    this.idleAction = null;
    if (this.emoteTimeout !== null) {
      clearTimeout(this.emoteTimeout);
      this.emoteTimeout = null;
    }
    this.emoteAction = null;
    this.emoteClipCache.clear();
    this.teleportProgress = 1.0;
    this.cleanupTeleportDissolve();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.rendererBackend === "webgl") {
        this.renderer.forceContextLoss?.();
      }
    }
    this.renderer = null;
    this.rendererBackend = "webgl";
    this.scene = null;
    this.camera = null;
    this.characterRoot = null;
    this.onUpdate = null;
  }
  setInteractionEnabled(enabled: boolean): void {
    this.interactionEnabled = enabled;
    if (this.controls) {
      this.controls.enabled = enabled;
    }
  }
  setInteractionMode(mode: InteractionMode): void {
    this.interactionMode = mode;
    if (this.controls) {
      this.cameraManager.applyInteractionMode(this.controls, mode);
      this.controls.update();
    }
  }
  setCameraProfile(profile: CameraProfile): void {
    if (this.cameraProfile === profile) return;
    if (this.currentScenePreset === "pro-streamer-stage") {
      this.cameraProfile = profile;
      this.applySceneLayout();
      return;
    }

    // Save current state for transition
    if (this.camera) {
      this.transitionStartFov = this.camera.fov;
      this.transitionStartPos.copy(this.camera.position);
      this.transitionStartLookAt.copy(this.lookAtTarget);

      this.cameraProfile = profile;
      if (profile === "companion" || profile === "companion_close") {
        this.cameraAnimation = { ...this.cameraAnimation, enabled: false };
      }

      const targetLookAt = new THREE.Vector3();
      const targetPos = new THREE.Vector3();

      if (this.vrm) {
        this.cameraManager.centerAndFrame(
          this.vrm,
          this.camera,
          this.controls,
          this.cameraProfile,
          targetLookAt,
          targetPos,
          (c) =>
            this.cameraManager.applyInteractionMode(c, this.interactionMode),
        );
      } else if (this.controls) {
        this.cameraManager.applyCameraProfileToCamera(
          this.camera,
          this.controls,
          this.cameraProfile,
        );
        targetPos.copy(this.camera.position);
      }

      this.transitionTargetFov = this.camera.fov;
      this.transitionTargetPos.copy(targetPos);
      this.transitionTargetLookAt.copy(targetLookAt);

      // Reset position/fov back to start, we will lerp to target in loop
      this.camera.fov = this.transitionStartFov;
      this.camera.position.copy(this.transitionStartPos);
      this.camera.updateProjectionMatrix();

      this.isCameraTransitioning = true;
      this.transitionProgress = 0;
    } else {
      this.cameraProfile = profile;
    }
  }
  setIdleGlbUrls(urls: string[]): void {
    this.idleGlbUrls = urls
      .map((value) => value.trim())
      .filter(Boolean);
  }
  async setScenePreset(preset: StageScenePreset): Promise<void> {
    if (this.currentScenePreset === preset) {
      if (preset === "pro-streamer-stage") {
        await this.ensureStageSceneLoaded();
      }
      this.applySceneLayout();
      return;
    }

    this.currentScenePreset = preset;
    if (preset === "pro-streamer-stage") {
      await this.ensureStageSceneLoaded();
    } else {
      this.detachStageScene();
    }
    this.applySceneLayout();
  }
  async setSceneMark(mark: StageSceneMark): Promise<void> {
    this.currentSceneMark = mark;
    this.applySceneLayout();
  }
  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.currentScenePreset === "pro-streamer-stage" && this.stageScene) {
      this.applyStageCamera(this.stageScene);
    }
  }
  getState(): VrmEngineState {
    const idlePlaying = this.idleAction?.isRunning() ?? false;
    return {
      vrmLoaded: this.vrm !== null && this.vrmReady,
      vrmName: this.vrmName,
      idlePlaying,
      idleTime: this.idleAction?.time ?? 0,
      idleTracks: this.idleAction?.getClip()?.tracks.length ?? 0,
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
  async playEmote(
    path: string,
    duration: number,
    loop: boolean,
  ): Promise<void> {
    const vrm = this.vrm;
    const mixer = this.mixer;
    if (!vrm || !mixer) return;
    this.stopEmote();
    this.emoteRequestId++;
    const requestId = this.emoteRequestId;
    const clip = await this.loadEmoteClipCached(path, vrm);
    if (!clip || this.vrm !== vrm || this.mixer !== mixer) return;
    if (this.emoteRequestId !== requestId) return;
    const action = mixer.clipAction(clip);
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
    action.fadeIn(fadeDuration);
    action.play();
    this.emoteAction = action;
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
    }
  }
  async loadVrmFromUrl(url: string, name?: string): Promise<void> {
    await this.whenReady();
    if (!this.scene) throw new Error("VrmEngine not initialized");
    if (!this.camera) throw new Error("VrmEngine not initialized");
    if (!this.characterRoot) throw new Error("VrmEngine not initialized");
    if (this.loadingAborted) return;
    const requestId = ++this.vrmLoadRequestId;
    if (this.vrm) {
      if (this.vrm.scene.parent === this.characterRoot) {
        this.characterRoot.remove(this.vrm.scene);
      } else {
        this.scene.remove(this.vrm.scene);
      }
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
      this.vrmReady = false;
      this.vrmName = null;
      this.mixer = null;
      this.idleAction = null;
      this.stopEmote();
      this.emoteClipCache.clear();
    }
    const loader = new GLTFLoader();
    const webGpuNodes =
      this.rendererBackend === "webgpu"
        ? await import("@pixiv/three-vrm/nodes")
        : null;
    loader.register((parser) => {
      if (webGpuNodes) {
        const mtoonMaterialPlugin = new MToonMaterialLoaderPlugin(parser, {
          materialType: webGpuNodes.MToonNodeMaterial,
        });
        return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin });
      }
      return new VRMLoaderPlugin(parser);
    });
    const gltf = await loader.loadAsync(url);
    if (
      this.loadingAborted ||
      !this.scene ||
      requestId !== this.vrmLoadRequestId
    ) {
      const staleVrm = gltf.userData.vrm as VRM | undefined;
      if (staleVrm) VRMUtils.deepDispose(staleVrm.scene);
      return;
    }
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error("Loaded asset is not a VRM");
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    if (this.currentScenePreset !== "pro-streamer-stage" && this.camera) {
      this.cameraManager.centerAndFrame(
        vrm,
        this.camera,
        this.controls,
        this.cameraProfile,
        this.lookAtTarget,
        this.baseCameraPosition,
        (c) => this.cameraManager.applyInteractionMode(c, this.interactionMode),
      );
    }
    try {
      VRMUtils.rotateVRM0(vrm);
    } catch {
      /* optional in some versions */
    }
    if (this.currentScenePreset !== "pro-streamer-stage") {
      this.cameraManager.ensureFacingCamera(vrm, this.camera);
    }
    if (
      this.loadingAborted ||
      !this.scene ||
      !this.characterRoot ||
      requestId !== this.vrmLoadRequestId
    ) {
      VRMUtils.deepDispose(vrm.scene);
      return;
    }
    vrm.scene.visible = false;
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });
    this.characterRoot.add(vrm.scene);
    this.vrm = vrm;
    this.vrmName = name ?? null;
    vrm.springBoneManager?.reset?.();
    this.blinkController.reset();
    this.applySceneLayout();

    try {
      await this.loadAndPlayIdle(vrm);
      if (!this.loadingAborted && this.vrm === vrm) {
        this.vrmReady = true;
        await this.playTeleportReveal(vrm);
        vrm.scene.visible = true;
      }
    } catch {
      if (!this.loadingAborted && this.vrm === vrm) {
        this.vrmReady = true;
        vrm.scene.visible = true;
      }
    }
  }

  private async playTeleportReveal(vrm: VRM): Promise<void> {
    this.teleportProgress = 0.0;
    this.cleanupTeleportDissolve();

    try {
      const tsl = await import("three/tsl");

      const uProgress = tsl.uniform(0.0);
      this.teleportProgressUniform = uProgress;

      vrm.scene.traverse((obj: THREE.Object3D) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const mat of mats) {
          if (!mat.isNodeMaterial || mat.userData._dissolveApplied) continue;
          mat.userData._dissolveApplied = true;
          mat.userData._origOpacityNode = mat.opacityNode ?? null;
          // biome-ignore lint/suspicious/noExplicitAny: Three.js NodeMaterial emissiveNode is not in public types
          mat.userData._origEmissiveNode = (mat as any).emissiveNode ?? null;
          mat.userData._origAlphaTest = mat.alphaTest;

          // World-space Y from TSL
          const worldY = tsl.positionWorld.y;

          // Sweep threshold: -0.2 → 2.0 as progress goes 0 → 1
          const threshold = uProgress.mul(2.2).add(-0.2);

          // Distance above dissolve line
          const diff = worldY.sub(threshold);

          // Dither noise using a hash of world position
          const noiseCoord = tsl.vec2(
            worldY.mul(40.0),
            tsl.positionWorld.x.add(tsl.positionWorld.z).mul(30.0),
          );
          const noise = tsl.fract(
            tsl
              .sin(tsl.dot(noiseCoord, tsl.vec2(12.9898, 78.233)))
              .mul(43758.5453),
          );

          // Ratio: 0 = fully visible, 1 = fully hidden (wider zone = 0.3)
          const ratio = diff.div(0.3).clamp(0.0, 1.0);

          // Dithered alpha: visible when noise >= ratio
          const dissolveAlpha = tsl.step(ratio, noise);

          // --- Holographic glow at the dissolve edge ---
          // Glow is strongest right at the dissolve boundary
          const edgeDist = diff.abs();
          const glowWidth = tsl.float(0.15);
          const glowIntensity = tsl
            .float(1.0)
            .sub(edgeDist.div(glowWidth).clamp(0.0, 1.0));
          // Holographic color: cyan-magenta shift based on world position
          const hueShift = tsl.fract(worldY.mul(3.0).add(uProgress.mul(2.0)));
          const holoR = tsl
            .smoothstep(tsl.float(0.3), tsl.float(0.7), hueShift)
            .mul(0.8)
            .add(0.2);
          const holoG = tsl.float(0.9);
          const holoB = tsl
            .smoothstep(tsl.float(0.7), tsl.float(0.3), hueShift)
            .mul(0.8)
            .add(0.2);
          const holoColor = tsl.vec3(holoR, holoG, holoB);

          // Only show glow when dissolve is active and fragment is visible
          const glowActive = tsl
            .step(tsl.float(0.001), uProgress)
            .mul(tsl.float(1.0).sub(tsl.step(tsl.float(0.999), uProgress)));
          const emissiveBoost = holoColor.mul(
            glowIntensity.mul(3.0).mul(glowActive).mul(dissolveAlpha),
          );

          // Compose with existing nodes
          const origOpacity = mat.opacityNode;
          mat.opacityNode = origOpacity
            ? origOpacity.mul(dissolveAlpha)
            : dissolveAlpha;

          // biome-ignore lint/suspicious/noExplicitAny: Three.js NodeMaterial emissiveNode is not in public types
          const origEmissive = (mat as any).emissiveNode;
          // biome-ignore lint/suspicious/noExplicitAny: Three.js NodeMaterial emissiveNode is not in public types
          (mat as any).emissiveNode = origEmissive
            ? origEmissive.add(emissiveBoost)
            : emissiveBoost;

          mat.alphaTest = 0.01;
          mat.transparent = true;
          mat.needsUpdate = true;
          this.teleportDissolvedMaterials.push(mat);
        }
      });
    } catch (err) {
      console.warn(
        "[VrmEngine] TSL dissolve unavailable, showing instantly:",
        err,
      );
    }
  }

  private cleanupTeleportDissolve(): void {
    for (const mat of this.teleportDissolvedMaterials) {
      if (mat.userData._dissolveApplied) {
        (mat as unknown as Record<string, unknown>).opacityNode =
          mat.userData._origOpacityNode ?? null;
        (mat as unknown as Record<string, unknown>).emissiveNode =
          mat.userData._origEmissiveNode ?? null;
        mat.alphaTest = mat.userData._origAlphaTest ?? 0;
        delete mat.userData._dissolveApplied;
        delete mat.userData._origOpacityNode;
        delete mat.userData._origEmissiveNode;
        delete mat.userData._origAlphaTest;
        mat.needsUpdate = true;
      }
    }
    this.teleportDissolvedMaterials = [];
    this.teleportProgressUniform = null;
  }
  private get animationLoaderContext(): AnimationLoaderContext {
    return {
      isAborted: () => this.loadingAborted,
      isCurrentVrm: (vrm: VRM) => this.vrm === vrm,
    };
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
    } catch (error) {
      console.error("[VrmEngine] Failed to load pro streamer stage:", error);
      this.stageScene = null;
    }
  }
  private detachStageScene(): void {
    if (this.scene && this.stageScene?.sceneRoot.parent === this.scene) {
      this.scene.remove(this.stageScene.sceneRoot);
    }
    this.stageScene = null;
  }
  private applySceneLayout(): void {
    const camera = this.camera;
    const characterRoot = this.characterRoot;
    if (!camera || !characterRoot) return;

    if (this.currentScenePreset === "pro-streamer-stage" && this.stageScene) {
      characterRoot.scale.setScalar(
        Math.max(0.1, this.stageScene.anchorMetadata.targetHeightM * 2.8),
      );
      this.applyStageCamera(this.stageScene);
      this.applyMarkTransform(
        this.currentSceneMark === "portrait"
          ? this.stageScene.portraitMark
          : this.stageScene.stageMark,
      );
      if (this.vrm) {
        this.cameraManager.ensureFacingCamera(this.vrm, camera);
      }
      return;
    }

    characterRoot.position.set(0, 0, 0);
    characterRoot.quaternion.identity();
    characterRoot.scale.setScalar(1);
    this.currentRigPosition.copy(characterRoot.position);
    this.currentRigQuaternion.copy(characterRoot.quaternion);

    if (this.vrm) {
      this.cameraManager.centerAndFrame(
        this.vrm,
        camera,
        this.controls,
        this.cameraProfile,
        this.lookAtTarget,
        this.baseCameraPosition,
        (controls) =>
          this.cameraManager.applyInteractionMode(controls, this.interactionMode),
      );
    }
  }
  private applyStageCamera(stageScene: ProStreamerStageSceneContract): void {
    const camera = this.camera;
    if (!camera) return;

    const authoredCamera = stageScene.stageCamera;
    const authoredPosition = stageScene.stageCameraNode.getWorldPosition(
      new THREE.Vector3(),
    );
    const viewportAspect =
      camera.aspect > 0 ? camera.aspect : stageScene.backdropMetrics.aspect;
    const lookTarget = stageScene.backdropMetrics.center;

    camera.position.copy(authoredPosition);
    camera.up.set(0, 1, 0);
    this.lookAtTarget.copy(lookTarget);
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
    this.baseCameraPosition.copy(camera.position);

    if (this.controls) {
      this.controls.target.copy(this.lookAtTarget);
      this.controls.update();
    }
  }
  private applyMarkTransform(mark: StageMarkTransform): void {
    const characterRoot = this.characterRoot;
    if (!characterRoot) return;

    characterRoot.position.copy(mark.position);
    characterRoot.quaternion.copy(mark.quaternion);
    this.currentRigPosition.copy(mark.position);
    this.currentRigQuaternion.copy(mark.quaternion);
  }
  private loop(): void {
    this.animationFrameId = requestAnimationFrame(() => this.loop());
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return;
    const rawDelta = this.clock.getDelta();
    const stableDelta = Math.min(rawDelta, 1 / 30);
    this.elapsedTime += rawDelta;
    this.mixer?.update(rawDelta);
    if (this.vrm) {
      if (this.teleportProgress < 1.0) {
        this.teleportProgress += stableDelta * 2.0; // ~0.5 seconds duration
        if (this.teleportProgress > 1.0) this.teleportProgress = 1.0;

        if (this.teleportProgressUniform) {
          this.teleportProgressUniform.value = this.teleportProgress;
        }

        if (this.teleportProgress >= 1.0) {
          this.cleanupTeleportDissolve();
        }
      }

      this.applyMouthToVrm(this.vrm);
      const blinkValue = this.blinkController.update(rawDelta);
      this.vrm.expressionManager?.setValue("blink", blinkValue);
      this.vrm.update(stableDelta);
      this.footShadow.update(this.vrm);
    }

    // Process camera transition
    if (this.isCameraTransitioning) {
      this.transitionProgress += stableDelta / this.transitionDuration;
      let finished = false;
      if (this.transitionProgress >= 1.0) {
        this.transitionProgress = 1.0;
        this.isCameraTransitioning = false;
        finished = true;
      }

      // Smooth step easing
      const t = this.transitionProgress;
      const ease = t * t * (3.0 - 2.0 * t);

      camera.position.lerpVectors(
        this.transitionStartPos,
        this.transitionTargetPos,
        ease,
      );
      this.baseCameraPosition.copy(camera.position);

      this.lookAtTarget.lerpVectors(
        this.transitionStartLookAt,
        this.transitionTargetLookAt,
        ease,
      );

      camera.fov = THREE.MathUtils.lerp(
        this.transitionStartFov,
        this.transitionTargetFov,
        ease,
      );
      camera.updateProjectionMatrix();

      if (this.controls) {
        this.controls.target.copy(this.lookAtTarget);
        if (finished) {
          this.controls.update(); // Sync once at the very end when bounds match
        }
      }
    }

    const manualCameraActive = this.interactionEnabled;
    if (
      !manualCameraActive &&
      this.cameraAnimation.enabled &&
      this.baseCameraPosition.length() > 0 &&
      !this.isCameraTransitioning
    ) {
      this.cameraManager.applyCameraSway(
        camera,
        this.baseCameraPosition,
        this.cameraAnimation,
        this.elapsedTime,
      );
    }
    if (this.controls) {
      if (manualCameraActive && !this.isCameraTransitioning) {
        this.controls.update();
        this.lookAtTarget.copy(this.controls.target);
      } else if (!this.isCameraTransitioning) {
        this.controls.target.copy(this.lookAtTarget);
      }
    }
    if (!manualCameraActive || this.isCameraTransitioning) {
      camera.lookAt(this.lookAtTarget);
    }
    renderer.render(scene, camera);
    this.onUpdate?.();
  }
  private async loadAndPlayIdle(vrm: VRM): Promise<void> {
    if (this.loadingAborted) return;
    const idleGlbUrl = this.idleGlbUrls[0] || this.idleGlbUrl;
    const clip = await loadIdleClip(
      vrm,
      idleGlbUrl,
      this.animationLoaderContext,
    );
    if (!clip) return;
    const mixer = new THREE.AnimationMixer(vrm.scene);
    this.mixer = mixer;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.fadeIn(0.25);
    action.play();
    action.timeScale = 1.0;
    this.idleAction = action;
  }
  private async loadEmoteClipCached(
    path: string,
    vrm: VRM,
  ): Promise<THREE.AnimationClip | null> {
    const cached = this.emoteClipCache.get(path);
    if (cached) return cached;
    const clip = await loadEmoteClip(path, vrm, this.animationLoaderContext);
    if (clip) {
      this.emoteClipCache.set(path, clip);
    }
    return clip;
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
}
