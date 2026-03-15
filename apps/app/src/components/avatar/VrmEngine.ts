import { resolveAppAssetUrl } from "@milady/app-core/utils";
import {
  MToonMaterialLoaderPlugin,
  type VRM,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
import type {
  SparkRenderer as SparkRendererType,
  SplatMesh as SparkSplatMesh,
} from "@sparkjsdev/spark";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
  loadError: string | null;
  idlePlaying: boolean;
  idleTime: number;
  idleTracks: number;
  revealStarted: boolean;
};

type DebugVector3 = {
  x: number;
  y: number;
  z: number;
};

type DebugBounds = {
  min: DebugVector3;
  max: DebugVector3;
  center: DebugVector3;
  size: DebugVector3;
};

export type VrmEngineDebugInfo = {
  initialized: boolean;
  rendererBackend: RendererBackend;
  cameraProfile: CameraProfile;
  worldUrl: string | null;
  sceneChildren: string[];
  camera: {
    parentName: string | null;
    position: DebugVector3 | null;
    rotation: DebugVector3 | null;
    fov: number | null;
    lookAtTarget: DebugVector3;
  };
  avatar: {
    loaded: boolean;
    ready: boolean;
    parentName: string | null;
    position: DebugVector3 | null;
    scale: DebugVector3 | null;
    bounds: DebugBounds | null;
  };
  world: {
    loaded: boolean;
    parentName: string | null;
    position: DebugVector3 | null;
    scale: DebugVector3 | null;
    bounds: DebugBounds | null;
    rawBounds: DebugBounds | null;
  };
  spark: {
    attached: boolean;
    parentName: string | null;
    renderOrder: number | null;
  };
};

type UpdateCallback = () => void;
type RendererBackend = "webgl" | "webgpu";
type RendererPreference = "auto" | "webgl";
type ElectrobunRuntimeWindow = Window & {
  __electrobunWindowId?: number;
  __electrobunWebviewId?: number;
};
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

type TeleportFallbackShader = {
  uniforms: {
    uTeleportProgress: { value: number };
  };
};

const DEFAULT_CAMERA_ANIMATION: CameraAnimationConfig = {
  enabled: false,
  swayAmplitude: 0.06,
  bobAmplitude: 0.03,
  rotationAmplitude: 0.01,
  speed: 0.8,
};
const COMPANION_WORLD_SCALE = 3;
const COMPANION_DARK_WORLD_FLOOR_OFFSET_Y = -0.95;
const COMPANION_LIGHT_WORLD_FLOOR_OFFSET_Y = -0.35;
const COMPANION_DOF_APERTURE_SIZE = 0.04;
const COMPANION_WORLD_MAX_SPLATS = 1_000_000;
const COMPANION_ZOOM_NEAR_FACTOR = 0.25;
const COMPANION_ZOOM_MIN_RADIUS = 1.2;
const SPARK_CLIP_XY = 1.08;
const SPARK_MAX_STD_DEV = 2.35;
const SPARK_MIN_ALPHA = 0.0016;
const SPARK_SORT_DISTANCE = 0.035;
const MAX_RENDERER_PIXEL_RATIO = 2;
const AVATAR_RENDERER_OVERRIDE_KEY = "milady.avatarRenderer";
const KNOWN_VRM_WEBGPU_WARNING =
  'TSL: "transformedNormalView" is deprecated. Use "normalView" instead.';

let knownVrmWebGpuWarningFilterRefs = 0;
let releaseKnownVrmWebGpuWarningFilterGlobal: (() => void) | null = null;
let sharedDracoLoader: DRACOLoader | null = null;
const DRACO_DECODER_PATH = resolveAppAssetUrl("vrm-decoders/draco/");

function getRendererPixelRatio(sparkOptimized = false): number {
  if (typeof window === "undefined") return 1;
  if (sparkOptimized) return 1;
  return Math.min(
    Math.max(window.devicePixelRatio || 1, 1),
    MAX_RENDERER_PIXEL_RATIO,
  );
}

function isElectrobunAvatarRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const runtimeWindow = window as ElectrobunRuntimeWindow;
  return (
    typeof runtimeWindow.__electrobunWindowId === "number" ||
    typeof runtimeWindow.__electrobunWebviewId === "number"
  );
}

function getPreferredAvatarRendererBackend(): RendererBackend {
  if (typeof window === "undefined") return "webgl";
  const override = (() => {
    try {
      return window.localStorage.getItem(AVATAR_RENDERER_OVERRIDE_KEY);
    } catch {
      return null;
    }
  })();
  const normalizedOverride = override?.trim().toLowerCase();
  if (normalizedOverride === "webgpu" || normalizedOverride === "webgl") {
    return normalizedOverride;
  }
  return isElectrobunAvatarRuntime() ? "webgpu" : "webgl";
}

function installKnownVrmWebGpuWarningFilter(): () => void {
  knownVrmWebGpuWarningFilterRefs += 1;

  if (!releaseKnownVrmWebGpuWarningFilterGlobal) {
    const originalWarn = console.warn.bind(console);
    console.warn = (...args: Parameters<typeof console.warn>) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes(KNOWN_VRM_WEBGPU_WARNING)
      ) {
        return;
      }
      originalWarn(...args);
    };
    releaseKnownVrmWebGpuWarningFilterGlobal = () => {
      knownVrmWebGpuWarningFilterRefs = Math.max(
        0,
        knownVrmWebGpuWarningFilterRefs - 1,
      );
      if (knownVrmWebGpuWarningFilterRefs === 0) {
        console.warn = originalWarn;
        releaseKnownVrmWebGpuWarningFilterGlobal = null;
      }
    };
  }

  return () => {
    releaseKnownVrmWebGpuWarningFilterGlobal?.();
  };
}

function getSharedDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderConfig({ type: "wasm" });
    sharedDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    sharedDracoLoader.preload();
  }
  return sharedDracoLoader;
}

function configureVrmGltfLoader(loader: GLTFLoader): void {
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setDRACOLoader(getSharedDracoLoader());
}

function quantileSorted(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.floor((values.length - 1) * percentile)),
  );
  return values[index] ?? 0;
}

function getRobustSplatAnchor(splat: SparkSplatMesh): THREE.Vector3 {
  const maxSamples = 4096;
  const xSamples: number[] = [];
  const ySamples: number[] = [];
  const zSamples: number[] = [];
  const packedSplats = (
    splat as unknown as {
      packedSplats?: { count?: number; numSplats?: number };
    }
  ).packedSplats;
  const splatCount =
    packedSplats?.numSplats ?? packedSplats?.count ?? maxSamples;
  const sampleStep =
    splatCount > maxSamples
      ? Math.max(1, Math.floor(splatCount / maxSamples))
      : 1;

  splat.forEachSplat((index, center) => {
    if (sampleStep > 1 && index % sampleStep !== 0) return;
    xSamples.push(center.x);
    ySamples.push(center.y);
    zSamples.push(center.z);
  });

  if (xSamples.length === 0) {
    const bounds = splat.getBoundingBox(true);
    const center = bounds.getCenter(new THREE.Vector3());
    return new THREE.Vector3(center.x, bounds.min.y, center.z);
  }

  xSamples.sort((a, b) => a - b);
  ySamples.sort((a, b) => a - b);
  zSamples.sort((a, b) => a - b);

  return new THREE.Vector3(
    quantileSorted(xSamples, 0.5),
    quantileSorted(ySamples, 0.05),
    quantileSorted(zSamples, 0.5),
  );
}

function getCompanionWorldFloorOffsetY(url: string): number {
  const normalizedUrl = url.toLowerCase();
  return normalizedUrl.includes("night") ||
    normalizedUrl.includes("dark") ||
    normalizedUrl.includes("lunarpunk")
    ? COMPANION_DARK_WORLD_FLOOR_OFFSET_Y
    : COMPANION_LIGHT_WORLD_FLOOR_OFFSET_Y;
}

function isGzipBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;
  const bytes = new Uint8Array(buffer, 0, 2);
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function decompressGzipBuffer(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream !== "function") {
    throw new Error(
      "This runtime does not support gzip-compressed VRM assets.",
    );
  }
  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

async function loadGltfAsset(
  loader: GLTFLoader,
  url: string,
): Promise<Awaited<ReturnType<GLTFLoader["loadAsync"]>>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch VRM asset: ${response.status}`);
  }
  let buffer = await response.arrayBuffer();
  if (!isGzipBuffer(buffer)) {
    return await loader.loadAsync(url);
  }
  buffer = await decompressGzipBuffer(buffer);
  const objectUrl = URL.createObjectURL(
    new Blob([buffer], { type: "model/gltf-binary" }),
  );
  try {
    return await loader.loadAsync(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Create the best available renderer for the current platform.
 * Electrobun's CEF desktop shell expects WebGPU for the avatar stage, while the
 * browser dev shell stays on WebGL by default to avoid upstream TSL noise.
 * A localStorage override can force either backend for debugging.
 * THREE.WebGPURenderer is async-init and requires await renderer.init().
 */
async function createRenderer(
  canvas: HTMLCanvasElement,
  preference: RendererPreference = "auto",
  sparkOptimized = false,
): Promise<{ backend: RendererBackend; renderer: RendererLike }> {
  if (
    preference !== "webgl" &&
    getPreferredAvatarRendererBackend() === "webgpu" &&
    typeof navigator !== "undefined" &&
    navigator.gpu
  ) {
    try {
      const { WebGPURenderer } = await import("three/webgpu");
      const renderer = new WebGPURenderer({
        canvas,
        alpha: true,
        antialias: !sparkOptimized,
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
    antialias: !sparkOptimized,
    powerPreference: sparkOptimized ? "high-performance" : "default",
  }) as unknown as RendererLike;
  console.info("[VrmEngine] Using WebGLRenderer");
  return { backend: "webgl", renderer };
}

export class VrmEngine {
  private static sparkModulePromise: Promise<
    typeof import("@sparkjsdev/spark")
  > | null = null;
  private renderer: RendererLike | null = null;
  private rendererBackend: RendererBackend = "webgl";
  private rendererPreference: RendererPreference = "auto";
  private scene: THREE.Scene | null = null;
  private avatarRoot: THREE.Group | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
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
  private lastLoadError: string | null = null;
  private teleportProgress = 1.0;
  private teleportProgressUniform: { value: number } | null = null;
  private teleportDissolvedMaterials: THREE.Material[] = [];
  private teleportFallbackShaders: TeleportFallbackShader[] = [];
  private revealStarted = false;
  private mouthValue = 0;
  private mouthSmoothed = 0;
  private vrmName: string | null = null;
  private lookAtTarget = new THREE.Vector3(0, 0.5, 0);
  private readonly idleGlbUrl = resolveAppAssetUrl("animations/idle.glb");
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
  private worldUrl: string | null = null;
  private worldMesh: SparkSplatMesh | null = null;
  private sparkRenderer: SparkRendererType | null = null;
  private worldLoadRequestId = 0;
  private pointerParallaxEnabled = false;
  private pointerParallaxTarget = new THREE.Vector2();
  private pointerParallaxCurrent = new THREE.Vector2();
  private pointerParallaxPosition = new THREE.Vector3();
  private pointerParallaxLookAt = new THREE.Vector3();
  private dragOrbitTarget = new THREE.Vector2();
  private dragOrbitCurrent = new THREE.Vector2();
  private companionZoomTarget = 0;
  private companionZoomCurrent = 0;
  private avatarLookTarget: THREE.Group | null = null;
  private headLookTarget = new THREE.Vector2();
  private headLookCurrent = new THREE.Vector2();
  private avatarLookRig: {
    headBone: THREE.Object3D | null;
    neckBone: THREE.Object3D | null;
    spineBone: THREE.Object3D | null;
    headRestQuaternion: THREE.Quaternion | null;
    neckRestQuaternion: THREE.Quaternion | null;
    spineRestQuaternion: THREE.Quaternion | null;
  } = {
    headBone: null,
    neckBone: null,
    spineBone: null,
    headRestQuaternion: null,
    neckRestQuaternion: null,
    spineRestQuaternion: null,
  };
  private readonly tempCameraOrbitOffset = new THREE.Vector3();
  private readonly tempCameraSpherical = new THREE.Spherical();
  private readonly tempAvatarLookTarget = new THREE.Vector3();
  private readonly tempAvatarLocalTarget = new THREE.Vector3();
  private readonly tempAvatarLocalAnchor = new THREE.Vector3();
  private readonly tempAvatarHeadWorld = new THREE.Vector3();
  private readyPromise: Promise<void> = Promise.resolve();
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error?: unknown) => void) | null = null;
  private releaseKnownWebGpuWarningFilter: (() => void) | null = null;

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

  private async loadSparkModule(): Promise<typeof import("@sparkjsdev/spark")> {
    if (!VrmEngine.sparkModulePromise) {
      VrmEngine.sparkModulePromise = import("@sparkjsdev/spark");
    }
    return VrmEngine.sparkModulePromise;
  }

  private async ensureSparkRenderer(): Promise<void> {
    if (this.sparkRenderer || this.rendererBackend !== "webgl") return;
    if (!this.scene || !this.renderer) return;

    const { SparkRenderer } = await this.loadSparkModule();
    const sparkRenderer = new SparkRenderer({
      renderer: this.renderer as THREE.WebGLRenderer,
      apertureAngle: 0.0,
      focalDistance: 5.0,
      originDistance: 1,
      clipXY: SPARK_CLIP_XY,
      maxStdDev: SPARK_MAX_STD_DEV,
      minAlpha: SPARK_MIN_ALPHA,
      view: {
        depthBias: 1,
        sortDistance: SPARK_SORT_DISTANCE,
        sortRadial: true,
        sort360: false,
      },
    });
    sparkRenderer.renderOrder = 9998;
    this.scene.add(sparkRenderer);
    this.sparkRenderer = sparkRenderer;
  }

  private updateSparkDepthOfField(camera: THREE.PerspectiveCamera): void {
    const sparkRenderer = this.sparkRenderer;
    if (!sparkRenderer) return;
    if (!this.worldMesh) {
      sparkRenderer.apertureAngle = 0;
      return;
    }

    const focalDistance = Math.max(
      0.5,
      camera.position.distanceTo(this.pointerParallaxLookAt),
    );
    sparkRenderer.focalDistance = focalDistance;
    sparkRenderer.apertureAngle =
      2 *
      Math.atan(
        (0.5 * COMPANION_DOF_APERTURE_SIZE) / sparkRenderer.focalDistance,
      );
  }

  private applyCompanionZoom(
    camera: THREE.PerspectiveCamera,
    stableDelta: number,
  ): void {
    const isCompanionProfile =
      this.cameraProfile === "companion" ||
      this.cameraProfile === "companion_close";
    const follow = Math.min(1, stableDelta * 10);
    const targetZoom = isCompanionProfile ? this.companionZoomTarget : 0;
    this.companionZoomCurrent = THREE.MathUtils.lerp(
      this.companionZoomCurrent,
      targetZoom,
      follow,
    );
    if (this.companionZoomCurrent < 1e-4) return;

    const baseRadius = this.baseCameraPosition.distanceTo(this.lookAtTarget);
    if (!Number.isFinite(baseRadius) || baseRadius < 1e-4) return;

    const orbitOffset = this.tempCameraOrbitOffset
      .copy(camera.position)
      .sub(this.lookAtTarget);
    if (orbitOffset.lengthSq() < 1e-6) return;

    const spherical = this.tempCameraSpherical.setFromVector3(orbitOffset);
    const nearRadius = Math.max(
      COMPANION_ZOOM_MIN_RADIUS,
      baseRadius * COMPANION_ZOOM_NEAR_FACTOR,
    );
    spherical.radius = THREE.MathUtils.lerp(
      baseRadius,
      nearRadius,
      this.companionZoomCurrent,
    );
    camera.position
      .copy(this.lookAtTarget)
      .add(orbitOffset.setFromSpherical(spherical));
  }

  private configureAvatarLookTracking(vrm: VRM): void {
    const target = this.avatarLookTarget;
    if (target) {
      target.position.set(0, 1.5, 2);
      target.updateMatrixWorld(true);
    }
    if (vrm.lookAt && target) {
      vrm.lookAt.autoUpdate = true;
      vrm.lookAt.target = target;
    }

    const headBone = vrm.humanoid?.getNormalizedBoneNode("head") ?? null;
    const neckBone = vrm.humanoid?.getNormalizedBoneNode("neck") ?? null;
    const spineBone =
      vrm.humanoid?.getNormalizedBoneNode("upperChest") ??
      vrm.humanoid?.getNormalizedBoneNode("chest") ??
      vrm.humanoid?.getNormalizedBoneNode("spine") ??
      null;

    this.avatarLookRig = {
      headBone,
      neckBone,
      spineBone,
      headRestQuaternion:
        headBone?.quaternion && typeof headBone.quaternion.clone === "function"
          ? headBone.quaternion.clone()
          : null,
      neckRestQuaternion:
        neckBone?.quaternion && typeof neckBone.quaternion.clone === "function"
          ? neckBone.quaternion.clone()
          : null,
      spineRestQuaternion:
        spineBone?.quaternion &&
        typeof spineBone.quaternion.clone === "function"
          ? spineBone.quaternion.clone()
          : null,
    };
    this.headLookTarget.set(0, 0);
    this.headLookCurrent.set(0, 0);
  }

  private updateAvatarLookTarget(camera: THREE.PerspectiveCamera): void {
    const target = this.avatarLookTarget;
    if (!target) return;
    this.tempAvatarLookTarget.copy(camera.position);
    this.tempAvatarLookTarget.y -= 0.06;
    target.position.set(
      this.tempAvatarLookTarget.x,
      this.tempAvatarLookTarget.y,
      this.tempAvatarLookTarget.z,
    );
    target.updateMatrixWorld(true);
  }

  private applyAvatarHeadTracking(
    camera: THREE.PerspectiveCamera,
    stableDelta: number,
  ): void {
    const vrm = this.vrm;
    const { headBone, neckBone, spineBone } = this.avatarLookRig;
    if (!vrm || !headBone) return;
    if (typeof vrm.scene.worldToLocal !== "function") return;
    if (
      typeof THREE.Euler !== "function" ||
      typeof THREE.Quaternion !== "function"
    ) {
      return;
    }

    headBone.getWorldPosition(this.tempAvatarHeadWorld);
    this.tempAvatarLocalTarget.copy(camera.position);
    this.tempAvatarLocalTarget.y -= 0.06;
    vrm.scene.worldToLocal(this.tempAvatarLocalTarget);
    vrm.scene.worldToLocal(
      this.tempAvatarLocalAnchor.copy(this.tempAvatarHeadWorld),
    );
    this.tempAvatarLocalTarget.sub(this.tempAvatarLocalAnchor);

    const planarDistance = Math.max(
      1e-4,
      Math.hypot(this.tempAvatarLocalTarget.x, this.tempAvatarLocalTarget.z),
    );
    this.headLookTarget.set(
      THREE.MathUtils.clamp(
        Math.atan2(
          this.tempAvatarLocalTarget.x,
          Math.max(this.tempAvatarLocalTarget.z, 1e-4),
        ),
        -0.55,
        0.55,
      ),
      THREE.MathUtils.clamp(
        Math.atan2(this.tempAvatarLocalTarget.y, planarDistance),
        -0.3,
        0.24,
      ),
    );
    this.headLookCurrent.lerp(
      this.headLookTarget,
      Math.min(1, stableDelta * 4.5),
    );

    const applyTrackedBone = (
      bone: THREE.Object3D | null,
      restQuaternion: THREE.Quaternion | null,
      yawWeight: number,
      pitchWeight: number,
    ) => {
      if (!bone || !restQuaternion || !bone.quaternion) return;
      const offsetEuler = new THREE.Euler(
        -this.headLookCurrent.y * pitchWeight,
        this.headLookCurrent.x * yawWeight,
        0,
        "YXZ",
      );
      const offsetQuaternion = new THREE.Quaternion().setFromEuler(offsetEuler);
      bone.quaternion.copy(restQuaternion).multiply(offsetQuaternion);
    };

    applyTrackedBone(
      spineBone,
      this.avatarLookRig.spineRestQuaternion,
      0.12,
      0.06,
    );
    applyTrackedBone(
      neckBone,
      this.avatarLookRig.neckRestQuaternion,
      0.26,
      0.16,
    );
    applyTrackedBone(
      headBone,
      this.avatarLookRig.headRestQuaternion,
      0.38,
      0.24,
    );
  }

  private toDebugVector3(vector: THREE.Vector3 | null): DebugVector3 | null {
    if (!vector) return null;
    return {
      x: Number(vector.x.toFixed(4)),
      y: Number(vector.y.toFixed(4)),
      z: Number(vector.z.toFixed(4)),
    };
  }

  private toDebugBounds(object: THREE.Object3D | null): DebugBounds | null {
    if (!object) return null;
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return null;
    return this.toDebugBoundsFromBox(bounds);
  }

  private toDebugBoundsFromBox(bounds: THREE.Box3 | null): DebugBounds | null {
    if (!bounds || bounds.isEmpty()) return null;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const min = this.toDebugVector3(bounds.min.clone());
    const max = this.toDebugVector3(bounds.max.clone());
    const centerVector = this.toDebugVector3(center);
    const sizeVector = this.toDebugVector3(size);
    if (!min || !max || !centerVector || !sizeVector) return null;
    return {
      min,
      max,
      center: centerVector,
      size: sizeVector,
    };
  }

  getDebugInfo(): VrmEngineDebugInfo {
    this.scene?.updateMatrixWorld(true);
    this.vrm?.scene.updateMatrixWorld(true);
    this.worldMesh?.updateMatrixWorld(true);

    const cameraRotation = this.camera
      ? new THREE.Vector3(
          this.camera.rotation.x,
          this.camera.rotation.y,
          this.camera.rotation.z,
        )
      : null;
    const lookAtTarget =
      this.toDebugVector3(this.lookAtTarget) ??
      ({ x: 0, y: 0, z: 0 } satisfies DebugVector3);

    return {
      initialized: this.initialized,
      rendererBackend: this.rendererBackend,
      cameraProfile: this.cameraProfile,
      worldUrl: this.worldUrl,
      sceneChildren:
        this.scene?.children.map((child) => child.name || child.type) ?? [],
      camera: {
        parentName: this.camera?.parent?.name ?? null,
        position: this.toDebugVector3(this.camera?.position ?? null),
        rotation: this.toDebugVector3(cameraRotation),
        fov: this.camera?.fov ?? null,
        lookAtTarget,
      },
      avatar: {
        loaded: this.vrm !== null,
        ready: this.vrmReady,
        parentName: this.vrm?.scene.parent?.name ?? null,
        position: this.toDebugVector3(this.vrm?.scene.position ?? null),
        scale: this.toDebugVector3(this.vrm?.scene.scale ?? null),
        bounds: this.toDebugBounds(this.vrm?.scene ?? null),
      },
      world: {
        loaded: this.worldMesh !== null,
        parentName: this.worldMesh?.parent?.name ?? null,
        position: this.toDebugVector3(this.worldMesh?.position ?? null),
        scale: this.toDebugVector3(this.worldMesh?.scale ?? null),
        bounds: this.toDebugBounds(this.worldMesh ?? null),
        rawBounds: this.worldMesh
          ? this.toDebugBoundsFromBox(this.worldMesh.getBoundingBox(true))
          : null,
      },
      spark: {
        attached: this.sparkRenderer !== null,
        parentName: this.sparkRenderer?.parent?.name ?? null,
        renderOrder: this.sparkRenderer?.renderOrder ?? null,
      },
    };
  }

  setDebugAvatarVisible(visible: boolean): void {
    if (!this.vrm) return;
    this.vrm.scene.visible = visible;
  }

  setDebugWorldPosition(x: number, y: number, z: number): void {
    if (!this.worldMesh) return;
    this.worldMesh.position.set(x, y, z);
  }

  setDebugWorldQuaternion(x: number, y: number, z: number, w: number): void {
    if (!this.worldMesh) return;
    this.worldMesh.quaternion.set(x, y, z, w);
  }

  setDebugCamera(position: THREE.Vector3, target: THREE.Vector3): void {
    if (!this.camera) return;
    this.isCameraTransitioning = false;
    this.camera.position.copy(position);
    this.baseCameraPosition.copy(position);
    this.lookAtTarget.copy(target);
    this.controls?.target.copy(target);
    this.controls?.update();
    this.camera.lookAt(target);
  }

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

  setup(
    canvas: HTMLCanvasElement,
    onUpdate: UpdateCallback,
    options?: {
      rendererPreference?: RendererPreference;
      sparkOptimized?: boolean;
    },
  ): void {
    if (this.initialized && this.renderer?.domElement === canvas) {
      this.onUpdate = onUpdate;
      return;
    }
    if (this.initialized) this.dispose();
    this.onUpdate = onUpdate;
    this.loadingAborted = false;
    this.rendererPreference = options?.rendererPreference ?? "auto";
    this.resetReadyPromise();
    // Async renderer creation: tries WebGPU, falls back to WebGL.
    // setup() remains synchronous for callers; the loop starts after init resolves.
    void (async () => {
      try {
        const { backend, renderer } = await createRenderer(
          canvas,
          this.rendererPreference,
          options?.sparkOptimized ?? false,
        );
        const releaseKnownWebGpuWarningFilter =
          backend === "webgpu" ? installKnownVrmWebGpuWarningFilter() : null;
        // Guard: if dispose() was called while we were awaiting, abort.
        if (this.loadingAborted) {
          releaseKnownWebGpuWarningFilter?.();
          renderer.dispose();
          this.settleReady();
          return;
        }
        this.releaseKnownWebGpuWarningFilter = releaseKnownWebGpuWarningFilter;
        renderer.setPixelRatio(
          getRendererPixelRatio(options?.sparkOptimized ?? false),
        );
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
        const avatarRoot = new THREE.Group();
        avatarRoot.name = "AvatarRoot";
        scene.add(avatarRoot);
        this.avatarRoot = avatarRoot;
        const avatarLookTarget = new THREE.Group();
        avatarLookTarget.name = "AvatarLookTarget";
        scene.add(avatarLookTarget);
        this.avatarLookTarget = avatarLookTarget;
        const cameraRig = new THREE.Group();
        cameraRig.name = "AvatarCameraRig";
        scene.add(cameraRig);
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
        camera.position.set(0, 1.2, 5.0);
        cameraRig.add(camera);
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
        this.resize(canvas.clientWidth, canvas.clientHeight);
        this.initialized = true;
        this.loop();
        this.settleReady();
      } catch (error) {
        this.initialized = false;
        this.releaseKnownWebGpuWarningFilter?.();
        this.releaseKnownWebGpuWarningFilter = null;
        this.renderer = null;
        this.rendererBackend = "webgl";
        this.scene = null;
        this.camera = null;
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
    this.releaseKnownWebGpuWarningFilter?.();
    this.releaseKnownWebGpuWarningFilter = null;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.vrm?.scene.parent) {
      this.vrm.scene.parent.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
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
    this.lastLoadError = null;
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
    this.disposeWorld();
    this.avatarLookTarget?.parent?.remove(this.avatarLookTarget);
    this.avatarLookTarget = null;
    this.avatarLookRig = {
      headBone: null,
      neckBone: null,
      spineBone: null,
      headRestQuaternion: null,
      neckRestQuaternion: null,
      spineRestQuaternion: null,
    };
    this.headLookTarget.set(0, 0);
    this.headLookCurrent.set(0, 0);
    if (this.sparkRenderer) {
      this.sparkRenderer.apertureAngle = 0;
      this.sparkRenderer.removeFromParent();
      this.sparkRenderer = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    this.renderer = null;
    this.rendererBackend = "webgl";
    this.scene = null;
    this.avatarRoot = null;
    this.camera = null;
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

    // Save current state for transition
    if (this.camera) {
      this.transitionStartFov = this.camera.fov;
      this.transitionStartPos.copy(this.camera.position);
      this.transitionStartLookAt.copy(this.lookAtTarget);

      this.cameraProfile = profile;

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
  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
  getState(): VrmEngineState {
    const idlePlaying = this.idleAction?.isRunning() ?? false;
    return {
      vrmLoaded: this.vrm !== null && this.vrmReady,
      vrmName: this.vrmName,
      loadError: this.lastLoadError,
      idlePlaying,
      idleTime: this.idleAction?.time ?? 0,
      idleTracks: this.idleAction?.getClip()?.tracks.length ?? 0,
      revealStarted: this.revealStarted,
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
  setPointerParallaxEnabled(enabled: boolean): void {
    this.pointerParallaxEnabled = enabled;
    if (!enabled) {
      this.pointerParallaxTarget.set(0, 0);
    }
  }
  setPointerParallaxTarget(x: number, y: number): void {
    this.pointerParallaxTarget.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1),
    );
  }
  resetPointerParallax(): void {
    this.pointerParallaxTarget.set(0, 0);
  }
  setDragOrbitTarget(yaw: number, pitch: number): void {
    this.dragOrbitTarget.set(
      THREE.MathUtils.clamp(yaw, -0.6, 0.6),
      THREE.MathUtils.clamp(pitch, -0.35, 0.35),
    );
  }
  resetDragOrbit(): void {
    this.dragOrbitTarget.set(0, 0);
  }
  setCompanionZoomNormalized(value: number): void {
    this.companionZoomTarget = THREE.MathUtils.clamp(value, 0, 1);
  }
  async setWorldUrl(url: string | null): Promise<void> {
    await this.whenReady();
    if (!this.scene) return;
    const normalizedUrl = url?.trim() ? url : null;
    if (this.worldUrl === normalizedUrl && this.worldMesh) return;

    const requestId = ++this.worldLoadRequestId;
    this.worldUrl = normalizedUrl;
    this.disposeWorld();
    if (!normalizedUrl) return;

    await this.ensureSparkRenderer();
    const { SplatMesh } = await this.loadSparkModule();
    const splat = new SplatMesh({
      url: normalizedUrl,
      maxSplats: COMPANION_WORLD_MAX_SPLATS,
    });
    splat.frustumCulled = false;
    splat.quaternion.identity();
    splat.position.set(0, 0, 0);
    splat.scale.setScalar(COMPANION_WORLD_SCALE);
    this.scene.add(splat);

    await splat.initialized;

    if (
      this.loadingAborted ||
      !this.scene ||
      requestId !== this.worldLoadRequestId
    ) {
      splat.parent?.remove(splat);
      splat.dispose();
      return;
    }

    const worldCenterBottom = getRobustSplatAnchor(splat);
    const worldFloorOffsetY = getCompanionWorldFloorOffsetY(normalizedUrl);
    splat.position.set(
      -worldCenterBottom.x * COMPANION_WORLD_SCALE,
      -worldCenterBottom.y * COMPANION_WORLD_SCALE + worldFloorOffsetY,
      -worldCenterBottom.z * COMPANION_WORLD_SCALE,
    );
    this.worldMesh = splat;
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
    if (this.loadingAborted) return;
    const requestId = ++this.vrmLoadRequestId;
    if (this.vrm) {
      this.vrm.scene.parent?.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
      this.vrmReady = false;
      this.vrmName = null;
      this.mixer = null;
      this.idleAction = null;
      this.revealStarted = false;
      this.stopEmote();
      this.emoteClipCache.clear();
    }
    this.lastLoadError = null;
    const loader = new GLTFLoader();
    configureVrmGltfLoader(loader);
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
    let gltf: Awaited<ReturnType<GLTFLoader["loadAsync"]>>;
    try {
      gltf = await loadGltfAsset(loader, url);
    } catch (error) {
      if (!this.loadingAborted && requestId === this.vrmLoadRequestId) {
        this.lastLoadError =
          error instanceof Error ? error.message : String(error);
        this.onUpdate?.();
      }
      throw error;
    }
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
    if (this.camera) {
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
    this.cameraManager.ensureFacingCamera(vrm, this.camera);
    this.configureAvatarLookTracking(vrm);
    if (
      this.loadingAborted ||
      !this.scene ||
      requestId !== this.vrmLoadRequestId
    ) {
      VRMUtils.deepDispose(vrm.scene);
      return;
    }
    vrm.scene.visible = false;
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });
    const avatarParent = this.avatarRoot ?? this.scene;
    avatarParent.add(vrm.scene);
    this.vrm = vrm;
    this.vrmName = name ?? null;
    this.lastLoadError = null;
    vrm.springBoneManager?.reset?.();
    this.blinkController.reset();

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
    this.revealStarted = true;
    this.cleanupTeleportDissolve();
    let appliedNodeDissolve = false;

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
          appliedNodeDissolve = true;
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

    if (!appliedNodeDissolve) {
      this.applyTeleportFallbackDissolve(vrm);
    }
  }

  private applyTeleportFallbackDissolve(vrm: VRM): void {
    vrm.scene.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat.userData._dissolveApplied) continue;
        mat.userData._dissolveApplied = true;
        mat.userData._origTransparent = mat.transparent;
        mat.userData._origAlphaTest = mat.alphaTest;
        mat.userData._origOnBeforeCompile = mat.onBeforeCompile;
        mat.userData._origCustomProgramCacheKey = mat.customProgramCacheKey;

        const shaderRef: TeleportFallbackShader = {
          uniforms: { uTeleportProgress: { value: this.teleportProgress } },
        };
        this.teleportFallbackShaders.push(shaderRef);

        mat.transparent = true;
        mat.alphaTest = Math.max(mat.alphaTest ?? 0, 0.01);
        mat.onBeforeCompile = (
          shader: Parameters<THREE.Material["onBeforeCompile"]>[0],
        ) => {
          shader.uniforms.uTeleportProgress =
            shaderRef.uniforms.uTeleportProgress;
          shader.vertexShader = `
varying vec3 vTeleportWorldPosition;
${shader.vertexShader}
`.replace(
            "#include <worldpos_vertex>",
            `#include <worldpos_vertex>
vTeleportWorldPosition = worldPosition.xyz;`,
          );
          shader.fragmentShader = `
uniform float uTeleportProgress;
varying vec3 vTeleportWorldPosition;
float teleportNoiseHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
${shader.fragmentShader}
`.replace(
            "#include <alphatest_fragment>",
            `float teleportThreshold = mix(-0.2, 2.0, uTeleportProgress);
float teleportDiff = vTeleportWorldPosition.y - teleportThreshold;
float teleportRatio = clamp(teleportDiff / 0.3, 0.0, 1.0);
float teleportNoise = teleportNoiseHash(vec2(
  vTeleportWorldPosition.y * 40.0,
  (vTeleportWorldPosition.x + vTeleportWorldPosition.z) * 30.0
));
if (teleportNoise < teleportRatio) discard;
#include <alphatest_fragment>`,
          );

          const originalOnBeforeCompile = mat.userData._origOnBeforeCompile;
          if (typeof originalOnBeforeCompile === "function") {
            originalOnBeforeCompile(shader, this.renderer as never);
          }
        };
        mat.customProgramCacheKey = () =>
          `${mat.type}:teleport-dissolve-fallback`;
        mat.needsUpdate = true;
        this.teleportDissolvedMaterials.push(mat);
      }
    });
  }

  private cleanupTeleportDissolve(): void {
    for (const mat of this.teleportDissolvedMaterials) {
      if (mat.userData._dissolveApplied) {
        if (mat.userData._origOpacityNode !== undefined) {
          (mat as unknown as Record<string, unknown>).opacityNode =
            mat.userData._origOpacityNode ?? null;
        }
        if (mat.userData._origEmissiveNode !== undefined) {
          (mat as unknown as Record<string, unknown>).emissiveNode =
            mat.userData._origEmissiveNode ?? null;
        }
        mat.alphaTest = mat.userData._origAlphaTest ?? 0;
        mat.transparent = mat.userData._origTransparent ?? mat.transparent;
        mat.onBeforeCompile =
          mat.userData._origOnBeforeCompile ?? mat.onBeforeCompile;
        mat.customProgramCacheKey =
          mat.userData._origCustomProgramCacheKey ?? mat.customProgramCacheKey;
        delete mat.userData._dissolveApplied;
        delete mat.userData._origOpacityNode;
        delete mat.userData._origEmissiveNode;
        delete mat.userData._origAlphaTest;
        delete mat.userData._origTransparent;
        delete mat.userData._origOnBeforeCompile;
        delete mat.userData._origCustomProgramCacheKey;
        mat.needsUpdate = true;
      }
    }
    this.teleportDissolvedMaterials = [];
    this.teleportProgressUniform = null;
    this.teleportFallbackShaders = [];
  }
  private get animationLoaderContext(): AnimationLoaderContext {
    return {
      isAborted: () => this.loadingAborted,
      isCurrentVrm: (vrm: VRM) => this.vrm === vrm,
    };
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
        for (const shader of this.teleportFallbackShaders) {
          shader.uniforms.uTeleportProgress.value = this.teleportProgress;
        }

        if (this.teleportProgress >= 1.0) {
          this.cleanupTeleportDissolve();
        }
      }

      this.applyMouthToVrm(this.vrm);
      const blinkValue = this.blinkController.update(rawDelta);
      this.vrm.expressionManager?.setValue("blink", blinkValue);
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
      this.cameraManager.applyCameraMotion(
        camera,
        this.baseCameraPosition,
        this.lookAtTarget,
        this.cameraAnimation,
        this.elapsedTime,
      );
    }
    const dragOrbitFollow = Math.min(1, stableDelta * 9);
    this.dragOrbitCurrent.lerp(this.dragOrbitTarget, dragOrbitFollow);
    if (
      this.dragOrbitCurrent.lengthSq() > 1e-6 &&
      this.baseCameraPosition.lengthSq() > 1e-6
    ) {
      const orbitOffset = this.tempCameraOrbitOffset
        .copy(camera.position)
        .sub(this.lookAtTarget);
      if (orbitOffset.lengthSq() > 1e-6) {
        const spherical = this.tempCameraSpherical.setFromVector3(orbitOffset);
        spherical.theta += this.dragOrbitCurrent.x;
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi + this.dragOrbitCurrent.y,
          0.2,
          Math.PI - 0.2,
        );
        orbitOffset.setFromSpherical(spherical);
        camera.position.copy(this.lookAtTarget).add(orbitOffset);
      }
    }
    this.applyCompanionZoom(camera, stableDelta);
    if (this.pointerParallaxEnabled) {
      const follow = Math.min(1, stableDelta * 7.5);
      this.pointerParallaxCurrent.lerp(this.pointerParallaxTarget, follow);
      this.pointerParallaxPosition.set(
        this.pointerParallaxCurrent.x * 0.18,
        this.pointerParallaxCurrent.y * 0.12,
        0,
      );
      camera.position.add(this.pointerParallaxPosition);
      this.pointerParallaxLookAt
        .copy(this.lookAtTarget)
        .add(
          new THREE.Vector3(
            this.pointerParallaxCurrent.x * 0.08,
            this.pointerParallaxCurrent.y * 0.05,
            0,
          ),
        );
    } else {
      this.pointerParallaxCurrent.lerp(this.pointerParallaxTarget, 0.12);
      this.pointerParallaxLookAt.copy(this.lookAtTarget);
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
      camera.lookAt(this.pointerParallaxLookAt);
    }
    if (this.vrm) {
      this.updateAvatarLookTarget(camera);
      this.vrm.update(stableDelta);
      this.applyAvatarHeadTracking(camera, stableDelta);
      this.footShadow.update(this.vrm);
    }
    this.updateSparkDepthOfField(camera);
    renderer.render(scene, camera);
    this.onUpdate?.();
  }
  private disposeWorld(): void {
    if (this.sparkRenderer) {
      this.sparkRenderer.apertureAngle = 0;
    }
    if (!this.worldMesh) {
      this.worldMesh = null;
      return;
    }
    this.worldMesh.parent?.remove(this.worldMesh);
    this.worldMesh.dispose();
    this.worldMesh = null;
  }
  private async loadAndPlayIdle(vrm: VRM): Promise<void> {
    if (this.loadingAborted) return;
    const clip = await loadIdleClip(
      vrm,
      this.idleGlbUrl,
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
    mixer.update(1 / 60);
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
