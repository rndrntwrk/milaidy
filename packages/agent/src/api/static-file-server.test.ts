import { describe, expect, it } from "vitest";
import {
  injectApiBaseIntoHtml,
  isPublicBroadcastUiPath,
} from "./static-file-server";

describe("isPublicBroadcastUiPath", () => {
  it("recognizes the public broadcast shell route", () => {
    expect(isPublicBroadcastUiPath("/broadcast/alice-cam")).toBe(true);
    expect(isPublicBroadcastUiPath("/broadcast/alice-cam/")).toBe(true);
  });

  it("does not treat unrelated routes as public broadcast", () => {
    expect(isPublicBroadcastUiPath("/")).toBe(false);
    expect(isPublicBroadcastUiPath("/companion")).toBe(false);
    expect(isPublicBroadcastUiPath("/api/broadcast/alice-cam/scene")).toBe(
      false,
    );
  });
});

describe("injectApiBaseIntoHtml", () => {
  it("injects the api token only when explicitly provided", () => {
    const html = Buffer.from("<html><head></head><body></body></html>");
    const injected = injectApiBaseIntoHtml(html, null, { apiToken: "secret" })
      .toString("utf8");
    const withoutToken = injectApiBaseIntoHtml(html, null).toString("utf8");

    expect(injected).toContain("window.__ELIZA_API_TOKEN__");
    expect(withoutToken).not.toContain("window.__ELIZA_API_TOKEN__");
  });
});
