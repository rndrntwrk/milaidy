import { LogsView } from "./LogsView";
import { ControlStackSectionFrame } from "./ControlStackSectionFrame.js";

export function LogsPageView() {
  return (
    <ControlStackSectionFrame
      title="Logs"
      description="Structured runtime logs, operational notices, and filtered debugging output for the current stream node."
      badge="Diagnostics"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-white/45">
          Runtime log stream
        </div>
        <div className="min-h-0 flex-1">
          <LogsView />
        </div>
      </div>
    </ControlStackSectionFrame>
  );
}
