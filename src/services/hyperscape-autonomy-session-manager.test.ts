import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IAgentRuntime } from "@elizaos/core";
import {
  HyperscapeAutonomySessionManager,
  resolveHyperscapeAutonomyEnabled,
  resolveDefaultHyperscapeAutonomyAgentId,
} from "./hyperscape-autonomy-session-manager.js";

const HYPERSCAPE_BASE_URL = "https://hyperscape.example";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitFor(
  check: () => boolean,
  timeoutMs = 10_000,
  intervalMs = 40,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

describe("HyperscapeAutonomySessionManager", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.EVM_PRIVATE_KEY =
      "0x59c6995e998f97a5a0044966f094538b292f0a1f0d7f5f9e3f98e8a7f8b80d0b";
    delete process.env.HYPERSCAPE_STREAM_AUTOSTART;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("orchestrates a session to in_world with wallet provenance", async () => {
    const events: string[] = [];
    let listCalls = 0;

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const target = new URL(String(input), HYPERSCAPE_BASE_URL);
      const method =
        init?.method?.toUpperCase() ||
        (input instanceof Request ? input.method.toUpperCase() : "GET");
      if (target.pathname === "/api/agents/wallet-auth") {
        return jsonResponse({
          success: true,
          authToken: "auth-token-1",
          characterId: "char-1",
          data: { expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
        });
      }
      if (target.pathname === "/api/embedded-agents" && method === "GET") {
        listCalls += 1;
        if (listCalls === 1) {
          return jsonResponse({ success: true, agents: [] });
        }
        return jsonResponse({
          success: true,
          agents: [
            {
              agentId: "embedded-1",
              characterId: "char-1",
              name: "alice",
              state: "running",
              entityId: "entity-1",
              position: { x: 5, y: 0, z: 2 },
              lastActivity: Date.now(),
            },
          ],
        });
      }
      if (target.pathname === "/api/embedded-agents" && method === "POST") {
        return jsonResponse({
          success: true,
          agent: {
            agentId: "embedded-1",
            characterId: "char-1",
            name: "alice",
            state: "idle",
          },
        });
      }
      if (target.pathname.endsWith("/start")) {
        return jsonResponse({ success: true });
      }
      if (target.pathname.endsWith("/goal")) {
        return jsonResponse({ success: true });
      }
      if (target.pathname.endsWith("/command")) {
        return jsonResponse({ success: true });
      }

      return jsonResponse({ success: true });
    }) as typeof global.fetch;

    const manager = new HyperscapeAutonomySessionManager({
      getRuntime: () => null,
      getHyperscapeApiBaseUrl: () => HYPERSCAPE_BASE_URL,
      onEvent: (event) => {
        events.push(event.session.state);
      },
    });

    const created = await manager.createSession({
      agentId: "alice",
      goal: "Gather resources and explore",
    });

    await waitFor(() => {
      const current = manager.getSession(created.sessionId);
      return current?.session.state === "in_world";
    });

    const result = manager.getSession(created.sessionId);
    expect(result?.session.state).toBe("in_world");
    expect(result?.session.characterId).toBe("char-1");
    expect(result?.session.walletAddress).toBeTruthy();
    expect(result?.session.firstActionAt).toBeTruthy();
    expect(events).toContain("wallet_ready");
    expect(events).toContain("auth_ready");
    expect(events).toContain("in_world");

    const wallet = manager.getWalletProvenance("alice");
    expect(wallet?.source).toBe("managed_signer");
    expect(wallet?.walletAddress).toBe(result?.session.walletAddress);

    const snapshot = manager.getOperationalSnapshot();
    expect(snapshot.totalSessions).toBe(1);
    expect(snapshot.states.in_world).toBe(1);

    manager.dispose();
  });

  it("reuses cached wallet auth token during recover", async () => {
    let walletAuthCalls = 0;

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const target = new URL(String(input), HYPERSCAPE_BASE_URL);
      const method =
        init?.method?.toUpperCase() ||
        (input instanceof Request ? input.method.toUpperCase() : "GET");
      if (target.pathname === "/api/agents/wallet-auth") {
        walletAuthCalls += 1;
        return jsonResponse({
          success: true,
          authToken: "auth-token-cache",
          characterId: "char-cache",
          data: { expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
        });
      }
      if (target.pathname === "/api/embedded-agents" && method === "GET") {
        return jsonResponse({
          success: true,
          agents: [
            {
              agentId: "embedded-cache",
              characterId: "char-cache",
              name: "alice",
              state: "running",
              entityId: "entity-cache",
              position: { x: 7, y: 0, z: 3 },
              lastActivity: Date.now(),
            },
          ],
        });
      }
      if (target.pathname.endsWith("/start")) {
        return jsonResponse({ success: true });
      }
      if (target.pathname.endsWith("/goal")) {
        return jsonResponse({ success: true });
      }
      if (target.pathname.endsWith("/command")) {
        return jsonResponse({ success: true });
      }
      if (target.pathname === "/api/embedded-agents" && method === "POST") {
        return jsonResponse({
          success: true,
          agent: {
            agentId: "embedded-cache",
            characterId: "char-cache",
            name: "alice",
          },
        });
      }
      return jsonResponse({ success: true });
    }) as typeof global.fetch;

    const manager = new HyperscapeAutonomySessionManager({
      getRuntime: () => null,
      getHyperscapeApiBaseUrl: () => HYPERSCAPE_BASE_URL,
    });

    const created = await manager.createSession({ agentId: "alice" });
    await waitFor(() => manager.getSession(created.sessionId)?.session.state === "in_world");

    await manager.recoverSession(created.sessionId);
    await waitFor(() => {
      const current = manager.getSession(created.sessionId);
      return (
        current?.session.state === "in_world" &&
        (current.session.recoveries ?? 0) >= 1
      );
    });

    expect(walletAuthCalls).toBe(1);
    expect(manager.getWalletProvenance("alice")?.source).toBe(
      "existing_agent_wallet",
    );
    manager.dispose();
  });

  it("resolves autonomy defaults from env/runtime", () => {
    expect(resolveHyperscapeAutonomyEnabled({ HYPERSCAPE_AUTONOMY_ENABLED: "1" })).toBe(true);
    expect(resolveHyperscapeAutonomyEnabled({ HYPERSCAPE_AUTONOMY_ENABLED: "false" })).toBe(
      false,
    );

    const runtime = {
      character: { name: "alice-runtime" },
      getSetting: vi.fn(),
    } as unknown as IAgentRuntime;
    expect(resolveDefaultHyperscapeAutonomyAgentId(runtime)).toBe("alice-runtime");
  });
});
