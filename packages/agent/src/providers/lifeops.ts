import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { checkSenderRole } from "@miladyai/plugin-roles";
import { LifeOpsService } from "../lifeops/service.js";

function formatCount(label: string, count: number): string {
  return `${label}: ${count}`;
}

function summarizeOccurrences(
  title: string,
  occurrences: Array<{ title: string; state: string }>,
): string[] {
  if (occurrences.length === 0) {
    return [];
  }
  return [
    title,
    ...occurrences.slice(0, 3).map((occurrence) => `- ${occurrence.title} (${occurrence.state})`),
  ];
}

async function hasLifeOpsAccess(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<boolean> {
  if (message.entityId === runtime.agentId) {
    return true;
  }
  const role = await checkSenderRole(runtime, message);
  return Boolean(role?.isAdmin);
}

export const lifeOpsProvider: Provider = {
  name: "lifeops",
  description:
    "Owner/admin and agent only. Provides the current LifeOps overview and explains how to use MANAGE_LIFEOPS for conversational capture, editing, completion, snoozing, and goal review.",
  dynamic: true,
  position: 12,
  async get(
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const source = (message.content as Record<string, unknown> | undefined)?.source;
    if (
      source !== "client_chat" &&
      message.entityId !== runtime.agentId
    ) {
      return { text: "", values: {}, data: {} };
    }
    if (!(await hasLifeOpsAccess(runtime, message))) {
      return { text: "", values: {}, data: {} };
    }

    const overview = await new LifeOpsService(runtime).getOverview();
    const ownerLines = summarizeOccurrences("Owner active items:", overview.owner.occurrences);
    const agentLines = summarizeOccurrences("Agent ops:", overview.agentOps.occurrences);

    return {
      text: [
        "## Life Ops",
        "Use MANAGE_LIFEOPS whenever the user wants to create or edit reminders, routines, recurring tasks, goals, or goal reviews.",
        "Owner life-ops are private to the owner/admin and the agent. Agent ops are internal and should stay separated unless explicitly requested.",
        formatCount("Owner open occurrences", overview.owner.summary.activeOccurrenceCount),
        formatCount("Owner active goals", overview.owner.summary.activeGoalCount),
        formatCount("Owner live reminders", overview.owner.summary.activeReminderCount),
        ...ownerLines,
        formatCount("Agent open occurrences", overview.agentOps.summary.activeOccurrenceCount),
        formatCount("Agent active goals", overview.agentOps.summary.activeGoalCount),
        ...agentLines,
      ].join("\n"),
      values: {
        ownerOpenOccurrences: overview.owner.summary.activeOccurrenceCount,
        ownerActiveGoals: overview.owner.summary.activeGoalCount,
        agentOpenOccurrences: overview.agentOps.summary.activeOccurrenceCount,
        agentActiveGoals: overview.agentOps.summary.activeGoalCount,
      },
      data: {
        overview,
      },
    };
  },
};
