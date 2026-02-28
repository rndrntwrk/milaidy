import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, MiladyClient } from "../../src/api-client";

describe("MiladyClient request timeout handling", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it("raises typed timeout error for hung requests", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    const request = client.getStatus().catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(10_001);

    const error = await request;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: "timeout",
      path: "/api/status",
    });
  });

  it("raises typed timeout error for raw export requests", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    const request = client
      .exportTrajectories({ format: "json" })
      .catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(10_001);

    const error = await request;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: "timeout",
      path: "/api/trajectories/export",
    });
  });

  it("uses extended timeout for app launch requests", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    let settled = false;
    const request = client
      .launchApp("@elizaos/app-hyperscape")
      .catch((err: unknown) => err)
      .then((value) => {
        settled = true;
        return value;
      });

    await vi.advanceTimersByTimeAsync(10_001);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(35_001);
    const error = await request;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: "timeout",
      path: "/api/apps/launch",
      message: "Request timed out after 45000ms",
    });
  });

  it("uses extended timeout for hyperscape API requests", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    let settled = false;
    const request = client
      .listHyperscapeEmbeddedAgents()
      .catch((err: unknown) => err)
      .then((value) => {
        settled = true;
        return value;
      });

    await vi.advanceTimersByTimeAsync(10_001);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(20_001);
    const error = await request;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: "timeout",
      path: "/api/apps/hyperscape/embedded-agents",
      message: "Request timed out after 30000ms",
    });
  });
});
