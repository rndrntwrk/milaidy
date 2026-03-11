/**
 * VRM avatar canvas component.
 *
 * Renders a VRM model with idle animation and mouth-sync driven by
 * the `mouthOpen` prop. Sized to fill its parent container.
 */

import { useEffect, useRef } from "react";
import { DEFAULT_PRO_STREAMER_VRM_URL } from "../../AppContext";
import type { StageSceneMark, StageScenePreset } from "../../proStreamerStageScene";
import { VrmEngine, type VrmEngineState } from "./VrmEngine";

const DEFAULT_VRM_PATH = DEFAULT_PRO_STREAMER_VRM_URL;

export type VrmViewerProps = {
  /** Path to the VRM file to load (default: built-in pro streamer avatar) */
  vrmPath?: string;
  idleGlbPaths?: string[];
  mouthOpen: number;
  /** When true the engine generates mouth animation internally */
  isSpeaking?: boolean;
  scenePreset?: StageScenePreset;
  sceneMark?: StageSceneMark;
  onEngineState?: (state: VrmEngineState) => void;
  onEngineReady?: (engine: VrmEngine) => void;
  onViewerError?: (error: Error) => void;
};

export function VrmViewer(props: VrmViewerProps) {
  const {
    mouthOpen,
    isSpeaking,
    scenePreset,
    sceneMark,
    onEngineReady,
    onEngineState,
    onViewerError,
    vrmPath,
    idleGlbPaths,
  } =
    props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<VrmEngine | null>(null);
  const mouthOpenRef = useRef<number>(mouthOpen);
  const isSpeakingRef = useRef<boolean>(isSpeaking ?? false);
  const lastStateEmitMsRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const currentVrmPathRef = useRef<string>("");

  mouthOpenRef.current = mouthOpen;
  isSpeakingRef.current = isSpeaking ?? false;

  // Setup engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    mountedRef.current = true;

    let engine = engineRef.current;
    if (!engine || !engine.isInitialized()) {
      engine = new VrmEngine();
      engineRef.current = engine;
    }

    try {
      engine.setup(canvas, () => {
        engine.setMouthOpen(mouthOpenRef.current);
        engine.setSpeaking(isSpeakingRef.current);
        if (onEngineState && mountedRef.current) {
          const now = performance.now();
          if (now - lastStateEmitMsRef.current >= 250) {
            lastStateEmitMsRef.current = now;
            onEngineState(engine.getState());
          }
        }
      });
      engine.setIdleGlbUrls(idleGlbPaths ?? []);
      void engine.setScenePreset(scenePreset ?? "default");
      void engine.setSceneMark(sceneMark ?? "stage");
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error("Failed to initialize avatar viewer");
      console.warn("Failed to initialize VRM viewer:", error);
      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
      onViewerError?.(error);
      return;
    }

    onEngineReady?.(engine);

    const resize = () => {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      engine.resize(rect.width, rect.height);
    };
    resize();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        resize();
      });
      resizeObserver.observe(canvas);
      if (canvas.parentElement) {
        resizeObserver.observe(canvas.parentElement);
      }
    }
    window.addEventListener("resize", resize);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();

      const engineToDispose = engine;
      setTimeout(() => {
        if (!mountedRef.current) {
          engineToDispose.dispose();
          if (engineRef.current === engineToDispose) {
            engineRef.current = null;
          }
        }
      }, 100);
    };
  }, [onEngineReady, onEngineState, onViewerError]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isInitialized()) return;
    void engine.setScenePreset(scenePreset ?? "default");
  }, [scenePreset]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isInitialized()) return;
    void engine.setSceneMark(sceneMark ?? "stage");
  }, [sceneMark]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isInitialized()) return;
    engine.setIdleGlbUrls(idleGlbPaths ?? []);
  }, [idleGlbPaths]);

  // Load VRM when path changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isInitialized()) return;

    const vrmUrl = vrmPath ?? DEFAULT_VRM_PATH;
    if (vrmUrl === currentVrmPathRef.current) return;
    currentVrmPathRef.current = vrmUrl;

    const abortController = new AbortController();

    void (async () => {
      try {
        if (!mountedRef.current || abortController.signal.aborted) return;
        await engine.loadVrmFromUrl(
          vrmUrl,
          vrmUrl.split("/").pop() ?? "avatar.vrm",
        );
        if (!mountedRef.current || abortController.signal.aborted) return;
        onEngineState?.(engine.getState());
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load VRM:", err);
        onViewerError?.(
          err instanceof Error ? err : new Error("Failed to load VRM"),
        );
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [vrmPath, onEngineState]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        background: "transparent",
      }}
    />
  );
}
