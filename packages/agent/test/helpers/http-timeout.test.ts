import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { req } from "../../../../test/helpers/http.ts";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("server did not expose a numeric port"));
        return;
      }
      resolve(address.port);
    });
  });
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe("test HTTP helper timeouts", () => {
  const servers = new Set<http.Server>();

  afterEach(async () => {
    await Promise.all(Array.from(servers, (server) => close(server)));
    servers.clear();
  });

  it("rejects when the request exceeds the configured timeout", async () => {
    const server = http.createServer(() => {
      // Intentionally never responds.
    });
    servers.add(server);
    const port = await listen(server);

    await expect(
      req(port, "GET", "/stuck", undefined, undefined, { timeoutMs: 25 }),
    ).rejects.toThrow(/timed out/i);
  });

  it("still succeeds when the response completes before the timeout", async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    servers.add(server);
    const port = await listen(server);

    const response = await req(
      port,
      "GET",
      "/ok",
      undefined,
      undefined,
      { timeoutMs: 1_000 },
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ ok: true });
  });
});
