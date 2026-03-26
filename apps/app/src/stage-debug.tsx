import { useCallback, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { StageSceneMark } from "./proStreamerStageScene";
import type { VrmEngine, VrmEngineState } from "./components/avatar/VrmEngine";
import { VrmViewer } from "./components/avatar/VrmViewer";

type PreviewState = "loading" | "ready" | "error";

function readSceneMark(): StageSceneMark {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("mark");
  return value === "portrait" ? "portrait" : "stage";
}

function readVrmPath(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("vrm")?.trim() || "/vrms/alice.vrm";
}

function StageDebugPage() {
  const sceneMark = useMemo(() => readSceneMark(), []);
  const vrmPath = useMemo(() => readVrmPath(), []);
  const engineRef = useRef<VrmEngine | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<VrmEngineState | null>(null);
  const [stageInfo, setStageInfo] = useState<Record<string, string>>({});

  const collectStageInfo = useCallback((engine: VrmEngine | null) => {
    if (!engine) return;
    const engineAny = engine as VrmEngine & {
      scene?: { children?: { length?: number }[] | { length?: number } };
      stageScene?: {
        sceneRoot?: { children?: unknown[] };
        backdrop?: {
          visible?: boolean;
          children?: unknown[];
          type?: string;
          traverse?: (cb: (child: unknown) => void) => void;
        };
        stageCamera?: { fov?: number };
        backdropMetrics?: { width?: number; height?: number; aspect?: number };
      } | null;
      rendererBackend?: string;
    };
    const stageScene = engineAny.stageScene;
    const backdrop = stageScene?.backdrop;
    let backdropMeshCount = 0;
    let backdropMaterialSummary = "n/a";

    backdrop?.traverse?.((child) => {
      const mesh = child as {
        isMesh?: boolean;
        material?:
          | {
              type?: string;
              name?: string;
              color?: { getHexString?: () => string };
              emissive?: { getHexString?: () => string };
              map?: unknown;
              emissiveMap?: unknown;
              transparent?: boolean;
              opacity?: number;
            }
          | Array<{
              type?: string;
              name?: string;
              color?: { getHexString?: () => string };
              emissive?: { getHexString?: () => string };
              map?: unknown;
              emissiveMap?: unknown;
              transparent?: boolean;
              opacity?: number;
            }>;
      };
      if (!mesh?.isMesh) return;
      backdropMeshCount += 1;
      if (backdropMaterialSummary !== "n/a") return;
      const firstMaterial = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material;
      if (!firstMaterial) return;
      backdropMaterialSummary = [
        firstMaterial.type ?? "unknown",
        `name=${firstMaterial.name ?? "unnamed"}`,
        `color=#${firstMaterial.color?.getHexString?.() ?? "n/a"}`,
        `emissive=#${firstMaterial.emissive?.getHexString?.() ?? "n/a"}`,
        `map=${firstMaterial.map ? "yes" : "no"}`,
        `emissiveMap=${firstMaterial.emissiveMap ? "yes" : "no"}`,
        `transparent=${firstMaterial.transparent ? "true" : "false"}`,
        `opacity=${String(firstMaterial.opacity ?? "n/a")}`,
      ].join(" ");
    });

    setStageInfo({
      renderer: engineAny.rendererBackend ?? "unknown",
      stageScene: stageScene ? "present" : "missing",
      sceneChildren: String(engineAny.scene?.children?.length ?? "n/a"),
      stageRootChildren: String(stageScene?.sceneRoot?.children?.length ?? "n/a"),
      backdropType: backdrop?.type ?? "n/a",
      backdropVisible: backdrop?.visible === false ? "false" : "true",
      backdropChildCount: String(backdrop?.children?.length ?? "n/a"),
      backdropMeshCount: String(backdropMeshCount),
      backdropMaterial: backdropMaterialSummary,
      stageCameraFov: String(stageScene?.stageCamera?.fov ?? "n/a"),
      backdropAspect: String(stageScene?.backdropMetrics?.aspect ?? "n/a"),
    });
  }, []);

  const handleEngineReady = useCallback((_engine: VrmEngine) => {
    engineRef.current = _engine;
    setPreviewState("ready");
    setErrorMessage(null);
    collectStageInfo(_engine);
  }, [collectStageInfo]);

  const handleEngineState = useCallback((state: VrmEngineState) => {
    setEngineState(state);
    collectStageInfo(engineRef.current);
    if (state.vrmLoaded) {
      setPreviewState("ready");
      setErrorMessage(null);
    }
  }, [collectStageInfo]);

  const handleViewerError = useCallback((error: Error) => {
    setPreviewState("error");
    setErrorMessage(error.message);
  }, []);

  return (
    <main
      data-stage-debug-root
      data-stage-debug-state={previewState}
      data-stage-debug-mark={sceneMark}
      data-stage-debug-idle-playing={engineState?.idlePlaying ? "true" : "false"}
      data-stage-debug-idle-tracks={String(engineState?.idleTracks ?? 0)}
      data-stage-debug-stage-scale={
        engineState?.stageScale != null ? String(engineState.stageScale) : "n/a"
      }
      style={{
        minHeight: "100vh",
        margin: 0,
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at 50% 18%, rgba(255, 196, 80, 0.18), transparent 30%), linear-gradient(180deg, #04070d 0%, #02040a 100%)",
        color: "white",
        fontFamily:
          "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: "min(1320px, 96vw)",
          height: "min(820px, 88vh)",
          position: "relative",
          overflow: "hidden",
          borderRadius: "32px",
          border: "1px solid rgba(255,255,255,0.08)",
          background:
            "radial-gradient(circle at 50% 16%, rgba(255,255,255,0.03), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.15) 72%, rgba(0,0,0,0.25) 100%)",
          boxShadow: "0 28px 96px rgba(0, 0, 0, 0.48)",
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <VrmViewer
            vrmPath={vrmPath}
            mouthOpen={0}
            isSpeaking={false}
            scenePreset="pro-streamer-stage"
            sceneMark={sceneMark}
            onEngineReady={handleEngineReady}
            onEngineState={handleEngineState}
            onViewerError={handleViewerError}
          />
        </div>

        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 18,
            background: "rgba(5, 9, 16, 0.76)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
            Alice Stage Debug
          </div>
          <div style={{ fontSize: 14 }}>
            state: <strong>{previewState}</strong>
          </div>
          <div style={{ fontSize: 14 }}>
            mark: <strong>{sceneMark}</strong>
          </div>
          <div style={{ fontSize: 14 }}>
            vrmLoaded: <strong>{engineState?.vrmLoaded ? "true" : "false"}</strong>
          </div>
          <div style={{ fontSize: 14 }}>
            vrmName: <strong>{engineState?.vrmName ?? "n/a"}</strong>
          </div>
          <div style={{ fontSize: 14 }}>
            idlePlaying: <strong>{engineState?.idlePlaying ? "true" : "false"}</strong>
          </div>
          <div style={{ fontSize: 14 }}>
            idleTracks: <strong>{engineState?.idleTracks ?? 0}</strong>
          </div>
          <div style={{ fontSize: 14 }}>
            stageScale: <strong>{engineState?.stageScale?.toFixed(4) ?? "n/a"}</strong>
          </div>
          {Object.entries(stageInfo).map(([key, value]) => (
            <div key={key} style={{ maxWidth: 420, fontSize: 13, lineHeight: 1.35 }}>
              {key}: <strong>{value}</strong>
            </div>
          ))}
          {errorMessage ? (
            <div style={{ maxWidth: 360, fontSize: 13, lineHeight: 1.4, color: "#ffd6dd" }}>
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root for stage debug");
}

createRoot(rootElement).render(<StageDebugPage />);
