import { useApp } from "../AppContext.js";
import { Button } from "./ui/Button.js";
import { SectionEmptyState } from "./SectionStates.js";
import { SectionShell } from "./SectionShell.js";

export function ActionDeckPanel() {
  const {
    plugins,
    setTab,
  } = useApp();
  const hasOperationalTools = plugins.some((plugin) => plugin.enabled);

  return (
    <SectionShell
      title="Quick actions"
      description="Open the next operator surface without surfacing the full manager on stage."
      className="border-white/8 bg-white/[0.025]"
      contentClassName="gap-3"
    >
        {hasOperationalTools ? (
          <div className="rounded-2xl border border-white/8 bg-black/14 px-3 py-3 text-sm text-white/62">
            Connected tools are available through these shortcuts.
          </div>
        ) : (
          <SectionEmptyState
            title="No live connectors"
            description="Enable channels or connectors to surface their state here."
            actionLabel="Open connectors"
            onAction={() => setTab("connectors")}
            className="border-none bg-transparent shadow-none"
          />
        )}

        <div className="mt-auto grid grid-cols-2 gap-2">
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => setTab("connectors")}>
            Connectors
          </Button>
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => setTab("plugins")}>
            Plugins
          </Button>
          <Button variant="outline" className="justify-start rounded-2xl" onClick={() => setTab("actions")}>
            Actions
          </Button>
          <Button variant="outline" className="justify-start rounded-2xl" onClick={() => setTab("apps")}>
            Apps
          </Button>
        </div>
    </SectionShell>
  );
}
