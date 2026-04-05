import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleManagedClient,
  type ManagedGoogleClientError,
} from "./google-managed-client";

describe("GoogleManagedClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces plain-text upstream errors without reusing the response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream exploded", {
        status: 502,
        statusText: "Bad Gateway",
        headers: {
          "Content-Type": "text/plain",
        },
      }),
    );

    const client = new GoogleManagedClient({
      configured: true,
      apiKey: "test-key",
      apiBaseUrl: "https://cloud.example",
      siteUrl: "https://cloud.example",
    });

    await expect(client.getStatus()).rejects.toEqual(
      expect.objectContaining<Partial<ManagedGoogleClientError>>({
        status: 502,
        message: "upstream exploded",
      }),
    );
  });

  it("prefers structured JSON error messages when present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "cloud rejected request" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const client = new GoogleManagedClient({
      configured: true,
      apiKey: "test-key",
      apiBaseUrl: "https://cloud.example",
      siteUrl: "https://cloud.example",
    });

    await expect(client.getStatus()).rejects.toEqual(
      expect.objectContaining<Partial<ManagedGoogleClientError>>({
        status: 401,
        message: "cloud rejected request",
      }),
    );
  });

  it("keeps HTML error responses concise", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Not found</body></html>", {
        status: 404,
        statusText: "Not Found",
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      }),
    );

    const client = new GoogleManagedClient({
      configured: true,
      apiKey: "test-key",
      apiBaseUrl: "https://cloud.example",
      siteUrl: "https://cloud.example",
    });

    await expect(client.getStatus()).rejects.toEqual(
      expect.objectContaining<Partial<ManagedGoogleClientError>>({
        status: 404,
        message: "404 Not Found",
      }),
    );
  });
});
