/**
 * Coding agent integration bridge extracted from server.ts.
 *
 * Wires the SwarmCoordinator's callbacks (chat, WS broadcast, event routing,
 * swarm synthesis) and provides the fallback /api/coding-agents/* handler.
 */

import crypto from "node:crypto";
import http from "node:http";

import {
  type AgentRuntime,
  ChannelType,
  createMessageMemory,
  logger,
  ModelType,
  stringToUuid,
  type UUID,
} from "@elizaos/core";

import type {
  CoordinationLLMResponse,
  PTYService,
} from "./parse-action-block.js";
import {
  parseActionBlock,
  stripActionBlockFromDisplay,
} from "./parse-action-block.js";
import type {
  SwarmEvent,
  TaskCompletionSummary,
  TaskContext,
} from "./coordinator-types.js";
import type { AgentEventPayloadLike } from "../runtime/agent-event-service.js";
import { resolveAppUserName, type ConversationMeta } from "./server-helpers.js";
import {
  readJsonBody as parseJsonBody,
  type ReadJsonBodyOptions,
  sendJson,
  sendJsonError,
} from "./http-helpers.js";
import {
  generateChatResponse as generateChatResponseFromChatRoutes,
} from "./chat-routes.js";
import type { ElizaConfig } from "../config/config.js";
import type { SandboxManager } from "../services/sandbox-manager.js";
import type { AppManager } from "../services/app-manager.js";
import type { RegistryService } from "./registry-service.js";
import type { DropService } from "./drop-service.js";
import type { CloudRouteState } from "./cloud-routes.js";
import type { ConnectorHealthMonitor } from "./connector-health.js";

// ---------------------------------------------------------------------------
// Internal type re-used in this module
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  sendJson(res, data, status);
}

function error(res: http.ServerResponse, message: string, status = 400): void {
  sendJsonError(res, message, status);
}

async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: ReadJsonBodyOptions = {},
): Promise<T | null> {
  return parseJsonBody(req, res, {
    maxBytes: MAX_BODY_BYTES,
    ...options,
  });
}

/**
 * Minimal ServerState shape needed by this module.
 * The full ServerState lives in server.ts; we only reference the fields we need.
 */
export interface CodingAgentServerState {
  runtime: AgentRuntime | null;
  config: ElizaConfig;
  agentName: string;
  chatRoomId: UUID | null;
  chatUserId: UUID | null;
  adminEntityId: UUID | null;
  activeConversationId: string | null;
  conversations: Map<string, ConversationMeta>;
  broadcastWs: ((data: Record<string, unknown>) => void) | null;
}

// ---------------------------------------------------------------------------
// Autonomy → User message routing
// ---------------------------------------------------------------------------

/**
 * Route non-conversation text output to the user's active conversation.
 * Stores the message as a Memory in the conversation room and broadcasts
 * a `proactive-message` WS event to the frontend.
 */
export async function routeAutonomyTextToUser(
  state: CodingAgentServerState,
  responseText: string,
  source = "autonomy",
): Promise<void> {
  const runtime = state.runtime;
  if (!runtime) return;

  const normalizedText = responseText.trim();
  if (!normalizedText) return;

  // Find target conversation (active, or most recent)
  let conv: ConversationMeta | undefined;
  if (state.activeConversationId) {
    conv = state.conversations.get(state.activeConversationId);
  }
  if (!conv) {
    // Fall back to most recently updated conversation
    const sorted = Array.from(state.conversations.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    conv = sorted[0];
  }
  if (!conv) return; // No conversations exist yet

  // Ephemeral sources: broadcast to UI but don't persist to DB.
  // Coding-agent status updates and coordinator decisions are transient —
  // they bloat the database without adding long-term value.
  const ephemeralSources = new Set(["coding-agent", "coordinator", "action"]);

  const messageId = crypto.randomUUID() as UUID;

  if (!ephemeralSources.has(source)) {
    const agentMessage = createMessageMemory({
      id: messageId,
      entityId: runtime.agentId,
      roomId: conv.roomId,
      content: {
        text: normalizedText,
        source,
      },
    });
    await runtime.createMemory(agentMessage, "messages");
  }
  conv.updatedAt = new Date().toISOString();

  // Broadcast to all WS clients (always, even for ephemeral sources)
  state.broadcastWs?.({
    type: "proactive-message",
    conversationId: conv.id,
    message: {
      id: messageId,
      role: "assistant",
      text: normalizedText,
      timestamp: Date.now(),
      source,
    },
  });
}

// ---------------------------------------------------------------------------
// Coordinator access
// ---------------------------------------------------------------------------

/**
 * Get the SwarmCoordinator from the runtime services (if available).
 * Discovers via runtime.getService("SWARM_COORDINATOR") — the coordinator
 * registers itself during PTYService.start().
 */
export function getCoordinatorFromRuntime(runtime: AgentRuntime): {
  setChatCallback?: (
    cb: (text: string, source?: string) => Promise<void>,
  ) => void;
  setWsBroadcast?: (cb: (event: SwarmEvent) => void) => void;
  setAgentDecisionCallback?: (
    cb: (
      eventDescription: string,
      sessionId: string,
      taskContext: TaskContext,
    ) => Promise<CoordinationLLMResponse | null>,
  ) => void;
  setSwarmCompleteCallback?: (
    cb: (payload: {
      tasks: TaskCompletionSummary[];
      total: number;
      completed: number;
      stopped: number;
      errored: number;
    }) => Promise<void>,
  ) => void;
} | null {
  const coordinator = runtime.getService("SWARM_COORDINATOR");
  if (coordinator) {
    return coordinator as ReturnType<typeof getCoordinatorFromRuntime>;
  }
  const ptyService = runtime.getService("PTY_SERVICE") as
    | (PTYService & { coordinator?: unknown })
    | null;
  if (ptyService?.coordinator) {
    return ptyService.coordinator as ReturnType<
      typeof getCoordinatorFromRuntime
    >;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bridge wiring
// ---------------------------------------------------------------------------

export function wireCodingAgentBridgesNow(st: CodingAgentServerState): void {
  wireCodingAgentChatBridge(st);
  wireCodingAgentWsBridge(st);
  wireCoordinatorEventRouting(st);
  wireCodingAgentSwarmSynthesis(st);
}

/**
 * Wire the SwarmCoordinator's chatCallback so coordinator messages
 * appear in the user's chat UI via the existing proactive-message flow.
 * Returns true if successfully wired.
 */
export function wireCodingAgentChatBridge(st: CodingAgentServerState): boolean {
  if (!st.runtime) return false;
  const coordinator = getCoordinatorFromRuntime(st.runtime);
  if (!coordinator?.setChatCallback) return false;
  coordinator.setChatCallback(async (text: string, source?: string) => {
    await routeAutonomyTextToUser(st, text, source ?? "coding-agent");
  });
  return true;
}

/**
 * Wire the SwarmCoordinator's wsBroadcast callback so coordinator events
 * are relayed to all WebSocket clients as "pty-session-event" messages.
 * Returns true if successfully wired.
 */
export function wireCodingAgentWsBridge(st: CodingAgentServerState): boolean {
  if (!st.runtime) return false;
  const coordinator = getCoordinatorFromRuntime(st.runtime);
  if (!coordinator?.setWsBroadcast) return false;
  coordinator.setWsBroadcast((event: SwarmEvent) => {
    // Preserve the coordinator's event type (task_registered, task_complete, etc.)
    // as `eventType` so it doesn't overwrite the WS message dispatch type.
    const { type: eventType, ...rest } = event;
    st.broadcastWs?.({ type: "pty-session-event", eventType, ...rest });
  });
  return true;
}

/**
 * Wire the SwarmCoordinator's swarmCompleteCallback so that when all agents
 * finish, we synthesize a summary via the agent's LLM and post it as a
 * persisted message in the conversation.
 */
export function wireCodingAgentSwarmSynthesis(st: CodingAgentServerState): boolean {
  if (!st.runtime) return false;
  const coordinator = getCoordinatorFromRuntime(st.runtime);
  if (!coordinator?.setSwarmCompleteCallback) return false;

  coordinator.setSwarmCompleteCallback((payload) =>
    handleSwarmSynthesis(st, payload),
  );
  return true;
}

/**
 * Handle swarm completion by synthesizing a summary via the LLM.
 * Extracted from wireCodingAgentSwarmSynthesis for testability.
 *
 * Paths: (A) LLM returns synthesis → route to user,
 *        (B) LLM returns empty → warn,
 *        (C) LLM throws → fallback generic message.
 */
export async function handleSwarmSynthesis(
  st: { runtime: AgentRuntime | null },
  payload: {
    tasks: Array<{
      sessionId: string;
      label: string;
      agentType: string;
      originalTask: string;
      status: string;
      completionSummary: string;
    }>;
    total: number;
    completed: number;
    stopped: number;
    errored: number;
  },
  routeMessage: (text: string, source: string) => Promise<void> = (
    text,
    source,
  ) => routeAutonomyTextToUser(st as CodingAgentServerState, text, source),
): Promise<void> {
  const runtime = st.runtime;
  if (!runtime) {
    logger.warn("[swarm-synthesis] No runtime available — skipping synthesis");
    return;
  }

  logger.info(
    `[swarm-synthesis] Generating synthesis for ${payload.total} tasks (${payload.completed} completed, ${payload.stopped} stopped, ${payload.errored} errored)`,
  );

  const taskLines = payload.tasks
    .map(
      (t) =>
        `- [${t.status.toUpperCase()}] "${t.label}" (${t.agentType})\n  Task: ${t.originalTask}\n  Result: ${t.completionSummary || "No summary available"}`,
    )
    .join("\n\n");

  const prompt =
    `You are summarizing the results of a task-agent swarm for the user. ` +
    `${payload.total} agents were dispatched. ${payload.completed} completed, ` +
    `${payload.stopped} stopped, ${payload.errored} errored.\n\n` +
    `Here are the individual task results:\n\n${taskLines}\n\n` +
    `Write a concise, conversational summary of what was accomplished. ` +
    `Highlight key outcomes (PRs created, issues found, research results). ` +
    `If any tasks failed or stopped, mention what went wrong. ` +
    `Keep your personality — be warm and helpful but brief.`;

  try {
    const synthesis = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      maxTokens: 2048,
      temperature: 0.7,
    });

    if (synthesis?.trim()) {
      logger.info("[swarm-synthesis] Synthesis generated, routing to user");
      await routeMessage(synthesis.trim(), "swarm_synthesis");
    } else {
      logger.warn("[swarm-synthesis] LLM returned empty synthesis");
    }
  } catch (err) {
    logger.error(`[swarm-synthesis] LLM call failed: ${err}`);
    const parts: string[] = [];
    if (payload.completed > 0) parts.push(`${payload.completed} completed`);
    if (payload.stopped > 0) parts.push(`${payload.stopped} stopped`);
    if (payload.errored > 0) parts.push(`${payload.errored} errored`);
    await routeMessage(
      `All ${payload.total} task agents finished (${parts.join(", ")}). Review their work when you're ready.`,
      "coding-agent",
    );
  }
}

// ---------------------------------------------------------------------------
// Coordinator event routing
// ---------------------------------------------------------------------------

/**
 * Wire the SwarmCoordinator's agentDecisionCallback so coordinator events
 * (blocked prompts, turn completions) route through Eliza's full
 * elizaOS pipeline (memory, personality, actions) so she has conversation
 * context to make informed decisions. The pipeline's model size is
 * temporarily overridden to TEXT_SMALL via the private
 * `runtime.llmModeOption` (no public setter exists).
 * This is intentional — coordinator decisions must be fast to avoid
 * stalling CLI agents waiting for input.
 *
 * Events are serialized (one at a time) to prevent context confusion.
 * Eliza's response appears in chat via WS broadcast, and the embedded
 * JSON action block is parsed and returned to the coordinator for execution.
 *
 * If the callback fails or Eliza's response has no action block,
 * returns null → coordinator falls back to the small LLM.
 */
export function wireCoordinatorEventRouting(st: CodingAgentServerState): boolean {
  if (!st.runtime) return false;
  const coordinator = getCoordinatorFromRuntime(st.runtime);
  if (!coordinator?.setAgentDecisionCallback) return false;

  // Serialization queue — one coordinator event at a time
  let eventQueue: Promise<void> = Promise.resolve();

  coordinator.setAgentDecisionCallback(
    async (
      eventDescription: string,
      _sessionId: string,
      _taskCtx: TaskContext,
    ): Promise<CoordinationLLMResponse | null> => {
      let resolveOuter!: (v: CoordinationLLMResponse | null) => void;
      const resultPromise = new Promise<CoordinationLLMResponse | null>((r) => {
        resolveOuter = r;
      });

      eventQueue = eventQueue.then(async () => {
        try {
          const runtime = st.runtime;
          if (!runtime) {
            resolveOuter(null);
            return;
          }

          // Ensure the legacy chat connection exists (creates room/world if needed).
          const agentName = runtime.character.name ?? "Eliza";
          const existingLegacyChatRoom = st.chatRoomId
            ? await runtime.getRoom(st.chatRoomId).catch(() => null)
            : null;
          if (!st.chatUserId || !st.chatRoomId || !existingLegacyChatRoom) {
            const adminId =
              st.adminEntityId ??
              (stringToUuid(`${st.agentName}-admin-entity`) as UUID);
            st.adminEntityId = adminId;
            st.chatUserId = adminId;
            st.chatRoomId =
              st.chatRoomId ??
              (stringToUuid(`${agentName}-web-chat-room`) as UUID);
            const worldId = stringToUuid(`${agentName}-web-chat-world`) as UUID;
            const messageServerId = stringToUuid(
              `${agentName}-web-server`,
            ) as UUID;
            await runtime.ensureConnection({
              entityId: adminId,
              roomId: st.chatRoomId,
              worldId,
              userName: resolveAppUserName(st.config),
              source: "client_chat",
              channelId: `${agentName}-web-chat`,
              type: ChannelType.DM,
              messageServerId,
              metadata: { ownership: { ownerId: adminId } },
            });
          }
          if (!st.chatUserId || !st.chatRoomId) {
            resolveOuter(null);
            return;
          }

          // Create a message memory so the event enters Eliza's conversation history.
          const message = createMessageMemory({
            id: crypto.randomUUID() as UUID,
            entityId: st.chatUserId,
            agentId: runtime.agentId,
            roomId: st.chatRoomId,
            content: {
              text: eventDescription,
              source: "coordinator",
              channelType: "DM",
            },
          });

          // Temporarily force TEXT_SMALL — coordinator events are time-sensitive
          // and TEXT_LARGE can timeout while CLI agents stall waiting for input.
          // llmModeOption is private with no public setter; cast is intentional.
          const rt = runtime as unknown as Record<string, unknown>;
          const prevLlmMode = rt.llmModeOption;
          rt.llmModeOption = "SMALL";
          let result: { text: string; agentName?: string };
          try {
            result = await generateChatResponseFromChatRoutes(runtime, message, agentName, {
              resolveNoResponseText: () => "I'll look into that.",
            });
          } finally {
            rt.llmModeOption = prevLlmMode;
          }

          // WS broadcast the natural language portion (strip JSON action block).
          if (result.text && result.text !== "(no response)") {
            const displayText = stripActionBlockFromDisplay(result.text);
            if (displayText && displayText.length > 2) {
              const conv = st.activeConversationId
                ? st.conversations.get(st.activeConversationId)
                : Array.from(st.conversations.values()).sort(
                    (a, b) =>
                      new Date(b.updatedAt).getTime() -
                      new Date(a.updatedAt).getTime(),
                  )[0];
              if (conv) {
                st.broadcastWs?.({
                  type: "proactive-message",
                  conversationId: conv.id,
                  message: {
                    id: `coordinator-${Date.now()}`,
                    role: "assistant",
                    text: displayText,
                    timestamp: Date.now(),
                    source: "coordinator",
                  },
                });
              }
            }
          }

          resolveOuter(parseActionBlock(result.text ?? ""));
        } catch (err) {
          logger.error(
            `Coordinator event routing failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          resolveOuter(null);
        }
      });

      return resultPromise;
    },
  );

  return true;
}

// ---------------------------------------------------------------------------
// Coding agents fallback route handler
// ---------------------------------------------------------------------------

/**
 * Fallback handler for /api/coding-agents/* routes when the plugin
 * doesn't export createCodingAgentRouteHandler.
 * Uses the AgentOrchestratorService (CODE_TASK) to provide task data.
 */
export async function handleCodingAgentsFallback(
  runtime: AgentRuntime,
  pathname: string,
  method: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  type ScratchStatus = "pending_decision" | "kept" | "promoted";
  type ScratchTerminalEvent = "stopped" | "task_complete" | "error";
  type ScratchRecord = {
    sessionId: string;
    label: string;
    path: string;
    status: ScratchStatus;
    createdAt: number;
    terminalAt: number;
    terminalEvent: ScratchTerminalEvent;
    expiresAt?: number;
  };
  type AgentPreflightRecord = {
    adapter?: string;
    installed?: boolean;
    installCommand?: string;
    docsUrl?: string;
  };
  type CodeTaskService = {
    getTasks?: () => Promise<
      Array<{
        id?: string;
        name?: string;
        description?: string;
        metadata?: {
          status?: string;
          providerId?: string;
          providerLabel?: string;
          workingDirectory?: string;
          progress?: number;
          steps?: Array<{ status?: string }>;
        };
      }>
    >;
    getAgentPreflight?: () => Promise<unknown>;
    listAgentPreflight?: () => Promise<unknown>;
    preflightCodingAgents?: () => Promise<unknown>;
    preflight?: () => Promise<unknown>;
    listScratchWorkspaces?: () => Promise<unknown>;
    getScratchWorkspaces?: () => Promise<unknown>;
    listScratch?: () => Promise<unknown>;
    keepScratchWorkspace?: (sessionId: string) => Promise<unknown>;
    keepScratch?: (sessionId: string) => Promise<unknown>;
    deleteScratchWorkspace?: (sessionId: string) => Promise<unknown>;
    deleteScratch?: (sessionId: string) => Promise<unknown>;
    promoteScratchWorkspace?: (
      sessionId: string,
      name?: string,
    ) => Promise<unknown>;
    promoteScratch?: (sessionId: string, name?: string) => Promise<unknown>;
  };

  const codeTaskService = runtime.getService(
    "CODE_TASK",
  ) as CodeTaskService | null;

  const buildEmptyCoordinatorStatus = () => ({
    supervisionLevel: "autonomous",
    taskCount: 0,
    tasks: [] as Array<Record<string, unknown>>,
    recentTasks: [] as Array<Record<string, unknown>>,
    taskThreadCount: 0,
    taskThreads: [] as Array<Record<string, unknown>>,
    pendingConfirmations: 0,
    frameworks: [] as Array<Record<string, unknown>>,
  });

  const toNumber = (value: unknown, fallback = 0): number => {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const toScratchStatus = (value: unknown): ScratchStatus => {
    if (value === "kept" || value === "promoted") return value;
    return "pending_decision";
  };
  const toTerminalEvent = (value: unknown): ScratchTerminalEvent => {
    if (value === "stopped" || value === "error") return value;
    return "task_complete";
  };
  const normalizeScratchRecord = (value: unknown): ScratchRecord | null => {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const sessionId =
      typeof raw.sessionId === "string" ? raw.sessionId.trim() : "";
    const pathValue = typeof raw.path === "string" ? raw.path.trim() : "";
    if (!sessionId || !pathValue) return null;
    const createdAt = toNumber(raw.createdAt, Date.now());
    const terminalAt = toNumber(raw.terminalAt, createdAt);
    const expiresAt = toNumber(raw.expiresAt, 0);
    return {
      sessionId,
      label:
        typeof raw.label === "string" && raw.label.trim().length > 0
          ? raw.label
          : sessionId,
      path: pathValue,
      status: toScratchStatus(raw.status),
      createdAt,
      terminalAt,
      terminalEvent: toTerminalEvent(raw.terminalEvent),
      ...(expiresAt > 0 ? { expiresAt } : {}),
    };
  };
  const parseSessionId = (raw: string): string | null => {
    let sessionId = "";
    try {
      sessionId = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (!sessionId || sessionId.includes("/") || sessionId.includes("..")) {
      return null;
    }
    return sessionId;
  };
  const parseTaskId = (raw: string): string | null => {
    let taskId = "";
    try {
      taskId = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (!taskId || taskId.includes("/") || taskId.includes("..")) {
      return null;
    }
    return taskId;
  };
  const ptyListService = runtime.getService("PTY_SERVICE") as
    | (PTYService & {
        listSessions?: () => Promise<unknown[]>;
      })
    | null;

  // GET /api/coding-agents/tasks
  if (method === "GET" && pathname === "/api/coding-agents/tasks") {
    try {
      const url = new URL(req.url ?? pathname, "http://localhost");
      const requestedStatus = url.searchParams.get("status");
      const requestedLimit = Number(url.searchParams.get("limit"));
      let tasks = (await codeTaskService?.getTasks?.()) ?? [];
      if (!Array.isArray(tasks)) {
        tasks = [];
      }
      if (requestedStatus) {
        tasks = tasks.filter(
          (task) => task.metadata?.status === requestedStatus,
        );
      }
      if (Number.isFinite(requestedLimit) && requestedLimit > 0) {
        tasks = tasks.slice(0, requestedLimit);
      }
      json(res, { tasks });
      return true;
    } catch (e) {
      error(res, `Failed to list coding agent tasks: ${e}`, 500);
      return true;
    }
  }

  const taskMatch = pathname.match(/^\/api\/coding-agents\/tasks\/([^/]+)$/);
  if (method === "GET" && taskMatch) {
    const taskId = parseTaskId(taskMatch[1]);
    if (!taskId) {
      error(res, "Invalid task ID", 400);
      return true;
    }
    try {
      const tasks = (await codeTaskService?.getTasks?.()) ?? [];
      const task = Array.isArray(tasks)
        ? tasks.find((entry) => entry.id === taskId)
        : undefined;
      if (!task) {
        error(res, "Task not found", 404);
        return true;
      }
      json(res, { task });
      return true;
    } catch (e) {
      error(res, `Failed to get coding agent task: ${e}`, 500);
      return true;
    }
  }

  // GET /api/coding-agents/sessions
  if (method === "GET" && pathname === "/api/coding-agents/sessions") {
    try {
      const sessions = (await ptyListService?.listSessions?.()) ?? [];
      json(res, { sessions: Array.isArray(sessions) ? sessions : [] });
      return true;
    } catch (e) {
      error(res, `Failed to list coding agent sessions: ${e}`, 500);
      return true;
    }
  }

  const sessionMatch = pathname.match(
    /^\/api\/coding-agents\/sessions\/([^/]+)$/,
  );
  if (method === "GET" && sessionMatch) {
    const sessionId = parseSessionId(sessionMatch[1]);
    if (!sessionId) {
      error(res, "Invalid session ID", 400);
      return true;
    }
    try {
      const sessions = (await ptyListService?.listSessions?.()) ?? [];
      const session = Array.isArray(sessions)
        ? sessions.find((entry) => {
            if (!entry || typeof entry !== "object") return false;
            const raw = entry as Record<string, unknown>;
            return (
              raw.id === sessionId ||
              raw.sessionId === sessionId ||
              raw.roomId === sessionId
            );
          })
        : undefined;
      if (!session) {
        error(res, "Session not found", 404);
        return true;
      }
      json(res, { session });
      return true;
    } catch (e) {
      error(res, `Failed to get coding agent session: ${e}`, 500);
      return true;
    }
  }

  // GET /api/coding-agents/preflight
  if (method === "GET" && pathname === "/api/coding-agents/preflight") {
    try {
      const loaders: Array<(() => Promise<unknown>) | undefined> = [
        codeTaskService?.getAgentPreflight,
        codeTaskService?.listAgentPreflight,
        codeTaskService?.preflightCodingAgents,
        codeTaskService?.preflight,
      ];
      let rows: unknown[] = [];
      for (const loader of loaders) {
        if (!loader) continue;
        const maybeRows = await loader.call(codeTaskService);
        if (Array.isArray(maybeRows)) {
          rows = maybeRows;
          break;
        }
      }
      const normalized = rows.flatMap((item): AgentPreflightRecord[] => {
        if (!item || typeof item !== "object") return [];
        const raw = item as Record<string, unknown>;
        const adapter =
          typeof raw.adapter === "string" ? raw.adapter.trim() : "";
        if (!adapter) return [];
        return [
          {
            adapter,
            installed: Boolean(raw.installed),
            installCommand:
              typeof raw.installCommand === "string"
                ? raw.installCommand
                : undefined,
            docsUrl: typeof raw.docsUrl === "string" ? raw.docsUrl : undefined,
          },
        ];
      });
      json(res, normalized);
      return true;
    } catch (e) {
      error(res, `Failed to get coding agent preflight: ${e}`, 500);
      return true;
    }
  }

  // GET /api/coding-agents/coordinator/status
  if (
    method === "GET" &&
    pathname === "/api/coding-agents/coordinator/status"
  ) {
    if (!codeTaskService?.getTasks) {
      // Return empty status if service not available
      json(res, buildEmptyCoordinatorStatus());
      return true;
    }

    try {
      const tasks = await codeTaskService.getTasks();

      // Map tasks to the CodingAgentSession format expected by frontend
      const mappedTasks = tasks.map((task) => {
        const meta = task.metadata ?? {};
        // Map orchestrator status to frontend status
        let status: string = "active";
        switch (meta.status) {
          case "completed":
            status = "completed";
            break;
          case "failed":
          case "error":
            status = "error";
            break;
          case "cancelled":
            status = "stopped";
            break;
          case "paused":
            status = "blocked";
            break;
          case "running":
            status = "active";
            break;
          case "pending":
            status = "active";
            break;
          default:
            status = "active";
        }

        return {
          sessionId: task.id ?? "",
          agentType: meta.providerId ?? "eliza",
          label: meta.providerLabel ?? task.name ?? "Task",
          originalTask: task.description ?? task.name ?? "",
          workdir: meta.workingDirectory ?? process.cwd(),
          status,
          decisionCount: meta.steps?.length ?? 0,
          autoResolvedCount:
            meta.steps?.filter((s) => s.status === "completed").length ?? 0,
        };
      });

      json(res, {
        ...buildEmptyCoordinatorStatus(),
        taskCount: mappedTasks.length,
        tasks: mappedTasks,
        recentTasks: mappedTasks,
        pendingConfirmations: 0,
      });
      return true;
    } catch (e) {
      error(res, `Failed to get coding agent status: ${e}`, 500);
      return true;
    }
  }

  // POST /api/coding-agents/:sessionId/stop - Stop a coding agent task
  const stopMatch = pathname.match(/^\/api\/coding-agents\/([^/]+)\/stop$/);
  if (method === "POST" && stopMatch) {
    const sessionId = parseSessionId(stopMatch[1]);
    if (!sessionId) {
      error(res, "Invalid session ID", 400);
      return true;
    }
    const ptyService = runtime.getService("PTY_SERVICE") as PTYService | null;

    if (!ptyService?.stopSession) {
      error(res, "PTY Service not available", 503);
      return true;
    }

    try {
      await ptyService.stopSession(sessionId);
      json(res, { ok: true });
      return true;
    } catch (e) {
      error(res, `Failed to stop session: ${e}`, 500);
      return true;
    }
  }

  // GET /api/coding-agents/scratch
  if (method === "GET" && pathname === "/api/coding-agents/scratch") {
    try {
      const loaders: Array<(() => Promise<unknown>) | undefined> = [
        codeTaskService?.listScratchWorkspaces,
        codeTaskService?.getScratchWorkspaces,
        codeTaskService?.listScratch,
      ];
      let rows: unknown[] = [];
      for (const loader of loaders) {
        if (!loader) continue;
        const maybeRows = await loader.call(codeTaskService);
        if (Array.isArray(maybeRows)) {
          rows = maybeRows;
          break;
        }
      }
      const normalized = rows
        .map((item) => normalizeScratchRecord(item))
        .filter((item): item is ScratchRecord => item !== null);
      json(res, normalized);
      return true;
    } catch (e) {
      error(res, `Failed to list scratch workspaces: ${e}`, 500);
      return true;
    }
  }

  const keepMatch = pathname.match(
    /^\/api\/coding-agents\/([^/]+)\/scratch\/keep$/,
  );
  if (method === "POST" && keepMatch) {
    const sessionId = parseSessionId(keepMatch[1]);
    if (!sessionId) {
      error(res, "Invalid session ID", 400);
      return true;
    }
    const keeper =
      codeTaskService?.keepScratchWorkspace ?? codeTaskService?.keepScratch;
    if (!keeper) {
      error(res, "Scratch keep is not available", 503);
      return true;
    }
    try {
      await keeper.call(codeTaskService, sessionId);
      json(res, { ok: true });
      return true;
    } catch (e) {
      error(res, `Failed to keep scratch workspace: ${e}`, 500);
      return true;
    }
  }

  const deleteMatch = pathname.match(
    /^\/api\/coding-agents\/([^/]+)\/scratch\/delete$/,
  );
  if (method === "POST" && deleteMatch) {
    const sessionId = parseSessionId(deleteMatch[1]);
    if (!sessionId) {
      error(res, "Invalid session ID", 400);
      return true;
    }
    const deleter =
      codeTaskService?.deleteScratchWorkspace ?? codeTaskService?.deleteScratch;
    if (!deleter) {
      error(res, "Scratch delete is not available", 503);
      return true;
    }
    try {
      await deleter.call(codeTaskService, sessionId);
      json(res, { ok: true });
      return true;
    } catch (e) {
      error(res, `Failed to delete scratch workspace: ${e}`, 500);
      return true;
    }
  }

  const promoteMatch = pathname.match(
    /^\/api\/coding-agents\/([^/]+)\/scratch\/promote$/,
  );
  if (method === "POST" && promoteMatch) {
    const sessionId = parseSessionId(promoteMatch[1]);
    if (!sessionId) {
      error(res, "Invalid session ID", 400);
      return true;
    }
    const promoter =
      codeTaskService?.promoteScratchWorkspace ??
      codeTaskService?.promoteScratch;
    if (!promoter) {
      error(res, "Scratch promote is not available", 503);
      return true;
    }
    const body = await readJsonBody<{ name?: string }>(req, res);
    if (body === null) return true;
    const name =
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : undefined;
    try {
      const promoted = await promoter.call(codeTaskService, sessionId, name);
      const scratch = normalizeScratchRecord(promoted);
      json(res, { success: true, ...(scratch ? { scratch } : {}) });
      return true;
    } catch (e) {
      error(res, `Failed to promote scratch workspace: ${e}`, 500);
      return true;
    }
  }

  // Not handled by fallback
  return false;
}

// ---------------------------------------------------------------------------
// PTY console bridge access
// ---------------------------------------------------------------------------

/**
 * Get the PTYConsoleBridge from the PTYService (if available).
 * Used by the WS PTY handlers to subscribe to output and forward input.
 */
export function getPtyConsoleBridge(st: CodingAgentServerState) {
  if (!st.runtime) return null;
  const ptyService = st.runtime.getService(
    "PTY_SERVICE",
  ) as unknown as PTYService | null;
  return ptyService?.consoleBridge ?? null;
}

// ---------------------------------------------------------------------------
// Autonomy event → conversation routing
// ---------------------------------------------------------------------------

/**
 * Route non-conversation agent events into the active user chat.
 * This avoids monkey-patching the message service and relies on explicit
 * event stream plumbing from AGENT_EVENT.
 */
export async function maybeRouteAutonomyEventToConversation(
  state: CodingAgentServerState,
  event: AgentEventPayloadLike,
): Promise<void> {
  if (event.stream !== "assistant") return;

  const payload =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : null;
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) return;

  const hasExplicitSource =
    typeof payload?.source === "string" && payload.source.trim().length > 0;
  const source = hasExplicitSource
    ? (payload?.source as string).trim()
    : "autonomy";

  // Regular user conversation turns should never be re-routed as proactive.
  // Some AGENT_EVENT payloads may omit roomId metadata, so rely on source too.
  if (source === "client_chat") return;
  if (!hasExplicitSource && !event.roomId) return;

  // Keep regular conversation messages in their own room only.
  if (
    event.roomId &&
    Array.from(state.conversations.values()).some(
      (c) => c.roomId === event.roomId,
    )
  ) {
    return;
  }

  await routeAutonomyTextToUser(state, text, source);
}
