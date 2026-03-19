import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentCard } from "../components/dashboard/AgentCard";
import { AgentDetail } from "../components/dashboard/AgentDetail";
import { LogsPanel } from "../components/dashboard/LogsPanel";
import { MetricsPanel } from "../components/dashboard/MetricsPanel";
import { Sidebar } from "../components/dashboard/Sidebar";
import type { AgentStatus } from "../lib/cloud-api";

vi.mock("../lib/AgentProvider", () => ({
  useAgents: () => ({
    agents: [
      {
        id: "cloud-test-1",
        name: "Test Agent",
        source: "cloud" as const,
        status: "running" as const,
        model: "gpt-4",
        sourceUrl: "https://www.elizacloud.ai/api/v1/milady/agents/test-1",
        cloudAgent: {
          id: "test-1",
          agentName: "Test Agent",
          status: "running",
        },
        cloudClient: {
          listAgents: vi.fn(),
          suspendAgent: vi.fn(),
          resumeAgent: vi.fn(),
          listBackups: vi.fn().mockResolvedValue([]),
          takeSnapshot: vi.fn(),
        },
        cloudAgentId: "test-1",
      },
    ],
    loading: false,
    cloudClient: {
      listAgents: vi.fn(),
      createAgent: vi.fn(),
      deleteAgent: vi.fn(),
    },
    refresh: vi.fn(),
    createAgent: vi.fn(),
    deleteAgent: vi.fn(),
  }),
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

/* ------------------------------------------------------------------ */
/*  Sidebar                                                           */
/* ------------------------------------------------------------------ */
describe("Sidebar", () => {
  it("renders all 6 section buttons", () => {
    const onChange = vi.fn();
    render(<Sidebar active="agents" onChange={onChange} />);

    for (const label of [
      "Agents",
      "Metrics",
      "Logs",
      "Snapshots",
      "Credits",
      "Billing",
    ]) {
      const buttons = screen.getAllByText(
        (_content, el) =>
          !!(el?.textContent?.includes(label) && el?.tagName === "BUTTON"),
      );
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("calls onChange with section id when clicked", () => {
    const onChange = vi.fn();
    render(<Sidebar active="agents" onChange={onChange} />);

    // Click the first "Metrics" button (desktop sidebar)
    const metricsButtons = screen.getAllByText(
      (_content, el) =>
        !!(el?.textContent?.includes("Metrics") && el?.tagName === "BUTTON"),
    );
    fireEvent.click(metricsButtons[0]);
    expect(onChange).toHaveBeenCalledWith("metrics");

    const logsButtons = screen.getAllByText(
      (_content, el) =>
        !!(el?.textContent?.includes("Logs") && el?.tagName === "BUTTON"),
    );
    fireEvent.click(logsButtons[0]);
    expect(onChange).toHaveBeenCalledWith("logs");
  });
});

/* ConnectionModal tests removed — remote connections no longer supported in cloud-only mode */

/* ------------------------------------------------------------------ */
/*  AgentCard                                                         */
/* ------------------------------------------------------------------ */
describe("AgentCard", () => {
  const baseProps = {
    connectionName: "Local",
    onPlay: vi.fn(),
    onResume: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onSelect: vi.fn(),
    selected: false,
  };

  function makeAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
    return {
      agentName: "TestAgent",
      model: "gpt-4",
      state: "running",
      uptime: 3600,
      ...overrides,
    };
  }

  it("renders agent name, model, and state", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent()} />,
    );
    expect(container.textContent).toContain("TestAgent");
    expect(container.textContent).toContain("gpt-4");
    expect(container.textContent).toContain("running");
  });

  it("shows Play button when stopped", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "stopped" })} />,
    );
    expect(screen.getByText("Play")).toBeTruthy();
    expect(screen.queryByText("Resume")).toBeNull();
    expect(screen.queryByText("Pause")).toBeNull();
  });

  it("shows Resume button when paused", () => {
    render(<AgentCard {...baseProps} agent={makeAgent({ state: "paused" })} />);
    expect(screen.getByText("Resume")).toBeTruthy();
    expect(screen.queryByText("Play")).toBeNull();
  });

  it("shows Pause button when running", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "running" })} />,
    );
    expect(screen.getByText("Pause")).toBeTruthy();
    expect(screen.queryByText("Play")).toBeNull();
    expect(screen.queryByText("Resume")).toBeNull();
  });

  it("calls onStop when Stop is clicked", () => {
    const onStop = vi.fn();
    render(
      <AgentCard
        {...baseProps}
        onStop={onStop}
        agent={makeAgent({ state: "running" })}
      />,
    );
    fireEvent.click(screen.getByText("Stop"));
    expect(onStop).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  MetricsPanel                                                      */
/* ------------------------------------------------------------------ */
describe("MetricsPanel", () => {
  it("renders coming soon placeholder", () => {
    const { container } = render(<MetricsPanel />);
    expect(container.textContent).toContain("Metrics coming soon");
  });
});

/* ------------------------------------------------------------------ */
/*  LogsPanel                                                         */
/* ------------------------------------------------------------------ */
describe("LogsPanel", () => {
  it("renders coming soon placeholder", () => {
    const { container } = render(<LogsPanel />);
    expect(container.textContent).toContain("Logs coming soon");
  });
});

/* ------------------------------------------------------------------ */
/*  ExportPanel (rendered with mocked useAgents)                      */
/* ------------------------------------------------------------------ */
describe("ExportPanel", () => {
  it("renders cloud snapshot UI for cloud agent", async () => {
    const { ExportPanel } = await import("../components/dashboard/ExportPanel");
    const { container } = render(<ExportPanel connectionId="cloud-test-1" />);
    const text = container.textContent ?? "";
    // Cloud agents show snapshot controls instead of password export
    expect(text).toContain("Snapshot");
  });
});

/* ------------------------------------------------------------------ */
/*  AgentDetail                                                        */
/* ------------------------------------------------------------------ */
describe("AgentDetail", () => {
  const agent: AgentStatus = {
    agentName: "Detail Agent",
    model: "claude-3",
    state: "running",
    uptime: 7200,
  };

  it("renders Metrics tab by default", () => {
    const { container } = render(
      <AgentDetail agent={agent} connectionId="cloud-test-1" />,
    );
    expect(container.textContent).toContain("Metrics coming soon");
  });

  it("shows agent name in header", () => {
    const { container } = render(
      <AgentDetail agent={agent} connectionId="cloud-test-1" />,
    );
    expect(container.textContent).toContain("Detail Agent");
  });

  it("renders all three tab buttons", () => {
    render(<AgentDetail agent={agent} connectionId="cloud-test-1" />);
    expect(screen.getByText("Metrics")).toBeTruthy();
    expect(screen.getByText("Logs")).toBeTruthy();
    expect(screen.getByText("Snapshots")).toBeTruthy();
  });

  it("switches to Logs tab", () => {
    const { container } = render(
      <AgentDetail agent={agent} connectionId="cloud-test-1" />,
    );
    fireEvent.click(screen.getByText("Logs"));
    expect(container.textContent).toContain("Logs coming soon");
  });

  it("switches to Snapshots tab", () => {
    render(<AgentDetail agent={agent} connectionId="cloud-test-1" />);
    fireEvent.click(screen.getByText("Snapshots"));
    // Snapshots tab renders ExportPanel which shows cloud snapshot controls
    expect(screen.getByText("Take Snapshot")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  AgentCard — regression tests                                       */
/* ------------------------------------------------------------------ */
describe("AgentCard regression", () => {
  const baseProps = {
    connectionName: "Local",
    onPlay: vi.fn(),
    onResume: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onSelect: vi.fn(),
    selected: false,
  };

  function makeAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
    return {
      agentName: "TestAgent",
      model: "gpt-4",
      state: "running",
      uptime: 3600,
      ...overrides,
    };
  }

  it("does not show Stop button when already stopped", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "stopped" })} />,
    );
    expect(screen.queryByText("Stop")).toBeNull();
  });

  it("shows both Pause and Stop for running agent", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "running" })} />,
    );
    expect(screen.getByText("Pause")).toBeTruthy();
    expect(screen.getByText("Stop")).toBeTruthy();
  });

  it("shows Stop button for paused agent", () => {
    render(<AgentCard {...baseProps} agent={makeAgent({ state: "paused" })} />);
    expect(screen.getByText("Stop")).toBeTruthy();
  });

  it("displays uptime formatted correctly (hours and minutes)", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent({ uptime: 3660 })} />,
    );
    // 3660s = 1h 1m
    expect(container.textContent).toContain("1h 1m");
  });

  it("displays uptime as minutes only when less than an hour", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent({ uptime: 300 })} />,
    );
    // 300s = 5m
    expect(container.textContent).toContain("5m");
  });

  it("displays dash when uptime is 0 or undefined", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent({ uptime: 0 })} />,
    );
    expect(container.textContent).toContain("\u2014");
  });

  it("displays memory count when provided", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent({ memories: 42 })} />,
    );
    expect(container.textContent).toContain("42 memories");
  });

  it("hides memory count when undefined", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent()} />,
    );
    expect(container.textContent).not.toContain("memories");
  });

  it("shows connection source label", () => {
    const { container } = render(
      <AgentCard
        {...baseProps}
        connectionName="Cloud-Prod"
        agent={makeAgent()}
      />,
    );
    expect(container.textContent).toContain("Cloud-Prod");
  });

  it("calls onSelect when card is clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <AgentCard {...baseProps} onSelect={onSelect} agent={makeAgent()} />,
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onSelect).toHaveBeenCalled();
  });

  it("calls onPlay when Play button is clicked on stopped agent", () => {
    const onPlay = vi.fn();
    render(
      <AgentCard
        {...baseProps}
        onPlay={onPlay}
        agent={makeAgent({ state: "stopped" })}
      />,
    );
    fireEvent.click(screen.getByText("Play"));
    expect(onPlay).toHaveBeenCalled();
  });

  it("calls onPause when Pause button is clicked on running agent", () => {
    const onPause = vi.fn();
    render(
      <AgentCard
        {...baseProps}
        onPause={onPause}
        agent={makeAgent({ state: "running" })}
      />,
    );
    fireEvent.click(screen.getByText("Pause"));
    expect(onPause).toHaveBeenCalled();
  });

  it("calls onResume when Resume button is clicked on paused agent", () => {
    const onResume = vi.fn();
    render(
      <AgentCard
        {...baseProps}
        onResume={onResume}
        agent={makeAgent({ state: "paused" })}
      />,
    );
    fireEvent.click(screen.getByText("Resume"));
    expect(onResume).toHaveBeenCalled();
  });

  it("applies selected styling when selected is true", () => {
    const { container } = render(
      <AgentCard {...baseProps} selected={true} agent={makeAgent()} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-brand");
  });
});

/* ------------------------------------------------------------------ */
/*  AuthGate                                                           */
/* ------------------------------------------------------------------ */
describe("AuthGate", () => {
  it("renders children when authenticated", async () => {
    localStorage.setItem("milady-cloud-token", "test-key");
    let result: ReturnType<typeof render>;
    await act(async () => {
      const { AuthGate } = await import("../components/dashboard/AuthGate");
      result = render(
        <AuthGate>
          <div>Dashboard Content</div>
        </AuthGate>,
      );
    });
    expect(result?.getByText("Dashboard Content")).toBeTruthy();
  });

  it("shows login UI when not authenticated (no skip option)", async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      const { AuthGate } = await import("../components/dashboard/AuthGate");
      result = render(
        <AuthGate>
          <div>Dashboard Content</div>
        </AuthGate>,
      );
    });
    expect(result?.getByText("Login with Eliza Cloud")).toBeTruthy();
    // Cloud-only mode: no skip button
    expect(result?.queryByText("Skip (local only)")).toBeNull();
  });

  it("shows Eliza Cloud heading in login view", async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      const { AuthGate } = await import("../components/dashboard/AuthGate");
      result = render(
        <AuthGate>
          <div>child</div>
        </AuthGate>,
      );
    });
    expect(result?.getByText("Eliza Cloud")).toBeTruthy();
  });
});
