/**
 * AdvancedPageView — container for advanced configuration sub-tabs.
 *
 * Sub-tabs:
 *   - Plugins: Feature/connector plugin management
 *   - Skills: Custom agent skills
 *   - Triggers: Automation trigger management
 *   - Fine-Tuning: Dataset and model training workflows
 *   - Trajectories: LLM call viewer and analysis
 *   - Runtime: Runtime object inspection
 *   - Databases: Tables/media/vector browser
 *   - Logs: Runtime log viewer
 */

import { useState } from "react";
import { useApp } from "../AppContext";
import type { Tab } from "../navigation";
import { CustomActionsView } from "./CustomActionsView";
import { DatabasePageView } from "./DatabasePageView";
import { FineTuningView } from "./FineTuningView";
import { LogsPageView } from "./LogsPageView";
import { PluginsPageView } from "./PluginsPageView";
import { RuntimeView } from "./RuntimeView";
import { SecurityAuditPageView } from "./SecurityAuditPageView";
import { SkillsView } from "./SkillsView";
import { TrajectoriesView } from "./TrajectoriesView";
import { TrajectoryDetailView } from "./TrajectoryDetailView";
import { TriggersView } from "./TriggersView";
import { IdentityPanel } from "./IdentityPanel";
import { ApprovalPanel } from "./ApprovalPanel";
import { SafeModePanel } from "./SafeModePanel";
import { GovernancePanel } from "./GovernancePanel";
import { Button } from "./ui/Button.js";
import { Badge } from "./ui/Badge.js";
import { Card } from "./ui/Card.js";
import { ControlStackSectionFrame } from "./ControlStackSectionFrame.js";

type SubTab =
  | "plugins"
  | "skills"
  | "actions"
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

const SUB_TABS: Array<{ id: SubTab; label: string; description: string }> = [
  { id: "plugins", label: "Plugins", description: "Features and connectors" },
  { id: "skills", label: "Skills", description: "Custom agent skills" },
  { id: "actions", label: "Actions", description: "Custom agent actions" },
  { id: "triggers", label: "Triggers", description: "Scheduled and event-based automations" },
  { id: "identity", label: "Identity", description: "Agent identity and preferences" },
  { id: "approvals", label: "Approvals", description: "Pending approval queue" },
  { id: "safe-mode", label: "Safe Mode", description: "Safe mode status and controls" },
  { id: "governance", label: "Governance", description: "Policies, compliance, and retention" },
  { id: "fine-tuning", label: "Fine-Tuning", description: "Dataset and model training workflows" },
  { id: "trajectories", label: "Trajectories", description: "LLM call history and analysis" },
  { id: "runtime", label: "Runtime", description: "Deep runtime object introspection and load order" },
  { id: "database", label: "Databases", description: "Tables, media, and vector browser" },
  { id: "logs", label: "Logs", description: "Runtime and service logs" },
  {
    id: "security",
    label: "Security",
    description: "Sandbox and policy audit feed",
  },
];

function mapTabToSubTab(tab: Tab): SubTab {
  switch (tab) {
    case "plugins": return "plugins";
    case "skills": return "skills";
    case "actions": return "actions";
    case "triggers": return "triggers";
    case "identity": return "identity";
    case "approvals": return "approvals";
    case "safe-mode": return "safe-mode";
    case "governance": return "governance";
    case "fine-tuning": return "fine-tuning";
    case "trajectories": return "trajectories";
    case "runtime": return "runtime";
    case "database": return "database";
    case "logs": return "logs";
    default: return "plugins";
  }
}

export function AdvancedPageView() {
  const { tab, setTab } = useApp();
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<
    string | null
  >(null);

  const currentSubTab = mapTabToSubTab(tab);
  const currentMeta =
    SUB_TABS.find((subTab) => subTab.id === currentSubTab) ?? SUB_TABS[0];

  const handleSubTabChange = (subTab: SubTab) => {
    setSelectedTrajectoryId(null);
    switch (subTab) {
      case "plugins":
        setTab("plugins");
        break;
      case "skills":
        setTab("skills");
        break;
      case "actions":
        setTab("actions");
        break;
      case "triggers":
        setTab("triggers");
        break;
      case "identity":
        setTab("identity");
        break;
      case "approvals":
        setTab("approvals");
        break;
      case "safe-mode":
        setTab("safe-mode");
        break;
      case "governance":
        setTab("governance");
        break;
      case "fine-tuning":
        setTab("fine-tuning");
        break;
      case "trajectories":
        setTab("trajectories");
        break;
      case "runtime":
        setTab("runtime");
        break;
      case "database":
        setTab("database");
        break;
      case "logs":
        setTab("logs");
        break;
      case "security":
        setTab("security");
        break;
      default:
        setTab("plugins");
    }
  };

  const renderContent = () => {
    switch (currentSubTab) {
      case "plugins":
        return <PluginsPageView />;
      case "skills":
        return <SkillsView />;
      case "actions":
        return <CustomActionsView />;
      case "triggers":
        return <TriggersView />;
      case "identity":
        return <IdentityPanel />;
      case "approvals":
        return <ApprovalPanel />;
      case "safe-mode":
        return <SafeModePanel />;
      case "governance":
        return (
          <ControlStackSectionFrame
            title="Governance"
            description="Policies, retention, quarantine, and compliance posture for the current operator environment."
            badge="Policy"
          >
            <GovernancePanel />
          </ControlStackSectionFrame>
        );
      case "fine-tuning":
        return <FineTuningView />;
      case "trajectories":
        if (selectedTrajectoryId) {
          return (
            <TrajectoryDetailView
              trajectoryId={selectedTrajectoryId}
              onBack={() => setSelectedTrajectoryId(null)}
            />
          );
        }
        return (
          <ControlStackSectionFrame
            title="Trajectories"
            description="Captured LLM call history, token and latency analysis, and drill-down into structured execution records."
            badge="Trace"
          >
            <TrajectoriesView onSelectTrajectory={setSelectedTrajectoryId} />
          </ControlStackSectionFrame>
        );
      case "runtime":
        return (
          <ControlStackSectionFrame
            title="Runtime"
            description="Deep runtime inspection, load ordering, and execution diagnostics for the active agent process."
            badge="Deep debug"
          >
            <RuntimeView />
          </ControlStackSectionFrame>
        );
      case "database":
        return <DatabasePageView />;
      case "logs":
        return <LogsPageView />;
      case "security":
        return <SecurityAuditPageView />;
      default:
        return <PluginsPageView />;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card className="rounded-[22px] border-white/10 bg-white/[0.04] shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
              Control Stack Section
            </div>
            <div className="mt-1 text-base font-semibold text-white/92">
              {currentMeta.label}
            </div>
            <div className="mt-1 max-w-3xl text-sm text-white/68">
              {currentMeta.description}
            </div>
          </div>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
            Deep tools
          </Badge>
        </div>
      </Card>

      <div className="shrink-0">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Advanced settings">
          {SUB_TABS.map((subTab) => {
            const isActive = currentSubTab === subTab.id;
            return (
              <Button
                key={subTab.id}
                id={`adv-tab-${subTab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls="adv-tabpanel"
                variant={isActive ? "secondary" : "ghost"}
                className={`shrink-0 rounded-full border ${isActive
                    ? "border-white/18 bg-white/[0.14] text-white"
                    : "border-white/8 text-white/55 hover:border-white/16 hover:bg-white/[0.06] hover:text-white"
                  }`}
                onClick={() => handleSubTabChange(subTab.id)}
                title={subTab.description}
              >
                {subTab.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto"
        role="tabpanel"
        id="adv-tabpanel"
        aria-labelledby={`adv-tab-${currentSubTab}`}
      >
        {renderContent()}
      </div>
    </div>
  );
}
