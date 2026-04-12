import { EventEmitter } from "node:events";
import { createConnection } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createConnectionMock } = vi.hoisted(() => ({
  createConnectionMock: vi.fn(),
}));

vi.mock("node:net", () => ({
  createConnection: createConnectionMock,
}));

function createMockSocket(outcome: "connect" | "error") {
  const socket = new EventEmitter() as EventEmitter & { destroy: () => void };
  socket.destroy = vi.fn();
  queueMicrotask(() => {
    socket.emit(outcome);
  });
  return socket;
}

function waitForPort(
  port: number,
  { timeout = 2000, interval = 100 } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    let activeSocket: ReturnType<typeof createConnection> | null = null;

    function attempt() {
      if (Date.now() > deadline) {
        if (activeSocket) {
          activeSocket.destroy();
          activeSocket = null;
        }
        reject(
          new Error(
            `Timed out waiting for port ${port} after ${timeout / 1000}s`,
          ),
        );
        return;
      }
      activeSocket = createConnection({ port, host: "127.0.0.1" });
      activeSocket.once("connect", () => {
        activeSocket?.destroy();
        activeSocket = null;
        resolve();
      });
      activeSocket.once("error", () => {
        activeSocket?.destroy();
        activeSocket = null;
        setTimeout(attempt, interval);
      });
    }

    attempt();
  });
}

describe("waitForPort", () => {
  afterEach(() => {
    createConnectionMock.mockReset();
    vi.restoreAllMocks();
  });

  it("resolves when port becomes available", async () => {
    createConnectionMock.mockReturnValue(createMockSocket("connect"));
    await expect(
      waitForPort(31337, { timeout: 5000 }),
    ).resolves.toBeUndefined();
    expect(createConnectionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects on timeout without leaking sockets", async () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValue(1_100);
    createConnectionMock.mockImplementation(() => createMockSocket("error"));

    await expect(waitForPort(1, { timeout: 50, interval: 0 })).rejects.toThrow(
      "Timed out",
    );

    const firstSocket = createConnectionMock.mock.results[0]?.value as
      | { destroy: ReturnType<typeof vi.fn> }
      | undefined;
    expect(firstSocket?.destroy).toHaveBeenCalled();
  });
});
