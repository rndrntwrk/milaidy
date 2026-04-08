import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { AgentRuntime, Content } from "@elizaos/core";
import type { Trajectory } from "../types/trajectory";
import type { RoleplayEpisode } from "./roleplay-trajectories";
import {
  buildRoleplayExecutionReport,
  executeRoleplayEpisode,
  exportRoleplayExecutionResults,
} from "./roleplay-executor";

const GROUP_CHANNEL = "GROUP";

function createRuntimeWithTrajectory(trajectory: Trajectory): AgentRuntime {
  const logger = {
    getTrajectoryDetail: vi.fn(async () => trajectory),
  };

  return {
    agentId: "00000000-0000-0000-0000-000000000111",
    character: {
      name: "Nova",
    },
    createMemory: vi.fn(async () => undefined),
    ensureConnection: vi.fn(async () => undefined),
    getActionResults: vi.fn(() => [{ actionName: "SWAP_TOKEN" }]),
    getServicesByType: vi.fn(() => [logger]),
    getService: vi.fn(() => logger),
    messageService: {
      handleMessage: vi.fn(
        async (
          _runtime: AgentRuntime,
          _message: unknown,
          callback?: (content: Content) => Promise<unknown>,
        ) => {
          await callback?.({
            text: "Swapping now.",
            actions: ["SWAP_TOKEN"],
            source: "discord",
            channelType: GROUP_CHANNEL,
          });

          return {
            didRespond: true,
            responseContent: {
              text: "Swapping now.",
              actions: ["SWAP_TOKEN"],
              source: "discord",
              channelType: GROUP_CHANNEL,
            },
            responseMessages: [],
            state: { values: {}, data: {} },
            mode: "actions",
          };
        },
      ),
    },
  } as unknown as AgentRuntime;
}

const episode: RoleplayEpisode = {
  id: "episode-1",
  blueprintId: "respond-wallet-swap-001",
  agentName: "Nova",
  platform: "discord",
  roomType: "group",
  primaryContext: "wallet",
  secondaryContexts: ["automation"],
  expectedDecision: "RESPOND",
  expectedAction: "SWAP_TOKEN",
  evaluationTurnId: "turn-002",
  turns: [
    {
      id: "turn-001",
      role: "participant",
      speaker: "Alice",
      content: "ETH is pumping again.",
      isEvaluationTarget: false,
    },
    {
      id: "turn-002",
      role: "participant",
      speaker: "Bob",
      content: "Nova swap half to USDC.",
      isEvaluationTarget: true,
    },
  ],
  metadata: {
    pattern: "group_direct_mention",
    generatedBy: "test",
    generatedAt: new Date(0).toISOString(),
    sourceSampleId: "sample-1",
  },
};

const trajectory: Trajectory = {
  trajectoryId: "00000000-0000-0000-0000-000000000222",
  agentId: "00000000-0000-0000-0000-000000000111",
  startTime: Date.now(),
  steps: [
    {
      timestamp: Date.now(),
      llmCalls: [
        {
          purpose: "should_respond",
          systemPrompt:
            "available_contexts:\nwallet, automation\ncontext_routing:\n- primaryContext: wallet\n- secondaryContexts: automation\n- evidenceTurnIds: turn-002\ndecision_note:",
          userPrompt:
            "conversation:\n[turn-001] Alice: ETH is pumping again.\n[turn-002] Bob: Nova swap half to USDC.",
          response:
            "name: Nova\nreasoning: Direct wallet request.\naction: RESPOND\nprimaryContext: wallet\nsecondaryContexts: automation\nevidenceTurnIds: turn-002",
        },
      ],
    },
  ],
};

describe("roleplay executor", () => {
  test("replays an episode against a runtime and scores decision/context/action agreement", async () => {
    const runtime = createRuntimeWithTrajectory(trajectory);
    const execution = await executeRoleplayEpisode(episode, {
      runtime,
    });

    expect(execution.actualDecision).toBe("RESPOND");
    expect(execution.actualPrimaryContext).toBe("wallet");
    expect(execution.actualActions).toContain("SWAP_TOKEN");
    expect(execution.decisionMatch).toBe(true);
    expect(execution.primaryContextMatch).toBe(true);
    expect(execution.actionMatch).toBe(true);

    const report = buildRoleplayExecutionReport([execution]);
    expect(report.decisionAccuracy).toBe(1);
    expect(report.actionAccuracy).toBe(1);
  });

  test("exports execution results plus per-task trajectory corpora", async () => {
    const runtime = createRuntimeWithTrajectory(trajectory);
    const execution = await executeRoleplayEpisode(episode, {
      runtime,
    });
    const outputDir = await mkdtemp(join(tmpdir(), "roleplay-execution-"));
    const exported = await exportRoleplayExecutionResults([execution], outputDir);

    const reportRaw = await readFile(exported.reportPath, "utf-8");
    const plannerRaw = exported.trajectoryDataset
      ? await readFile(exported.trajectoryDataset.paths.shouldRespondPath, "utf-8")
      : "";

    expect(reportRaw).toContain("\"decisionAccuracy\": 1");
    expect(plannerRaw).toContain("\"role\":\"model\"");
  });
});
