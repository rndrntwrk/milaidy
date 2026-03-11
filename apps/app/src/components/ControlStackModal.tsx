import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { SettingsView } from "./SettingsView.js";
import { AdvancedPageView } from "./AdvancedPageView.js";
import { AppsPageView } from "./AppsPageView.js";
import { ConnectorsPageView } from "./ConnectorsPageView.js";
import type { Tab } from "../navigation.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { CloseIcon, StackIcon } from "./ui/Icons.js";
import { resolveAgentDisplayName } from "./shared/agentDisplayName.js";
import {
  controlSectionForTab,
  defaultTabForControlSection,
  getControlStackSectionMeta,
  getControlStackSections,
  sanitizeControlSection,
  type HudControlSection,
} from "../miladyHudRouting.js";

function renderSectionContent(resolvedSection: HudControlSection, activeTab: Tab) {
  if (resolvedSection === "settings") return <SettingsView />;
  if (resolvedSection === "apps") return <AppsPageView />;
  if (resolvedSection === "plugins-connectors" && activeTab === "connectors") {
    return <ConnectorsPageView />;
  }
  return <AdvancedPageView />;
}

export function ControlStackModal({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section?: HudControlSection | null;
  onClose: () => void;
}) {
  const { tab, setTab, agentStatus } = useApp();
  const agentName = resolveAgentDisplayName(agentStatus?.agentName);
  const sections = getControlStackSections();

  const resolvedSection = sanitizeControlSection(
    section ?? controlSectionForTab(tab) ?? "settings",
  );
  const sectionMeta = getControlStackSectionMeta(resolvedSection);
  const activeTab = useMemo(() => {
    if (resolvedSection === "plugins-connectors") {
      return tab === "connectors" || tab === "skills" ? tab : "plugins";
    }
    if (resolvedSection === "advanced") {
      return tab === "advanced"
        ? "advanced"
        : defaultTabForControlSection(resolvedSection);
    }
    const defaultTab = defaultTabForControlSection(resolvedSection);
    return tab === defaultTab
      ? tab
      : defaultTab;
  }, [resolvedSection, tab]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 backdrop-blur-md lg:p-4">
      <div className="relative flex h-[96vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-[30px] border border-white/14 bg-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/18 px-4 py-4 lg:px-6">
          <div className="min-w-0">
            <div className="pro-streamer-control-stack-title flex items-center gap-2 text-white/92">
              <StackIcon className="h-4 w-4" />
              {agentName} Pro Stack
            </div>
            <div className="pro-streamer-control-stack-copy mt-1">
              {sectionMeta.copy}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
              Route-less
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close control stack"
              className="rounded-full border border-white/10 text-white/65 hover:border-white/20 hover:text-white"
            >
              <CloseIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="border-b border-white/10 bg-white/[0.03] px-3 py-3 lg:px-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sections.map((entry) => (
              <Button
                key={entry.id}
                variant={resolvedSection === entry.id ? "secondary" : "ghost"}
                className={`h-auto shrink-0 rounded-full border px-3 py-2 text-[11px] ${
                  resolvedSection === entry.id
                    ? "border-white/18 bg-white/[0.14] text-white"
                    : "border-white/8 bg-transparent text-white/55 hover:border-white/16 hover:bg-white/[0.06] hover:text-white"
                }`}
                onClick={() => setTab(entry.defaultTab)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-black/10">
          {resolvedSection === "plugins-connectors" ? (
            <div className="pro-streamer-control-stack-subtabs border-b border-white/10 px-4 py-3">
              {(["connectors", "plugins", "skills"] as Tab[]).map((entry) => (
                <Button
                  key={entry}
                  variant={activeTab === entry ? "secondary" : "ghost"}
                  className={`rounded-full border px-3 py-1 text-[11px] ${
                    activeTab === entry
                      ? "border-white/18 bg-white/[0.14] text-white"
                      : "border-white/8 text-white/55 hover:border-white/16 hover:bg-white/[0.06] hover:text-white"
                  }`}
                  onClick={() => setTab(entry)}
                >
                  {entry}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
            <div className="milady-control-stack-scope pro-streamer-control-stack-body min-h-full p-4 backdrop-blur-xl lg:p-5">
              {renderSectionContent(resolvedSection, activeTab)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
