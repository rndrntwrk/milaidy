import { act, create, type ReactTestRendererJSON } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../src/AppContext.js";
import { AdvancedPageView } from "../src/components/AdvancedPageView.js";

vi.mock("../src/AppContext.js", () => ({
  useApp: vi.fn(),
}));

vi.mock("../src/components/PluginsPageView.js", () => ({
  PluginsPageView: () => <div>PluginsViewMock</div>,
}));
vi.mock("../src/components/SkillsView.js", () => ({
  SkillsView: () => <div>SkillsViewMock</div>,
}));
vi.mock("../src/components/CustomActionsView.js", () => ({
  CustomActionsView: () => <div>CustomActionsViewMock</div>,
}));
vi.mock("../src/components/TriggersView.js", () => ({
  TriggersView: () => <div>TriggersViewMock</div>,
}));
vi.mock("../src/components/IdentityPanel.js", () => ({
  IdentityPanel: () => <div>IdentityPanelMock</div>,
}));
vi.mock("../src/components/ApprovalPanel.js", () => ({
  ApprovalPanel: () => <div>ApprovalPanelMock</div>,
}));
vi.mock("../src/components/SafeModePanel.js", () => ({
  SafeModePanel: () => <div>SafeModePanelMock</div>,
}));
vi.mock("../src/components/GovernancePanel.js", () => ({
  GovernancePanel: () => <div>GovernancePanelMock</div>,
}));
vi.mock("../src/components/FineTuningView.js", () => ({
  FineTuningView: () => <div>FineTuningViewMock</div>,
}));
vi.mock("../src/components/TrajectoriesView.js", () => ({
  TrajectoriesView: () => <div>TrajectoriesViewMock</div>,
}));
vi.mock("../src/components/TrajectoryDetailView.js", () => ({
  TrajectoryDetailView: () => <div>TrajectoryDetailViewMock</div>,
}));
vi.mock("../src/components/RuntimeView.js", () => ({
  RuntimeView: () => <div>RuntimeViewMock</div>,
}));
vi.mock("../src/components/DatabasePageView.js", () => ({
  DatabasePageView: () => <div>DatabasePageViewMock</div>,
}));
vi.mock("../src/components/LogsPageView.js", () => ({
  LogsPageView: () => <div>LogsPageViewMock</div>,
}));
vi.mock("../src/components/SecurityAuditPageView.js", () => ({
  SecurityAuditPageView: () => <div>SecurityAuditPageViewMock</div>,
}));

function collectText(
  node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null,
): string {
  if (node === null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((child) => collectText(child)).join(" ");
  return collectText(node.children as ReactTestRendererJSON[] | string | null);
}

describe("AdvancedPageView", () => {
  it("renders the security audit page when the active tab is security", async () => {
    // @ts-expect-error test uses a narrowed context subset.
    vi.spyOn(AppContext, "useApp").mockReturnValue({ tab: "security" });

    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(<AdvancedPageView />);
    });

    expect(collectText(renderer?.toJSON() ?? null)).toContain(
      "SecurityAuditPageViewMock",
    );
  });

  it("treats the umbrella advanced tab as the plugins landing view", async () => {
    // @ts-expect-error test uses a narrowed context subset.
    vi.spyOn(AppContext, "useApp").mockReturnValue({ tab: "advanced" });

    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(<AdvancedPageView />);
    });

    expect(collectText(renderer?.toJSON() ?? null)).toContain("PluginsViewMock");
  });
});
