import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { VrmEngine, VrmEngineState } from "./components/avatar/VrmEngine";
import { VrmViewer } from "./components/avatar/VrmViewer";

type PreviewState = "loading" | "ready" | "error";

function AlicePreviewCapture() {
  const engineRef = useRef<VrmEngine | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current);
      }
    };
  }, []);

  const freezeIdleMotion = useCallback(() => {
    const engine = engineRef.current as
      | (VrmEngine & {
          baseCameraPosition?: { set: (x: number, y: number, z: number) => void };
          camera?: {
            position: { set: (x: number, y: number, z: number) => void };
            lookAt: (x: number, y: number, z: number) => void;
            updateProjectionMatrix: () => void;
          };
          frameMetrics?: {
            shoulderHeight?: number;
            distance?: number;
          };
          lookAtTarget?: { set: (x: number, y: number, z: number) => void };
          mixer?: { timeScale?: number };
        })
      | null;
    if (!engine) return;
    if (engine.mixer && typeof engine.mixer.timeScale === "number") {
      engine.mixer.timeScale = 0;
    }
    if (engine.camera && engine.frameMetrics) {
      const shoulderHeight = engine.frameMetrics.shoulderHeight ?? 1.08;
      const distance = engine.frameMetrics.distance ?? 1.9;
      const portraitLookY = shoulderHeight + 0.28;
      const portraitCameraY = shoulderHeight + 0.12;
      const portraitDistance = distance * 1.05;
      engine.lookAtTarget?.set(0, portraitLookY, 0);
      engine.camera.position.set(0, portraitCameraY, portraitDistance);
      engine.camera.lookAt(0, portraitLookY, 0);
      engine.camera.updateProjectionMatrix();
      engine.baseCameraPosition?.set(0, portraitCameraY, portraitDistance);
    }
  }, []);

  const scheduleReady = useCallback(() => {
    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current);
    }
    readyTimerRef.current = window.setTimeout(() => {
      setPreviewState("ready");
      readyTimerRef.current = null;
    }, 350);
  }, []);

  useEffect(() => {
    if (previewState !== "loading") return;

    const pollLoadedState = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      if (!engine.getState().vrmLoaded) return;
      freezeIdleMotion();
      scheduleReady();
      window.clearInterval(pollLoadedState);
    }, 100);

    return () => {
      window.clearInterval(pollLoadedState);
    };
  }, [freezeIdleMotion, previewState, scheduleReady]);

  const handleEngineReady = useCallback((engine: VrmEngine) => {
    engineRef.current = engine;
    engine.setCameraAnimation({ enabled: false });
    engine.setForceFaceCameraFlip(false);
  }, []);

  const handleEngineState = useCallback((state: VrmEngineState) => {
    if (!state.vrmLoaded || previewState === "error") return;
    freezeIdleMotion();
  }, [freezeIdleMotion, previewState]);

  const handleViewerError = useCallback((error: Error) => {
    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }
    setPreviewState("error");
    setErrorMessage(error.message);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at 50% 18%, rgba(255, 212, 98, 0.12), transparent 34%), linear-gradient(180deg, #060913 0%, #03050b 100%)",
      }}
    >
      <div
        data-avatar-preview-state={previewState}
        data-avatar-preview-ready={previewState === "ready" ? "true" : "false"}
        style={{
          width: "640px",
          height: "640px",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          data-avatar-preview-frame
          style={{
            width: "512px",
            height: "512px",
            position: "relative",
            overflow: "hidden",
            borderRadius: "40px",
            background:
              "radial-gradient(circle at 50% 14%, rgba(255,255,255,0.06), transparent 28%), linear-gradient(180deg, #0a101b 0%, #070b14 56%, #05070d 100%)",
            boxShadow: "0 28px 90px rgba(0, 0, 0, 0.42)",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "460px",
              height: "460px",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <VrmViewer
              vrmPath="/vrms/alice.vrm"
              idleGlbPaths={[]}
              mouthOpen={0}
              isSpeaking={false}
              scenePreset="default"
              onEngineReady={handleEngineReady}
              onEngineState={handleEngineState}
              onViewerError={handleViewerError}
            />
          </div>

          {previewState === "loading" ? (
            <div
              style={{
                position: "absolute",
                inset: "auto 0 18px 0",
                textAlign: "center",
                color: "rgba(255,255,255,0.58)",
                fontSize: "14px",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontFamily:
                  "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              Loading Alice
            </div>
          ) : null}

          {previewState === "error" ? (
            <div
              style={{
                position: "absolute",
                inset: "auto 24px 24px 24px",
                padding: "14px 16px",
                borderRadius: "18px",
                background: "rgba(86, 18, 24, 0.92)",
                color: "#ffd9de",
                fontSize: "14px",
                lineHeight: 1.4,
                fontFamily:
                  "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              {errorMessage ?? "Failed to render Alice preview"}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root for Alice preview capture");
}

createRoot(rootElement).render(<AlicePreviewCapture />);
