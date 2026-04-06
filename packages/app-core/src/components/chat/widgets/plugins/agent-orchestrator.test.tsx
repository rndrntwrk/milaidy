import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { mockClient, mockUseApp } = vi.hoisted(() => ({
  mockClient: {
    listCodingAgentTaskThreads: vi.fn(),
    getCodingAgentTaskThread: vi.fn(),
    archiveCodingAgentTaskThread: vi.fn(),
    reopenCodingAgentTaskThread: vi.fn(),
  },
  mockUseApp: vi.fn(),
}));

vi.mock("../../../../api", () => ({
  client: mockClient,
}));

vi.mock("../../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Badge: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}));

vi.mock("lucide-react", () => ({
  Activity: (props: React.SVGProps<SVGSVGElement>) => (
    <svg aria-hidden="true" {...props} />
  ),
}));

import { AGENT_ORCHESTRATOR_PLUGIN_WIDGETS } from "./agent-orchestrator";

const TasksWidget = AGENT_ORCHESTRATOR_PLUGIN_WIDGETS.find(
  (widget) => widget.id === "agent-orchestrator.tasks",
)!.Component;

function createThread() {
  return {
    id: "thread-1",
    title: "Task Alpha",
    kind: "coding",
    status: "active" as const,
    originalRequest: "Implement durable task persistence",
    summary: "Validation in progress",
    sessionCount: 1,
    activeSessionCount: 1,
    latestSessionId: "session-1",
    latestSessionLabel: "alpha-agent",
    latestWorkdir: "/workspace/project",
    latestRepo: "https://github.com/example/project",
    latestActivityAt: Date.now(),
    decisionCount: 3,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:10.000Z",
    closedAt: null,
    archivedAt: null,
  };
}

function createThreadDetail() {
  return {
    ...createThread(),
    acceptanceCriteria: [
      "Persist task state to the database",
      "Record validation artifacts",
    ],
    sessions: [
      {
        id: "session-row-1",
        threadId: "thread-1",
        sessionId: "session-1",
        framework: "codex",
        providerSource: "subscription",
        label: "alpha-agent",
        originalTask: "Implement durable task persistence",
        workdir: "/workspace/project",
        repo: "https://github.com/example/project",
        status: "active",
        decisionCount: 3,
        autoResolvedCount: 1,
        registeredAt: Date.now(),
        lastActivityAt: Date.now(),
        idleCheckCount: 0,
        taskDelivered: true,
        completionSummary: null,
        lastSeenDecisionIndex: 3,
        lastInputSentAt: null,
        stoppedAt: null,
        metadata: {},
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    decisions: [
      {
        id: "decision-1",
        threadId: "thread-1",
        sessionId: "session-1",
        event: "turn_complete",
        promptText: "done",
        decision: "complete",
        response: null,
        reasoning: "Implementation and tests are complete.",
        timestamp: Date.now(),
        createdAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    events: [
      {
        id: "event-1",
        threadId: "thread-1",
        sessionId: "session-1",
        eventType: "validation_passed",
        timestamp: Date.now(),
        summary: "Validation passed",
        data: {},
        createdAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    artifacts: [
      {
        id: "artifact-1",
        threadId: "thread-1",
        sessionId: "session-1",
        artifactType: "validation_report",
        title: "Validation report",
        path: "/tmp/validation-report.json",
        uri: null,
        mimeType: "application/json",
        metadata: {},
        createdAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    transcripts: [
      {
        id: "transcript-1",
        threadId: "thread-1",
        sessionId: "session-1",
        timestamp: Date.now(),
        direction: "stdout" as const,
        content: "Verification complete.",
        metadata: {},
        createdAt: "2026-04-06T00:00:10.000Z",
      },
    ],
  };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && textOf(node) === label,
  );
  if (!matches[0]) {
    throw new Error(`Button "${label}" not found`);
  }
  return matches[0];
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  attempts = 20,
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(message);
}

describe("agent orchestrator tasks widget", () => {
  let tree: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    mockClient.listCodingAgentTaskThreads.mockReset();
    mockClient.getCodingAgentTaskThread.mockReset();
    mockClient.archiveCodingAgentTaskThread.mockReset();
    mockClient.reopenCodingAgentTaskThread.mockReset();
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      ptySessions: [],
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
  });

  afterEach(() => {
    if (tree) {
      act(() => {
        tree?.unmount();
      });
    }
    tree = null;
  });

  it("loads persisted task threads and archives the selected thread", async () => {
    const openThread = createThread();
    const archivedThread = {
      ...createThread(),
      status: "archived" as const,
      archivedAt: "2026-04-06T00:01:00.000Z",
    };
    mockClient.listCodingAgentTaskThreads.mockImplementation(
      async (options?: { includeArchived?: boolean }) =>
        options?.includeArchived ? [archivedThread] : [openThread],
    );
    mockClient.getCodingAgentTaskThread.mockResolvedValue(createThreadDetail());
    mockClient.archiveCodingAgentTaskThread.mockResolvedValue(true);

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(tree!.root).includes("Validation report"),
      "expected persisted task detail to render",
    );

    expect(textOf(tree!.root)).toContain("Task Alpha");
    expect(textOf(tree!.root)).toContain("Persist task state to the database");

    await act(async () => {
      findButtonByText(tree!.root, "Archive").props.onClick();
    });

    await waitFor(
      () => mockClient.archiveCodingAgentTaskThread.mock.calls.length === 1,
      "expected archive request to be sent",
    );
    expect(mockClient.archiveCodingAgentTaskThread).toHaveBeenCalledWith(
      "thread-1",
    );
    expect(mockClient.listCodingAgentTaskThreads).toHaveBeenLastCalledWith({
      includeArchived: true,
      search: undefined,
      limit: 30,
    });
  });

  it("falls back to live PTY sessions when no persisted threads exist", async () => {
    mockUseApp.mockReturnValue({
      ptySessions: [
        {
          sessionId: "session-live-1",
          agentType: "codex",
          label: "Live Agent",
          originalTask: "Run the end-to-end verification",
          workdir: "/workspace/live",
          status: "active",
          decisionCount: 0,
          autoResolvedCount: 0,
          toolDescription: "",
          lastActivity: "Running tests",
        },
      ],
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
    mockClient.listCodingAgentTaskThreads.mockResolvedValue([]);

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(tree!.root).includes("Live Agent"),
      "expected live session fallback to render",
    );

    expect(textOf(tree!.root)).toContain("Run the end-to-end verification");
  });
});
