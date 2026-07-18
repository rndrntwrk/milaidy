import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("serves the empty computer-use approvals fallback", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/computer-use/approvals",
    );

    expect(status).toBe(200);
    expect(data).toEqual({
      mode: "full_control",
      pendingCount: 0,
      pendingApprovals: [],
    });
  });

  it("acknowledges overlay presence without requiring an app registry", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/apps/overlay-presence",
      { appName: null },
    );

    expect(status).toBe(200);
    expect(data).toEqual({ ok: true, appName: null });
  });
});
