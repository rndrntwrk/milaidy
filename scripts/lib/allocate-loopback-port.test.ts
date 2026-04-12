import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createServerMock } = vi.hoisted(() => ({
  createServerMock: vi.fn(),
}));

vi.mock("node:net", () => ({
  createServer: createServerMock,
}));

import { allocateFirstFreeLoopbackPort } from "./allocate-loopback-port.mjs";

type BindResult = "ok" | "error";

function mockBindSequence(...results: BindResult[]) {
  const queue = [...results];
  createServerMock.mockImplementation(() => {
    const server = new EventEmitter() as EventEmitter & {
      close: (cb?: () => void) => void;
      listen: (options: { host: string; port: number }, cb: () => void) => void;
      removeAllListeners: () => EventEmitter;
      unref?: () => void;
    };

    server.listen = (_options, cb) => {
      const next = queue.shift() ?? "ok";
      queueMicrotask(() => {
        if (next === "error") {
          server.emit("error", new Error("bind failed"));
          return;
        }
        cb();
      });
    };
    server.close = (cb) => {
      cb?.();
    };
    server.unref = () => {};
    return server;
  });
}

describe("allocateFirstFreeLoopbackPort", () => {
  afterEach(() => {
    createServerMock.mockReset();
  });

  it("returns preferred when free", async () => {
    mockBindSequence("ok");
    const p = await allocateFirstFreeLoopbackPort(45_200);
    expect(p).toBe(45_200);
  });

  it("advances when preferred is held", async () => {
    mockBindSequence("error", "ok");
    const p = await allocateFirstFreeLoopbackPort(45_210, { maxHops: 5 });
    expect(p).toBe(45_211);
  });

  it("throws when no free port exists within maxHops", async () => {
    mockBindSequence("error", "error");
    await expect(
      allocateFirstFreeLoopbackPort(45_220, { maxHops: 2 }),
    ).rejects.toThrow(/No free TCP port/);
  });
});
