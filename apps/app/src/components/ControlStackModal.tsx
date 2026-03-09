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
import { resolveThemeDisplayName } from "./shared/themeDisplayName.js";

export type ControlStackSection =
  | "settings"
  | "apps"
  | "advanced"
  | "plugins-connectors"
  | "custom-actions"
  | "triggers"
  | "identity"
  | "approvals"
  | "safe-mode"
  | "governance"
  | "fine-tuning"
  | "trajectories"
  | "runtime"
  | "database"
  | "logs"
  | "security";

const SECTION_DEFAULT_TAB: Record<ControlStackSection, Tab> = {
  settings: "settings",
  apps: "apps",
  advanced: "advanced",
  "plugins-connectors": "plugins",
  "custom-actions": "actions",
  triggers: "triggers",
  identity: "identity",
  approvals: "approvals",
  "safe-mode": "safe-mode",
  governance: "governance",
  "fine-tuning": "fine-tuning",
  trajectories: "trajectories",
  runtime: "runtime",
  database: "database",
  logs: "logs",
  security: "security",
};

const SECTION_LABELS: Record<ControlStackSection, string> = {
  settings: "Settings",
  apps: "Apps",
  advanced: "Advanced",
  "plugins-connectors": "Plugins & Connectors",
  "custom-actions": "Custom Actions",
  triggers: "Triggers",
  identity: "Identity",
  approvals: "Approvals",
  "safe-mode": "Safe Mode",
  governance: "Governance",
  "fine-tuning": "Fine-Tuning",
  trajectories: "Trajectories",
  runtime: "Runtime",
  database: "Database",
  logs: "Logs",
  security: "Security",
};

const SECTION_COPY: Record<ControlStackSection, string> = {
  settings: "Master preferences, model defaults, and runtime-wide behavior.",
  apps: "Launch and inspect installed surfaces without leaving the dashboard.",
  advanced: "Deep operator controls routed into one route-less overlay.",
  "plugins-connectors": "Connector state, plugin health, and external service wiring.",
  "custom-actions": "Curated quick actions and automations that can be triggered from the HUD.",
  triggers: "Schedules, recurring workflows, and trigger execution controls.",
  identity: "Persona, identity, and profile configuration.",
  approvals: "Human-in-the-loop requests and mission review.",
  "safe-mode": "Safety posture, guardrails, and constrained execution settings.",
  governance: "Policies, governance controls, and operational rules.",
  "fine-tuning": "Advanced tuning surfaces for behavior and model calibration.",
  trajectories: "Trajectory inspection and cognitive trace analysis.",
  runtime: "Runtime health, process state, and execution diagnostics.",
  database: "Database browser, vector memory, and document stores.",
  logs: "Structured logs, telemetry, and stream diagnostics.",
  security: "Security audit stream and channel trust state.",
};

const SECTION_ORDER: ControlStackSection[] = [
  "settings",
  "apps",
  "advanced",
  "plugins-connectors",
  "custom-actions",
  "triggers",
  "identity",
  "approvals",
  "safe-mode",
  "governance",
  "fine-tuning",
  "trajectories",
  "runtime",
  "database",
  "logs",
  "security",
];

export function miladyControlSectionForTab(
  tab: string,
): ControlStackSection | null {
  switch (tab) {
    case "settings":
      return "settings";
    case "apps":
      return "apps";
    case "advanced":
      return "advanced";
    case "connectors":
    case "plugins":
    case "skills":
      return "plugins-connectors";
    case "actions":
      return "custom-actions";
    case "triggers":
      return "triggers";
    case "identity":
      return "identity";
    case "approvals":
      return "approvals";
    case "safe-mode":
      return "safe-mode";
    case "governance":
      return "governance";
    case "fine-tuning":
      return "fine-tuning";
    case "trajectories":
      return "trajectories";
    case "runtime":
      return "runtime";
    case "database":
      return "database";
    case "logs":
      return "logs";
    case "security":
      return "security";
    default:
      return null;
  }
}

function renderSectionContent(resolvedSection: ControlStackSection, activeTab: Tab) {
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
  section?: ControlStackSection | null;
  onClose: () => void;
}) {
  const { tab, setTab } = useApp();
  const themeName = resolveThemeDisplayName();

  const resolvedSection = section ?? miladyControlSectionForTab(tab) ?? "settings";
  const activeTab = useMemo(() => {
    if (resolvedSection === "plugins-connectors") {
      return tab === "connectors" || tab === "skills" ? tab : "plugins";
    }
    if (resolvedSection === "advanced") {
      return tab === "advanced" ? "advanced" : SECTION_DEFAULT_TAB.advanced;
    }
    return tab === SECTION_DEFAULT_TAB[resolvedSection]
      ? tab
      : SECTION_DEFAULT_TAB[resolvedSection];
  }, [resolvedSection, tab]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 backdrop-blur-md lg:p-4">
      <div className="relative flex h-[96vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-[30px] border border-white/14 bg-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/18 px-4 py-4 lg:px-6">
          <div className="min-w-0">
            <div className="pro-streamer-control-stack-title flex items-center gap-2 text-white/92">
              <StackIcon className="h-4 w-4" />
              {themeName} Control Stack
            </div>
            <div className="pro-streamer-control-stack-copy mt-1">
              {SECTION_COPY[resolvedSection]}
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
            {SECTION_ORDER.map((entry) => (
              <Button
                key={entry}
                variant={resolvedSection === entry ? "secondary" : "ghost"}
                className={`h-auto shrink-0 rounded-full border px-3 py-2 text-[11px] ${
                  resolvedSection === entry
                    ? "border-white/18 bg-white/[0.14] text-white"
                    : "border-white/8 bg-transparent text-white/55 hover:border-white/16 hover:bg-white/[0.06] hover:text-white"
                }`}
                onClick={() => setTab(SECTION_DEFAULT_TAB[entry])}
              >
                {SECTION_LABELS[entry]}
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
