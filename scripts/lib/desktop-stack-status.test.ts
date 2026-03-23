import { describe, expect, it, vi } from "vitest";
import * as stackStatus from "./desktop-stack-status.mjs";

describe("desktop-stack-status", () => {
  it("fetchJsonOk parses JSON bodies", async () => {
    const fetchImpl = vi.fn(
      async () =>
        /** @type {Response} */ ({
          ok: true,
          status: 200,
          text: async () => '{"a":1}',
        }),
    );
    const r = await stackStatus.fetchJsonOk("http://x", fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.json).toEqual({ a: 1 });
  });

  it("gatherDesktopStackStatus uses env ports and fetch", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/dev/stack")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              schema: "milady.dev.stack/v1",
              desktop: {
                uiPort: 7777,
                rendererUrl: null,
                desktopApiBase: null,
              },
              cursorScreenshot: { available: false, path: null },
              desktopDevLog: { filePath: null, apiTailPath: null },
            }),
        };
      }
      if (String(url).endsWith("/api/health")) {
        return {
          ok: true,
          status: 200,
          text: async () => "{}",
        };
      }
      if (String(url).endsWith("/api/status")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ state: "running" }),
        };
      }
      return {
        ok: false,
        status: 404,
        text: async () => "",
      };
    });

    const report = await stackStatus.gatherDesktopStackStatus(
      { MILADY_PORT: "9999", MILADY_API_PORT: "8888" },
      fetchImpl as unknown as typeof fetch,
      { isPortOpen: async () => true },
    );

    expect(report.uiPort).toBe(9999);
    expect(report.devStack?.desktop?.uiPort).toBe(7777);
    expect(report.apiPort).toBe(8888);
    expect(report.apiHealth.ok).toBe(true);
    expect(report.apiStatus.json).toEqual({ state: "running" });
  });
});
