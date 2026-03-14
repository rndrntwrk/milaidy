import { describe, expect, it } from "vitest";
import { isPublicUiRequest } from "./publicUiAuth";

describe("isPublicUiRequest", () => {
  it("allows the dashboard shell without an API token", () => {
    expect(isPublicUiRequest("GET", "/")).toBe(true);
    expect(isPublicUiRequest("HEAD", "/settings")).toBe(true);
    expect(isPublicUiRequest("GET", "/assets/index.js")).toBe(true);
  });

  it("keeps API and websocket namespaces protected", () => {
    expect(isPublicUiRequest("GET", "/api")).toBe(false);
    expect(isPublicUiRequest("GET", "/api/conversations")).toBe(false);
    expect(isPublicUiRequest("GET", "/ws")).toBe(false);
  });

  it("does not bypass auth for non-read requests", () => {
    expect(isPublicUiRequest("POST", "/")).toBe(false);
    expect(isPublicUiRequest("DELETE", "/assets/index.js")).toBe(false);
  });
});
