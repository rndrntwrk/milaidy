import { useRenderGuard } from "@milady/app-core/hooks";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "@milady/app-core/state";
import { resolveAppAssetUrl } from "@milady/app-core/utils";
import {
  memo,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { VrmEngine } from "./avatar/VrmEngine";
import { ChatModalView } from "./ChatModalView";
import { CompanionHeader } from "./companion/CompanionHeader";
import { VrmStage } from "./companion/VrmStage";

const COMPANION_ZOOM_WHEEL_SENSITIVITY = 1 / 720;
const COMPANION_ZOOM_PINCH_SENSITIVITY = 2.35;
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

type TouchPoint = {
  x: number;
  y: number;
};

function getTouchDistance(points: Map<number, TouchPoint>): number {
  const touchPoints = [...points.values()];
  if (touchPoints.length < 2) return 0;
  const [firstPoint, secondPoint] = touchPoints;
  if (!firstPoint || !secondPoint) return 0;
  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
}

function getWheelPixels(event: ReactWheelEvent<HTMLDivElement>): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) {
    return event.deltaY * (window.innerHeight || 1);
  }
  return event.deltaY;
}

function hasFocusedTextEntry(): boolean {
  if (typeof document === "undefined") return false;
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLTextAreaElement) {
    return true;
  }
  if (activeElement instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(activeElement.type.toLowerCase());
  }
  return activeElement instanceof HTMLElement
    ? activeElement.isContentEditable
    : false;
}

export const CompanionView = memo(function CompanionView() {
  useRenderGuard("CompanionView");
  const {
    selectedVrmIndex,
    customVrmUrl,
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    setTab,
    setUiShellMode,
    // Header properties
    agentStatus,
    miladyCloudEnabled,
    miladyCloudConnected,
    miladyCloudCredits,
    miladyCloudCreditsCritical,
    miladyCloudCreditsLow,
    miladyCloudTopUpUrl,
    walletAddresses,
    lifecycleBusy,
    lifecycleAction,

    handleRestart,
    t,
  } = useApp();

  // Compute Header properties
  const name = agentStatus?.agentName ?? "Milady";
  const agentState = agentStatus?.state ?? "not_started";

  const stateColor =
    agentState === "running"
      ? "text-ok border-ok"
      : agentState === "restarting" || agentState === "starting"
        ? "text-warn border-warn"
        : agentState === "error"
          ? "text-danger border-danger"
          : "text-muted border-muted";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";

  const creditColor = miladyCloudCreditsCritical
    ? "border-danger text-danger"
    : miladyCloudCreditsLow
      ? "border-warn text-warn"
      : "border-ok text-ok";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 4)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const companionZoomRef = useRef(0);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
  });
  const touchPointsRef = useRef(new Map<number, TouchPoint>());
  const pinchStateRef = useRef<{
    active: boolean;
    startDistance: number;
    startZoom: number;
  }>({
    active: false,
    startDistance: 0,
    startZoom: 0,
  });

  const handleSwitchToNativeShell = useCallback(() => {
    setUiShellMode("native");
    setTab("chat");
  }, [setTab, setUiShellMode]);
  const setCompanionZoom = useCallback((value: number) => {
    const nextZoom = Math.max(0, Math.min(1, value));
    companionZoomRef.current = nextZoom;
    vrmEngineRef.current?.setCompanionZoomNormalized(nextZoom);
  }, []);
  const handleStageEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    engine.setCompanionZoomNormalized(companionZoomRef.current);
  }, []);
  const handlePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (typeof window.getSelection === "function") {
        window.getSelection()?.removeAllRanges();
      }
      if (event.pointerType === "touch") {
        touchPointsRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      if (event.pointerType === "touch" && touchPointsRef.current.size >= 2) {
        pinchStateRef.current = {
          active: true,
          startDistance: getTouchDistance(touchPointsRef.current),
          startZoom: companionZoomRef.current,
        };
        dragStateRef.current = {
          active: false,
          pointerId: null,
          startX: 0,
          startY: 0,
        };
        vrmEngineRef.current?.resetDragOrbit();
        event.preventDefault?.();
        return;
      }
      dragStateRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      event.preventDefault?.();
    },
    [],
  );
  const handlePointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType === "touch" &&
        touchPointsRef.current.has(event.pointerId)
      ) {
        touchPointsRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (
          pinchStateRef.current.active &&
          touchPointsRef.current.size >= 2 &&
          pinchStateRef.current.startDistance > 0
        ) {
          const viewportSpan = Math.max(
            1,
            Math.min(
              window.innerWidth || event.currentTarget.clientWidth || 1,
              window.innerHeight || event.currentTarget.clientHeight || 1,
            ),
          );
          const pinchDistance = getTouchDistance(touchPointsRef.current);
          const zoomDelta =
            ((pinchDistance - pinchStateRef.current.startDistance) /
              viewportSpan) *
            COMPANION_ZOOM_PINCH_SENSITIVITY;
          setCompanionZoom(pinchStateRef.current.startZoom + zoomDelta);
          event.preventDefault();
          return;
        }
      }
      const dragState = dragStateRef.current;
      if (!dragState.active || dragState.pointerId !== event.pointerId) {
        return;
      }
      const width = window.innerWidth || event.currentTarget.clientWidth || 1;
      const height =
        window.innerHeight || event.currentTarget.clientHeight || 1;
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      const yaw = (deltaX / width) * 1.35;
      const pitch = (-deltaY / height) * 0.85;
      vrmEngineRef.current?.setDragOrbitTarget(yaw, pitch);
      event.preventDefault();
    },
    [setCompanionZoom],
  );
  const handleWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const wheelPixels = getWheelPixels(event);
      if (Math.abs(wheelPixels) < 0.01) return;
      setCompanionZoom(
        companionZoomRef.current -
          wheelPixels * COMPANION_ZOOM_WHEEL_SENSITIVITY,
      );
      event.preventDefault();
    },
    [setCompanionZoom],
  );
  const handleRootWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (hasFocusedTextEntry()) {
        if (event.ctrlKey) {
          event.preventDefault();
        }
        return;
      }
      handleWheelCapture(event);
    },
    [handleWheelCapture],
  );
  const releaseCameraDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPointsRef.current.size < 2) {
          pinchStateRef.current = {
            active: false,
            startDistance: 0,
            startZoom: companionZoomRef.current,
          };
        }
      }
      const dragState = dragStateRef.current;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (dragState.pointerId !== event.pointerId) return;
      dragStateRef.current = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
      };
      vrmEngineRef.current?.resetDragOrbit();
    },
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };

    root.addEventListener("gesturestart", preventGestureZoom, {
      passive: false,
    });
    root.addEventListener("gesturechange", preventGestureZoom, {
      passive: false,
    });
    root.addEventListener("gestureend", preventGestureZoom, {
      passive: false,
    });

    return () => {
      root.removeEventListener("gesturestart", preventGestureZoom);
      root.removeEventListener("gesturechange", preventGestureZoom);
      root.removeEventListener("gestureend", preventGestureZoom);
    };
  }, []);

  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const vrmPath =
    selectedVrmIndex === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreviewUrl =
    selectedVrmIndex > 0
      ? getVrmPreviewUrl(safeSelectedVrmIndex)
      : getVrmPreviewUrl(1);
  const worldUrl =
    uiTheme === "dark"
      ? resolveAppAssetUrl("worlds/companion-night.spz")
      : resolveAppAssetUrl("worlds/companion-day.spz");

  return (
    <div
      ref={rootRef}
      data-testid="companion-root"
      className="absolute inset-0 overflow-hidden text-white font-display rounded-2xl bg-[radial-gradient(circle_at_50%_120%,#212942_0%,#12151e_80%)] animate-in fade-in zoom-in-95 duration-500"
      onWheelCapture={handleRootWheelCapture}
      style={{ overscrollBehavior: "none" }}
    >
      <div className="absolute inset-0 z-0 bg-cover opacity-60 bg-[radial-gradient(circle_at_10%_20%,rgba(255,255,255,0.03)_0%,transparent_40%),radial-gradient(circle_at_80%_80%,rgba(0,225,255,0.05)_0%,transparent_40%)] pointer-events-none" />

      {/* Model Layer */}
      <VrmStage
        vrmPath={vrmPath}
        worldUrl={worldUrl}
        fallbackPreviewUrl={fallbackPreviewUrl}
        cameraProfile="companion"
        onEngineReady={handleStageEngineReady}
        t={t}
      />

      <div
        aria-hidden="true"
        data-testid="companion-camera-drag-surface"
        className="absolute inset-0 z-[1] cursor-grab select-none"
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerUpCapture={releaseCameraDrag}
        onPointerCancelCapture={releaseCameraDrag}
        onLostPointerCaptureCapture={releaseCameraDrag}
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col px-8 py-6 pointer-events-none">
        <CompanionHeader
          name={name}
          agentState={agentState}
          stateColor={stateColor}
          lifecycleBusy={lifecycleBusy}
          restartBusy={restartBusy}
          handleRestart={handleRestart}
          miladyCloudEnabled={miladyCloudEnabled}
          miladyCloudConnected={miladyCloudConnected}
          miladyCloudCredits={miladyCloudCredits}
          creditColor={creditColor}
          miladyCloudTopUpUrl={miladyCloudTopUpUrl}
          evmShort={evmShort}
          solShort={solShort}
          handleSwitchToNativeShell={handleSwitchToNativeShell}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          uiTheme={uiTheme}
          setUiTheme={setUiTheme}
          t={t}
        />

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[45%] z-20 pointer-events-auto">
          <ChatModalView variant="companion-dock" />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 grid grid-cols-[1fr_auto] gap-6 min-h-0 relative">
          {/* Center (Empty to show character) */}
          <div className="w-full h-full" />
        </div>
      </div>
    </div>
  );
});
