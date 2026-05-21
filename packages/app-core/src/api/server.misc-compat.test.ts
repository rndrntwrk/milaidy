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
});
