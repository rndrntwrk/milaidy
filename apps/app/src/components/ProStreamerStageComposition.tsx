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

function CameraHoldWindow({
  agentName,
  isSpeaking,
}: {
  agentName: string;
  isSpeaking: boolean;
}) {
  return (
    <div
      className="absolute bottom-[8.5rem] right-4 z-[4] h-[10.5rem] w-[8rem] overflow-hidden rounded-[24px] border border-white/16 bg-black/55 shadow-[0_18px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:bottom-[9rem] sm:right-5 sm:h-[12rem] sm:w-[9.5rem] lg:bottom-[10rem] lg:right-6 lg:h-[14rem] lg:w-[11rem] xl:h-[15.5rem] xl:w-[12rem]"
      data-stage-camera-hold
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.08),transparent_56%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.35)_34%,rgba(0,0,0,0.72)_100%)]" />
      <div className="absolute inset-x-2 top-2 z-[2] flex items-center justify-between rounded-full border border-white/12 bg-black/46 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-white/68">
        <span>{agentName}</span>
        <span>Hold</span>
      </div>
      <div className="absolute inset-[0.35rem] overflow-hidden rounded-[20px]">
        <ChatAvatar isSpeaking={isSpeaking} />
      </div>
      <div className="absolute inset-x-2 bottom-2 z-[2] rounded-full border border-white/10 bg-black/46 px-2.5 py-1 text-center text-[9px] uppercase tracking-[0.18em] text-white/58">
        camera
      </div>
    </div>
  );
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
  const heroFrame =
    liveLayoutMode === "camera-hold"
      ? resolveStageHeroFrame(
          liveHeroSource,
          activeGameDisplayName,
          activeGameViewerUrl,
          activeGameSandbox,
        )
      : null;

  if (heroFrame) {
    return (
      <div
        className="absolute inset-0"
        data-stage-layout="camera-hold"
      >
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
          <div className="absolute left-3 top-3 z-[2] rounded-full border border-white/12 bg-black/46 px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] text-white/68 sm:left-4 sm:top-4">
            {heroFrame.kindLabel} Hero
          </div>
          <div className="absolute left-3 bottom-3 z-[2] rounded-full border border-white/10 bg-black/46 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/60 sm:left-4 sm:bottom-4">
            {heroFrame.label}
          </div>
        </div>
        <CameraHoldWindow agentName={agentName} isSpeaking={isSpeaking} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0" data-stage-layout="camera-full">
      <div className="absolute inset-x-[18%] bottom-[12.25rem] top-[10rem] z-[1] sm:inset-x-[16%] sm:bottom-[11.75rem] sm:top-[8.25rem] lg:inset-x-[20%] lg:bottom-[10.5rem] lg:top-[6rem] xl:inset-x-[22%]">
        <div className="absolute inset-0">
          <ChatAvatar isSpeaking={isSpeaking} />
        </div>
      </div>
      <div className="absolute right-4 top-4 z-[2] rounded-full border border-white/12 bg-black/46 px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] text-white/64 sm:right-5 sm:top-5">
        {agentName} Camera
      </div>
    </div>
  );
}
