import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentRuntime,
  ChannelType,
  Content,
  Memory,
  UUID,
} from "@elizaos/core";
import type { Trajectory } from "../types/trajectory.js";
import type {
  RoleplayEpisode,
  RoleplayManifestLine,
  RoleplayTurn,
} from "./roleplay-trajectories.js";
import {
  exportTrajectoryTaskDatasets,
  type TrajectoryTaskDatasetExport,
} from "./trajectory-task-datasets.js";

export interface RoleplayTurnExecution {
  turnId: string;
  speaker: string;
  role: RoleplayTurn["role"];
  isEvaluationTarget: boolean;
  actualDecision?: "RESPOND" | "IGNORE" | "STOP";
  actualPrimaryContext?: string;
  actualSecondaryContexts: string[];
  selectedActions: string[];
  executedActions: string[];
  responseText: string;
  callbackTexts: string[];
  trajectoryId?: string;
  warnings: string[];
}

export interface RoleplayEpisodeExecution {
  episodeId: string;
  blueprintId: string;
  agentName: string;
  evaluationTurnId: string;
  expectedDecision: "RESPOND" | "IGNORE" | "STOP";
  actualDecision: "RESPOND" | "IGNORE" | "STOP";
  expectedPrimaryContext: string;
  actualPrimaryContext?: string;
  expectedSecondaryContexts: string[];
  actualSecondaryContexts: string[];
  expectedAction?: string;
  actualActions: string[];
  decisionMatch: boolean;
  primaryContextMatch: boolean;
  secondaryContextExactMatch: boolean;
  actionMatch: boolean;
  trajectoryCaptured: boolean;
  responseText: string;
  callbackTexts: string[];
  warnings: string[];
  turnExecutions: RoleplayTurnExecution[];
  trajectory?: Trajectory | null;
}

export interface RoleplayExecutionReport {
  totalEpisodes: number;
  decisionMatches: number;
  primaryContextMatches: number;
  secondaryContextExactMatches: number;
  actionMatches: number;
  trajectoryCaptured: number;
  decisionAccuracy: number;
  primaryContextAccuracy: number;
  secondaryContextExactAccuracy: number;
  actionAccuracy: number;
  trajectoryCaptureRate: number;
  mismatches: Array<{
    episodeId: string;
    expectedDecision: string;
    actualDecision: string;
    expectedPrimaryContext: string;
    actualPrimaryContext?: string;
    expectedAction?: string;
    actualActions: string[];
  }>;
}

export interface RoleplayExecutionExportPaths {
  executionsPath: string;
  reportPath: string;
  trajectoryDataset?: TrajectoryTaskDatasetExport;
}

export interface ExecuteRoleplayOptions {
  runtime?: AgentRuntime;
  timeoutMs?: number;
  executeAllParticipantTurns?: boolean;
  outputDir?: string;
}

type RuntimeLike = AgentRuntime & {
  ensureConnection?: (params: {
    entityId: UUID;
    roomId: UUID;
    worldId: UUID;
    userName: string;
    source: string;
    channelId: string;
    type: ChannelType;
    messageServerId: UUID;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  createMemory: (memory: Memory, tableName?: string) => Promise<unknown>;
  messageService: NonNullable<AgentRuntime["messageService"]>;
  getActionResults: (messageId: UUID) => Array<{ actionName?: string } | string>;
  getServicesByType?: (serviceType: string) => unknown;
  getService?: (serviceType: string) => unknown;
};

const GROUP_CHANNEL = "GROUP" as ChannelType;

function deterministicUuid(seed: string): UUID {
  const hex = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-") as UUID;
}

type TrajectoryLoggerLike = {
  getTrajectoryDetail?: (trajectoryId: string) => Promise<Trajectory | null>;
};

function parseDelimitedList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index);
}

function readTag(response: string, tagName: string): string | undefined {
  const xmlMatch = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(
    response,
  );
  if (xmlMatch?.[1]) {
    const value = xmlMatch[1].trim();
    return value.length > 0 ? value : undefined;
  }

  const lineMatch = new RegExp(`(^|\\n)${tagName}:\\s*([^\\n]+)`, "i").exec(response);
  if (lineMatch?.[2]) {
    const value = lineMatch[2].trim();
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}

function parseRoutingDecision(response: string): {
  decision?: "RESPOND" | "IGNORE" | "STOP";
  primaryContext?: string;
  secondaryContexts: string[];
} {
  const decision = readTag(response, "action")?.toUpperCase();
  const primaryContext = readTag(response, "primaryContext");
  const secondaryContexts = parseDelimitedList(
    readTag(response, "secondaryContexts") ?? "",
  );

  return {
    decision:
      decision === "RESPOND" || decision === "IGNORE" || decision === "STOP"
        ? decision
        : undefined,
    primaryContext,
    secondaryContexts,
  };
}

function collectRuntimeCandidates(runtime: RuntimeLike): unknown[] {
  const candidates: unknown[] = [];
  const seen = new Set<unknown>();

  const push = (candidate: unknown): void => {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    candidates.push(candidate);
  };

  if (typeof runtime.getServicesByType === "function") {
    const value = runtime.getServicesByType("trajectory_logger");
    if (Array.isArray(value)) {
      for (const entry of value) {
        push(entry);
      }
    } else {
      push(value);
    }
  }

  if (typeof runtime.getService === "function") {
    push(runtime.getService("trajectory_logger"));
  }

  return candidates;
}

function getTrajectoryLogger(runtime: RuntimeLike): TrajectoryLoggerLike | null {
  for (const candidate of collectRuntimeCandidates(runtime)) {
    if (
      candidate &&
      typeof candidate === "object" &&
      typeof (candidate as TrajectoryLoggerLike).getTrajectoryDetail === "function"
    ) {
      return candidate as TrajectoryLoggerLike;
    }
  }

  return null;
}

async function waitForTrajectoryDetail(
  logger: TrajectoryLoggerLike | null,
  trajectoryId: string,
): Promise<Trajectory | null> {
  if (!logger?.getTrajectoryDetail) {
    return null;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const detail = await logger.getTrajectoryDetail(trajectoryId);
    if (detail) {
      return detail;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

function normalizeActionName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
}

function collectActionNamesFromContent(content: Content | null | undefined): string[] {
  if (!content?.actions) {
    return [];
  }

  return content.actions
    .map((action) => normalizeActionName(action))
    .filter((action, index, actions) => action.length > 0 && actions.indexOf(action) === index);
}

function collectExecutedActionNames(
  runtime: RuntimeLike,
  messageId: UUID,
): string[] {
  return runtime
    .getActionResults(messageId)
    .map((result) => {
      if (typeof result === "string") {
        return result;
      }

      const record =
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : null;
      if (!record) {
        return "";
      }

      if (typeof record.actionName === "string") {
        return record.actionName;
      }

      const data =
        record.data && typeof record.data === "object"
          ? (record.data as Record<string, unknown>)
          : null;
      return typeof data?.actionName === "string" ? data.actionName : "";
    })
    .map((action) => normalizeActionName(action))
    .filter((action, index, actions) => action.length > 0 && actions.indexOf(action) === index);
}

function resolveActualDecision(args: {
  didRespond: boolean;
  callbackContents: Content[];
  responseContent: Content | null;
  shouldRespondDecision?: "RESPOND" | "IGNORE" | "STOP";
}): "RESPOND" | "IGNORE" | "STOP" {
  const callbackActions = args.callbackContents.flatMap((content) =>
    collectActionNamesFromContent(content),
  );
  if (callbackActions.includes("STOP")) {
    return "STOP";
  }
  if (callbackActions.includes("IGNORE")) {
    return "IGNORE";
  }

  const responseActions = collectActionNamesFromContent(args.responseContent);
  if (responseActions.includes("STOP")) {
    return "STOP";
  }
  if (responseActions.includes("IGNORE") && !args.didRespond) {
    return "IGNORE";
  }

  if (args.shouldRespondDecision) {
    return args.shouldRespondDecision;
  }

  return args.didRespond ? "RESPOND" : "IGNORE";
}

function secondaryContextsEqual(expected: string[], actual: string[]): boolean {
  const normalizedExpected = [...new Set(expected.map((value) => value.trim().toLowerCase()))]
    .filter(Boolean)
    .sort();
  const normalizedActual = [...new Set(actual.map((value) => value.trim().toLowerCase()))]
    .filter(Boolean)
    .sort();

  return JSON.stringify(normalizedExpected) === JSON.stringify(normalizedActual);
}

function resolveMessageRoutingFallback(message: Memory): {
  primaryContext?: string;
  secondaryContexts: string[];
} {
  const metadata =
    message.content?.metadata &&
    typeof message.content.metadata === "object"
      ? (message.content.metadata as Record<string, unknown>)
      : {};
  const responseContext =
    metadata.__responseContext &&
    typeof metadata.__responseContext === "object"
      ? (metadata.__responseContext as Record<string, unknown>)
      : {};

  const secondaryContexts = Array.isArray(responseContext.secondaryContexts)
    ? responseContext.secondaryContexts
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : parseDelimitedList(String(responseContext.secondaryContexts ?? ""));

  return {
    primaryContext:
      typeof responseContext.primaryContext === "string"
        ? responseContext.primaryContext
        : undefined,
    secondaryContexts,
  };
}

function buildParticipantId(episodeId: string, speaker: string): UUID {
  return deterministicUuid(`roleplay-${episodeId}-${speaker.toLowerCase()}`);
}

function buildRoomIds(episodeId: string): {
  roomId: UUID;
  worldId: UUID;
  messageServerId: UUID;
} {
  return {
    roomId: deterministicUuid(`roleplay-room-${episodeId}`),
    worldId: deterministicUuid(`roleplay-world-${episodeId}`),
    messageServerId: deterministicUuid(`roleplay-server-${episodeId}`),
  };
}

async function seedTurnMemory(
  runtime: RuntimeLike,
  episode: RoleplayEpisode,
  turn: RoleplayTurn,
  roomIds: ReturnType<typeof buildRoomIds>,
): Promise<void> {
  const entityId =
    turn.role === "assistant"
      ? runtime.agentId
      : buildParticipantId(episode.id, turn.speaker);

  await runtime.createMemory(
    {
      id: deterministicUuid(`roleplay-seed-${episode.id}-${turn.id}`),
      entityId,
      agentId: runtime.agentId,
      roomId: roomIds.roomId,
      createdAt: Date.now(),
      content: {
        text: turn.content,
        source: episode.platform,
        channelType: GROUP_CHANNEL,
        metadata: {
          entityName: turn.speaker,
        },
      },
    },
    "messages",
  );
}

async function ensureRoleplayConnections(
  runtime: RuntimeLike,
  episode: RoleplayEpisode,
  roomIds: ReturnType<typeof buildRoomIds>,
): Promise<void> {
  if (typeof runtime.ensureConnection !== "function") {
    return;
  }

  const participants = [
    ...new Set(
      episode.turns
        .filter((turn) => turn.role === "participant")
        .map((turn) => turn.speaker),
    ),
  ];

  for (const speaker of participants) {
    const entityId = buildParticipantId(episode.id, speaker);
    await runtime.ensureConnection({
      entityId,
      roomId: roomIds.roomId,
      worldId: roomIds.worldId,
      userName: speaker,
      source: episode.platform,
      channelId: `roleplay-${episode.id}`,
      type: GROUP_CHANNEL,
      messageServerId: roomIds.messageServerId,
      metadata: {
        ownership: {
          ownerId: entityId,
        },
      },
    });
  }
}

async function resolveRuntime(runtime?: AgentRuntime): Promise<RuntimeLike> {
  if (runtime) {
    return runtime as RuntimeLike;
  }

  const { bootElizaRuntime } = await import("../runtime/eliza.js");
  return (await bootElizaRuntime()) as RuntimeLike;
}

export async function executeRoleplayEpisode(
  episode: RoleplayEpisode,
  options: ExecuteRoleplayOptions = {},
): Promise<RoleplayEpisodeExecution> {
  const runtime = await resolveRuntime(options.runtime);
  const roomIds = buildRoomIds(episode.id);
  const logger = getTrajectoryLogger(runtime);
  const turnExecutions: RoleplayTurnExecution[] = [];

  await ensureRoleplayConnections(runtime, episode, roomIds);

  for (const turn of episode.turns) {
    if (turn.role === "assistant") {
      await seedTurnMemory(runtime, episode, turn, roomIds);
      turnExecutions.push({
        turnId: turn.id,
        speaker: turn.speaker,
        role: turn.role,
        isEvaluationTarget: turn.isEvaluationTarget,
        actualSecondaryContexts: [],
        selectedActions: [],
        executedActions: [],
        responseText: turn.content,
        callbackTexts: [],
        warnings: [],
      });
      continue;
    }

    if (!turn.isEvaluationTarget && !options.executeAllParticipantTurns) {
      await seedTurnMemory(runtime, episode, turn, roomIds);
      turnExecutions.push({
        turnId: turn.id,
        speaker: turn.speaker,
        role: turn.role,
        isEvaluationTarget: false,
        actualSecondaryContexts: [],
        selectedActions: [],
        executedActions: [],
        responseText: "",
        callbackTexts: [],
        warnings: [],
      });
      continue;
    }

    const trajectoryId = deterministicUuid(`roleplay-trajectory-${episode.id}-${turn.id}`);
    const message: Memory = {
      id: deterministicUuid(`roleplay-message-${episode.id}-${turn.id}`),
      entityId: buildParticipantId(episode.id, turn.speaker),
      roomId: roomIds.roomId,
      agentId: runtime.agentId,
      createdAt: Date.now(),
      content: {
        text: turn.content,
        source: episode.platform,
        channelType: GROUP_CHANNEL,
        metadata: {
          entityName: turn.speaker,
          type: "message",
          trajectoryStepId: trajectoryId,
        },
      },
    };

    const callbackContents: Content[] = [];
    const result = await runtime.messageService.handleMessage(
      runtime,
      message,
      async (content) => {
        callbackContents.push(content);
        return [];
      },
      options.timeoutMs ? { timeoutDuration: options.timeoutMs } : undefined,
    );

    const trajectory = await waitForTrajectoryDetail(logger, trajectoryId);
    const shouldRespondCall = trajectory?.steps
      ?.flatMap((step) => step.llmCalls ?? [])
      .find((call) => normalizeActionName(call.purpose) === "SHOULD_RESPOND");
    const routingFromModel = shouldRespondCall?.response
      ? parseRoutingDecision(shouldRespondCall.response)
      : { secondaryContexts: [] as string[] };
    const routingFallback = resolveMessageRoutingFallback(message);

    const actualDecision = resolveActualDecision({
      didRespond: result.didRespond,
      callbackContents,
      responseContent: result.responseContent ?? null,
      shouldRespondDecision: routingFromModel.decision,
    });
    const actualPrimaryContext =
      routingFromModel.primaryContext ?? routingFallback.primaryContext;
    const actualSecondaryContexts =
      routingFromModel.secondaryContexts.length > 0
        ? routingFromModel.secondaryContexts
        : routingFallback.secondaryContexts;
    const selectedActions = [
      ...new Set([
        ...collectActionNamesFromContent(result.responseContent ?? null),
        ...callbackContents.flatMap((content) => collectActionNamesFromContent(content)),
      ]),
    ];
    if (!message.id) {
      throw new Error(`Roleplay message ${turn.id} is missing an ID`);
    }
    const executedActions = collectExecutedActionNames(runtime, message.id);
    const callbackTexts = callbackContents
      .map((content) => content.text?.trim() ?? "")
      .filter((text) => text.length > 0);
    const responseText =
      result.responseContent?.text?.trim() ??
      callbackTexts[callbackTexts.length - 1] ??
      "";
    const warnings: string[] = [];

    if (!trajectory) {
      warnings.push("trajectory_capture_missing");
    }
    if (turn.isEvaluationTarget && !routingFromModel.primaryContext && !routingFallback.primaryContext) {
      warnings.push("context_routing_missing");
    }

    turnExecutions.push({
      turnId: turn.id,
      speaker: turn.speaker,
      role: turn.role,
      isEvaluationTarget: turn.isEvaluationTarget,
      actualDecision,
      actualPrimaryContext,
      actualSecondaryContexts,
      selectedActions,
      executedActions,
      responseText,
      callbackTexts,
      trajectoryId,
      warnings,
    });
  }

  const evaluationTurn = turnExecutions.find((turn) => turn.isEvaluationTarget);
  if (!evaluationTurn) {
    throw new Error(`Roleplay episode ${episode.id} has no evaluation target turn`);
  }

  const actualActions = [...new Set([...evaluationTurn.selectedActions, ...evaluationTurn.executedActions])];
  const decisionMatch = evaluationTurn.actualDecision === episode.expectedDecision;
  const primaryContextMatch =
    (evaluationTurn.actualPrimaryContext ?? "").toLowerCase() ===
    episode.primaryContext.toLowerCase();
  const secondaryContextExactMatch = secondaryContextsEqual(
    episode.secondaryContexts,
    evaluationTurn.actualSecondaryContexts,
  );
  const actionMatch = episode.expectedAction
    ? actualActions.includes(normalizeActionName(episode.expectedAction))
    : true;
  const trajectory =
    evaluationTurn.trajectoryId && logger
      ? await waitForTrajectoryDetail(logger, evaluationTurn.trajectoryId)
      : null;

  return {
    episodeId: episode.id,
    blueprintId: episode.blueprintId,
    agentName: episode.agentName,
    evaluationTurnId: episode.evaluationTurnId,
    expectedDecision: episode.expectedDecision,
    actualDecision: evaluationTurn.actualDecision ?? "IGNORE",
    expectedPrimaryContext: episode.primaryContext,
    actualPrimaryContext: evaluationTurn.actualPrimaryContext,
    expectedSecondaryContexts: episode.secondaryContexts,
    actualSecondaryContexts: evaluationTurn.actualSecondaryContexts,
    expectedAction: episode.expectedAction,
    actualActions,
    decisionMatch,
    primaryContextMatch,
    secondaryContextExactMatch,
    actionMatch,
    trajectoryCaptured: Boolean(trajectory),
    responseText: evaluationTurn.responseText,
    callbackTexts: evaluationTurn.callbackTexts,
    warnings: evaluationTurn.warnings,
    turnExecutions,
    trajectory,
  };
}

export async function executeRoleplayEpisodes(
  episodes: RoleplayEpisode[],
  options: ExecuteRoleplayOptions = {},
): Promise<RoleplayEpisodeExecution[]> {
  const runtime = await resolveRuntime(options.runtime);
  const executions: RoleplayEpisodeExecution[] = [];

  for (const episode of episodes) {
    executions.push(
      await executeRoleplayEpisode(episode, {
        ...options,
        runtime,
      }),
    );
  }

  return executions;
}

export function buildRoleplayExecutionReport(
  executions: RoleplayEpisodeExecution[],
): RoleplayExecutionReport {
  const totalEpisodes = executions.length;
  const decisionMatches = executions.filter((execution) => execution.decisionMatch).length;
  const primaryContextMatches = executions.filter(
    (execution) => execution.primaryContextMatch,
  ).length;
  const secondaryContextExactMatches = executions.filter(
    (execution) => execution.secondaryContextExactMatch,
  ).length;
  const actionRelevantExecutions = executions.filter(
    (execution) => execution.expectedAction,
  );
  const actionMatches = actionRelevantExecutions.filter(
    (execution) => execution.actionMatch,
  ).length;
  const trajectoryCaptured = executions.filter(
    (execution) => execution.trajectoryCaptured,
  ).length;

  return {
    totalEpisodes,
    decisionMatches,
    primaryContextMatches,
    secondaryContextExactMatches,
    actionMatches,
    trajectoryCaptured,
    decisionAccuracy: decisionMatches / (totalEpisodes || 1),
    primaryContextAccuracy: primaryContextMatches / (totalEpisodes || 1),
    secondaryContextExactAccuracy:
      secondaryContextExactMatches / (totalEpisodes || 1),
    actionAccuracy: actionMatches / (actionRelevantExecutions.length || 1),
    trajectoryCaptureRate: trajectoryCaptured / (totalEpisodes || 1),
    mismatches: executions
      .filter(
        (execution) =>
          !execution.decisionMatch ||
          !execution.primaryContextMatch ||
          !execution.secondaryContextExactMatch ||
          !execution.actionMatch,
      )
      .map((execution) => ({
        episodeId: execution.episodeId,
        expectedDecision: execution.expectedDecision,
        actualDecision: execution.actualDecision,
        expectedPrimaryContext: execution.expectedPrimaryContext,
        actualPrimaryContext: execution.actualPrimaryContext,
        expectedAction: execution.expectedAction,
        actualActions: execution.actualActions,
      })),
  };
}

export async function exportRoleplayExecutionResults(
  executions: RoleplayEpisodeExecution[],
  outputDir: string,
): Promise<RoleplayExecutionExportPaths> {
  await mkdir(outputDir, { recursive: true });

  const executionsPath = join(outputDir, "roleplay_execution_results.json");
  const reportPath = join(outputDir, "roleplay_execution_report.json");
  const trajectories = executions
    .map((execution) => execution.trajectory)
    .filter((trajectory): trajectory is Trajectory => Boolean(trajectory));

  await writeFile(executionsPath, JSON.stringify(executions, null, 2));
  await writeFile(
    reportPath,
    JSON.stringify(buildRoleplayExecutionReport(executions), null, 2),
  );

  const trajectoryDataset =
    trajectories.length > 0
      ? await exportTrajectoryTaskDatasets(
          trajectories,
          join(outputDir, "trajectory-datasets"),
        )
      : undefined;

  return {
    executionsPath,
    reportPath,
    trajectoryDataset,
  };
}

export async function loadRoleplayEpisodesFromPath(
  inputPath: string,
): Promise<RoleplayEpisode[]> {
  const raw = await readFile(inputPath, "utf-8");

  if (inputPath.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RoleplayManifestLine)
      .map((line) => ({
        id: line.episodeId,
        blueprintId: line.blueprintId,
        agentName: line.agentName,
        platform: "group-chat",
        roomType: "group" as const,
        primaryContext: line.primaryContext,
        secondaryContexts: line.secondaryContexts,
        expectedDecision: line.expectedDecision,
        expectedAction: line.expectedAction,
        evaluationTurnId: line.evaluationTurnId,
        turns: line.conversation.map((turn) => ({
          id: turn.id,
          role: turn.role,
          speaker: turn.speaker,
          content: turn.content,
          isEvaluationTarget: turn.id === line.evaluationTurnId,
        })),
        metadata: {
          pattern: "manifest-import",
          generatedBy: "manifest",
          generatedAt: new Date().toISOString(),
          sourceSampleId: line.episodeId,
        },
      }));
  }

  const parsed = JSON.parse(raw) as RoleplayEpisode[];
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of roleplay episodes in ${inputPath}`);
  }
  return parsed;
}
