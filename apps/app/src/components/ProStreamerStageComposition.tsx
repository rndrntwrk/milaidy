import { liveSourceKindLabel, type LiveLayoutMode, type LiveSecondarySource } from "../liveComposition.js";
import { ChatAvatar } from "./ChatAvatar.js";

const DEFAULT_STAGE_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";

type ProStreamerStageCompositionProps = {
  agentName: string;
  activeGameDisplayName: string;
  activeGameSandbox: string;
  activeGameViewerUrl: string;
  isSpeaking: boolean;
  liveHeroSource: LiveSecondarySource | null;
  liveLayoutMode: LiveLayoutMode;
};

type StageHeroFrame = {
  kindLabel: string;
  label: string;
  statusLabel: string;
  viewerUrl: string | null;
  viewerSandbox: string;
};

function resolveStageHeroFrame(
  liveHeroSource: LiveSecondarySource | null,
  activeGameDisplayName: string,
  activeGameViewerUrl: string,
  activeGameSandbox: string,
): StageHeroFrame | null {
  if (!liveHeroSource) return null;

  if (liveHeroSource.id === "active-game") {
    return {
      kindLabel: "Game",
      label:
        activeGameDisplayName.trim() ||
        liveHeroSource.label.trim() ||
        "Game Feed",
      statusLabel: activeGameViewerUrl.trim()
        ? "Live game feed in hero view"
        : "Game feed pending connection",
      viewerUrl: activeGameViewerUrl.trim() || null,
      viewerSandbox: activeGameSandbox.trim() || DEFAULT_STAGE_VIEWER_SANDBOX,
    };
  }

  return {
    kindLabel: liveSourceKindLabel(liveHeroSource.kind),
    label: liveHeroSource.label.trim() || `${liveSourceKindLabel(liveHeroSource.kind)} Feed`,
    statusLabel:
      liveHeroSource.kind === "screen"
        ? "Screen share active"
        : `${liveSourceKindLabel(liveHeroSource.kind)} source active`,
    viewerUrl: liveHeroSource.viewerUrl?.trim() || null,
    viewerSandbox: DEFAULT_STAGE_VIEWER_SANDBOX,
  };
}

export function ProStreamerStageComposition({
  agentName,
  activeGameDisplayName,
  activeGameSandbox,
  activeGameViewerUrl,
  isSpeaking,
  liveHeroSource,
  liveLayoutMode,
}: ProStreamerStageCompositionProps) {
  const isCameraHoldLayout = liveLayoutMode === "camera-hold";
  const heroFrame =
    isCameraHoldLayout
      ? resolveStageHeroFrame(
          liveHeroSource,
          activeGameDisplayName,
          activeGameViewerUrl,
          activeGameSandbox,
        )
      : null;
  const cameraInHold = isCameraHoldLayout && heroFrame !== null;
  const cameraSurfaceClassName = cameraInHold
    ? "absolute bottom-[8.5rem] right-4 z-[4] h-[10.5rem] w-[8rem] overflow-hidden rounded-[24px] border border-white/16 bg-black/55 shadow-[0_18px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-[width,height,top,right,bottom,left,transform] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:bottom-[9rem] sm:right-5 sm:h-[12rem] sm:w-[9.5rem] lg:bottom-[10rem] lg:right-6 lg:h-[14rem] lg:w-[11rem] xl:h-[15.5rem] xl:w-[12rem]"
    : "absolute inset-0 z-[1] overflow-hidden rounded-[inherit] transition-[width,height,top,right,bottom,left,transform] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]";
  const contextPillLabel = cameraInHold
    ? heroFrame
      ? `${heroFrame.kindLabel} · ${heroFrame.label}`
      : `${agentName} Camera`
    : `${agentName} Camera`;

  return (
    <div
      className="absolute inset-0"
      data-stage-layout={cameraInHold ? "camera-hold" : "camera-full"}
    >
      {heroFrame ? (
        <div className="absolute inset-[0.8rem] bottom-[7.2rem] overflow-hidden rounded-[28px] border border-white/10 bg-[#04060a] shadow-[0_24px_64px_rgba(0,0,0,0.4)] sm:inset-[1rem] sm:bottom-[7.8rem] lg:inset-[1.2rem] lg:bottom-[8.4rem]">
          {heroFrame.viewerUrl ? (
            <div className="absolute inset-0 pointer-events-none" data-stage-hero-frame>
              <iframe
                src={heroFrame.viewerUrl}
                sandbox={heroFrame.viewerSandbox}
                className="h-full w-full border-none"
                title={`${heroFrame.label} hero feed`}
              />
            </div>
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_32%,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,rgba(10,12,16,0.9),rgba(3,5,8,0.98))] px-6 text-center"
              data-stage-hero-placeholder
            >
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/42">
                {heroFrame.kindLabel} Hero
              </div>
              <div className="mt-3 text-[clamp(1.4rem,2vw,2.2rem)] font-semibold text-white">
                {heroFrame.label}
              </div>
              <div className="mt-2 max-w-xl text-sm leading-relaxed text-white/62">
                {heroFrame.statusLabel}
              </div>
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.07),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_16%,rgba(0,0,0,0.24)_58%,rgba(0,0,0,0.66)_100%)]" />
          <div className="absolute left-3 bottom-3 z-[2] rounded-full border border-white/10 bg-black/46 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/60 sm:left-4 sm:bottom-4">
            {heroFrame.label}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-16 right-16 top-4 z-[3] flex justify-center sm:left-24 sm:right-24 sm:top-5 lg:left-32 lg:right-32 xl:left-40 xl:right-40">
        <div
          className="max-w-full truncate rounded-full border border-white/12 bg-black/46 px-4 py-1.5 text-center text-[10px] uppercase tracking-[0.24em] text-white/66 backdrop-blur-xl"
          data-stage-context-pill
          title={contextPillLabel}
        >
          {contextPillLabel}
        </div>
      </div>

      <div
        className={cameraSurfaceClassName}
        data-stage-camera-surface
        data-stage-camera-mode={cameraInHold ? "hold" : "full"}
        data-stage-camera-hold={cameraInHold || undefined}
      >
        {cameraInHold ? (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.08),transparent_56%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.35)_34%,rgba(0,0,0,0.72)_100%)]" />
            <div className="absolute inset-x-2 top-2 z-[2] flex items-center justify-between rounded-full border border-white/12 bg-black/46 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-white/68">
              <span>{agentName}</span>
              <span>Hold</span>
            </div>
          </>
        ) : null}

        <div className={cameraInHold ? "absolute inset-[0.35rem] overflow-hidden rounded-[20px]" : "absolute inset-0"}>
          <ChatAvatar
            isSpeaking={isSpeaking}
            scenePreset="pro-streamer-stage"
            sceneMark={cameraInHold ? "portrait" : "stage"}
          />
        </div>

        {cameraInHold ? (
          <div className="absolute inset-x-2 bottom-2 z-[2] rounded-full border border-white/10 bg-black/46 px-2.5 py-1 text-center text-[9px] uppercase tracking-[0.18em] text-white/58">
            camera
          </div>
        ) : null}
      </div>

    </div>
  );
}
