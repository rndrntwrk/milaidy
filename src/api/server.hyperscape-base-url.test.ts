import { describe, expect, it } from "vitest";
import { resolveHyperscapeApiBaseUrl, resolveHyperscapeWsProbeUrl } from "./server";

describe("resolveHyperscapeApiBaseUrl", () => {
  it("uses HYPERSCAPE_API_URL when configured", () => {
    expect(
      resolveHyperscapeApiBaseUrl({
        HYPERSCAPE_API_URL: "https://api.example.com/v1/",
      } as NodeJS.ProcessEnv),
    ).toBe("https://api.example.com/v1");
  });

  it("derives API base from HYPERSCAPE_SERVER_URL (ws)", () => {
    expect(
      resolveHyperscapeApiBaseUrl({
        HYPERSCAPE_SERVER_URL: "ws://localhost:5555/ws",
      } as NodeJS.ProcessEnv),
    ).toBe("http://localhost:5555");
  });

  it("derives API base from HYPERSCAPE_SERVER_URL (wss)", () => {
    expect(
      resolveHyperscapeApiBaseUrl({
        HYPERSCAPE_SERVER_URL: "wss://hyperscape-production.up.railway.app/ws",
      } as NodeJS.ProcessEnv),
    ).toBe("https://hyperscape-production.up.railway.app");
  });

  it("falls back to localhost when values are missing or invalid", () => {
    expect(
      resolveHyperscapeApiBaseUrl({
        HYPERSCAPE_API_URL: "not-a-url",
        HYPERSCAPE_SERVER_URL: "also-not-a-url",
      } as NodeJS.ProcessEnv),
    ).toBe("http://localhost:5555");
  });
});

describe("resolveHyperscapeWsProbeUrl", () => {
  it("uses explicit HYPERSCAPE_WS_URL when configured", () => {
    expect(
      resolveHyperscapeWsProbeUrl({
        HYPERSCAPE_WS_URL: "wss://hyperscape.example/ws?mode=spectator",
      } as NodeJS.ProcessEnv),
    ).toBe("wss://hyperscape.example/ws?mode=spectator");
  });

  it("derives a /ws endpoint from HYPERSCAPE_API_URL", () => {
    expect(
      resolveHyperscapeWsProbeUrl({
        HYPERSCAPE_API_URL: "https://hyperscape-production.up.railway.app",
      } as NodeJS.ProcessEnv),
    ).toBe("wss://hyperscape-production.up.railway.app/ws");
  });
});
