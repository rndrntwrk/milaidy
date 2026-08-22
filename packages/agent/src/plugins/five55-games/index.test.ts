import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as drive555Artifacts from "./drive555-local-artifacts";
import { Drive555RehearsalSupervisor } from "./drive555-rehearsal-supervisor";
import { createFive55GamesPlugin } from "./index";

const originalEnv = { ...process.env };
const DRIVE555_POLICY_FIXTURE = {
  reactionWindowMs: 190,
  riskTolerance: 0.4,
  recenterBias: 0.8,
  hazardAvoidanceBias: 0.84,
};

function actionResultText(result: { text: string }) {
  return JSON.parse(result.text) as Record<string, unknown>;
}

function buildRuntime(): IAgentRuntime {
  return {
    agentId: "agent-1",
    getSetting: vi.fn(() => undefined),
  } as unknown as IAgentRuntime;
}

function buildMessage(roomId = "room-1"): Memory {
  return {
    entityId: "owner-1",
    roomId,
    metadata: { provider: "web", sender: { id: "owner-1" } },
    content: { text: "run it" },
  } as unknown as Memory;
}

function enableProductionDrive555(): void {
  process.env.NODE_ENV = "production";
  process.env.FIVE55_GAMES_DRIVE555_LIVE_CONTROL_ENABLED = "true";
  process.env.FIVE55_GAMES_LOCAL_SDK_ROOT = "/approved/sdk";
  process.env.FIVE55_GAMES_LOCAL_SDK_ENTRY = "/approved/sdk/gameplay.mjs";
  process.env.FIVE55_GAMES_LOCAL_ARCADE_ROOT = "/approved/arcade";
}

function buildProductionDrive555Runtime(): IAgentRuntime {
  const streamControl = {
    broadcastEvent: vi.fn(async () => ({ ok: true, sent: true })),
    triggerAdBreak: vi.fn(async () => ({
      graphicId: "graphic-1",
      layout: "squeeze-back",
      duration: 12_000,
    })),
  };
  return {
    agentId: "alice-agent",
    getSetting: vi.fn(() => undefined),
    getService: vi.fn(() => streamControl),
    createMemory: vi.fn(async () => undefined),
  } as unknown as IAgentRuntime;
}

function installProductionDrive555Artifacts() {
  const gameplayClient = {
    getGameCapabilities: vi.fn(async () => ({
      protocolVersion: "gameplay.v1",
      sessionId: "session-1",
      gameRunId: "run-1",
      controlMode: "fenced_agent_v1",
      binding: {
        bindingId: "binding-1",
        gameRunId: "run-1",
        sourceId: "source-1",
        gameId: "555drive",
        controlMode: "fenced_agent_v1",
      },
    })),
  };
  const loadArtifacts = vi
    .spyOn(drive555Artifacts, "loadDrive555LocalArtifacts")
    .mockResolvedValue({
      sdk: {
        GameplayApiClient: function GameplayApiClient(_options: {
          apiUrl: string;
          token: string;
        }) {
          return gameplayClient;
        },
        sha256GameplayCanonical: () => "a".repeat(64),
      },
      adapter: { normalizeObservation: vi.fn() },
      controller: { initialState: vi.fn(), decide: vi.fn() },
      controllerArtifact: {
        schemaVersion: "gameplay-controller-artifact.v1",
        packageName: "@rndrntwrk/plugin-555arcade",
        controllerId: "racing_line",
        controllerVersion: "1.0.0",
        entrypoint: "racing-line.js",
        files: [{ path: "racing-line.js", sha256: "b".repeat(64) }],
        artifactDigest: "c".repeat(64),
      },
      expectedArtifacts: {
        bridgeDigest: "d".repeat(64),
        adapterManifestDigest: "e".repeat(64),
        controllerDigest: "c".repeat(64),
        sourceAnchorDigest: "f".repeat(64),
        initialFixtureDigest: "1".repeat(64),
      },
    } as never);
  return { gameplayClient, loadArtifacts };
}

function enqueueProductionDrive555Fetches(
  fetchMock: ReturnType<typeof vi.spyOn>,
): void {
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: "session-1" }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ active: false }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ cfSessionId: "cf-1" }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "started",
          sessionId: "session-1",
          sourceId: "source-1",
          gameId: "555drive",
          runId: "run-1",
        }),
        { status: 201 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          active: true,
          phase: "live",
          cloudflare: { isConnected: true, state: "connected" },
        }),
        { status: 200 },
      ),
    );
}

function routeProductionDrive555Fetches(
  fetchMock: ReturnType<typeof vi.spyOn>,
): void {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/agent/v1/sessions") && init?.method === "POST") {
      return new Response(JSON.stringify({ sessionId: "session-1" }), {
        status: 200,
      });
    }
    if (
      url.endsWith("/api/agent/v1/sessions/session-1") &&
      init?.method === "GET"
    ) {
      return new Response(
        JSON.stringify({ active: true, cfSessionId: "cf-1" }),
        { status: 200 },
      );
    }
    if (url.endsWith("/games/play") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          status: "already_running",
          sessionId: "session-1",
          sourceId: "source-1",
          gameId: "555drive",
          runId: "run-1",
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/stream/status") && init?.method === "GET") {
      return new Response(
        JSON.stringify({
          active: true,
          phase: "live",
          cloudflare: { isConnected: true, state: "connected" },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error: "unexpected test request" }), {
      status: 500,
    });
  });
}

async function invokeProductionDrive555(
  runtime: IAgentRuntime,
  message = buildMessage(),
) {
  const action = createFive55GamesPlugin().actions?.find(
    (entry) => entry.name === "FIVE55_GAMES_GO_LIVE_PLAY",
  );
  return action?.handler?.(
    runtime,
    message,
    { values: { trustedAdmin: true } } as unknown as State,
    {
      parameters: {
        sessionId: "session-1",
        gameId: "555drive",
        gameRunId: "run-1",
        goal: "drive the verified racing line safely",
      },
    },
    undefined,
  );
}

async function waitForRequestCount(
  fetchMock: ReturnType<typeof vi.spyOn>,
  suffix: string,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const count = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith(suffix),
    ).length;
    if (count === expected) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`timed out waiting for ${expected} ${suffix} requests`);
}

describe("five55-games plugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.STREAM555_BASE_URL = "https://stream555.example";
    process.env.STREAM555_AGENT_TOKEN = "static-token";
  });

  it("defaults play mode to agent and resolves a game id from catalog", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-1" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ games: [{ id: "knighthood" }, { id: "ninja" }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ started: true }), { status: 200 }),
      );

    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "FIVE55_GAMES_PLAY",
    );
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: true } } as unknown as State,
      { parameters: {} },
      undefined,
    );

    expect(result?.success).toBe(true);
    expect(actionResultText(result as { text: string }).message).toBe(
      "game play started",
    );
    const playCall = fetchMock.mock.calls[2];
    expect(String(playCall?.[0])).toContain(
      "/api/agent/v1/sessions/session-1/games/play",
    );
    expect(playCall?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(playCall?.[1]?.body))).toMatchObject({
      gameId: "knighthood",
      mode: "agent",
    });
  });

  it("go-live play provisions stream output before playing and waits for readiness", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-1" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ active: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cfSessionId: "cf-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ games: [{ id: "ninja" }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ started: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            active: true,
            phase: "live",
            cloudflare: { isConnected: true, state: "connected" },
          }),
          { status: 200 },
        ),
      );

    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "FIVE55_GAMES_GO_LIVE_PLAY",
    );
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: true } } as unknown as State,
      { parameters: {} },
      undefined,
    );

    expect(result?.success).toBe(true);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://stream555.example/api/agent/v1/sessions",
      "https://stream555.example/api/agent/v1/sessions/session-1",
      "https://stream555.example/api/agent/v1/sessions/session-1/stream/start",
      "https://stream555.example/api/agent/v1/sessions/session-1/games/catalog",
      "https://stream555.example/api/agent/v1/sessions/session-1/games/play",
      "https://stream555.example/api/agent/v1/sessions/session-1/stream/status",
    ]);
  });

  it("fails closed before network access when production 555Drive control is not explicitly enabled", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.FIVE55_GAMES_DRIVE555_LIVE_CONTROL_ENABLED;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "FIVE55_GAMES_GO_LIVE_PLAY",
    );
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: true } } as unknown as State,
      {
        parameters: {
          sessionId: "session-1",
          gameId: "555drive",
          gameRunId: "run-1",
        },
      },
      undefined,
    );

    expect(result?.success).toBe(false);
    expect(actionResultText(result as { text: string }).message).toContain(
      "FIVE55_GAMES_DRIVE555_LIVE_CONTROL_ENABLED=true",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires explicit session and game-run identity before starting production 555Drive", async () => {
    process.env.NODE_ENV = "production";
    process.env.FIVE55_GAMES_DRIVE555_LIVE_CONTROL_ENABLED = "true";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "FIVE55_GAMES_GO_LIVE_PLAY",
    );
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: true } } as unknown as State,
      { parameters: { sessionId: "session-1", gameId: "555drive" } },
      undefined,
    );

    expect(result?.success).toBe(false);
    expect(actionResultText(result as { text: string }).message).toContain(
      "sessionId and gameRunId are required for production 555Drive control",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects loopback and non-TLS bases for production 555Drive before sending credentials", async () => {
    process.env.NODE_ENV = "production";
    process.env.FIVE55_GAMES_DRIVE555_LIVE_CONTROL_ENABLED = "true";
    process.env.STREAM555_BASE_URL = "http://127.0.0.1:3000";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "FIVE55_GAMES_GO_LIVE_PLAY",
    );
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: true } } as unknown as State,
      {
        parameters: {
          sessionId: "session-1",
          gameId: "555drive",
          gameRunId: "run-1",
        },
      },
      undefined,
    );

    expect(result?.success).toBe(false);
    expect(actionResultText(result as { text: string }).message).toContain(
      "production 555Drive control requires a credential-free remote HTTPS base",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires agent mode before provisioning a production 555Drive session", async () => {
    enableProductionDrive555();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "FIVE55_GAMES_GO_LIVE_PLAY",
    );
    const result = await action?.handler?.(
      buildProductionDrive555Runtime(),
      buildMessage(),
      { values: { trustedAdmin: true } } as unknown as State,
      {
        parameters: {
          sessionId: "session-1",
          gameId: "555drive",
          gameRunId: "run-1",
          mode: "ranked",
        },
      },
      undefined,
    );

    expect(result?.success).toBe(false);
    expect(actionResultText(result as { text: string }).message).toContain(
      "production 555Drive control requires agent mode",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a session bootstrap that changes the requested production binding", async () => {
    enableProductionDrive555();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: "session-other" }), {
        status: 200,
      }),
    );

    const result = await invokeProductionDrive555(
      buildProductionDrive555Runtime(),
    );

    expect(result?.success).toBe(false);
    expect(actionResultText(result as { text: string }).message).toContain(
      "session bootstrap did not preserve the requested 555Drive identity",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not report production 555Drive live until the fenced native loop returns reflected proof", async () => {
    enableProductionDrive555();
    const { gameplayClient, loadArtifacts } =
      installProductionDrive555Artifacts();
    const runSupervisor = vi
      .spyOn(Drive555RehearsalSupervisor.prototype, "run")
      .mockResolvedValue({
        gameRunId: "run-1",
        decisionId: "decision-1",
        reflectedObservationSequence: 42,
      });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    enqueueProductionDrive555Fetches(fetchMock);

    const result = await invokeProductionDrive555(
      buildProductionDrive555Runtime(),
    );

    expect(result?.success, result?.text).toBe(true);
    const envelope = actionResultText(result as { text: string });
    expect(envelope.message).toBe(
      "Alice 555Drive is live with reflected native control evidence",
    );
    expect(envelope.data).toMatchObject({
      binding: {
        sessionId: "session-1",
        gameId: "555drive",
        gameRunId: "run-1",
        sourceId: "source-1",
      },
      control: {
        decisionId: "decision-1",
        reflectedObservationSequence: 42,
      },
    });
    expect(loadArtifacts).toHaveBeenCalledWith({
      mode: "local",
      sdk: {
        allowedRoot: "/approved/sdk",
        entryPath: "/approved/sdk/gameplay.mjs",
      },
      arcade: { allowedRoot: "/approved/arcade" },
    });
    expect(gameplayClient.getGameCapabilities).toHaveBeenNthCalledWith(
      1,
      "session-1",
    );
    expect(gameplayClient.getGameCapabilities).toHaveBeenNthCalledWith(
      2,
      "session-1",
    );
    expect(runSupervisor).toHaveBeenCalledWith({
      sessionId: "session-1",
      gameRunId: "run-1",
      goal: "drive the verified racing line safely",
    });
    const playCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/games/play"),
    );
    expect(JSON.parse(String(playCall?.[1]?.body))).toMatchObject({
      gameId: "555drive",
      mode: "agent",
      runId: "run-1",
      controlAuthority: "milaidy",
      policyVersion: 1,
      policySnapshot: DRIVE555_POLICY_FIXTURE,
    });
  });

  it("coalesces concurrent production control for the same fenced 555Drive binding", async () => {
    enableProductionDrive555();
    const { loadArtifacts } = installProductionDrive555Artifacts();
    let resolveControl:
      | ((value: {
          gameRunId: string;
          decisionId: string;
          reflectedObservationSequence: number;
        }) => void)
      | undefined;
    const controlResult = new Promise<{
      gameRunId: string;
      decisionId: string;
      reflectedObservationSequence: number;
    }>((resolve) => {
      resolveControl = resolve;
    });
    const runSupervisor = vi
      .spyOn(Drive555RehearsalSupervisor.prototype, "run")
      .mockImplementation(async () => controlResult);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    routeProductionDrive555Fetches(fetchMock);
    const runtime = buildProductionDrive555Runtime();

    const first = invokeProductionDrive555(runtime);
    const second = invokeProductionDrive555(runtime);
    await waitForRequestCount(fetchMock, "/games/play", 2);
    resolveControl?.({
      gameRunId: "run-1",
      decisionId: "decision-1",
      reflectedObservationSequence: 42,
    });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult?.success).toBe(true);
    expect(secondResult?.text).toBe(firstResult?.text);
    expect(loadArtifacts).toHaveBeenCalledTimes(1);
    expect(runSupervisor).toHaveBeenCalledTimes(1);
  });

  it("keeps idempotency scoped to the Alice persistence room", async () => {
    enableProductionDrive555();
    const { loadArtifacts } = installProductionDrive555Artifacts();
    let resolveControl:
      | ((value: {
          gameRunId: string;
          decisionId: string;
          reflectedObservationSequence: number;
        }) => void)
      | undefined;
    const controlResult = new Promise<{
      gameRunId: string;
      decisionId: string;
      reflectedObservationSequence: number;
    }>((resolve) => {
      resolveControl = resolve;
    });
    const runSupervisor = vi
      .spyOn(Drive555RehearsalSupervisor.prototype, "run")
      .mockImplementation(async () => controlResult);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    routeProductionDrive555Fetches(fetchMock);
    const runtime = buildProductionDrive555Runtime();

    const first = invokeProductionDrive555(runtime, buildMessage("room-1"));
    const second = invokeProductionDrive555(runtime, buildMessage("room-2"));
    await waitForRequestCount(fetchMock, "/games/play", 2);
    resolveControl?.({
      gameRunId: "run-1",
      decisionId: "decision-1",
      reflectedObservationSequence: 42,
    });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult?.success).toBe(true);
    expect(secondResult?.success).toBe(true);
    expect(loadArtifacts).toHaveBeenCalledTimes(2);
    expect(runSupervisor).toHaveBeenCalledTimes(2);
  });

  it("rejects play actions when the caller is not trusted", async () => {
    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "FIVE55_GAMES_PLAY",
    );
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: false } } as unknown as State,
      { parameters: { gameId: "ninja" } },
      undefined,
    );

    expect(result?.success).toBe(false);
    expect(actionResultText(result as { text: string }).status).toBe(403);
  });
});
