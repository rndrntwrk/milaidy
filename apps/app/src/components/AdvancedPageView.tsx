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

import { useEffect, useState } from "react";
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

function mapTabToSubTab(tab: Tab): SubTab {
  switch (tab) {
    case "advanced":
      return "plugins";
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
    case "security": return "security";
    default: return "plugins";
  }
}

export function AdvancedPageView() {
  const { tab } = useApp();
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<
    string | null
  >(null);

  const currentSubTab = mapTabToSubTab(tab);

  useEffect(() => {
    if (currentSubTab !== "trajectories" && selectedTrajectoryId !== null) {
      setSelectedTrajectoryId(null);
    }
  }, [currentSubTab, selectedTrajectoryId]);

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
        return <GovernancePanel />;
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
        return <TrajectoriesView onSelectTrajectory={setSelectedTrajectoryId} />;
      case "runtime":
        return <RuntimeView />;
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
    <div className="flex h-full min-h-0 flex-col">
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
