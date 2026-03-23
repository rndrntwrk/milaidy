import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { allocateFirstFreeLoopbackPort } from "./allocate-loopback-port.mjs";

describe("allocateFirstFreeLoopbackPort", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(() => {
    for (const s of servers.splice(0)) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  });

  it("returns preferred when free", async () => {
    const p = await allocateFirstFreeLoopbackPort(45_200);
    expect(p).toBe(45_200);
  });

  it("advances when preferred is held", async () => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ port: 45_210, host: "127.0.0.1" }, () => resolve());
    });
    const p = await allocateFirstFreeLoopbackPort(45_210, { maxHops: 5 });
    expect(p).toBe(45_211);
  });
});
