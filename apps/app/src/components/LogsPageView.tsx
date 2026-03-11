import { LogsView } from "./LogsView";

export function LogsPageView() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <LogsView />
      </div>
    </div>
  );
}
