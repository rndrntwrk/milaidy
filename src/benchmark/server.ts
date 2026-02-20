import http from "node:http";
import path from "node:path";
import {
  AgentRuntime,
  ChannelType,
  type Content,
  elizaLogger,
  type Memory,
  type Plugin,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import dotenv from "dotenv";
import { CORE_PLUGINS } from "../runtime/core-plugins";
import { createMiladyPlugin } from "../runtime/milady-plugin";
import {
  type BenchmarkContext,
  type CapturedAction,
  clearCapturedAction,
  createBenchmarkPlugin,
  getCapturedAction,
  setBenchmarkContext,
} from "./plugin";

// Load environment variables BEFORE anything else
// This ensures API keys are available when plugins initialize
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DEFAULT_PORT = 3939;
const DEFAULT_HOST = "127.0.0.1";
const BENCHMARK_WORLD_ID = stringToUuid("milady-benchmark-world");
const BENCHMARK_MESSAGE_SERVER_ID = stringToUuid(
  "milady-benchmark-message-server",
);

interface BenchmarkSession {
  benchmark: string;
  taskId: string;
  roomId: UUID;
  relayRoomId: UUID;
  userEntityId: UUID;
}

interface BenchmarkOutboxEntry {
  kind: "direct" | "room";
  targetId: string;
  text: string;
  source: string;
  ts: number;
}

interface BenchmarkTrajectoryStep {
  step: number;
  startedAt: number;
  finishedAt: number;
  inputText: string;
  promptText: string;
  context?: Record<string, unknown>;
  thought: string | null;
  responseText: string;
  actions: string[];
  params: Record<string, unknown>;
}

interface CuaServiceLike {
  runTask(roomId: string, goal: string): Promise<unknown>;
  approveLatest(roomId: string): Promise<unknown>;
  cancelLatest(roomId: string): Promise<void>;
  screenshotBase64(): Promise<string>;
  getStatus(): Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function hasCuaConfig(): boolean {
  const hasLocal = Boolean(process.env.CUA_HOST?.trim());
  const hasCloud = Boolean(
    process.env.CUA_API_KEY?.trim() &&
      (process.env.CUA_SANDBOX_NAME?.trim() ||
        process.env.CUA_CONTAINER_NAME?.trim()),
  );
  return hasLocal || hasCloud;
}

function parseBooleanValue(value: unknown, defaultValue = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return defaultValue;
}

function compactCuaStep(
  step: unknown,
  includeScreenshots: boolean,
): Record<string, unknown> {
  if (!isRecord(step)) {
    return { step };
  }

  const screenshot =
    typeof step.screenshotAfterBase64 === "string"
      ? step.screenshotAfterBase64
      : undefined;
  const { screenshotAfterBase64: _omit, ...rest } = step;

  return includeScreenshots
    ? {
        ...rest,
        screenshotAfterBase64: screenshot,
        hasScreenshot: Boolean(screenshot),
      }
    : {
        ...rest,
        hasScreenshot: Boolean(screenshot),
      };
}

function compactCuaResult(
  result: unknown,
  includeScreenshots: boolean,
): Record<string, unknown> {
  if (!isRecord(result)) {
    return { status: "unknown", raw: result };
  }

  const status = typeof result.status === "string" ? result.status : "unknown";

  if (status === "completed" || status === "failed") {
    const rawSteps = Array.isArray(result.steps) ? result.steps : [];
    return {
      ...result,
      steps: rawSteps.map((step) => compactCuaStep(step, includeScreenshots)),
    };
  }

  if (status === "paused_for_approval") {
    const pending = isRecord(result.pending) ? result.pending : {};
    const rawSteps = Array.isArray(pending.stepsSoFar)
      ? pending.stepsSoFar
      : [];
    const screenshotBefore =
      typeof pending.screenshotBeforeBase64 === "string"
        ? pending.screenshotBeforeBase64
        : undefined;
    const { screenshotBeforeBase64: _omit, ...pendingRest } = pending;

    return {
      ...result,
      pending: includeScreenshots
        ? {
            ...pendingRest,
            stepsSoFar: rawSteps.map((step) =>
              compactCuaStep(step, includeScreenshots),
            ),
            screenshotBeforeBase64: screenshotBefore,
            hasScreenshotBefore: Boolean(screenshotBefore),
          }
        : {
            ...pendingRest,
            stepsSoFar: rawSteps.map((step) =>
              compactCuaStep(step, includeScreenshots),
            ),
            hasScreenshotBefore: Boolean(screenshotBefore),
          },
    };
  }

  return { ...result };
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function toPlugin(candidate: unknown, source: string): Plugin {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Plugin from ${source} was not an object`);
  }

  const pluginLike = candidate as { name?: unknown };
  if (typeof pluginLike.name !== "string" || pluginLike.name.length === 0) {
    throw new Error(`Plugin from ${source} was missing a valid name`);
  }

  return candidate as Plugin;
}

function resolvePort(): number {
  const raw = process.env.MILADY_BENCH_PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    elizaLogger.warn(
      `[bench] Invalid MILADY_BENCH_PORT="${raw}"; using ${DEFAULT_PORT}`,
    );
    return DEFAULT_PORT;
  }
  return Math.floor(parsed);
}

function resolveHost(): string {
  const raw = process.env.MILADY_BENCH_HOST?.trim();
  if (!raw) return DEFAULT_HOST;

  if (raw !== "127.0.0.1" && raw !== "::1" && raw !== "localhost") {
    elizaLogger.warn(
      `[bench] Ignoring non-loopback MILADY_BENCH_HOST="${raw}"; using ${DEFAULT_HOST}`,
    );
    return DEFAULT_HOST;
  }

  return raw;
}

function extractRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function extractTaskId(context: Record<string, unknown> | undefined): string {
  const bySnake = context?.task_id;
  if (typeof bySnake === "string" && bySnake.trim()) return bySnake.trim();
  const byCamel = context?.taskId;
  if (typeof byCamel === "string" && byCamel.trim()) return byCamel.trim();
  return "default-task";
}

function extractBenchmarkName(
  context: Record<string, unknown> | undefined,
): string {
  const benchmark = context?.benchmark;
  if (typeof benchmark === "string" && benchmark.trim()) {
    return benchmark.trim();
  }
  return "unknown";
}

function composeBenchmarkPrompt(params: {
  text: string;
  context?: Record<string, unknown>;
  image?: unknown;
}): string {
  const segments: string[] = [params.text.trim()];

  if (params.context && Object.keys(params.context).length > 0) {
    segments.push(
      [
        "BENCHMARK CONTEXT (authoritative):",
        JSON.stringify(params.context, null, 2),
      ].join("\n"),
    );
  }

  if (params.image !== undefined) {
    segments.push(
      ["IMAGE PAYLOAD:", JSON.stringify(params.image, null, 2)].join("\n"),
    );
  }

  segments.push(
    "Respond using normal Eliza action output so actions/params can be executed and evaluated.",
  );

  return segments.join("\n\n");
}

function coerceActions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function coerceParams(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to XML parsing
    }

    if (trimmed.startsWith("<")) {
      const paramsByAction: Record<string, unknown> = {};
      const actionMatches = [
        ...trimmed.matchAll(/<([A-Za-z0-9_-]+)>([\s\S]*?)<\/\1>/g),
      ];
      for (const [, actionName, actionBody] of actionMatches) {
        const actionParams: Record<string, unknown> = {};
        const fieldMatches = [
          ...actionBody.matchAll(/<([A-Za-z0-9_-]+)>([\s\S]*?)<\/\1>/g),
        ];
        for (const [, fieldName, fieldValue] of fieldMatches) {
          actionParams[fieldName] = fieldValue.trim();
        }
        paramsByAction[actionName] =
          Object.keys(actionParams).length > 0
            ? actionParams
            : actionBody.trim();
      }
      if (Object.keys(paramsByAction).length > 0) {
        return paramsByAction;
      }
    }
  }

  return {};
}

function normalizeBenchmarkContext(
  session: BenchmarkSession,
  context: Record<string, unknown> | undefined,
): BenchmarkContext {
  const normalized: Record<string, unknown> = {
    ...(context ?? {}),
    benchmark: session.benchmark,
    taskId: session.taskId,
  };

  if (
    !Array.isArray(normalized.actionSpace) &&
    Array.isArray(normalized.action_space)
  ) {
    normalized.actionSpace = normalized.action_space;
  }

  if (normalized.task_id === undefined) {
    normalized.task_id = session.taskId;
  }

  return normalized as BenchmarkContext;
}

function capturedActionToParams(
  capturedAction: CapturedAction | null,
): Record<string, unknown> {
  if (!capturedAction) return {};

  const benchmarkParams: Record<string, unknown> = {};
  if (capturedAction.command) benchmarkParams.command = capturedAction.command;
  if (capturedAction.toolName)
    benchmarkParams.tool_name = capturedAction.toolName;
  if (capturedAction.arguments)
    benchmarkParams.arguments = capturedAction.arguments;
  if (capturedAction.operation)
    benchmarkParams.operation = capturedAction.operation;
  if (capturedAction.elementId)
    benchmarkParams.element_id = capturedAction.elementId;
  if (capturedAction.value) benchmarkParams.value = capturedAction.value;

  if (Object.keys(benchmarkParams).length === 0) {
    return {};
  }

  return { BENCHMARK_ACTION: benchmarkParams };
}

function sessionKey(session: BenchmarkSession): string {
  return `${session.benchmark}:${session.taskId}`;
}

async function ensureBenchmarkSessionContext(
  runtime: AgentRuntime,
  session: BenchmarkSession,
): Promise<void> {
  await runtime.ensureWorldExists({
    id: BENCHMARK_WORLD_ID,
    name: "Milady Benchmark World",
    agentId: runtime.agentId,
    messageServerId: BENCHMARK_MESSAGE_SERVER_ID,
    metadata: {
      type: "benchmark",
      description: "World used for benchmark sessions",
      extra: {
        benchmark: session.benchmark,
      },
    },
  });

  // Use ChannelType.API to ensure the agent always responds to benchmark messages
  // (API channel type bypasses shouldRespond evaluation)
  await runtime.ensureRoomExists({
    id: session.roomId,
    name: `benchmark:${session.taskId}`,
    source: "benchmark",
    type: ChannelType.API,
    channelId: `bench-${session.taskId}`,
    messageServerId: BENCHMARK_MESSAGE_SERVER_ID,
    worldId: BENCHMARK_WORLD_ID,
    metadata: {
      benchmark: session.benchmark,
      taskId: session.taskId,
    },
  });

  await runtime.ensureRoomExists({
    id: session.relayRoomId,
    name: "relay-room",
    source: "benchmark",
    type: ChannelType.API,
    channelId: `relay-${session.taskId}`,
    messageServerId: BENCHMARK_MESSAGE_SERVER_ID,
    worldId: BENCHMARK_WORLD_ID,
    metadata: {
      benchmark: session.benchmark,
      taskId: session.taskId,
      role: "relay-room",
    },
  });

  await runtime.ensureConnection({
    entityId: session.userEntityId,
    roomId: session.roomId,
    worldId: BENCHMARK_WORLD_ID,
    userName: "Benchmark User",
    source: "benchmark",
    channelId: `bench-${session.taskId}`,
    type: ChannelType.API,
    messageServerId: BENCHMARK_MESSAGE_SERVER_ID,
    metadata: {
      benchmark: session.benchmark,
      taskId: session.taskId,
      role: "benchmark-room",
    },
  });
  await runtime.ensureParticipantInRoom(runtime.agentId, session.relayRoomId);
}

function createSession(taskId: string, benchmark: string): BenchmarkSession {
  const normalizedTaskId = taskId.trim() || "default-task";
  const normalizedBenchmark = benchmark.trim() || "unknown";
  const seed = `${normalizedBenchmark}:${normalizedTaskId}:${Date.now()}:${Math.random()}`;

  return {
    benchmark: normalizedBenchmark,
    taskId: normalizedTaskId,
    roomId: stringToUuid(`benchmark-room:${seed}`),
    relayRoomId: stringToUuid(`benchmark-relay:${seed}`),
    userEntityId: stringToUuid(`benchmark-user:${seed}`),
  };
}

// Proper robust server implementation
export async function startBenchmarkServer() {
  const port = resolvePort();
  const host = resolveHost();
  elizaLogger.info(
    `[bench] Initializing milady benchmark runtime on ${host}:${port}...`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PLUGIN LOADING — Use full CORE_PLUGINS to test with realistic context
  // ═══════════════════════════════════════════════════════════════════════════
  // We intentionally load the full Milady plugin set to ensure benchmarks test
  // the agent's ability to perform tasks despite context "pollution" from all
  // the default actions, providers, evaluators, etc. If the agent can still
  // succeed with a crowded context, it demonstrates sufficient context handling.
  // ═══════════════════════════════════════════════════════════════════════════

  const plugins: Plugin[] = [];
  const loadedPlugins: string[] = [];
  const failedPlugins: string[] = [];

  // Plugins to skip in benchmark context — these require external auth or
  // interfere with benchmark operation
  const skipPlugins = new Set([
    "@elizaos/plugin-elizacloud", // Requires ElizaOS cloud auth, conflicts with local LLM
  ]);

  // Load all CORE_PLUGINS — these are what the production Milady runtime uses
  for (const pluginName of CORE_PLUGINS) {
    if (skipPlugins.has(pluginName)) {
      elizaLogger.debug(
        `[bench] Skipping plugin (benchmark mode): ${pluginName}`,
      );
      continue;
    }
    try {
      const pluginModule = await import(pluginName);
      const plugin =
        pluginModule.default ?? pluginModule[Object.keys(pluginModule)[0]];
      if (plugin) {
        plugins.push(toPlugin(plugin, pluginName));
        loadedPlugins.push(pluginName);
      }
    } catch (error: unknown) {
      // Some plugins may not be available in all environments — that's OK
      failedPlugins.push(pluginName);
      elizaLogger.debug(
        `[bench] Plugin not available: ${pluginName} (${formatUnknownError(error)})`,
      );
    }
  }

  elizaLogger.info(
    `[bench] Loaded ${loadedPlugins.length}/${CORE_PLUGINS.length} core plugins`,
  );
  if (failedPlugins.length > 0) {
    elizaLogger.debug(
      `[bench] Unavailable plugins: ${failedPlugins.join(", ")}`,
    );
  }

  // Load Milady plugin — provides workspace context, session keys, autonomous state,
  // custom actions, and lifecycle actions (restart, trigger tasks)
  try {
    const workspaceDir = process.env.MILADY_WORKSPACE_DIR ?? process.cwd();
    const miladyPlugin = createMiladyPlugin({
      workspaceDir,
      agentId: "benchmark",
    });
    plugins.push(toPlugin(miladyPlugin, "milady-plugin"));
    elizaLogger.info(
      `[bench] Loaded milady plugin with workspace: ${workspaceDir}`,
    );
  } catch (error: unknown) {
    elizaLogger.error(
      `[bench] Failed to load milady plugin: ${formatUnknownError(error)}`,
    );
  }

  // Load benchmark plugin — provides benchmark provider + BENCHMARK_ACTION
  try {
    const benchmarkPlugin = createBenchmarkPlugin();
    plugins.push(toPlugin(benchmarkPlugin, "benchmark-plugin"));
    elizaLogger.info("[bench] Loaded benchmark plugin");
  } catch (error: unknown) {
    elizaLogger.error(
      `[bench] Failed to load benchmark plugin: ${formatUnknownError(error)}`,
    );
  }

  // Load trust plugin — provides trust engine, security module, and permission system
  // (may already be in CORE_PLUGINS but we want to ensure it's loaded)
  if (!loadedPlugins.includes("@elizaos/plugin-trust")) {
    try {
      const { default: trustPlugin } = await import("@elizaos/plugin-trust");
      plugins.push(toPlugin(trustPlugin, "@elizaos/plugin-trust"));
      elizaLogger.info("[bench] Loaded plugin: @elizaos/plugin-trust");
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] Trust plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  // Load LLM provider plugins based on environment
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (groqApiKey) {
    process.env.GROQ_API_KEY = groqApiKey;
    try {
      const { default: groqPlugin } = await import("@elizaos/plugin-groq");
      plugins.push(toPlugin(groqPlugin, "@elizaos/plugin-groq"));
      elizaLogger.info("[bench] Loaded LLM plugin: @elizaos/plugin-groq");
    } catch (error: unknown) {
      elizaLogger.warn(
        `[bench] Groq plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiApiKey && !openAiApiKey.startsWith("gsk_")) {
    process.env.OPENAI_API_KEY = openAiApiKey;
    try {
      const { default: openaiPlugin } = await import("@elizaos/plugin-openai");
      plugins.push(toPlugin(openaiPlugin, "@elizaos/plugin-openai"));
      elizaLogger.info("[bench] Loaded LLM plugin: @elizaos/plugin-openai");
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] OpenAI plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  // Load computer use plugin if enabled
  if (process.env.MILADY_ENABLE_COMPUTERUSE) {
    try {
      process.env.COMPUTERUSE_ENABLED ??= "true";
      process.env.COMPUTERUSE_MODE ??= "local";
      const localComputerusePath =
        "../../../plugins/plugin-computeruse/typescript/src/index.ts";
      const computeruseModule = (await import(localComputerusePath)) as Record<
        string,
        unknown
      >;
      const computerusePlugin =
        computeruseModule.computerusePlugin ??
        computeruseModule.computerUsePlugin ??
        computeruseModule.default;
      if (computerusePlugin) {
        plugins.push(toPlugin(computerusePlugin, localComputerusePath));
        elizaLogger.info(
          "[bench] Loaded local plugin: @elizaos/plugin-computeruse",
        );
      }
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] Computer use plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  const shouldLoadCua = envFlag("MILADY_ENABLE_CUA") || hasCuaConfig();
  if (shouldLoadCua) {
    const cuaSources = [
      "@elizaos/plugin-cua",
      "../../../eliza/packages/plugin-cua/src/index.ts",
    ];

    let loaded = false;
    for (const source of cuaSources) {
      try {
        const module = (await import(source)) as Record<string, unknown>;
        const candidate = module.default ?? module.cuaPlugin;
        if (!candidate) {
          throw new Error("module does not export cuaPlugin/default");
        }
        plugins.push(toPlugin(candidate, source));
        elizaLogger.info(`[bench] Loaded CUA plugin from ${source}`);
        loaded = true;
        break;
      } catch (error: unknown) {
        elizaLogger.debug(
          `[bench] CUA plugin source unavailable: ${source} (${formatUnknownError(error)})`,
        );
      }
    }

    if (!loaded) {
      elizaLogger.warn(
        "[bench] CUA benchmark mode requested but plugin could not be loaded",
      );
    }
  }

  // Load mock plugin for testing.
  // Prefer a local gitignored override (./mock-plugin.ts) and fall back to the
  // tracked base mock plugin so tests/CI stay deterministic.
  if (
    process.env.MILADY_BENCH_MOCK === "true" ||
    process.env.MILAIDY_BENCH_MOCK === "true"
  ) {
    try {
      const { plugin: mockPlugin, source } = await (async () => {
        try {
          const localMockPath = String("./mock-plugin.ts");
          const localModule = (await import(localMockPath)) as Record<
            string,
            unknown
          >;
          const localPlugin = localModule.mockPlugin ?? localModule.default;
          if (localPlugin) {
            return { plugin: localPlugin, source: localMockPath };
          }
          throw new Error("mock-plugin.ts did not export mockPlugin/default");
        } catch (localError: unknown) {
          elizaLogger.debug(
            `[bench] Local mock plugin unavailable, using base mock plugin: ${formatUnknownError(localError)}`,
          );
          const baseModule = (await import("./mock-plugin-base.ts")) as Record<
            string,
            unknown
          >;
          const basePlugin = baseModule.mockPlugin ?? baseModule.default;
          if (!basePlugin) {
            throw new Error(
              "mock-plugin-base.ts did not export mockPlugin/default",
            );
          }
          return { plugin: basePlugin, source: "./mock-plugin-base.ts" };
        }
      })();

      plugins.push(toPlugin(mockPlugin, source));
      elizaLogger.info(`[bench] Loaded mock benchmark plugin from ${source}`);
    } catch (error: unknown) {
      elizaLogger.error(
        `[bench] Failed to load mock benchmark plugin: ${formatUnknownError(error)}`,
      );
    }
  }

  // Build settings object from environment variables
  // These are needed by plugins like Groq that use runtime.getSetting()
  const settings: Record<string, string> = {
    // Use in-memory database for benchmarks to avoid pglite corruption issues
    // and ensure a clean state for each benchmark run
    PGLITE_DATA_DIR: "memory://",
  };
  const envKeys = [
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ];
  for (const key of envKeys) {
    const value = process.env[key]?.trim();
    if (value) {
      settings[key] = value;
    }
  }

  const runtime = new AgentRuntime({
    character: {
      name: "Kira",
      bio: ["A benchmark execution agent."],
      messageExamples: [],
      topics: [],
      adjectives: [],
      plugins: [],
      settings: {
        secrets: settings,
      },
    },
    plugins,
  });

  await runtime.initialize();
  const modelHandlers = (
    runtime as unknown as { models?: Map<string, unknown[]> }
  ).models;
  const modelHandlerSummary = Object.fromEntries(
    [...(modelHandlers?.entries() ?? [])].map(([modelType, handlers]) => [
      modelType,
      (handlers as Array<{ provider?: string; priority?: number }>).map(
        (handler) => ({
          provider: handler.provider ?? "unknown",
          priority: handler.priority ?? 0,
        }),
      ),
    ]),
  );
  elizaLogger.info(
    `[bench] Model handlers: ${JSON.stringify(modelHandlerSummary)}`,
  );
  elizaLogger.info(
    `[bench] Runtime initialized — agent=${runtime.character.name}, plugins=${plugins.length}`,
  );

  const roomToSession = new Map<string, string>();
  const entityToSession = new Map<string, string>();
  const trajectoriesBySession = new Map<string, BenchmarkTrajectoryStep[]>();
  const outboxBySession = new Map<string, BenchmarkOutboxEntry[]>();

  const benchmarkTransport = {
    sendDirectMessage: async (targetEntityId: string, content: Content) => {
      const key = entityToSession.get(targetEntityId);
      const text = typeof content.text === "string" ? content.text : "";
      const source =
        typeof content.source === "string" ? content.source : "benchmark";
      if (!key) return;
      const current = outboxBySession.get(key) ?? [];
      current.push({
        kind: "direct",
        targetId: targetEntityId,
        text,
        source,
        ts: Date.now(),
      });
      outboxBySession.set(key, current);
    },
    sendRoomMessage: async (targetRoomId: string, content: Content) => {
      const key = roomToSession.get(targetRoomId);
      const text = typeof content.text === "string" ? content.text : "";
      const source =
        typeof content.source === "string" ? content.source : "benchmark";
      if (!key) return;
      const current = outboxBySession.get(key) ?? [];
      current.push({
        kind: "room",
        targetId: targetRoomId,
        text,
        source,
        ts: Date.now(),
      });
      outboxBySession.set(key, current);
    },
  };

  const runtimeWithServiceOverride = runtime as unknown as {
    getService: (serviceType: string) => unknown;
  };
  const originalGetService =
    runtimeWithServiceOverride.getService.bind(runtime);
  runtimeWithServiceOverride.getService = (serviceType: string) => {
    if (serviceType === "benchmark") {
      return benchmarkTransport;
    }
    return originalGetService(serviceType);
  };

  const sessions = new Map<string, BenchmarkSession>();
  let activeSession: BenchmarkSession | null = null;

  const registerSessionRefs = (session: BenchmarkSession): void => {
    const key = sessionKey(session);
    roomToSession.set(session.roomId, key);
    roomToSession.set(session.relayRoomId, key);
    entityToSession.set(session.userEntityId, key);
  };

  const resolveSession = (
    taskId: string,
    benchmark: string,
    createIfMissing = true,
  ): BenchmarkSession | null => {
    const key = `${benchmark}:${taskId}`;
    const existing = sessions.get(key);
    if (existing) {
      activeSession = existing;
      return existing;
    }
    if (!createIfMissing) return null;
    const created = createSession(taskId, benchmark);
    sessions.set(key, created);
    registerSessionRefs(created);
    activeSession = created;
    return created;
  };

  const getCuaService = (): CuaServiceLike | null => {
    const service = runtime.getService("cua") as CuaServiceLike | null;
    return service;
  };

  const resolveCuaRoomId = (candidate: unknown): string => {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (activeSession?.roomId) {
      return activeSession.roomId;
    }
    return stringToUuid(`benchmark-cua-room:${Date.now()}:${Math.random()}`);
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (pathname === "/api/benchmark/health" && req.method === "GET") {
      const cuaService = getCuaService();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ready",
          agent_name: runtime.character.name ?? "Milady",
          plugins: plugins.length,
          active_session: activeSession
            ? {
                benchmark: activeSession.benchmark,
                task_id: activeSession.taskId,
                room_id: activeSession.roomId,
              }
            : null,
          cua: {
            requested: shouldLoadCua,
            configured: hasCuaConfig(),
            service_available: Boolean(cuaService),
          },
        }),
      );
      return;
    }

    if (pathname === "/api/benchmark/reset" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = body.trim()
            ? (JSON.parse(body) as {
                task_id?: unknown;
                benchmark?: unknown;
              })
            : {};
          const taskId =
            typeof parsed.task_id === "string" &&
            parsed.task_id.trim().length > 0
              ? parsed.task_id
              : "default-task";
          const benchmark =
            typeof parsed.benchmark === "string" &&
            parsed.benchmark.trim().length > 0
              ? parsed.benchmark
              : "unknown";

          const session = resolveSession(taskId, benchmark, true);
          if (!session) {
            throw new Error("Failed to initialize benchmark session");
          }
          const key = sessionKey(session);
          trajectoriesBySession.set(key, []);
          outboxBySession.set(key, []);

          await ensureBenchmarkSessionContext(runtime, session);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              room_id: session.roomId,
              task_id: session.taskId,
              benchmark: session.benchmark,
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          elizaLogger.error(`[bench] Reset error: ${formatUnknownError(err)}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });
      return;
    }

    if (pathname === "/api/benchmark/outbox" && req.method === "GET") {
      const context = extractRecord({
        benchmark: requestUrl.searchParams.get("benchmark") ?? undefined,
        task_id:
          requestUrl.searchParams.get("task_id") ??
          requestUrl.searchParams.get("taskId") ??
          undefined,
      });
      const taskId = extractTaskId(context);
      const benchmark = extractBenchmarkName(context);
      const session =
        resolveSession(taskId, benchmark, false) ??
        activeSession ??
        resolveSession("default-task", "unknown", false);

      if (!session) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", outbox: [] }));
        return;
      }

      const key = sessionKey(session);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          benchmark: session.benchmark,
          task_id: session.taskId,
          room_id: session.roomId,
          outbox: outboxBySession.get(key) ?? [],
        }),
      );
      return;
    }

    if (pathname === "/api/benchmark/trajectory" && req.method === "GET") {
      const context = extractRecord({
        benchmark: requestUrl.searchParams.get("benchmark") ?? undefined,
        task_id:
          requestUrl.searchParams.get("task_id") ??
          requestUrl.searchParams.get("taskId") ??
          undefined,
      });
      const taskId = extractTaskId(context);
      const benchmark = extractBenchmarkName(context);
      const session =
        resolveSession(taskId, benchmark, false) ??
        activeSession ??
        resolveSession("default-task", "unknown", false);

      if (!session) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            steps: [],
            outbox: [],
          }),
        );
        return;
      }

      const key = sessionKey(session);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          benchmark: session.benchmark,
          task_id: session.taskId,
          room_id: session.roomId,
          relay_room_id: session.relayRoomId,
          steps: trajectoriesBySession.get(key) ?? [],
          outbox: outboxBySession.get(key) ?? [],
        }),
      );
      return;
    }

    if (pathname === "/api/benchmark/cua/status" && req.method === "GET") {
      const service = getCuaService();
      if (!service) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error:
              "CUA service is unavailable. Set MILADY_ENABLE_CUA=1 and configure CUA_HOST (or CUA_API_KEY + CUA_SANDBOX_NAME).",
          }),
        );
        return;
      }

      try {
        const status = service.getStatus();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, status }));
      } catch (err: unknown) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      return;
    }

    if (pathname === "/api/benchmark/cua/screenshot" && req.method === "GET") {
      const service = getCuaService();
      if (!service) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error:
              "CUA service is unavailable. Set MILADY_ENABLE_CUA=1 and configure CUA_HOST (or CUA_API_KEY + CUA_SANDBOX_NAME).",
          }),
        );
        return;
      }

      try {
        const screenshot = await service.screenshotBase64();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            screenshot,
            mimeType: "image/png",
            timestamp: Date.now(),
          }),
        );
      } catch (err: unknown) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      return;
    }

    if (pathname === "/api/benchmark/cua/run" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        const service = getCuaService();
        if (!service) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error:
                "CUA service is unavailable. Set MILADY_ENABLE_CUA=1 and configure CUA_HOST (or CUA_API_KEY + CUA_SANDBOX_NAME).",
            }),
          );
          return;
        }

        try {
          const parsed = body.trim()
            ? (JSON.parse(body) as {
                goal?: unknown;
                room_id?: unknown;
                roomId?: unknown;
                auto_approve?: unknown;
                autoApprove?: unknown;
                include_screenshots?: unknown;
                includeScreenshots?: unknown;
                max_approvals?: unknown;
                maxApprovals?: unknown;
              })
            : {};

          const goal =
            typeof parsed.goal === "string" ? parsed.goal.trim() : "";
          if (!goal) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: false,
                error: 'Missing non-empty "goal" in request body',
              }),
            );
            return;
          }

          const roomId = resolveCuaRoomId(parsed.room_id ?? parsed.roomId);
          const autoApprove = parseBooleanValue(
            parsed.auto_approve ?? parsed.autoApprove,
            false,
          );
          const includeScreenshots = parseBooleanValue(
            parsed.include_screenshots ?? parsed.includeScreenshots,
            false,
          );

          const maxApprovalsRaw =
            typeof parsed.max_approvals === "number"
              ? parsed.max_approvals
              : typeof parsed.maxApprovals === "number"
                ? parsed.maxApprovals
                : 5;
          const maxApprovals =
            Number.isFinite(maxApprovalsRaw) && maxApprovalsRaw > 0
              ? Math.floor(maxApprovalsRaw)
              : 5;

          let approvals = 0;
          let result = await service.runTask(roomId, goal);

          while (
            autoApprove &&
            isRecord(result) &&
            result.status === "paused_for_approval" &&
            approvals < maxApprovals
          ) {
            approvals += 1;
            result = await service.approveLatest(roomId);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              room_id: roomId,
              approvals,
              auto_approve: autoApprove,
              result: compactCuaResult(result, includeScreenshots),
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: errorMessage }));
        }
      });
      return;
    }

    if (pathname === "/api/benchmark/cua/approve" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        const service = getCuaService();
        if (!service) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error:
                "CUA service is unavailable. Set MILADY_ENABLE_CUA=1 and configure CUA_HOST (or CUA_API_KEY + CUA_SANDBOX_NAME).",
            }),
          );
          return;
        }

        try {
          const parsed = body.trim()
            ? (JSON.parse(body) as { room_id?: unknown; roomId?: unknown })
            : {};
          const roomId = resolveCuaRoomId(parsed.room_id ?? parsed.roomId);
          const result = await service.approveLatest(roomId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              room_id: roomId,
              result: compactCuaResult(result, false),
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: errorMessage }));
        }
      });
      return;
    }

    if (pathname === "/api/benchmark/cua/cancel" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        const service = getCuaService();
        if (!service) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error:
                "CUA service is unavailable. Set MILADY_ENABLE_CUA=1 and configure CUA_HOST (or CUA_API_KEY + CUA_SANDBOX_NAME).",
            }),
          );
          return;
        }

        try {
          const parsed = body.trim()
            ? (JSON.parse(body) as { room_id?: unknown; roomId?: unknown })
            : {};
          const roomId = resolveCuaRoomId(parsed.room_id ?? parsed.roomId);
          await service.cancelLatest(roomId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              room_id: roomId,
              status: "cancelled",
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: errorMessage }));
        }
      });
      return;
    }

    if (pathname === "/api/benchmark/message" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body) as {
            text?: unknown;
            context?: unknown;
            image?: unknown;
          };

          const text =
            typeof parsed.text === "string" ? parsed.text.trim() : "";
          if (!text) {
            throw new Error(
              "Request body must include non-empty string `text`",
            );
          }

          const context = extractRecord(parsed.context);
          const taskId = extractTaskId(context);
          const benchmark = extractBenchmarkName(context);
          const session =
            resolveSession(taskId, benchmark, true) ??
            activeSession ??
            resolveSession("default-task", "unknown", true);
          if (!session) {
            throw new Error("Failed to resolve benchmark session");
          }
          const key = sessionKey(session);
          const trajectory = trajectoriesBySession.get(key) ?? [];
          const startedAt = Date.now();

          await ensureBenchmarkSessionContext(runtime, session);

          const benchmarkContext = normalizeBenchmarkContext(session, context);
          const composedPrompt = composeBenchmarkPrompt({
            text,
            context: benchmarkContext,
            image: parsed.image,
          });

          const incomingMessage: Memory = {
            id: stringToUuid(`benchmark-msg:${Date.now()}:${Math.random()}`),
            content: {
              text: composedPrompt,
              source: "benchmark",
              metadata: {
                benchmark: session.benchmark,
                taskId: session.taskId,
                ...(context ? { contextJson: JSON.stringify(context) } : {}),
              },
            },
            entityId: session.userEntityId,
            agentId: runtime.agentId,
            roomId: session.roomId,
            createdAt: Date.now(),
          };

          const callbackTexts: string[] = [];
          const callback = async (content: Content): Promise<Memory[]> => {
            if (
              typeof content.text === "string" &&
              content.text.trim().length > 0
            ) {
              callbackTexts.push(content.text.trim());
            }
            return [];
          };

          if (!runtime.messageService) {
            throw new Error("Runtime message service is not available");
          }
          const messageService = runtime.messageService;

          clearCapturedAction();
          setBenchmarkContext(benchmarkContext);
          const result = await (async () => {
            try {
              return await messageService.handleMessage(
                runtime,
                incomingMessage,
                callback,
              );
            } finally {
              setBenchmarkContext(null);
            }
          })();

          const capturedAction = getCapturedAction();

          const responseText =
            typeof result.responseContent?.text === "string"
              ? result.responseContent.text
              : callbackTexts.join("\n\n");
          const thought =
            typeof result.responseContent?.thought === "string"
              ? result.responseContent.thought
              : null;
          const actionList = coerceActions(result.responseContent?.actions);
          const actions =
            actionList.length > 0
              ? actionList
              : capturedAction
                ? ["BENCHMARK_ACTION"]
                : [];
          const parsedParams = coerceParams(result.responseContent?.params);
          const params =
            Object.keys(parsedParams).length > 0
              ? parsedParams
              : capturedActionToParams(capturedAction);
          const finishedAt = Date.now();

          trajectory.push({
            step: trajectory.length + 1,
            startedAt,
            finishedAt,
            inputText: text,
            promptText: composedPrompt,
            context,
            thought,
            responseText,
            actions,
            params,
          });
          trajectoriesBySession.set(key, trajectory);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              text: responseText,
              thought,
              actions,
              params,
              benchmark: session.benchmark,
              task_id: session.taskId,
              room_id: session.roomId,
              trajectory_step: trajectory.length,
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorDetail =
            err instanceof Error && err.stack
              ? err.stack
              : formatUnknownError(err);
          elizaLogger.error(`[bench] Request error: ${errorDetail}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, host, () => {
    elizaLogger.info(
      `[bench] Milady benchmark server listening on ${host}:${port}`,
    );
    console.log(`MILADY_BENCH_READY host=${host} port=${port}`);
  });
}

startBenchmarkServer().catch((err) => {
  console.error("Failed to start benchmark server:", err);
  process.exit(1);
});
