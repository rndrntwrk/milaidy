import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import { requestAgentJson } from "./agent-auth.js";

const keys = ["ALICE_RUNTIME_AUTHORITY_MODE", "ALICE_RUNTIME_PROFILE", "STREAM555_PUBLIC_BASE_URL",
  "STREAM555_DEFAULT_SESSION_ID", "STREAM555_AGENT_TOKEN", "STREAM555_AGENT_API_KEY"];
let saved: Map<string, string | undefined>;
let originalFetch: typeof fetch;
beforeEach(() => {
  saved = new Map(keys.map(key => [key, process.env[key]]));
  process.env.ALICE_RUNTIME_AUTHORITY_MODE = "proposer-only";
  process.env.ALICE_RUNTIME_PROFILE = "full-gated";
  process.env.STREAM555_PUBLIC_BASE_URL = "https://stream.rndrntwrk.com";
  process.env.STREAM555_DEFAULT_SESSION_ID = "alice-session";
  process.env.STREAM555_AGENT_API_KEY = "retired-api-key";
  const now = Math.floor(Date.now() / 1000);
  process.env.STREAM555_AGENT_TOKEN = [Buffer.from('{"alg":"HS256"}').toString("base64url"),
    Buffer.from(JSON.stringify({ type: "agent", studioAuthority: "d1-v1", iss: "555stream-studio-agent",
      aud: "555stream-native", jti: "grant-1", userId: "alice", subjectUserId: "alice", agentId: "alice",
      actorId: "actor-alice", actorType: "agent", authMethod: "agent_key", sessionKind: "agent_runtime",
      policyId: "policy-1", scopes: ["sessions:read"], sessionIds: ["alice-session"], iat: now, exp: now + 604800,
    })).toString("base64url"), "test-signature"].join(".");
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it("shares native credentials with game requests and never replays an uncertain write", async () => {
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${process.env.STREAM555_AGENT_TOKEN}`);
    assert.equal(init?.redirect, "error");
    return Response.json({ error: "unavailable" }, { status: 503 });
  };
  const result = await requestAgentJson({ baseUrl: "https://stream.rndrntwrk.com", endpoint: "/api/test",
    method: "POST", body: { input: "neutral" }, retries: 3 });
  assert.equal(calls, 1);
  assert.equal(result.authSource, "native-grant");
  assert.equal(result.status, 503);
});

it("retains bounded read retries and never sends a native bearer to another origin", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? Response.json({}, { status: 503 }) : Response.json({ ok: true });
  const result = await requestAgentJson({ baseUrl: "https://stream.rndrntwrk.com", endpoint: "/api/test",
    method: "GET", retries: 1, retryBaseDelayMs: 1 });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  const denied = await requestAgentJson({ baseUrl: "https://stream.rndrntwrk.com", endpoint: "https://foreign.example/api/test",
    method: "POST" });
  assert.equal(denied.ok, false);
  assert.equal(calls, 2);
});
