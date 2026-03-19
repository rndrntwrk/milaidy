/**
 * VRM avatar canvas component.
 *
 * Renders a VRM model with idle animation and mouth-sync driven by
 * the `mouthOpen` prop. Sized to fill its parent container.
 */

import { resolveAppAssetUrl } from "@milady/app-core/utils";
import { useEffect, useRef } from "react";
import type {
  StageSceneMark,
  StageScenePreset,
} from "../../proStreamerStageScene";
import {
  type CameraProfile,
  type InteractionMode,
  VrmEngine,
  type VrmEngineState,
} from "./VrmEngine";

const DEFAULT_VRM_PATH = resolveAppAssetUrl("vrms/alice.vrm");

export type VrmViewerProps = {
  /** Path to the VRM file to load (default: bundled Miwaifus #1) */
  vrmPath?: string;
  mouthOpen: number;
  /** When true the engine generates mouth animation internally */
  isSpeaking?: boolean;
  /** Enable drag-rotate + wheel/pinch zoom camera controls */
  interactive?: boolean;
  /** Camera profile preset (chat default, companion for hero-stage framing) */
  cameraProfile?: CameraProfile;
  /** Interaction behavior for camera controls */
  interactiveMode?: InteractionMode;
  scenePreset?: StageScenePreset;
  sceneMark?: StageSceneMark;
  onEngineState?: (state: VrmEngineState) => void;
  onEngineReady?: (engine: VrmEngine) => void;
  onViewerError?: (error: Error) => void;
};

export function VrmViewer(props: VrmViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<VrmEngine | null>(null);
  const mouthOpenRef = useRef<number>(props.mouthOpen);
  const isSpeakingRef = useRef<boolean>(props.isSpeaking ?? false);
  const interactiveRef = useRef<boolean>(props.interactive ?? false);
  const cameraProfileRef = useRef<CameraProfile>(props.cameraProfile ?? "chat");
  const interactionModeRef = useRef<InteractionMode>(
    props.interactiveMode ?? "free",
  );
  const lastStateEmitMsRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const currentVrmPathRef = useRef<string>("");
  const setupRunIdRef = useRef(0);
  const loadRunIdRef = useRef(0);
  const onEngineReadyRef = useRef(props.onEngineReady);
  const onEngineStateRef = useRef(props.onEngineState);
  const onViewerErrorRef = useRef(props.onViewerError);

  mouthOpenRef.current = props.mouthOpen;
  isSpeakingRef.current = props.isSpeaking ?? false;
  interactiveRef.current = props.interactive ?? false;
  cameraProfileRef.current = props.cameraProfile ?? "chat";
  interactionModeRef.current = props.interactiveMode ?? "free";
  onEngineReadyRef.current = props.onEngineReady;
  onEngineStateRef.current = props.onEngineState;
  onViewerErrorRef.current = props.onViewerError;

  // Setup engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    mountedRef.current = true;
    const setupRunId = ++setupRunIdRef.current;
    let active = true;

    let engine = engineRef.current;
    if (!engine || !engine.isInitialized()) {
      engine = new VrmEngine();
      engineRef.current = engine;
    }

    engine.setup(canvas, () => {
      // Frame loop: guard all state-setting calls against unmount.
      if (!mountedRef.current) return;
      engine.setMouthOpen(mouthOpenRef.current);
      engine.setSpeaking(isSpeakingRef.current);
      if (onEngineStateRef.current) {
        const now = performance.now();
        if (now - lastStateEmitMsRef.current >= 250) {
          lastStateEmitMsRef.current = now;
          onEngineStateRef.current(engine.getState());
        }
      }
    });

    // One-time initial camera/control setup (subsequent changes handled by effects).
    engine.setCameraProfile(cameraProfileRef.current);
    engine.setInteractionMode(interactionModeRef.current);
    engine.setInteractionEnabled(interactiveRef.current);
    engine.setIdleGlbUrls([]);
    void engine.setScenePreset(props.scenePreset ?? "default");
    void engine.setSceneMark(props.sceneMark ?? "stage");

    const resize = () => {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      engine.resize(rect.width, rect.height);
    };
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => resize())
        : null;
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);
    void engine.whenReady().then(
      () => {
        if (!active || !mountedRef.current) return;
        if (engineRef.current !== engine) return;
        if (setupRunIdRef.current !== setupRunId) return;
        resize();
        onEngineReadyRef.current?.(engine);
      },
      (error) => {
        if (!active) return;
        if (engineRef.current !== engine) return;
        if (setupRunIdRef.current !== setupRunId) return;
        console.warn("Failed to initialize VRM renderer:", error);
        onViewerErrorRef.current?.(
          error instanceof Error
            ? error
            : new Error("Failed to initialize VRM renderer"),
        );
      },
    );

    return () => {
      active = false;
      mountedRef.current = false;
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();

      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInteractionEnabled(props.interactive ?? false);
  }, [props.interactive]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setCameraProfile(props.cameraProfile ?? "chat");
  }, [props.cameraProfile]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInteractionMode(props.interactiveMode ?? "free");
  }, [props.interactiveMode]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    void engine.setScenePreset(props.scenePreset ?? "default");
  }, [props.scenePreset]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    void engine.setSceneMark(props.sceneMark ?? "stage");
  }, [props.sceneMark]);

  // Load VRM when path changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const vrmUrl = props.vrmPath ?? DEFAULT_VRM_PATH;
    if (vrmUrl === currentVrmPathRef.current) return;
    const loadRunId = ++loadRunIdRef.current;
    let active = true;
    currentVrmPathRef.current = vrmUrl;

    const abortController = new AbortController();

    void (async () => {
      try {
        await engine.whenReady();
        if (!active || !mountedRef.current || abortController.signal.aborted) return;
        if (engineRef.current !== engine) return;
        if (loadRunIdRef.current !== loadRunId) return;
        await engine.loadVrmFromUrl(
          vrmUrl,
          vrmUrl.split("/").pop() ?? "avatar.vrm",
        );
        if (!active || !mountedRef.current || abortController.signal.aborted) return;
        if (engineRef.current !== engine) return;
        if (loadRunIdRef.current !== loadRunId) return;
        onEngineStateRef.current?.(engine.getState());
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (
          active &&
          loadRunIdRef.current === loadRunId &&
          currentVrmPathRef.current === vrmUrl
        ) {
          currentVrmPathRef.current = "";
        }
        console.warn("Failed to load VRM:", err);
        onViewerErrorRef.current?.(
          err instanceof Error ? err : new Error("Failed to load VRM"),
        );
      }
    })();

    return () => {
      active = false;
      abortController.abort();
      if (
        loadRunIdRef.current === loadRunId &&
        currentVrmPathRef.current === vrmUrl
      ) {
        currentVrmPathRef.current = "";
      }
    };
  }, [props.vrmPath]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        background: "transparent",
        cursor: props.interactive ? "grab" : "default",
      }}
    />
  );
}
