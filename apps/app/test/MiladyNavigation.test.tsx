import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../src/AppContext.js";
import { tabFromPath } from "../src/navigation.js";
import { CommandPalette } from "../src/components/CommandPalette.js";
import { OpsDrawer } from "../src/components/OpsDrawer.js";

vi.mock("../src/AppContext.js", () => ({
  useApp: vi.fn(),
}));

vi.mock("../src/miladyHudRouting.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/miladyHudRouting.js")>(
      "../src/miladyHudRouting.js",
    );
  return {
    ...actual,
    isTabEnabled: (tab: Parameters<typeof actual.isTabEnabled>[0]) =>
      tab !== "apps",
  };
});

vi.mock("../src/hooks/useBugReport.js", () => ({
  useBugReport: () => ({ open: vi.fn() }),
}));
vi.mock("../src/components/ui/Dialog.js", () => ({
  Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
}));
vi.mock("../src/components/DrawerShell.js", () => ({
  DrawerShell: ({ title, children, summary }: any) => (
    <div>
      <h1>{title}</h1>
      {summary}
      {children}
    </div>
  ),
}));
vi.mock("../src/components/SectionShell.js", () => ({
  SectionShell: ({ title, children }: any) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
vi.mock("../src/components/SummaryStatRow.js", () => ({
  SummaryStatRow: () => <div>SummaryStatRowMock</div>,
}));
vi.mock("../src/components/ui/Button.js", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("../src/components/ui/Sheet.js", () => ({
  Sheet: ({ open, children }: any) => (open ? <div>{children}</div> : null),
}));
vi.mock("../src/components/ui/Icons.js", () => ({
  OpsIcon: () => <span>OpsIcon</span>,
}));
vi.mock("../src/components/PluginOperatorPanels.js", () => ({
  isStream555PrimaryPlugin: () => false,
  isArcade555PrimaryPlugin: () => false,
  buildStream555StatusSummary: () => null,
  Stream555ControlActionsPanel: () => null,
  Arcade555ControlActionsPanel: () => null,
}));

function renderText(renderer: ReturnType<typeof create> | null): string {
  return JSON.stringify(renderer?.toJSON() ?? null);
}

describe("Milady navigation gating", () => {
  it("treats /apps as unroutable when the apps gate is disabled", () => {
    expect(tabFromPath("/apps")).toBeNull();
  });

  it("omits apps commands from the command palette when the apps gate is disabled", async () => {
    // @ts-expect-error test uses a narrowed context subset.
    vi.spyOn(AppContext, "useApp").mockReturnValue({
      commandPaletteOpen: true,
      commandQuery: "",
      commandActiveIndex: 0,
      agentStatus: { state: "running" },
      handleStart: vi.fn(),
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      setTab: vi.fn(),
      loadPlugins: vi.fn(),
      loadSkills: vi.fn(),
      loadLogs: vi.fn(),
      loadWorkbench: vi.fn(),
      handleChatClear: vi.fn(),
      activeGameViewerUrl: "https://example.com/game",
      setState: vi.fn(),
    });

    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(<CommandPalette />);
    });

    const text = renderText(renderer);
    expect(text).not.toContain("Open Apps");
    expect(text).not.toContain("Open Current Game");
  });

  it("filters apps out of Ops quick links when the apps gate is disabled", async () => {
    // @ts-expect-error test uses a narrowed context subset.
    vi.spyOn(AppContext, "useApp").mockReturnValue({
      cloudConnected: false,
      cloudCredits: null,
      cloudCreditsCritical: false,
      cloudCreditsLow: false,
      extensionStatus: null,
      mcpServerStatuses: [],
      plugins: [],
      loadPlugins: vi.fn(async () => {}),
      setActionNotice: vi.fn(),
      setTab: vi.fn(),
    });

    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(<OpsDrawer open onClose={vi.fn()} />);
    });

    const text = renderText(renderer);
    expect(text).toContain("Connectors");
    expect(text).not.toContain(">Apps<");
    expect(text).not.toContain("\"Apps\"");
  });
});
