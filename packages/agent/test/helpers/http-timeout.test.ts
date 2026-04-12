import { EventEmitter } from "node:events";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http.ts";

function mockHttpRequest(args: { timeout: boolean }) {
  return vi.spyOn(http, "request").mockImplementation((options, callback) => {
    const request = new EventEmitter() as http.ClientRequest & {
      destroy: (error?: Error) => http.ClientRequest;
      end: () => http.ClientRequest;
      setTimeout: (
        timeout: number,
        listener: () => void,
      ) => http.ClientRequest;
      write: (chunk: string | Buffer) => boolean;
    };

    let timeoutListener: (() => void) | null = null;
    request.setTimeout = ((_timeout, listener) => {
      timeoutListener = listener;
      return request;
    }) as typeof request.setTimeout;
    request.write = vi.fn(() => true) as typeof request.write;
    request.destroy = ((error?: Error) => {
      if (error) {
        queueMicrotask(() => request.emit("error", error));
      }
      return request;
    }) as typeof request.destroy;
    request.end = (() => {
      if (args.timeout) {
        timeoutListener?.();
        return request;
      }

      const response = new EventEmitter() as http.IncomingMessage;
      response.statusCode = 200;
      response.headers = {};
      queueMicrotask(() => {
        callback?.(response);
        response.emit(
          "data",
          Buffer.from(JSON.stringify({ ok: true }), "utf-8"),
        );
        response.emit("end");
      });
      return request;
    }) as typeof request.end;

    return request;
  });
}

describe("test HTTP helper timeouts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when the request exceeds the configured timeout", async () => {
    mockHttpRequest({ timeout: true });

    await expect(
      req(31337, "GET", "/stuck", undefined, undefined, { timeoutMs: 25 }),
    ).rejects.toThrow(/timed out/i);
  });

  it("still succeeds when the response completes before the timeout", async () => {
    mockHttpRequest({ timeout: false });

    const response = await req(
      31337,
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
