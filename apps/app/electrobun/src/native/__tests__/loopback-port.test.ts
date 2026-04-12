import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createServerMock } = vi.hoisted(() => ({
  createServerMock: vi.fn(),
}));

vi.mock("node:net", () => ({
  createServer: createServerMock,
}));

import { findFirstAvailableLoopbackPort } from "../loopback-port";

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

describe("findFirstAvailableLoopbackPort", () => {
  afterEach(() => {
    createServerMock.mockReset();
  });

  it("returns preferred when it is free", async () => {
    mockBindSequence("ok");
    const p = await findFirstAvailableLoopbackPort(45_000);
    expect(p).toBe(45_000);
  });

  it("skips occupied ports", async () => {
    mockBindSequence("error", "ok");
    const p = await findFirstAvailableLoopbackPort(45_010, { maxHops: 5 });
    expect(p).toBe(45_011);
  });
});
