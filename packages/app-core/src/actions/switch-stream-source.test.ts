/**
 * Unit tests for the SWITCH_STREAM_SOURCE action.
 *
 * Verifies parameter validation, API call handling, error handling,
 * and action metadata.
 */

import type { HandlerOptions } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { switchStreamSourceAction } from "./switch-stream-source";

// ── Helpers ───────────────────────────────────────────────────────────────────

function callHandler(params: Record<string, unknown> = {}) {
  return switchStreamSourceAction.handler({} as never, {} as never, undefined, {
    parameters: params,
  } as HandlerOptions);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("SWITCH_STREAM_SOURCE action", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Metadata ──────────────────────────────────────────────────────────────

  it("has correct name", () => {
    expect(switchStreamSourceAction.name).toBe("SWITCH_STREAM_SOURCE");
  });

  it("has similes for natural language matching", () => {
    expect(switchStreamSourceAction.similes).toBeDefined();
    expect(switchStreamSourceAction.similes?.length).toBeGreaterThan(0);
    expect(switchStreamSourceAction.similes).toContain("CHANGE_STREAM");
    expect(switchStreamSourceAction.similes).toContain("STREAM_GAME");
    expect(switchStreamSourceAction.similes).toContain("STREAM_URL");
    expect(switchStreamSourceAction.similes).toContain("SET_STREAM_SOURCE");
  });

  it("has parameter definitions", () => {
    expect(switchStreamSourceAction.parameters).toBeDefined();
    expect(switchStreamSourceAction.parameters?.length).toBe(2);

    const sourceTypeParam = switchStreamSourceAction.parameters?.[0];
    expect(sourceTypeParam.name).toBe("sourceType");
    expect(sourceTypeParam.required).toBe(true);

    const customUrlParam = switchStreamSourceAction.parameters?.[1];
    expect(customUrlParam.name).toBe("customUrl");
    expect(customUrlParam.required).toBe(false);
  });

  it("validates successfully", async () => {
    const result = await switchStreamSourceAction.validate({} as never);
    expect(result).toBe(true);
  });

  // ── Invalid sourceType ────────────────────────────────────────────────────

  it("throws for invalid sourceType", async () => {
    await expect(callHandler({ sourceType: "screen-capture" })).rejects.toThrow(
      /Invalid sourceType/,
    );
  });

  it("throws for empty string sourceType that is not in valid set", async () => {
    await expect(callHandler({ sourceType: "unknown-type" })).rejects.toThrow(
      /Invalid sourceType/,
    );
  });

  // ── custom-url validation ────────────────────────────────────────────────

  it("throws when sourceType is custom-url but customUrl is missing", async () => {
    await expect(callHandler({ sourceType: "custom-url" })).rejects.toThrow(
      /customUrl is required/,
    );
  });

  it("throws when sourceType is custom-url and customUrl is empty string", async () => {
    await expect(
      callHandler({
        sourceType: "custom-url",
        customUrl: "",
      }),
    ).rejects.toThrow(/customUrl is required/);
  });

  // ── Successful POST ───────────────────────────────────────────────────────

  it("POSTs to the correct endpoint on success", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    await callHandler({ sourceType: "stream-tab" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:2138/api/stream/source");
    expect(init.method).toBe("POST");
  });

  it("sends sourceType in POST body", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    await callHandler({ sourceType: "game" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sourceType).toBe("game");
  });

  it("sends customUrl in POST body when sourceType is custom-url", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    await callHandler({
      sourceType: "custom-url",
      customUrl: "https://example.com/stream",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sourceType).toBe("custom-url");
    expect(body.customUrl).toBe("https://example.com/stream");
  });

  it("returns success with text and data on successful switch", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const mockResponseData = { status: "ok", source: "stream-tab" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseData,
    });

    const result = await callHandler({ sourceType: "stream-tab" });
    const { text, success } = result as {
      text: string;
      success: boolean;
    };

    expect(success).toBe(true);
    expect(text).toContain("Switched stream source to stream-tab");
  });

  it("includes customUrl in success message for custom-url sourceType", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const result = await callHandler({
      sourceType: "custom-url",
      customUrl: "https://example.com/stream",
    });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("custom-url");
    expect(text).toContain("https://example.com/stream");
  });

  it("handles valid sourceType: game", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const result = await callHandler({ sourceType: "game" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("game");
  });

  // ── API error responses ───────────────────────────────────────────────────

  it("throws for non-ok HTTP responses", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(callHandler({ sourceType: "stream-tab" })).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("throws for 404 error", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(callHandler({ sourceType: "game" })).rejects.toThrow(
      /HTTP 404/,
    );
  });

  // ── Network / fetch errors ───────────────────────────────────────────────

  it("propagates fetch errors", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(callHandler({ sourceType: "stream-tab" })).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });

  it("propagates timeout errors", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("The operation was aborted"));

    await expect(callHandler({ sourceType: "game" })).rejects.toThrow(
      /aborted/,
    );
  });

  it("propagates non-Error thrown values", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce("string error");

    await expect(callHandler({ sourceType: "stream-tab" })).rejects.toBe(
      "string error",
    );
  });

  // ── Default / missing parameters ─────────────────────────────────────────

  it("throws when sourceType is not provided", async () => {
    await expect(callHandler({})).rejects.toThrow(/Invalid sourceType/);
  });

  it("throws when options are missing", async () => {
    await expect(
      switchStreamSourceAction.handler({} as never, undefined),
    ).rejects.toThrow(/Invalid sourceType/);
  });
});
