import { describe, expect, it } from "vitest";
import { createAliceOpenAiCodexCredentialStore } from "./alice-openai-codex-store";

const credentials = {
  access: "access-value-for-test",
  refresh: "refresh-value-for-test",
  expires: 1_900_000_000_000,
};

describe("Alice OpenAI Codex credential store", () => {
  it("encrypts credentials and restores them after a container replacement", async () => {
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

    await createAliceOpenAiCodexCredentialStore(input).write(credentials, 1_777_000_000_000);
    expect(JSON.stringify(record)).not.toContain("access-value-for-test");
    expect(JSON.stringify(record)).not.toContain("refresh-value-for-test");
    expect(await createAliceOpenAiCodexCredentialStore(input).read()).toEqual(credentials);
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
