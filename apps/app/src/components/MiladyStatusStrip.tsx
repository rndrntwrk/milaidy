import { useApp } from "../AppContext.js";
import { Button } from "./ui/Button.js";
import { ConnectionIcon, StopIcon } from "./ui/Icons.js";

export function MiladyStatusStrip() {
  const {
    connected,
    liveBroadcastState,
    quickLayerStatuses,
    runQuickLayer,
    openGoLiveModal,
  } = useApp();
  const liveActionId = liveBroadcastState === "live" ? "end-live" : "go-live";
  const liveActionDisabled =
    !connected || (liveBroadcastState === "live" && quickLayerStatuses[liveActionId] === "disabled");
  const liveActionLabel =
    liveBroadcastState === "live" ? "End Live" : "Go Live";

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] justify-end sm:right-4 sm:top-4">
      <div className="pointer-events-auto inline-flex max-w-full items-center rounded-full border border-white/10 bg-black/52 px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.24)] backdrop-blur-2xl sm:px-3">
        <Button
          type="button"
          variant={liveBroadcastState === "live" ? "destructive" : "secondary"}
          size="sm"
          className="rounded-full"
          disabled={liveActionDisabled}
          onClick={() =>
            liveBroadcastState === "live"
              ? void runQuickLayer("end-live")
              : openGoLiveModal()
          }
          aria-label={liveActionLabel}
          title={connected ? liveActionLabel : "Connect before going live"}
        >
          {liveBroadcastState === "live" ? (
            <StopIcon className="h-3.5 w-3.5" />
          ) : (
            <ConnectionIcon className="h-3.5 w-3.5" />
          )}
          {liveActionLabel}
        </Button>
      </div>
    </div>
  );
}
