import { type AddressInfo, createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { findFirstAvailableLoopbackPort } from "../loopback-port";

describe("findFirstAvailableLoopbackPort", () => {
  const holders: ReturnType<typeof createServer>[] = [];

  const listenOnEphemeralLoopbackPort = async () => {
    const server = createServer();
    holders.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ port: 0, host: "127.0.0.1" }, () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected loopback server to expose an AddressInfo");
    }
    return {
      port: (address as AddressInfo).port,
      server,
    };
  };

  const closeServer = async (server: ReturnType<typeof createServer>) => {
    const index = holders.indexOf(server);
    if (index >= 0) {
      holders.splice(index, 1);
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  afterEach(() => {
    for (const s of holders.splice(0)) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  });

  it("returns preferred when it is free", async () => {
    const { port, server } = await listenOnEphemeralLoopbackPort();
    await closeServer(server);
    const p = await findFirstAvailableLoopbackPort(port, { maxHops: 1 });
    expect(p).toBe(port);
  });

  it("skips occupied ports", async () => {
    const { port } = await listenOnEphemeralLoopbackPort();
    const p = await findFirstAvailableLoopbackPort(port, { maxHops: 16 });
    expect(p).toBeGreaterThan(port);
  });
});
