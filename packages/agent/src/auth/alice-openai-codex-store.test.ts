import { afterEach, describe, expect, it, vi } from "vitest";
import { createAliceOpenAiCodexCredentialStore } from "./alice-openai-codex-store";

vi.mock("@elizaos/core", () => ({ logger: {} }));
vi.mock("./anthropic.js", () => ({ refreshAnthropicToken: vi.fn() }));
vi.mock("./openai-codex.js", () => ({ refreshCodexToken: vi.fn() }));

const credentials = {
  access: "access-value-for-test",
  refresh: "refresh-value-for-test",
  expires: 1_900_000_000_000,
};
const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe("Alice OpenAI Codex credential store", () => {
  it("persists pi-ai account credentials without metadata and retains required-field validation", async () => {
    const { persistOpenAiCodexCredentials } = await import("./credentials");
    let record: Record<string, unknown> | null = null;
    const fetchImpl = async (request: Request) => {
      const body = (await request.json()) as Record<string, unknown>;
      if (body.operation === "record.get") return Response.json({ ok: true, record });
      record = { payload: body.payload };
      return Response.json({ ok: true, record });
    };
    const input = {
      ownerId: "alice-owner-production",
      statePlaneUrl: "http://alice-state-plane.internal/v1/openai-codex-credentials",
      passphrase: "p".repeat(48),
      fetchImpl,
    };

    process.env = {
      ...originalEnv,
      ALICE_STATE_OWNER_ID: input.ownerId,
      ALICE_OPENAI_CODEX_STATE_URL: input.statePlaneUrl,
      ELIZA_VAULT_PASSPHRASE: input.passphrase,
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (request) => {
      if (!(request instanceof Request)) throw new Error("Expected a state-plane Request");
      return fetchImpl(request);
    });
    // pi-ai 0.52.12 returns accountId from both login and token refresh.
    const piAiCredentials = { ...credentials, accountId: "account-for-test" };
    await persistOpenAiCodexCredentials(piAiCredentials);
    expect(JSON.stringify(record)).not.toContain("access-value-for-test");
    expect(JSON.stringify(record)).not.toContain("refresh-value-for-test");
    expect(await createAliceOpenAiCodexCredentialStore(input).read()).toEqual(credentials);

    const persistedRecord = record;
    await expect(persistOpenAiCodexCredentials({ ...piAiCredentials, refresh: "" }))
      .rejects.toThrow("ALICE_OPENAI_CODEX_STATE_INVALID");
    expect(record).toBe(persistedRecord);
  });

  it("fails closed when the sealed credential record is changed", async () => {
    let payload: Record<string, unknown> | null = null;
    const fetchImpl = async (request: Request) => {
      const body = (await request.json()) as Record<string, unknown>;
      if (body.operation === "record.get") return Response.json({ ok: true, record: { payload } });
      payload = body.payload as Record<string, unknown>;
      return Response.json({ ok: true, record: { payload } });
    };
    const store = createAliceOpenAiCodexCredentialStore({
      ownerId: "alice-owner-production",
      statePlaneUrl: "http://alice-state-plane.internal/v1/openai-codex-credentials",
      passphrase: "p".repeat(48),
      fetchImpl,
    });
    await store.write(credentials, 1_777_000_000_000);
    payload = { ...payload!, tag: "0".repeat(32) };

    await expect(store.read()).rejects.toThrow("ALICE_OPENAI_CODEX_STATE_INVALID");
  });
});
