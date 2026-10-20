import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "./server";

describe("compat misc route wiring", () => {
  let port: number;
  let close: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  it("serves misc routes with local terminal auth helpers wired", async () => {
    const { status, data } = await req(port, "GET", "/api/emotes");

    expect(status).toBe(200);
    expect(Array.isArray(data.emotes)).toBe(true);
  });

  it("delivers an authenticated native emote to the real avatar websocket", async () => {
    vi.stubEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    vi.stubEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    vi.stubEnv("MILADY_API_TOKEN", "emote-route-test-token");
    vi.stubEnv("ELIZA_API_TOKEN", "emote-route-test-token");
    let ws: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const denied = await req(port, "POST", "/api/emote", { emoteId: "wave" });
      expect(denied.status).toBe(401);

      const headers = { Authorization: "Bearer emote-route-test-token" };
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
      await once(ws, "open");
      const delivered = new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Avatar emote was not delivered")),
            3000,
          );
          ws?.on("message", (raw) => {
            const payload = JSON.parse(raw.toString());
            if (payload.type === "emote") resolve(payload);
          });
        },
      );
      const response = await req(
        port,
        "POST",
        "/api/emote",
        { emoteId: "wave" },
        headers,
      );
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        ok: true,
        broadcast: { sent: false },
      });
      expect(await delivered).toMatchObject({
        type: "emote",
        emoteId: "wave",
        path: "/animations/emotes/waving-both-hands.glb.gz",
        loop: false,
      });
    } finally {
      clearTimeout(timer);
      ws?.terminate();
      vi.unstubAllEnvs();
    }
  });
});
